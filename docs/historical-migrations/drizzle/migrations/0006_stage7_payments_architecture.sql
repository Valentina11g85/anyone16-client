-- AnyOne16 Stage 7: payments architecture (no real money movement).

CREATE TYPE public.payment_status AS ENUM (
  'unpaid','payment_pending','authorized','paid','held','released',
  'refunded','partially_refunded','failed','cancelled','disputed'
);
CREATE TYPE public.settlement_status AS ENUM ('pending','released','cancelled');
CREATE TYPE public.refund_status AS ENUM ('requested','approved','rejected','processed','failed');
CREATE TYPE public.dispute_state AS ENUM ('open','under_review','resolved','rejected','refunded','partially_refunded');
CREATE TYPE public.fee_type AS ENUM ('percentage','fixed','hybrid');

-- Configurable platform fee rules (no hardcoded commission).
CREATE TABLE public.platform_fee_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  fee_type public.fee_type NOT NULL DEFAULT 'percentage',
  percentage NUMERIC NOT NULL DEFAULT 0,
  fixed_amount NUMERIC NOT NULL DEFAULT 0,
  min_amount NUMERIC,
  max_amount NUMERIC,
  currency_code TEXT REFERENCES public.currencies(code),
  country_code TEXT REFERENCES public.countries(code),
  city TEXT,
  category_slug TEXT REFERENCES public.categories(slug),
  promo_code TEXT,
  user_tier TEXT,
  worker_tier TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_fee_rules TO anon, authenticated;
GRANT ALL ON public.platform_fee_rules TO service_role;
ALTER TABLE public.platform_fee_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fee rules readable" ON public.platform_fee_rules FOR SELECT USING (true);
CREATE POLICY "admins manage fee rules" ON public.platform_fee_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Configurable cancellation policies.
CREATE TABLE public.cancellation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  actor TEXT NOT NULL,
  trigger TEXT NOT NULL,
  refund_percentage NUMERIC NOT NULL DEFAULT 100,
  penalty_percentage NUMERIC NOT NULL DEFAULT 0,
  worker_percentage NUMERIC NOT NULL DEFAULT 0,
  release_delay_hours INTEGER NOT NULL DEFAULT 0,
  country_code TEXT REFERENCES public.countries(code),
  priority INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cancellation_policies TO anon, authenticated;
