import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { FOUNDATION_URL } from "@/integrations/foundation/config";

/**
 * Mercado Pago Checkout Pro webhook (TEST credentials only for now).
 *
 * Security:
 *  1. Verifies the x-signature HMAC with MERCADOPAGO_WEBHOOK_SECRET.
 *  2. Never trusts the webhook body: re-reads the payment from the Mercado Pago
 *     API with MERCADOPAGO_ACCESS_TOKEN (server-only secret).
 *  3. Checks amount + currency against the Foundation payment_order.
 *  4. Only then calls apply_payment_provider_event / apply_refund_provider_event
 *     with the Foundation service_role key (server-only secret).
 *
 * payment_orders.id travels to Mercado Pago as `external_reference`.
 */

const PROVIDER = "mercadopago";

type MpPayment = {
  id: number;
  status: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  live_mode?: boolean;
  refunds?: Array<{ id: number; amount: number; status?: string; metadata?: Record<string, unknown> }>;
};

function mapStatus(s: string): string | null {
  switch (s) {
    case "approved":
      return "captured";
    case "authorized":
      return "authorized";
    case "pending":
    case "in_process":
    case "in_mediation":
      return "processing";
    case "rejected":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return null;
  }
}

function verifySignature(request: Request, dataId: string, secret: string): boolean {
  const header = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  let ts = "";
  let v1 = "";
  for (const part of header.split(",")) {
    const [k, v] = part.split("=").map((x) => x?.trim());
    if (k === "ts") ts = v ?? "";
    if (k === "v1") v1 = v ?? "";
  }
  if (!ts || !v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifest = "";
  if (id) manifest += `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

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

const ok = (msg: string) => new Response(msg, { status: 200 });

/** TEMPORARY [mp-webhook-diag]: never logs header, id, signature or secret values. */
function logSignatureDiag(
  request: Request,
  url: URL,
  body: { data?: { id?: string | number } },
  dataId: string,
  secret: string,
) {
  const sig = request.headers.get("x-signature");
  const rid = request.headers.get("x-request-id");
  const order: string[] = [];
  let ts = "";
  let v1 = "";
  for (const part of (sig ?? "").split(",")) {
    const eq = part.indexOf("=");
    const k = (eq === -1 ? part : part.slice(0, eq)).trim();
    const v = eq === -1 ? "" : part.slice(eq + 1).trim();
    if (k) order.push(k);
    if (k === "ts") ts = v;
    if (k === "v1") v1 = v;
  }
  const queryId = url.searchParams.get("data.id");
  const bodyId = body.data?.id != null ? String(body.data.id) : null;
  const shape = (s: string) =>
    /^\d+$/.test(s) ? "numeric" : /^[a-z0-9]+$/i.test(s) ? (/[A-Z]/.test(s) ? "alnum_upper" : "alnum_lower") : "other";
  const hmac = (m: string) => createHmac("sha256", secret).update(m).digest("hex");
  const eq = (a: string) => {
    const x = Buffer.from(a);
    const y = Buffer.from(v1);
    return x.length === y.length && timingSafeEqual(x, y);
  };
  const build = (id: string, withRid: boolean) =>
    `${id ? `id:${id};` : ""}${withRid && rid ? `request-id:${rid};` : ""}ts:${ts};`;
  const usedId = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const match = !!(ts && v1) && eq(hmac(build(usedId, true)));
  const variants = ts && v1
    ? {
        raw_id_with_rid: eq(hmac(build(dataId, true))),
        body_id_with_rid: bodyId != null ? eq(hmac(build(bodyId, true))) : null,
        id_without_rid: eq(hmac(build(usedId, false))),
        no_id_with_rid: eq(hmac(build("", true))),
      }
    : null;
  const category = !sig
    ? "missing_x_signature"
    : !ts || !v1
      ? "malformed_signature_header"
      : !/^\d+$/.test(ts)
        ? "non_numeric_ts"
        : !/^[0-9a-f]{64}$/.test(v1)
          ? "v1_not_lower_hex64"
          : match
            ? "none_hmac_ok"
            : "signature_mismatch";
  console.log(
    "[mp-webhook-diag]",
    JSON.stringify({
      x_signature: { present: !!sig, length: sig?.length ?? 0 },
      x_request_id: { present: !!rid, length: rid?.length ?? 0 },
      ts: { present: !!ts, length: ts.length, numeric: /^\d+$/.test(ts), age_s: ts ? Math.round(Date.now() / 1000 - Number(ts)) : null },
      v1: { present: !!v1, length: v1.length },
      signature_param_order: order,
      data_id: {
        present: !!dataId,
        length: dataId.length,
        shape: dataId ? shape(dataId) : null,
        source: queryId != null ? "query" : bodyId != null ? "body" : "none",
        query_equals_body: queryId != null && bodyId != null ? queryId === bodyId : null,
      },
      hmac_match: match,
      variants,
      failure_category: category,
    }),
  );
}

export const Route = createFileRoute("/api/public/payments/mercadopago/webhook")({
  server: {
    handlers: {
      GET: async () => ok("mercadopago webhook ready"),
      POST: async ({ request }) => {
        const secret = process.env["MERCADOPAGO_WEBHOOK_SECRET"];
        const token = process.env["MERCADOPAGO_ACCESS_TOKEN"];
        const serviceKey = process.env["FOUNDATION_SERVICE_ROLE_KEY"];
        if (!secret || !token || !serviceKey) {
          console.error("[mp-webhook] missing secrets");
          return new Response("not configured", { status: 200 }); // nothing to lose: no payments can exist before the keys
        }

        const url = new URL(request.url);
        const raw = await request.text();
        let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const type = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
        const dataId = String(url.searchParams.get("data.id") ?? body.data?.id ?? "");

        // TEMPORARY diagnostics — logs only presence/lengths/shapes/booleans, never values.
        try {
          logSignatureDiag(request, url, body, dataId, secret);
        } catch {
          console.log("[mp-webhook-diag]", JSON.stringify({ diag_error: true }));
        }

        if (!verifySignature(request, dataId, secret)) {
          return new Response("invalid signature", { status: 401 });
        }
        if (type !== "payment" || !dataId) return ok("ignored");

        // Authoritative read from Mercado Pago.
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!mpRes.ok) {
          console.error("[mp-webhook] MP fetch failed", mpRes.status);
          return new Response("mp fetch failed", { status: 502 }); // MP will retry
        }
        const p = (await mpRes.json()) as MpPayment;
        const orderId = p.external_reference ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(orderId)) return ok("no order reference");

        const db = foundationAdmin(serviceKey);
        const { data: order, error: oErr } = await db
          .from("payment_orders")
          .select("id, total_charged, currency_code, status")
          .eq("id", orderId)
          .maybeSingle();
        if (oErr) {
          console.error("[mp-webhook] order read", oErr);
          return new Response("db error", { status: 500 });
        }
        if (!order) return ok("order not found");

        const txStatus = mapStatus(p.status);
        if (!txStatus) return ok("status ignored");

        // Amount/currency must match exactly before confirming a charge.
        if (txStatus === "captured" || txStatus === "authorized") {
          const sameCurrency = (p.currency_id ?? "").toUpperCase() === String(order.currency_code).toUpperCase();
          const sameAmount = Math.abs(Number(p.transaction_amount) - Number(order.total_charged)) < 0.005;
          if (!sameCurrency || !sameAmount) {
            console.error("[mp-webhook] amount/currency mismatch", { orderId, mp: p.transaction_amount, cur: p.currency_id });
            return ok("mismatch recorded");
          }
        }

        // Refunds registered in Foundation (matched by external_refund_id).
        for (const r of p.refunds ?? []) {
          const { data: ref } = await db
            .from("payment_refunds")
            .select("id, status")
            .eq("payment_order_id", orderId)
            .eq("external_refund_id", String(r.id))
            .maybeSingle();
          if (ref && ref.status !== "succeeded") {
            const st = r.status === "rejected" ? "failed" : r.status === "cancelled" ? "cancelled" : "succeeded";
            const { error } = await db.rpc("apply_refund_provider_event", {
              _refund_id: ref.id,
              _status: st,
              _external_refund_id: String(r.id),
            });
            if (error) console.error("[mp-webhook] refund event", error);
          }
        }

        const { error } = await db.rpc("apply_payment_provider_event", {
          _payment_order_id: orderId,
          _payment_provider: PROVIDER,
          _external_transaction_id: String(p.id),
          _transaction_status: txStatus,
          _provider_status: p.status_detail ? `${p.status}:${p.status_detail}` : p.status,
          _metadata: { live_mode: p.live_mode ?? false, amount: p.transaction_amount, currency: p.currency_id },
        });
        if (error) {
          console.error("[mp-webhook] payment event", error);
          // Closed orders are final; don't make MP retry forever.
          if (String(error.message).includes("payment_order_closed")) return ok("order closed");
          return new Response("db error", { status: 500 });
        }
        return ok("processed");
      },
    },
  },
});
