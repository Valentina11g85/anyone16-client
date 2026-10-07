/**
 * AnyOne¹⁶ — Legal & privacy data layer. Foundation decides what is published,
 * what a person accepted, which version and when (RPCs stamp time/version/user).
 * The browser never records consent by itself.
 */
import { useCallback, useEffect, useState } from "react";

import { foundation } from "@/integrations/foundation/client";
import type { LegalDocType } from "@/content/legal/drafts";

type Row = Record<string, unknown>;
type PgError = { message: string; code?: string };
type Q = Promise<{ data: unknown; error: PgError | null }>;
type Client = {
  rpc: (n: string, p?: Record<string, unknown>) => Q;
  from: (t: string) => { select: (c: string) => { order: (c: string, o: { ascending: boolean }) => Q } };
};
const db = () => foundation as unknown as Client;
const str = (v: unknown) => (v == null ? null : String(v));

export const LEGAL_NOT_INSTALLED =
  "El Centro Legal todavía no está instalado en Foundation. Se muestran los borradores.";
const MESSAGES: Record<string, string> = {
  not_authenticated: "Inicia sesión para continuar.",
  admin_only: "Solo un administrador puede hacer esto.",
  version_not_published: "Esa versión ya no está vigente. Recarga e inténtalo de nuevo.",
  too_many_requests: "Has enviado muchas solicitudes hoy. Inténtalo mañana.",
  request_not_cancellable: "Esta solicitud ya no se puede cancelar.",
  only_drafts_are_editable: "Solo se pueden editar borradores. Crea una nueva versión.",
  only_drafts_can_be_published: "Solo se pueden publicar borradores.",
  resolution_required: "Escribe una respuesta de al menos 5 caracteres.",
  privacy_requests_one_open_account_deletion: "Ya tienes una solicitud de eliminación de cuenta abierta.",
  legal_document_versions_document_type_language_jurisdiction_version_key: "Ya existe esa versión.",
};
export const isMissing = (e: PgError) => ["PGRST202", "PGRST205", "42P01", "42883"].includes(e.code ?? "");
function toError(e: PgError) {
  if (isMissing(e)) return new Error(LEGAL_NOT_INSTALLED);
  const key = Object.keys(MESSAGES).find((k) => e.message.includes(k));
  return new Error(key ? MESSAGES[key]! : e.message);
}

export type LegalVersion = {
  id: string;
  documentType: LegalDocType;
  title: string;
  version: string;
  content: string;
  summary: string | null;
  language: string;
  jurisdiction: string;
  isTranslation: boolean;
  requiresAcceptance: boolean;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
  effectiveAt: string | null;
  retiredAt: string | null;
};
export type LegalAcceptance = {
  id: string;
  consentType: string;
  versionId: string | null;
  version: string | null;
  granted: boolean;
  source: string;
  createdAt: string;
};
export type PrivacyRequestType =
  | "access" | "rectification" | "deletion" | "revocation" | "complaint" | "account_deletion" | "other";
export type PrivacyRequest = {
  id: string;
  profileId: string;
  type: PrivacyRequestType;
  details: string | null;
  status: "received" | "in_review" | "resolved" | "rejected" | "cancelled";
  resolution: string | null;
  dueAt: string;
  resolvedAt: string | null;
  createdAt: string;
};

