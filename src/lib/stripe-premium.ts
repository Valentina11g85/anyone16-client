/**
 * Oportunidades Premium × Stripe — pure, server-safe helpers (no secrets, no I/O).
 * Used by the checkout server function and the signed webhook; unit-tested.
 */

export const STRIPE_PROVIDER = "stripe";
/** Tag stamped on every Premium Checkout Session / PaymentIntent we create. */
export const PREMIUM_PRODUCT_TAG = "opportunities_premium";

/** Stripe minor units: COP and MXN are two-decimal currencies in the Stripe API. */
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
export const toMinorUnits = (amount: number, currency: string) =>
  Math.round(amount * (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100));
export const fromMinorUnits = (minor: number, currency: string) =>
  minor / (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100);

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies the `Stripe-Signature` header (v1 = HMAC-SHA256 of `${t}.${rawBody}`),
 * rejecting timestamps outside the tolerance window (replays).
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t") t = v;
    if (k === "v1") v1.push(v);
  }
  const ts = Number(t);
  if (!t || !Number.isFinite(ts) || v1.length === 0) return false;
  if (Math.abs(nowSec - ts) > toleranceSec) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`)));
  return v1.some((sig) => safeEqual(sig, expected));
}

/** Subset of a Stripe Checkout Session re-read from the Stripe API. */
export type StripeSession = {
  id: string;
  mode?: string;
  status?: string | null;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  livemode?: boolean;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: string | { id: string } | null;
};

export type ActivationArgs = {
  _profile_id: string;
  _provider: string;
  _external_payment_id: string;
  _amount: number;
  _currency: string;
  _status: "pending" | "confirmed" | "failed";
  _live_mode: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Maps an authoritative Checkout Session to the arguments of Foundation's
 * activate_opportunities_access. Returns null when the session is not ours or
 * is malformed (nothing is sent). Foundation re-checks amount, currency,
 * live mode, refunds and duplicates — this function never decides access.
 */
export function sessionToActivation(s: StripeSession, eventType: string): ActivationArgs | null {
  if (s.mode !== "payment") return null;
  if (s.metadata?.["product"] !== PREMIUM_PRODUCT_TAG) return null;
  const profileId = s.client_reference_id ?? "";
  if (!UUID.test(profileId) || s.metadata?.["profile_id"] !== profileId) return null;
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
  if (!pi || s.amount_total == null || !s.currency || typeof s.livemode !== "boolean") return null;

  let status: ActivationArgs["_status"];
  if (eventType === "checkout.session.async_payment_failed") status = "failed";
  else if (s.status === "complete" && s.payment_status === "paid") status = "confirmed";
  else if (s.status === "expired") status = "failed";
  else status = "pending";

  const currency = s.currency.toUpperCase();
  return {
    _profile_id: profileId,
    _provider: STRIPE_PROVIDER,
    _external_payment_id: pi,
    _amount: fromMinorUnits(s.amount_total, currency),
    _currency: currency,
    _status: status,
    _live_mode: s.livemode,
  };
}

/** Allowed return origins for Checkout (never an arbitrary browser value). */
export const RETURN_ORIGINS = [
  "https://anyone16.com",
  "https://www.anyone16.com",
  "https://anyone16foundation.lovable.app",
  "https://id-preview--193ca4fd-c5b6-4311-a6e8-17372a92f543.lovable.app",
  "http://localhost:8080",
];
export const pickReturnOrigin = (origin: string | null | undefined) =>
  origin && RETURN_ORIGINS.includes(origin) ? origin : RETURN_ORIGINS[0]!;