GRANT ALL ON public.cancellation_policies TO service_role;
ALTER TABLE public.cancellation_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policies readable" ON public.cancellation_policies FOR SELECT USING (true);
CREATE POLICY "admins manage policies" ON public.cancellation_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Payments: one financial record per favor.
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  favor_id UUID NOT NULL REFERENCES public.favors(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES public.offers(id),
  customer_profile_id UUID REFERENCES public.profiles(id),
  worker_profile_id UUID REFERENCES public.worker_profiles(id),
  amount NUMERIC NOT NULL,
  currency_code TEXT NOT NULL REFERENCES public.currencies(code),
  platform_fee NUMERIC NOT NULL DEFAULT 0,
  processing_fee NUMERIC NOT NULL DEFAULT 0,
  taxes NUMERIC NOT NULL DEFAULT 0,
  worker_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL,
  fee_rule_id UUID REFERENCES public.platform_fee_rules(id),
  status public.payment_status NOT NULL DEFAULT 'unpaid',
  method TEXT,
  provider TEXT,
  provider_reference TEXT,
  idempotency_key TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_idempotency_key_uidx ON public.payments (idempotency_key);
-- One live payment per favor: prevents accidental double charges.
CREATE UNIQUE INDEX payments_one_live_per_favor_uidx ON public.payments (favor_id)
  WHERE status NOT IN ('cancelled','failed','refunded');
CREATE INDEX payments_favor_idx ON public.payments (favor_id);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT SELECT ON public.payments TO anon;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read payments" ON public.payments FOR SELECT
  USING (is_demo OR public.is_favor_participant(favor_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "customer creates payment" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (is_demo OR public.is_favor_participant(favor_id));
CREATE POLICY "participants update payment" ON public.payments FOR UPDATE TO authenticated
  USING (is_demo OR public.is_favor_participant(favor_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (is_demo OR public.is_favor_participant(favor_id) OR public.has_role(auth.uid(), 'admin'));

-- Settlements: gross -> fees -> worker amount.
CREATE TABLE public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  favor_id UUID NOT NULL REFERENCES public.favors(id) ON DELETE CASCADE,
  worker_profile_id UUID REFERENCES public.worker_profiles(id),
  gross_amount NUMERIC NOT NULL,
  platform_fee NUMERIC NOT NULL DEFAULT 0,
  processing_fee NUMERIC NOT NULL DEFAULT 0,
  taxes NUMERIC NOT NULL DEFAULT 0,
  worker_amount NUMERIC NOT NULL,
  currency_code TEXT NOT NULL REFERENCES public.currencies(code),
  status public.settlement_status NOT NULL DEFAULT 'pending',
  released_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX settlements_payment_uidx ON public.settlements (payment_id);
GRANT SELECT, INSERT, UPDATE ON public.settlements TO authenticated;
GRANT SELECT ON public.settlements TO anon;
GRANT ALL ON public.settlements TO service_role;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read settlements" ON public.settlements FOR SELECT
  USING (is_demo OR public.is_favor_participant(favor_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "participants create settlements" ON public.settlements FOR INSERT TO authenticated
  WITH CHECK (is_demo OR public.is_favor_participant(favor_id));
CREATE POLICY "participants update settlements" ON public.settlements FOR UPDATE TO authenticated
  USING (is_demo OR public.is_favor_participant(favor_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (is_demo OR public.is_favor_participant(favor_id) OR public.has_role(auth.uid(), 'admin'));

-- Refunds (prepared, never executed against a real provider yet).
CREATE TABLE public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  favor_id UUID NOT NULL REFERENCES public.favors(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency_code TEXT NOT NULL REFERENCES public.currencies(code),
  kind TEXT NOT NULL DEFAULT 'full',
  reason TEXT NOT NULL,
  status public.refund_status NOT NULL DEFAULT 'requested',
  requested_by_profile_id UUID REFERENCES public.profiles(id),
  idempotency_key TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX refunds_idempotency_key_uidx ON public.refunds (idempotency_key);
GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;
GRANT SELECT ON public.refunds TO anon;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read refunds" ON public.refunds FOR SELECT
  USING (is_demo OR public.is_favor_participant(favor_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "participants create refunds" ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (is_demo OR public.is_favor_participant(favor_id));
CREATE POLICY "admins update refunds" ON public.refunds FOR UPDATE TO authenticated
  USING (is_demo OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (is_demo OR public.has_role(auth.uid(), 'admin'));

-- Disputes.
CREATE TABLE public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  favor_id UUID NOT NULL REFERENCES public.favors(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE,
  opened_by_profile_id UUID REFERENCES public.profiles(id),
  opened_by_role TEXT NOT NULL DEFAULT 'customer',
  reason TEXT NOT NULL,
  description TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status public.dispute_state NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_by_profile_id UUID REFERENCES public.profiles(id),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.disputes TO authenticated;
GRANT SELECT ON public.disputes TO anon;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read disputes" ON public.disputes FOR SELECT
  USING (is_demo OR public.is_favor_participant(favor_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "participants open disputes" ON public.disputes FOR INSERT TO authenticated
  WITH CHECK (is_demo OR public.is_favor_participant(favor_id));
CREATE POLICY "admins resolve disputes" ON public.disputes FOR UPDATE TO authenticated
  USING (is_demo OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (is_demo OR public.has_role(auth.uid(), 'admin'));

-- Financial audit trail (previous_status -> new_status).
CREATE TABLE public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE,
  favor_id UUID REFERENCES public.favors(id) ON DELETE CASCADE,
  actor_profile_id UUID REFERENCES public.profiles(id),
  event TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'payment',
  entity_id UUID,
  previous_status TEXT,
  new_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_events_payment_idx ON public.payment_events (payment_id);
GRANT SELECT, INSERT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read payment events" ON public.payment_events FOR SELECT TO authenticated
  USING (is_demo OR (favor_id IS NOT NULL AND public.is_favor_participant(favor_id)) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "participants write payment events" ON public.payment_events FOR INSERT TO authenticated
  WITH CHECK (is_demo OR (favor_id IS NOT NULL AND public.is_favor_participant(favor_id)));

CREATE TRIGGER payments_touch BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER settlements_touch BEFORE UPDATE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER refunds_touch BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER fee_rules_touch BEFORE UPDATE ON public.platform_fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER cancellation_policies_touch BEFORE UPDATE ON public.cancellation_policies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
