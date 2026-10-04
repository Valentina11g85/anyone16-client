/**
 * AnyOne¹⁶ — Stage 8 Trust & Safety persistence.
 *
 * All security-sensitive reads and writes go through here. The confirmation
 * code is never read by worker code paths: only the backend function
 * validate_favor_completion_code can complete a favor.
 */

import { supabase } from "@/integrations/foundation/client";

import { createNotification, logAudit } from "./marketplace-repo";
import type {
  CodeValidationError,
  CodeValidationResult,
  DisputeCategory,
  EligibilityRule,
  RestrictionKind,
  RiskLevel,
  TrustLevel,
  TrustSettings,
  VerificationState,
  WorkerTrust,
} from "./trust-model";

type Row = Record<string, unknown>;
const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const str = (value: unknown) => (typeof value === "string" ? value : null);
const num = (value: unknown, fallback = 0) => (value === null || value === undefined ? fallback : Number(value));

/* ------------------------------------------------------------- settings -- */

export async function loadTrustSettings(): Promise<TrustSettings> {
  const { data } = await db.from("trust_settings").select("key, value");
  const settings: TrustSettings = {};
  for (const row of (data ?? []) as Row[]) settings[String(row['key'])] = row['value'];
  return settings;
}

export async function loadEligibilityRules(): Promise<EligibilityRule[]> {
  const { data } = await db
    .from("trust_eligibility_rules")
    .select("*")
    .order("priority", { ascending: false });
  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row['id']),
    label: String(row['label']),
    minTrustLevel: num(row['min_trust_level']),
    categorySlug: str(row['category_slug']),
    countryCode: str(row['country_code']),
    city: str(row['city']),
    requiresVehicle: Boolean(row['requires_vehicle']),
    requiresResidence: Boolean(row['requires_residence']),
    requiresBackgroundCheck: Boolean(row['requires_background_check']),
    minAmount: row['min_amount'] === null ? null : Number(row['min_amount']),
    maxAmount: row['max_amount'] === null ? null : Number(row['max_amount']),
    currencyCode: str(row['currency_code']),
    highRisk: Boolean(row['high_risk']),
    priority: num(row['priority']),
    active: Boolean(row['active']),
    isDemo: Boolean(row['is_demo']),
  }));
}

/* --------------------------------------------------------- worker trust -- */

const toWorkerTrust = (row: Row, restrictedCategories: string[] = []): WorkerTrust => ({
  workerProfileId: String(row['id']),
  trustLevel: (num(row['trust_level']) as TrustLevel) ?? 0,
  identityVerified: Boolean(row['identity_verified']),
  residenceVerified: Boolean(row['residence_verified']),
  vehicleVerified: Boolean(row['vehicle_verified']),
  backgroundChecked: Boolean(row['background_checked']),
  phoneVerified: Boolean(row['phone_verified']),
  restriction: (str(row['restriction_status']) ?? "none") as RestrictionKind,
  restrictedCategories,
  riskLevel: (str(row['risk_level']) ?? "low") as RiskLevel,
  riskScore: num(row['risk_score']),
  disputeCount: num(row['dispute_count']),
  completedFavors: num(row['completed_favors']),
  completionRate: num(row['completion_rate']),
  cancellationRate: num(row['cancellation_rate']),
  rating: num(row['rating']),
  city: str(row['city']),
  countryCode: str(row['country_code']),
  isDemo: Boolean(row['is_demo']),
});

/** Public trust data only. Risk score, restriction and coordinates stay server-side. */
const PUBLIC_TRUST_COLUMNS =
  "id, trust_level, identity_verified, residence_verified, vehicle_verified, background_checked, phone_verified, completed_favors, completion_rate, cancellation_rate, rating, city, country_code, is_demo";

export async function loadWorkerTrustIndex(): Promise<Record<string, WorkerTrust>> {
  const { data } = await db.from("worker_profiles").select(PUBLIC_TRUST_COLUMNS);
  const index: Record<string, WorkerTrust> = {};
  for (const row of (data ?? []) as Row[]) index[String(row['id'])] = toWorkerTrust(row);
  return index;
}

export async function loadWorkerRestrictions(workerProfileId: string) {
  const { data } = await db
    .from("worker_restrictions")
    .select("*")
    .eq("worker_profile_id", workerProfileId)
    .eq("active", true);
  return (data ?? []) as Row[];
}

/* ---------------------------------------------------- completion code -- */

export type CompletionCode = {
  favorId: string;
  code: string;
  status: "active" | "used" | "expired" | "revoked";
  failedAttempts: number;
  maxAttempts: number;
  expiresAt: string | null;
  usedAt: string | null;
};

