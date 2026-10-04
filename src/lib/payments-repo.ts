/**
 * AnyOne¹⁶ — Stage 7 payments persistence.
 *
 * Every financial write goes through here. No real provider is called: the
 * rows describe what WOULD happen once a payment provider is connected.
 * Idempotency keys guarantee a favor can never generate duplicated charges.
 */

import { supabase } from "@/integrations/foundation/client";

import {
  canTransition,
  paymentIdempotencyKey,
  refundIdempotencyKey,
  type CancellationPolicy,
  type Dispute,
  type DisputeStatus,
  type Payment,
  type PaymentEvent,
  type PaymentStatus,
  type PlatformFeeRule,
  type Refund,
  type RefundStatus,
  type Settlement,
  type SettlementBreakdown,
  type SettlementStatus,
} from "./payments-model";

/* --------------------------------------------------------------- shape -- */

type Row = Record<string, unknown>;

const num = (value: unknown) => Number(value ?? 0);
const str = (value: unknown) => (value == null ? null : String(value));

const toPayment = (row: Row): Payment => ({
  id: String(row["id"]),
  favorId: String(row["favor_id"]),
  offerId: str(row["offer_id"]),
  customerProfileId: str(row["customer_profile_id"]),
  workerProfileId: str(row["worker_profile_id"]),
  amount: num(row["amount"]),
  currencyCode: String(row["currency_code"]),
  platformFee: num(row["platform_fee"]),
  processingFee: num(row["processing_fee"]),
  taxes: num(row["taxes"]),
  workerAmount: num(row["worker_amount"]),
  totalAmount: num(row["total_amount"]),
  feeRuleId: str(row["fee_rule_id"]),
  status: String(row["status"]) as PaymentStatus,
  method: str(row["method"]),
  provider: str(row["provider"]),
  isDemo: Boolean(row["is_demo"]),
  createdAt: String(row["created_at"]),
  updatedAt: String(row["updated_at"]),
});

const toSettlement = (row: Row): Settlement => ({
  id: String(row["id"]),
  paymentId: String(row["payment_id"]),
  favorId: String(row["favor_id"]),
  workerProfileId: str(row["worker_profile_id"]),
  grossAmount: num(row["gross_amount"]),
  platformFee: num(row["platform_fee"]),
  processingFee: num(row["processing_fee"]),
  taxes: num(row["taxes"]),
  workerAmount: num(row["worker_amount"]),
  currencyCode: String(row["currency_code"]),
  status: String(row["status"]) as SettlementStatus,
  releasedAt: str(row["released_at"]),
  isDemo: Boolean(row["is_demo"]),
  createdAt: String(row["created_at"]),
});

const toRefund = (row: Row): Refund => ({
  id: String(row["id"]),
  paymentId: String(row["payment_id"]),
  favorId: String(row["favor_id"]),
  amount: num(row["amount"]),
  currencyCode: String(row["currency_code"]),
  kind: String(row["kind"]),
  reason: String(row["reason"]),
  status: String(row["status"]) as RefundStatus,
  isDemo: Boolean(row["is_demo"]),
  createdAt: String(row["created_at"]),
});

const toDispute = (row: Row): Dispute => ({
  id: String(row["id"]),
  favorId: String(row["favor_id"]),
  paymentId: str(row["payment_id"]),
  openedByProfileId: str(row["opened_by_profile_id"]),
  openedByRole: String(row["opened_by_role"]),
  reason: String(row["reason"]),
  description: str(row["description"]),
  status: String(row["status"]) as DisputeStatus,
  resolution: str(row["resolution"]),
  isDemo: Boolean(row["is_demo"]),
  createdAt: String(row["created_at"]),
  resolvedAt: str(row["resolved_at"]),
});

const toEvent = (row: Row): PaymentEvent => ({
  id: String(row["id"]),
  paymentId: str(row["payment_id"]),
  favorId: str(row["favor_id"]),
  event: String(row["event"]),
  previousStatus: str(row["previous_status"]),
  newStatus: str(row["new_status"]),
  isDemo: Boolean(row["is_demo"]),
  createdAt: String(row["created_at"]),
});

const toFeeRule = (row: Row): PlatformFeeRule => ({
  id: String(row["id"]),
  label: String(row["label"]),
  feeType: String(row["fee_type"]) as PlatformFeeRule["feeType"],
  percentage: num(row["percentage"]),
  fixedAmount: num(row["fixed_amount"]),
  minAmount: row["min_amount"] == null ? null : num(row["min_amount"]),
  maxAmount: row["max_amount"] == null ? null : num(row["max_amount"]),
  currencyCode: str(row["currency_code"]),
  countryCode: str(row["country_code"]),
  city: str(row["city"]),
  categorySlug: str(row["category_slug"]),
  promoCode: str(row["promo_code"]),
  userTier: str(row["user_tier"]),
  workerTier: str(row["worker_tier"]),
  priority: Number(row["priority"] ?? 0),
  active: Boolean(row["active"]),
  isDemo: Boolean(row["is_demo"]),
});

const toPolicy = (row: Row): CancellationPolicy => ({
  id: String(row["id"]),
  label: String(row["label"]),
  actor: String(row["actor"]),
  trigger: String(row["trigger"]),
  refundPercentage: num(row["refund_percentage"]),
  penaltyPercentage: num(row["penalty_percentage"]),
  workerPercentage: num(row["worker_percentage"]),
  releaseDelayHours: Number(row["release_delay_hours"] ?? 0),
  countryCode: str(row["country_code"]),
  priority: Number(row["priority"] ?? 0),
  active: Boolean(row["active"]),
  isDemo: Boolean(row["is_demo"]),
});

/* ---------------------------------------------------------------- read -- */

