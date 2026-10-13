import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { FOUNDATION_URL } from "@/integrations/foundation/config";
import {
  PREMIUM_PRODUCT_TAG,
  STRIPE_PROVIDER,
  sessionToActivation,
  stripeKeyAllowed,
  verifyStripeSignature,
  type StripeSession,
} from "@/lib/stripe-premium";

/**
 * Stripe webhook — Oportunidades Premium only.
 *
 * 1. Verifies Stripe-Signature with STRIPE_WEBHOOK_SECRET (5-min tolerance).
 * 2. Never trusts the event body: re-reads the Session / Charge / PaymentIntent
 *    from the Stripe API with STRIPE_SECRET_KEY.
 * 3. Only objects tagged metadata.product = opportunities_premium are processed.
 * 4. Calls Foundation's existing activate_opportunities_access /
 *    revoke_opportunities_access with FOUNDATION_SERVICE_ROLE_KEY. Foundation
 *    validates amount (≥ config), currency (COP), live mode, refunds and
 *    duplicates; it is idempotent per (provider, payment_intent).
 * Errors from Stripe/Foundation return 5xx so Stripe retries.
 */

const ok = (msg: string) => new Response(msg, { status: 200 });

function foundationAdmin(key: string) {
  return createClient(FOUNDATION_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function stripeGet<T>(path: string, key: string): Promise<T | null> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) {
    console.error("[stripe-webhook] stripe fetch failed", r.status);
    return null;
  }
  return (await r.json()) as T;
}

const SESSION_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

export const Route = createFileRoute("/api/public/payments/stripe/webhook")({
  server: {
    handlers: {
      GET: async () => ok("stripe webhook ready"),
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) {
          console.error("[stripe-webhook] missing webhook secret");
          return new Response("not configured", { status: 503 });
        }
        // 1. Signature first, over the raw body (only Stripe can produce a valid one).
        const raw = await request.text();
        if (!(await verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret))) {
          return new Response("invalid signature", { status: 400 });
        }
        // 2. Charges off (STRIPE_LIVE_ENABLED not "true" with a live key): acknowledge the
        //    authentic event WITHOUT processing it — no Stripe re-read, no Foundation call.
        const key = process.env["STRIPE_SECRET_KEY"];
        if (!stripeKeyAllowed(key, process.env["STRIPE_LIVE_ENABLED"])) {
          console.log("[stripe-webhook] signature valid; processing disabled");
          return ok("signature valid; processing disabled");
        }
        const serviceKey = process.env["FOUNDATION_SERVICE_ROLE_KEY"];
        if (!key || !serviceKey) {
          console.error("[stripe-webhook] missing configuration");
          return new Response("not configured", { status: 503 });
        }
        let event: { type?: string; data?: { object?: { id?: string; payment_intent?: string | null } } };
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const type = event.type ?? "";
        const objId = event.data?.object?.id ?? "";
        const db = foundationAdmin(serviceKey);

        // Payment: authoritative Session → Foundation decides.
        if (SESSION_EVENTS.has(type)) {
          const s = await stripeGet<StripeSession>(`checkout/sessions/${encodeURIComponent(objId)}`, key);
          if (!s) return new Response("stripe fetch failed", { status: 502 });
          const args = sessionToActivation(s, type);
          if (!args) return ok("ignored");
          if (args._status === "pending") return ok("pending"); // wait for async_payment_succeeded
          const { data, error } = await db.rpc("activate_opportunities_access", args);
          if (error) {
            console.error("[stripe-webhook] foundation activate failed", error.code);
            return new Response("foundation error", { status: 500 });
          }
          console.log("[stripe-webhook] activation outcome", String(data));
          return ok(String(data));
        }

        // Refund / dispute: revoke through Foundation (idempotent, blocks late confirmations).
        if (type === "charge.refunded" || type === "charge.dispute.created") {
          const piId =
            type === "charge.refunded"
              ? (await stripeGet<{ payment_intent?: string | null; refunded?: boolean }>(`charges/${encodeURIComponent(objId)}`, key))
              : (await stripeGet<{ payment_intent?: string | null }>(`disputes/${encodeURIComponent(objId)}`, key));
          if (!piId) return new Response("stripe fetch failed", { status: 502 });
          if (type === "charge.refunded" && (piId as { refunded?: boolean }).refunded !== true) return ok("partial refund ignored");
          const pi = piId.payment_intent ? await stripeGet<{ id: string; metadata?: Record<string, string> }>(`payment_intents/${encodeURIComponent(piId.payment_intent)}`, key) : null;
          if (!pi) return ok("no payment intent");
          if (pi.metadata?.["product"] !== PREMIUM_PRODUCT_TAG) return ok("ignored");
          const { error } = await db.rpc("revoke_opportunities_access", {
            _provider: STRIPE_PROVIDER,
            _external_payment_id: pi.id,
            _reason: type === "charge.refunded" ? "refund" : "chargeback",
          });
          if (error) {
            console.error("[stripe-webhook] foundation revoke failed", error.code);
            return new Response("foundation error", { status: 500 });
          }
          return ok("revoked");
        }

        return ok("ignored");
      },
    },
  },
});
