ALTER TYPE public.trust_verification_state ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE public.trust_verification_state ADD VALUE IF NOT EXISTS 'flagged';
ALTER TYPE public.trust_verification_state ADD VALUE IF NOT EXISTS 'requires_review';