export type FinanceSnapshot = {
  payments: Payment[];
  settlements: Settlement[];
  refunds: Refund[];
  disputes: Dispute[];
  events: PaymentEvent[];
  feeRules: PlatformFeeRule[];
  policies: CancellationPolicy[];
};

export async function loadFinance(): Promise<FinanceSnapshot> {
  const [payments, settlements, refunds, disputes, events, feeRules, policies] = await Promise.all([
    supabase.from("payments").select("*").order("created_at", { ascending: false }),
    supabase.from("settlements").select("*").order("created_at", { ascending: false }),
    supabase.from("refunds").select("*").order("created_at", { ascending: false }),
    supabase.from("disputes").select("*").order("created_at", { ascending: false }),
    supabase.from("payment_events").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("platform_fee_rules").select("*"),
    supabase.from("cancellation_policies").select("*"),
  ]);

  return {
    payments: (payments.data ?? []).map((row) => toPayment(row as Row)),
    settlements: (settlements.data ?? []).map((row) => toSettlement(row as Row)),
    refunds: (refunds.data ?? []).map((row) => toRefund(row as Row)),
    disputes: (disputes.data ?? []).map((row) => toDispute(row as Row)),
    events: (events.data ?? []).map((row) => toEvent(row as Row)),
    feeRules: (feeRules.data ?? []).map((row) => toFeeRule(row as Row)),
    policies: (policies.data ?? []).map((row) => toPolicy(row as Row)),
  };
}

export async function isAdminUser() {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return false;
  const { data: rows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  return (rows ?? []).length > 0;
}

/* -------------------------------------------------------------- audit --- */

const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase as unknown as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  }).rpc(fn, args);
  if (error) throw error;
  return data as T;
};

/**
 * Financial events are written by the backend inside the same transaction as
 * the state change. The browser can no longer create them, so this is a no-op
 * kept for call-site compatibility.
 */
export async function recordPaymentEvent(_input: {
  paymentId?: string | null;
  favorId?: string | null;
  actorProfileId?: string | null;
  event: string;
  entityType?: string;
  entityId?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  metadata?: Record<string, unknown>;
  isDemo: boolean;
}) {
  return;
}

/* --------------------------------------------------------------- write -- */

/**
 * Creates the payment for a favor. The amount, currency, commission and worker
 * amount are derived server-side from the accepted offer and the configured
 * fee rules — nothing financial is taken from the browser. Idempotent.
 */
export async function createPaymentForFavor(input: {
  favorId: string;
  offerId: string | null;
  customerProfileId: string | null;
  workerProfileId: string | null;
  breakdown: SettlementBreakdown;
  method: string | null;
  actorProfileId: string | null;
  isDemo: boolean;
}): Promise<Payment> {
  const row = await rpc<Row>("create_favor_payment", {
    _favor_id: input.favorId,
    _method: input.method,
  });
  return toPayment(row);
}

/** Server-validated state machine: invalid transitions are rejected in the database. */
export async function updatePaymentStatus(
  payment: Payment,
  next: PaymentStatus,
  _input: { actorProfileId?: string | null; method?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<Payment> {
  if (payment.status === next) return payment;
  if (!canTransition(payment.status, next)) {
    throw new Error(`invalid_transition:${payment.status}->${next}`);
  }
  const row = await rpc<Row>("advance_favor_payment", {
    _payment_id: payment.id,
    _next: next,
  });
  return toPayment(row);
}

/**
 * The settlement is created by the backend when the funds move to "held".
 * This only reads it back.
 */
export async function createSettlement(
  payment: Payment,
  _actorProfileId: string | null,
): Promise<Settlement> {
  const existing = await supabase
    .from("settlements")
    .select("*")
    .eq("payment_id", payment.id)
    .maybeSingle();
  if (existing.data) return toSettlement(existing.data as Row);
  throw new Error("settlement_not_ready");
}

/** Releasing money to a worker is an administrator-only backend operation. */
export async function releaseSettlement(
  settlement: Settlement,
  _actorProfileId: string | null,
): Promise<Settlement> {
  if (settlement.status === "released") return settlement;
  const row = await rpc<Row>("release_favor_settlement", { _settlement_id: settlement.id });
  return toSettlement(row);
}

/** A participant may only *request* a refund; the amount is validated server-side. */
export async function createRefund(input: {
  payment: Payment;
  amount: number;
  reason: string;
  kind: "full" | "partial";
  actorProfileId: string | null;
}): Promise<Refund> {
  const row = await rpc<Row>("request_favor_refund", {
    _payment_id: input.payment.id,
    _amount: input.amount,
    _reason: input.reason,
  });
  return toRefund(row);
}



export async function openDispute(input: {
  favorId: string;
  paymentId: string | null;
  openedByProfileId: string | null;
  openedByRole: string;
  reason: string;
  description?: string;
  isDemo: boolean;
}): Promise<Dispute> {
  const { data, error } = await supabase
    .from("disputes")
    .insert({
      favor_id: input.favorId,
      payment_id: input.paymentId,
      opened_by_profile_id: input.openedByProfileId,
      opened_by_role: input.openedByRole,
      reason: input.reason,
      description: input.description ?? null,
      status: "open",
      is_demo: input.isDemo,
    })
    .select("*")
    .single();
  if (error) throw error;
  const dispute = toDispute(data as Row);
  await recordPaymentEvent({
    paymentId: input.paymentId,
    favorId: input.favorId,
    actorProfileId: input.openedByProfileId,
    event: "dispute_opened",
    entityType: "dispute",
    entityId: dispute.id,
    newStatus: "open",
    metadata: { reason: dispute.reason },
    isDemo: dispute.isDemo,
  });
  return dispute;
}
