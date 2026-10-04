/**
 * AnyOne¹⁶ — Stage 7 payments model.
 *
 * Architecture only: state machine, configurable fees, settlement maths.
 * No real charge, transfer or payout is executed anywhere in this file.
 * Money is ALWAYS amount + currencyCode; "$" alone never means USD.
 */

export type PaymentStatus =
  | "unpaid"
  | "payment_pending"
  | "authorized"
  | "paid"
  | "held"
  | "released"
  | "refunded"
  | "partially_refunded"
  | "failed"
  | "cancelled"
  | "disputed";

export const PAYMENT_STATUSES: PaymentStatus[] = [
  "unpaid",
  "payment_pending",
  "authorized",
  "paid",
  "held",
  "released",
  "refunded",
  "partially_refunded",
  "failed",
  "cancelled",
  "disputed",
];

/** Allowed transitions. Anything not listed here is an invalid transition. */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  unpaid: ["payment_pending", "cancelled"],
  payment_pending: ["authorized", "paid", "failed", "cancelled"],
  authorized: ["paid", "held", "failed", "cancelled"],
  paid: ["held", "released", "refunded", "partially_refunded", "disputed"],
  held: ["released", "refunded", "partially_refunded", "disputed"],
  released: ["refunded", "partially_refunded", "disputed"],
  failed: ["payment_pending", "cancelled"],
  refunded: [],
  partially_refunded: ["refunded", "disputed"],
  cancelled: [],
  disputed: ["released", "refunded", "partially_refunded"],
};

export const canTransition = (from: PaymentStatus, to: PaymentStatus) =>
  PAYMENT_TRANSITIONS[from].includes(to);

export type SettlementStatus = "pending" | "released" | "cancelled";
export type RefundStatus = "requested" | "approved" | "rejected" | "processed" | "failed";
export type DisputeStatus =
  | "open"
  | "under_review"
  | "resolved"
  | "rejected"
  | "refunded"
  | "partially_refunded";

export type FeeType = "percentage" | "fixed" | "hybrid";

export type PlatformFeeRule = {
  id: string;
  label: string;
  feeType: FeeType;
  percentage: number;
  fixedAmount: number;
  minAmount: number | null;
  maxAmount: number | null;
  currencyCode: string | null;
  countryCode: string | null;
  city: string | null;
  categorySlug: string | null;
  promoCode: string | null;
  userTier: string | null;
  workerTier: string | null;
  priority: number;
  active: boolean;
  isDemo: boolean;
};

export type CancellationPolicy = {
  id: string;
  label: string;
  actor: string;
  trigger: string;
  refundPercentage: number;
  penaltyPercentage: number;
  workerPercentage: number;
  releaseDelayHours: number;
  countryCode: string | null;
  priority: number;
  active: boolean;
  isDemo: boolean;
};

