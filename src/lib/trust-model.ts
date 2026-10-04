/**
 * AnyOne¹⁶ — Stage 8 Trust & Safety model.
 *
 * Pure, testable logic: trust levels, configurable eligibility, risk scoring,
 * dispute taxonomy and protected-favor detection. Nothing here decides the
 * completion of a favor: that is enforced by the backend confirmation code.
 */

import type { FavorCategory } from "./favor-model";

/* ------------------------------------------------------------ trust level */

export const TRUST_LEVELS = [0, 1, 2, 3, 4] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const TRUST_LEVEL_KEYS: Record<TrustLevel, string> = {
  0: "trust.level.0",
  1: "trust.level.1",
  2: "trust.level.2",
  3: "trust.level.3",
  4: "trust.level.4",
};

/**
 * Verification states. Only the backend, after a real connected provider
 * returns a successful result with a stored reference, may set "verified".
 */
export type VerificationState =
  | "not_started"
  | "provider_not_connected"
  | "pending"
  | "in_review"
  | "requires_review"
  | "verified"
  | "failed"
  | "flagged"
  | "rejected"
  | "expired";

/** States that never grant a trust level or a public badge. */
export const NON_VERIFIED_STATES: readonly VerificationState[] = [
  "not_started",
  "provider_not_connected",
  "pending",
  "in_review",
  "requires_review",
  "failed",
  "flagged",
  "rejected",
  "expired",
];

/** A verification only counts when a real provider signed it off. */
export function isRealVerified(record: {
  status?: unknown;
  provider?: unknown;
  provider_reference?: unknown;
  is_demo?: unknown;
}): boolean {
  return (
    record.status === "verified" &&
    record.is_demo !== true &&
    typeof record.provider === "string" &&
    record.provider.length > 0 &&
    typeof record.provider_reference === "string" &&
    record.provider_reference.length > 0
  );
}


export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RestrictionKind =
  | "none"
  | "additional_verification_required"
  | "category_restricted"
  | "temporarily_suspended"
  | "permanently_suspended";

export type WorkerTrust = {
  workerProfileId: string;
  trustLevel: TrustLevel;
  identityVerified: boolean;
  residenceVerified: boolean;
  vehicleVerified: boolean;
  backgroundChecked: boolean;
  phoneVerified: boolean;
  restriction: RestrictionKind;
  restrictedCategories: string[];
  riskLevel: RiskLevel;
  riskScore: number;
  disputeCount: number;
  completedFavors: number;
  completionRate: number;
  cancellationRate: number;
  rating: number;
  city: string | null;
  countryCode: string | null;
  isDemo: boolean;
};

export type EligibilityRule = {
  id: string;
  label: string;
  minTrustLevel: number;
  categorySlug: string | null;
  countryCode: string | null;
  city: string | null;
  requiresVehicle: boolean;
  requiresResidence: boolean;
  requiresBackgroundCheck: boolean;
  minAmount: number | null;
  maxAmount: number | null;
  currencyCode: string | null;
  highRisk: boolean;
  priority: number;
  active: boolean;
  isDemo: boolean;
};

export type EligibilityContext = {
  categorySlug: FavorCategory | string | null;
  countryCode: string | null;
  city: string | null;
  amount: number | null;
  currencyCode: string | null;
};

const ruleMatches = (rule: EligibilityRule, context: EligibilityContext) => {
  if (!rule.active) return false;
  if (rule.categorySlug && rule.categorySlug !== context.categorySlug) return false;
  if (rule.countryCode && rule.countryCode !== context.countryCode) return false;
  if (rule.city && rule.city.toLowerCase() !== (context.city ?? "").toLowerCase()) return false;
  if (rule.currencyCode && rule.currencyCode !== context.currencyCode) return false;
  if (rule.minAmount !== null && (context.amount ?? 0) < rule.minAmount) return false;
  if (rule.maxAmount !== null && (context.amount ?? 0) > rule.maxAmount) return false;
  return true;
};

/** Every rule that applies, strongest requirement first. */
export function matchingRules(rules: EligibilityRule[], context: EligibilityContext) {
  return rules
    .filter((rule) => ruleMatches(rule, context))
    .sort((a, b) => b.priority - a.priority || b.minTrustLevel - a.minTrustLevel);
}

export type EligibilityResult = {
  eligible: boolean;
  requiredTrustLevel: number;
  reasons: string[];
  rule: EligibilityRule | null;
  highRisk: boolean;
};

