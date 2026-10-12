/**
 * Oportunidades Premium — Stripe Checkout Session, created ONLY on the server.
 *
 * - Identity: the caller's Foundation session (bearer) → current_profile_id().
 * - Price: read from Foundation's opportunities_access_config (4.000 COP); the
 *   browser sends nothing but its session. Charged in COP (a supported card
 *   presentment currency); Stripe settles in the account's currency.
 * - Already Premium → no session (no second charge).
 * - Idempotency-Key per account and 10-minute window → retries/double clicks
 *   reuse the same session.
 * - Live keys are refused unless STRIPE_LIVE_ENABLED="true" (explicit go-live).
 * - It NEVER grants access: only the signed webhook + Foundation do.
 */
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

import { foundation } from "@/integrations/foundation/client";
import { FOUNDATION_ANON_KEY, FOUNDATION_URL } from "@/integrations/foundation/config";
import { PREMIUM_PRODUCT_TAG, pickReturnOrigin, stripeKeyAllowed, toMinorUnits } from "./stripe-premium";

/** Attaches the FOUNDATION session token (accounts live in Foundation). */
const attachFoundationAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await foundation.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { "x-foundation-auth": `Bearer ${token}` } : {} });
});

export type CheckoutServerResult =
  | { status: "REDIRECT"; url: string }
  | { status: "ALREADY_ACTIVE" }
  | { status: "NOT_CONFIGURED" }
  | { status: "ERROR"; message: string };

const err = (message: string): CheckoutServerResult => ({ status: "ERROR", message });

export const createOpportunitiesCheckout = createServerFn({ method: "POST" })
  .middleware([attachFoundationAuth])
  .handler(async (): Promise<CheckoutServerResult> => {
    const stripeKey = process.env["STRIPE_SECRET_KEY"];
    if (!stripeKey) return { status: "NOT_CONFIGURED" };
    if (!stripeKeyAllowed(stripeKey, process.env["STRIPE_LIVE_ENABLED"])) {
      console.error("[opp-checkout] Stripe key not allowed (live requires STRIPE_LIVE_ENABLED=true)");
      return { status: "NOT_CONFIGURED" };
    }

    const auth = getRequestHeader("x-foundation-auth") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return err("Inicia sesión para continuar.");

    const userDb = createClient(FOUNDATION_URL, FOUNDATION_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: profileId, error: meErr } = await userDb.rpc("current_profile_id");
    if (meErr || typeof profileId !== "string" || !profileId) return err("Inicia sesión para continuar.");

    // Already Premium → never create a new charge.
    const { data: acc, error: accErr } = await userDb.rpc("get_my_opportunities_access");
    if (accErr) return err("No pudimos verificar tu acceso. Intenta de nuevo.");
    const row = Array.isArray(acc) ? acc[0] : acc;
    if (row === true || (row && typeof row === "object" && (row as { active?: boolean }).active === true)) {
      return { status: "ALREADY_ACTIVE" };
    }

    // Price and currency: server-side, from Foundation.
    const { data: cfg, error: cfgErr } = await userDb
      .from("opportunities_access_config")
      .select("amount, currency_code")
      .maybeSingle();
    const amount = Number(cfg?.amount);
    const currency = String(cfg?.currency_code ?? "").toUpperCase();
    if (cfgErr || !(amount > 0) || currency.length !== 3) return { status: "NOT_CONFIGURED" };

    const origin = pickReturnOrigin(getRequestHeader("origin"));
    const form = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(toMinorUnits(amount, currency)),
      "line_items[0][price_data][product_data][name]": "AnyOne¹⁶ · Oportunidades Premium",
      "line_items[0][price_data][product_data][description]": "Pago único por cuenta. Sin cobros recurrentes.",
      client_reference_id: profileId,
      "metadata[product]": PREMIUM_PRODUCT_TAG,
      "metadata[profile_id]": profileId,
      "payment_intent_data[metadata][product]": PREMIUM_PRODUCT_TAG,
      "payment_intent_data[metadata][profile_id]": profileId,
      success_url: `${origin}/?opp_checkout=return`,
      cancel_url: `${origin}/?opp_checkout=cancel`,
    });

    const windowId = Math.floor(Date.now() / (10 * 60 * 1000));
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `opp-premium:${profileId}:${amount}:${currency}:${origin}:${windowId}`,
      },
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; type?: string } } | null;
      console.error("[opp-checkout] stripe error", res.status, body?.error?.type, body?.error?.code);
      return err("No se pudo preparar el pago. Intenta de nuevo en unos minutos.");
    }
    const session = (await res.json()) as { url?: string | null };
    if (!session.url) return err("No se pudo preparar el pago. Intenta de nuevo en unos minutos.");
    return { status: "REDIRECT", url: session.url };
  });