const errorMessage = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String((error as { message: unknown }).message)
    : String(error);

/** Creation/renewal always goes through Foundation. Errors are propagated. */
export async function ensureCompletionCode(favorId: string) {
  const { error } = await db.rpc("ensure_favor_completion_code", { _favor_id: favorId });
  if (error) throw new Error(errorMessage(error));
}

/** Most recent code with status = 'active'. Expiry is decided by Foundation. */
async function queryActiveCompletionCode(favorId: string): Promise<CompletionCode | null> {
  const { data, error } = await db
    .from("favor_completion_codes")
    .select("favor_id, code, status, failed_attempts, max_attempts, expires_at, used_at, created_at")
    .eq("favor_id", favorId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(errorMessage(error));
  const row = data as Row | null;
  if (!row) return null;
  return {
    favorId: String(row['favor_id']),
    code: String(row['code']),
    status: "active",
    failedAttempts: num(row['failed_attempts']),
    maxAttempts: num(row['max_attempts'], 5),
    expiresAt: str(row['expires_at']),
    usedAt: str(row['used_at']),
  };
}

/**
 * Only the client who owns the favor can read this (enforced by RLS).
 * If no active code exists, asks Foundation once to ensure one and re-reads.
 */
export async function readCompletionCode(favorId: string): Promise<CompletionCode> {
  const existing = await queryActiveCompletionCode(favorId);
  if (existing) return existing;
  await ensureCompletionCode(favorId);
  const created = await queryActiveCompletionCode(favorId);
  if (!created) throw new Error("Foundation no devolvió ningún código activo para este favor.");
  return created;
}

/** Worker-side: the only path that can complete a favor. */
export async function submitCompletionCode(input: {
  favorId: string;
  code: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<CodeValidationResult> {
  const session = {
    userAgent: typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 180),
    at: new Date().toISOString(),
  };
  const { data, error } = await db.rpc("validate_favor_completion_code", {
    _favor_id: input.favorId,
    _code: input.code,
    _latitude: input.latitude ?? null,
    _longitude: input.longitude ?? null,
    _session: session,
  });
  if (error) return { ok: false, error: "unknown" };
  const result = (data ?? {}) as Row;
  if (result['ok'] === true) return { ok: true };
  const failure: CodeValidationResult = {
    ok: false,
    error: (str(result['error']) ?? "unknown") as CodeValidationError,
    ...(result['failed_attempts'] !== undefined
      ? { failedAttempts: num(result['failed_attempts']) }
      : {}),
    ...(result['max_attempts'] !== undefined ? { maxAttempts: num(result['max_attempts']) } : {}),
  };
  return failure;
}

export async function loadCodeAttempts(favorId?: string) {
  let query = db.from("favor_code_attempts").select("*").order("created_at", { ascending: false });
  if (favorId) query = query.eq("favor_id", favorId);
  const { data } = await query;
  return (data ?? []) as Row[];
}

/* ------------------------------------------------------- verifications -- */

export async function upsertIdentityVerification(input: {
  workerProfileId: string;
  legalName: string;
  dateOfBirth: string | null;
  documentType: string;
  documentCountry: string;
  documentReference: string;
  isDemo: boolean;
}) {
  const now = new Date().toISOString();
  const { error } = await db.from("worker_identity_verifications").upsert(
    {
      worker_profile_id: input.workerProfileId,
      legal_name: input.legalName,
      date_of_birth: input.dateOfBirth,
      document_type: input.documentType,
      document_country: input.documentCountry,
      // Reference/token only: no raw biometric material is stored.
      document_reference: input.documentReference,
      status: "provider_not_connected",
      selfie_check: "provider_not_connected",
      liveness_check: "provider_not_connected",
      document_check: "provider_not_connected",
      provider: null,
      started_at: now,
      consent_given_at: now,
      is_demo: input.isDemo,
    },
    { onConflict: "worker_profile_id" },
  );
  if (error) throw error;
  await logAudit("verification.identity_submitted", "worker_profile", input.workerProfileId);
}

export async function upsertAddressVerification(input: {
  workerProfileId: string;
  address: string;
  city: string;
  region: string;
  countryCode: string;
  proofType: string;
  isDemo: boolean;
}) {
  const { error } = await db.from("worker_address_verifications").upsert(
    {
      worker_profile_id: input.workerProfileId,
      declared_address: input.address,
      city: input.city,
      region: input.region,
      country_code: input.countryCode,
      proof_type: input.proofType,
      status: "provider_not_connected",
      is_demo: input.isDemo,
    },
    { onConflict: "worker_profile_id" },
  );
  if (error) throw error;
  await logAudit("verification.address_submitted", "worker_profile", input.workerProfileId);
}

export async function addVehicle(input: {
  workerProfileId: string;
  vehicleType: string;
  make: string;
  model: string;
  year: number | null;
  plate: string;
  ownership: string;
  countryCode: string;
  isDemo: boolean;
}) {
  const { error } = await db.from("worker_vehicles").insert({
    worker_profile_id: input.workerProfileId,
    vehicle_type: input.vehicleType,
    make: input.make,
    model: input.model,
    year: input.year,
    plate: input.plate,
    ownership: input.ownership,
    country_code: input.countryCode,
    status: "provider_not_connected",
    insurance_status: "not_started",
    is_demo: input.isDemo,
  });
  if (error) throw error;
  await logAudit("verification.vehicle_submitted", "worker_profile", input.workerProfileId);
}

export async function requestBackgroundCheck(input: {
  workerProfileId: string;
  countryCode: string;
  isDemo: boolean;
}) {
  const { error } = await db.from("worker_background_checks").insert({
    worker_profile_id: input.workerProfileId,
    check_type: "standard",
    country_code: input.countryCode,
    status: "provider_not_connected",
    consent_given_at: new Date().toISOString(),
    is_demo: input.isDemo,
  });
  if (error) throw error;
  await logAudit("verification.background_requested", "worker_profile", input.workerProfileId);
}

export async function loadWorkerVerifications(workerProfileId: string) {
  const [identity, address, vehicles, background] = await Promise.all([
    db.from("worker_identity_verifications").select("*").eq("worker_profile_id", workerProfileId).maybeSingle(),
    db.from("worker_address_verifications").select("*").eq("worker_profile_id", workerProfileId).maybeSingle(),
    db.from("worker_vehicles").select("*").eq("worker_profile_id", workerProfileId),
    db.from("worker_background_checks").select("*").eq("worker_profile_id", workerProfileId),
  ]);
  return {
    identity: (identity.data ?? null) as Row | null,
    address: (address.data ?? null) as Row | null,
    vehicles: (vehicles.data ?? []) as Row[],
    background: (background.data ?? []) as Row[],
  };
}

export async function recomputeTrustLevel(workerProfileId: string) {
  await db.rpc("recompute_worker_trust_level", { _worker_profile_id: workerProfileId });
}

/* ------------------------------------------------------------ evidence -- */

export async function addEvidence(input: {
  favorId: string;
  kind: "pickup" | "delivery" | "receipt";
  workerProfileId?: string | null;
  customerProfileId?: string | null;
  description: string;
  photoUrl?: string | null;
  receiptUrl?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isDemo: boolean;
}) {
  const { error } = await db.from("favor_evidence").insert({
    favor_id: input.favorId,
    kind: input.kind,
    worker_profile_id: input.workerProfileId ?? null,
    customer_profile_id: input.customerProfileId ?? null,
    description: input.description,
    photo_url: input.photoUrl ?? null,
    receipt_url: input.receiptUrl ?? null,
    amount: input.amount ?? null,
    currency_code: input.currencyCode ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    is_demo: input.isDemo,
  });
  if (error) throw error;
  await logAudit(`evidence.${input.kind}_uploaded`, "favor", input.favorId);
}

export async function loadEvidence(favorId?: string) {
  let query = db.from("favor_evidence").select("*").order("captured_at", { ascending: false });
  if (favorId) query = query.eq("favor_id", favorId);
  const { data } = await query;
  return (data ?? []) as Row[];
}

/* ------------------------------------------------------------ disputes -- */

/** Opening a dispute automatically snapshots the available evidence. */
export async function openTrustDispute(input: {
  favorId: string;
  category: DisputeCategory;
  description: string;
  openedByProfileId: string | null;
  openedByRole: "customer" | "worker";
  isDemo: boolean;
}) {
  const [evidence, attempts, messages, audit, payment] = await Promise.all([
    loadEvidence(input.favorId),
    loadCodeAttempts(input.favorId),
    db.from("messages").select("author_role, body, created_at").eq("favor_id", input.favorId),
    db.from("audit_logs").select("action, created_at, metadata").eq("entity_id", input.favorId),
    db.from("payments").select("id, amount, currency_code, status").eq("favor_id", input.favorId).maybeSingle(),
  ]);

  const bundle = {
    collectedAt: new Date().toISOString(),
    evidence,
    codeAttempts: attempts.map((row) => ({
      succeeded: row['succeeded'],
      createdAt: row['created_at'],
      latitude: row['latitude'],
      longitude: row['longitude'],
    })),
    messages: messages.data ?? [],
    auditTrail: audit.data ?? [],
  };

  const { data, error } = await db
    .from("disputes")
    .insert({
      favor_id: input.favorId,
      payment_id: (payment.data as Row | null)?.['id'] ?? null,
      opened_by_profile_id: input.openedByProfileId,
      opened_by_role: input.openedByRole,
      category: input.category,
      reason: input.category,
      description: input.description,
      status: "evidence_collection",
      evidence_bundle: bundle,
      is_demo: input.isDemo,
    })
    .select("id")
    .single();
  if (error) throw error;

  await logAudit("dispute.opened", "favor", input.favorId);
  await createNotification({
    profileId: input.openedByProfileId,
    type: "dispute.opened",
    title: "Disputa abierta",
    favorId: input.favorId,
    isDemo: input.isDemo,
  });
  return String((data as Row)['id']);
}

export async function loadDisputes() {
  const { data } = await db.from("disputes").select("*").order("created_at", { ascending: false });
  return (data ?? []) as Row[];
}

/* --------------------------------------------------------------- admin -- */

/**
 * Admin review action. "verified" is intentionally NOT reachable from the
 * app: only a connected provider result, applied server-side, can produce it
 * (the database rejects any other attempt).
 */
export type AdminVerificationStatus = Exclude<VerificationState, "verified">;

export async function setVerificationStatus(input: {
  table: "worker_identity_verifications" | "worker_address_verifications" | "worker_vehicles" | "worker_background_checks";
  id: string;
  workerProfileId: string;
  status: AdminVerificationStatus;
  failureReason?: string | null;
}) {
  const patch: Row = { status: input.status };
  if (input.failureReason && input.table !== "worker_background_checks") {
    patch['failure_reason'] = input.failureReason;
  }
  const { error } = await db.from(input.table).update(patch).eq("id", input.id);
  if (error) throw error;
  await recomputeTrustLevel(input.workerProfileId);
  await logAudit(`admin.verification_${input.status}`, "worker_profile", input.workerProfileId);
}


/** Suspensions and restorations run inside an admin-only backend function. */
export async function restrictWorker(input: {
  workerProfileId: string;
  kind: RestrictionKind;
  reason: string;
  categories?: string[];
  requiredTrustLevel?: number | null;
  adminProfileId: string | null;
}) {
  const { error } = await db.rpc("admin_set_worker_restriction", {
    _worker_profile_id: input.workerProfileId,
    _kind: input.kind,
    _reason: input.reason,
  });
  if (error) throw error;
}

export async function restoreWorker(workerProfileId: string, _adminProfileId: string | null) {
  const { error } = await db.rpc("admin_set_worker_restriction", {
    _worker_profile_id: workerProfileId,
    _kind: "none",
    _reason: "restored by admin",
  });
  if (error) throw error;
  await db
    .from("worker_restrictions")
    .update({ active: false, lifted_at: new Date().toISOString() })
    .eq("worker_profile_id", workerProfileId)
    .eq("active", true);
}

export async function updateDisputeStatus(input: {
  disputeId: string;
  favorId: string;
  status: string;
  decision?: string | null;
  resolution?: string | null;
  adminProfileId: string | null;
}) {
  const patch: Row = { status: input.status, assigned_admin_profile_id: input.adminProfileId };
  if (input.decision) patch['decision'] = input.decision;
  if (input.resolution) patch['resolution'] = input.resolution;
  if (input.status === "resolved" || input.status === "rejected") {
    patch['resolved_at'] = new Date().toISOString();
    patch['resolved_by_profile_id'] = input.adminProfileId;
  }
  if (input.status === "closed") patch['closed_at'] = new Date().toISOString();
  const { error } = await db.from("disputes").update(patch).eq("id", input.disputeId);
  if (error) throw error;
  await logAudit(`admin.dispute_${input.status}`, "favor", input.favorId);
}

export async function loadRiskSignals() {
  const { data } = await db.from("risk_signals").select("*").order("created_at", { ascending: false });
  return (data ?? []) as Row[];
}

export async function loadPendingVerifications() {
  const [identity, address, vehicles, background] = await Promise.all([
    db.from("worker_identity_verifications").select("*").neq("status", "verified"),
    db.from("worker_address_verifications").select("*").neq("status", "verified"),
    db.from("worker_vehicles").select("*").neq("status", "verified"),
    db.from("worker_background_checks").select("*").neq("status", "verified"),
  ]);
  return {
    identity: (identity.data ?? []) as Row[],
    address: (address.data ?? []) as Row[],
    vehicles: (vehicles.data ?? []) as Row[],
    background: (background.data ?? []) as Row[],
  };
}