export type Payment = {
  id: string;
  favorId: string;
  offerId: string | null;
  customerProfileId: string | null;
  workerProfileId: string | null;
  amount: number;
  currencyCode: string;
  platformFee: number;
  processingFee: number;
  taxes: number;
  workerAmount: number;
  totalAmount: number;
  feeRuleId: string | null;
  status: PaymentStatus;
  method: string | null;
  provider: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Settlement = {
  id: string;
  paymentId: string;
  favorId: string;
  workerProfileId: string | null;
  grossAmount: number;
  platformFee: number;
  processingFee: number;
  taxes: number;
  workerAmount: number;
  currencyCode: string;
  status: SettlementStatus;
  releasedAt: string | null;
  isDemo: boolean;
  createdAt: string;
};

export type Refund = {
  id: string;
  paymentId: string;
  favorId: string;
  amount: number;
  currencyCode: string;
  kind: string;
  reason: string;
  status: RefundStatus;
  isDemo: boolean;
  createdAt: string;
};

export type Dispute = {
  id: string;
  favorId: string;
  paymentId: string | null;
  openedByProfileId: string | null;
  openedByRole: string;
  reason: string;
  description: string | null;
  status: DisputeStatus;
  resolution: string | null;
  isDemo: boolean;
  createdAt: string;
  resolvedAt: string | null;
};

export type PaymentEvent = {
  id: string;
  paymentId: string | null;
  favorId: string | null;
  event: string;
  previousStatus: string | null;
  newStatus: string | null;
  isDemo: boolean;
  createdAt: string;
};

/** Payment methods available in the architecture (none charges real money yet). */
export type PaymentMethodKey = "card" | "bank_transfer" | "cash" | "wallet";

export const PAYMENT_METHODS: PaymentMethodKey[] = ["card", "bank_transfer", "cash", "wallet"];

/* --------------------------------------------------------------- money -- */

const ZERO_DECIMAL = new Set(["COP", "CLP", "JPY", "KRW", "PYG", "VND"]);

export const currencyDecimals = (currencyCode: string) => (ZERO_DECIMAL.has(currencyCode) ? 0 : 2);

export function roundMoney(amount: number, currencyCode: string) {
  const factor = 10 ** currencyDecimals(currencyCode);
  return Math.round(amount * factor) / factor;
}

/* ----------------------------------------------------------- fee rules -- */

export type FeeContext = {
  countryCode?: string | null;
  currencyCode?: string | null;
  categorySlug?: string | null;
  city?: string | null;
  promoCode?: string | null;
  userTier?: string | null;
  workerTier?: string | null;
};

const matches = (ruleValue: string | null, contextValue: string | null | undefined) =>
  ruleValue === null || (contextValue != null && ruleValue === contextValue);

/** Most specific active rule wins (higher priority first). */
export function pickFeeRule(rules: PlatformFeeRule[], context: FeeContext): PlatformFeeRule | null {
  const candidates = rules
    .filter((rule) => rule.active)
    .filter(
      (rule) =>
        matches(rule.countryCode, context.countryCode) &&
        matches(rule.currencyCode, context.currencyCode) &&
        matches(rule.categorySlug, context.categorySlug) &&
        matches(rule.city, context.city) &&
        matches(rule.promoCode, context.promoCode ?? null) &&
        matches(rule.userTier, context.userTier ?? null) &&
        matches(rule.workerTier, context.workerTier ?? null),
    )
    .sort((a, b) => b.priority - a.priority);
  return candidates[0] ?? null;
}

/** Commission is never hardcoded: it always comes from a configurable rule. */
export function computePlatformFee(
  amount: number,
  currencyCode: string,
  rule: PlatformFeeRule | null,
) {
  if (!rule) return 0;
  let fee = 0;
  if (rule.feeType === "percentage" || rule.feeType === "hybrid") {
    fee += (amount * rule.percentage) / 100;
  }
  if (rule.feeType === "fixed" || rule.feeType === "hybrid") {
    fee += rule.fixedAmount;
  }
  if (rule.minAmount !== null) fee = Math.max(fee, rule.minAmount);
  if (rule.maxAmount !== null) fee = Math.min(fee, rule.maxAmount);
  fee = Math.min(fee, amount);
  return roundMoney(Math.max(fee, 0), currencyCode);
}

export type SettlementBreakdown = {
  grossAmount: number;
  platformFee: number;
  processingFee: number;
  taxes: number;
  workerAmount: number;
  /** What the customer is asked to pay. */
  totalAmount: number;
  currencyCode: string;
  feeRuleId: string | null;
  feeRuleLabel: string | null;
};

export function computeSettlement(input: {
  amount: number;
  currencyCode: string;
  rule: PlatformFeeRule | null;
  processingFee?: number;
  taxes?: number;
}): SettlementBreakdown {
  const gross = roundMoney(Math.max(input.amount, 0), input.currencyCode);
  const platformFee = computePlatformFee(gross, input.currencyCode, input.rule);
  const processingFee = roundMoney(input.processingFee ?? 0, input.currencyCode);
  const taxes = roundMoney(input.taxes ?? 0, input.currencyCode);
  const workerAmount = roundMoney(
    Math.max(gross - platformFee - processingFee - taxes, 0),
    input.currencyCode,
  );
  return {
    grossAmount: gross,
    platformFee,
    processingFee,
    taxes,
    workerAmount,
    totalAmount: gross,
    currencyCode: input.currencyCode,
    feeRuleId: input.rule?.id ?? null,
    feeRuleLabel: input.rule?.label ?? null,
  };
}

/** Refund amount suggested by the configurable cancellation policy. */
export function computeRefund(payment: Payment, policy: CancellationPolicy | null) {
  const percentage = policy?.refundPercentage ?? 100;
  return roundMoney((payment.amount * percentage) / 100, payment.currencyCode);
}

export function pickCancellationPolicy(
  policies: CancellationPolicy[],
  input: { actor: string; trigger: string; countryCode?: string | null },
) {
  return (
    policies
      .filter(
        (policy) =>
          policy.active &&
          policy.actor === input.actor &&
          policy.trigger === input.trigger &&
          matches(policy.countryCode, input.countryCode),
      )
      .sort((a, b) => b.priority - a.priority)[0] ?? null
  );
}

/** Deterministic key so the same event can never create two payment rows. */
export const paymentIdempotencyKey = (favorId: string, event = "checkout") =>
  `payment:${favorId}:${event}`;

export const refundIdempotencyKey = (paymentId: string, event = "refund") =>
  `refund:${paymentId}:${event}`;