export const REQUEST_LABEL: Record<PrivacyRequestType, string> = {
  access: "Conocer mis datos",
  rectification: "Corregir mis datos",
  deletion: "Suprimir datos",
  revocation: "Revocar autorización",
  complaint: "Reclamo",
  account_deletion: "Eliminar mi cuenta",
  other: "Otra consulta",
};
export const REQUEST_STATUS: Record<PrivacyRequest["status"], string> = {
  received: "Recibida",
  in_review: "En revisión",
  resolved: "Respondida",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

const toVersion = (r: Row): LegalVersion => ({
  id: String(r["id"]),
  documentType: String(r["document_type"]) as LegalDocType,
  title: String(r["title"]),
  version: String(r["version"]),
  content: String(r["content"]),
  summary: str(r["summary_of_changes"]),
  language: String(r["language"]),
  jurisdiction: String(r["jurisdiction"]),
  isTranslation: Boolean(r["is_translation"]),
  requiresAcceptance: Boolean(r["requires_acceptance"]),
  status: String(r["status"]) as LegalVersion["status"],
  publishedAt: str(r["published_at"]),
  effectiveAt: str(r["effective_at"]),
  retiredAt: str(r["retired_at"]),
});
const toAcceptance = (r: Row): LegalAcceptance => ({
  id: String(r["id"]),
  consentType: String(r["consent_type"]),
  versionId: str(r["document_version_id"]),
  version: str(r["document_version"]),
  granted: Boolean(r["granted"]),
  source: String(r["source"]),
  createdAt: String(r["created_at"]),
});
const toRequest = (r: Row): PrivacyRequest => ({
  id: String(r["id"]),
  profileId: String(r["profile_id"]),
  type: String(r["request_type"]) as PrivacyRequestType,
  details: str(r["details"]),
  status: String(r["status"]) as PrivacyRequest["status"],
  resolution: str(r["resolution"]),
  dueAt: String(r["due_at"]),
  resolvedAt: str(r["resolved_at"]),
  createdAt: String(r["created_at"]),
});

async function list<T>(table: string, map: (r: Row) => T): Promise<T[]> {
  const { data, error } = await db().from(table).select("*").order("created_at", { ascending: false });
  if (error) throw toError(error);
  return ((data ?? []) as Row[]).map(map);
}

/** RLS: published + archived for everyone; drafts only for admins. */
export const loadLegalVersions = () => list("legal_document_versions", toVersion);
export const loadMyAcceptances = () => list("legal_acceptances", toAcceptance);
export const loadPrivacyRequests = () => list("privacy_requests", toRequest);

export async function loadPendingLegal(language = "es", jurisdiction = "CO") {
  const { data, error } = await db().rpc("get_my_pending_legal", { _language: language, _jurisdiction: jurisdiction });
  if (error) throw toError(error);
  return ((data ?? []) as Row[]).map(toVersion);
}

export async function acceptLegal(versionIds: string[], source: "signup" | "update_prompt" | "legal_center") {
  const { error } = await db().rpc("accept_legal_versions", {
    _version_ids: versionIds,
    _source: source,
    _user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
  });
  if (error) throw toError(error);
}

export async function setOptionalConsent(type: "marketing" | "location", granted: boolean, source: "signup" | "legal_center") {
  const { error } = await db().rpc("set_optional_consent", { _consent_type: type, _granted: granted, _source: source });
  if (error) throw toError(error);
}

export async function submitPrivacyRequest(type: PrivacyRequestType, details: string) {
  const { data, error } = await db().rpc("submit_privacy_request", { _request_type: type, _details: details || null });
  if (error) throw toError(error);
  return toRequest(data as Row);
}

export async function cancelPrivacyRequest(id: string) {
  const { error } = await db().rpc("cancel_my_privacy_request", { _request_id: id });
  if (error) throw toError(error);
}

export async function isLegalAdmin() {
  const { data, error } = await db().rpc("is_legal_admin");
  return !error && data === true;
}

export async function adminSaveDraft(input: {
  id: string | null;
  documentType: LegalDocType;
  title: string;
  version: string;
  content: string;
  requiresAcceptance: boolean;
  summary: string;
  language?: string;
  jurisdiction?: string;
}) {
  const { data, error } = await db().rpc("admin_save_legal_draft", {
    _id: input.id,
    _document_type: input.documentType,
    _title: input.title,
    _version: input.version,
    _content: input.content,
    _language: input.language ?? "es",
    _jurisdiction: input.jurisdiction ?? "CO",
    _requires_acceptance: input.requiresAcceptance,
    _is_translation: false,
    _summary: input.summary || null,
  });
  if (error) throw toError(error);
  return toVersion(data as Row);
}

export async function adminPublish(id: string) {
  const { error } = await db().rpc("admin_publish_legal_version", { _id: id, _effective_at: null });
  if (error) throw toError(error);
}

export async function adminUpdatePrivacyRequest(id: string, status: "in_review" | "resolved" | "rejected", resolution?: string) {
  const { error } = await db().rpc("admin_update_privacy_request", { _id: id, _status: status, _resolution: resolution ?? null });
  if (error) throw toError(error);
}

/** Published version per type (es/CO), or null if Foundation has none / isn't installed. */
export function useLegalVersions() {
  const [versions, setVersions] = useState<LegalVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setVersions(await loadLegalVersions());
      setError(null);
    } catch (e) {
      setVersions([]);
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void reload(), [reload]);
  return { versions, error, reload };
}

/* Signup intent: what the person ticked BEFORE they had a session (email confirmation).
   It is only an intent; Foundation records the acceptance on the first authenticated session. */
const INTENT_KEY = "anyone16.legal-intent";
export type SignupIntent = { email: string; marketing: boolean; at: string };
export const saveSignupIntent = (i: SignupIntent) => {
  try { localStorage.setItem(INTENT_KEY, JSON.stringify(i)); } catch { /* storage unavailable */ }
};
export const readSignupIntent = (): SignupIntent | null => {
  try { const raw = localStorage.getItem(INTENT_KEY); return raw ? (JSON.parse(raw) as SignupIntent) : null; } catch { return null; }
};
export const clearSignupIntent = () => {
  try { localStorage.removeItem(INTENT_KEY); } catch { /* ignore */ }
};