/** Configurable, never hardcoded: the rules come from the database. */
export function checkEligibility(
  worker: WorkerTrust | null,
  rules: EligibilityRule[],
  context: EligibilityContext,
): EligibilityResult {
  const applicable = matchingRules(rules, context);
  const required = applicable.reduce((max, rule) => Math.max(max, rule.minTrustLevel), 0);
  const rule = applicable[0] ?? null;
  const reasons: string[] = [];
  const highRisk = applicable.some((item) => item.highRisk);

  if (!worker) {
    return { eligible: false, requiredTrustLevel: required, reasons: ["trust.reason.noProfile"], rule, highRisk };
  }
  if (worker.restriction === "permanently_suspended" || worker.restriction === "temporarily_suspended") {
    reasons.push("trust.reason.suspended");
  }
  if (
    worker.restriction === "category_restricted" &&
    context.categorySlug &&
    worker.restrictedCategories.includes(String(context.categorySlug))
  ) {
    reasons.push("trust.reason.categoryRestricted");
  }
  if (worker.restriction === "additional_verification_required") {
    reasons.push("trust.reason.additionalVerification");
  }
  if (worker.trustLevel < required) reasons.push("trust.reason.lowLevel");
  if (applicable.some((item) => item.requiresVehicle) && !worker.vehicleVerified) {
    reasons.push("trust.reason.vehicle");
  }
  if (applicable.some((item) => item.requiresResidence) && !worker.residenceVerified) {
    reasons.push("trust.reason.residence");
  }
  if (applicable.some((item) => item.requiresBackgroundCheck) && !worker.backgroundChecked) {
    reasons.push("trust.reason.background");
  }

  return { eligible: reasons.length === 0, requiredTrustLevel: required, reasons, rule, highRisk };
}

/* --------------------------------------------------------- protected favor */

export type TrustSettings = Record<string, unknown>;

export const settingNumber = (settings: TrustSettings, key: string, fallback: number) => {
  const value = settings[key];
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
};

/** High-value favors need a stronger worker and extra evidence. */
export function isProtectedFavor(
  settings: TrustSettings,
  amount: number | null,
  currencyCode: string,
) {
  if (amount === null) return false;
  const key = `protected_favor.threshold_${currencyCode.toLowerCase()}`;
  const threshold = settingNumber(settings, key, Number.POSITIVE_INFINITY);
  return amount >= threshold;
}

/* ------------------------------------------------------------ risk scoring */

export type RiskSignal = { signal: string; weight: number; level: RiskLevel };

export function riskLevelFor(score: number, settings: TrustSettings): RiskLevel {
  if (score >= settingNumber(settings, "risk.threshold_critical", 10)) return "critical";
  if (score >= settingNumber(settings, "risk.threshold_high", 6)) return "high";
  if (score >= settingNumber(settings, "risk.threshold_medium", 3)) return "medium";
  return "low";
}

/** A single weak signal never bans anybody: the score is cumulative. */
export function riskScore(signals: RiskSignal[]) {
  return signals.reduce((total, signal) => total + signal.weight, 0);
}

/* ---------------------------------------------------------------- disputes */

export const DISPUTE_CATEGORIES = [
  "item_not_delivered",
  "wrong_item",
  "damaged_item",
  "incomplete_service",
  "fraudulent_completion",
  "code_problem",
  "worker_behavior",
  "client_behavior",
  "payment_issue",
  "other",
] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

export const DISPUTE_STATES = [
  "open",
  "evidence_collection",
  "under_review",
  "additional_info_required",
  "resolved",
  "appealed",
  "closed",
  "rejected",
  "refunded",
  "partially_refunded",
] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];

const DISPUTE_FLOW: Record<string, DisputeState[]> = {
  open: ["evidence_collection", "under_review", "closed", "rejected"],
  evidence_collection: ["under_review", "additional_info_required", "closed"],
  under_review: ["additional_info_required", "resolved", "rejected", "refunded", "partially_refunded"],
  additional_info_required: ["under_review", "closed"],
  resolved: ["appealed", "closed"],
  appealed: ["under_review", "closed"],
  rejected: ["appealed", "closed"],
  refunded: ["closed"],
  partially_refunded: ["closed"],
  closed: [],
};

export const canTransitionDispute = (from: DisputeState, to: DisputeState) =>
  (DISPUTE_FLOW[from] ?? []).includes(to);

/* -------------------------------------------------------- completion code */

export const COMPLETION_CODE_LENGTH = 6;

export const normalizeCode = (input: string) =>
  input.replace(/\D/g, "").slice(0, COMPLETION_CODE_LENGTH);

export const isCompleteCode = (input: string) =>
  normalizeCode(input).length === COMPLETION_CODE_LENGTH;

export type CodeValidationError =
  | "invalid_code"
  | "code_already_used"
  | "code_expired"
  | "code_not_active"
  | "too_many_attempts"
  | "not_authorized"
  | "favor_not_found"
  | "unknown";

export type CodeValidationResult =
  | { ok: true }
  | { ok: false; error: CodeValidationError; failedAttempts?: number; maxAttempts?: number };
