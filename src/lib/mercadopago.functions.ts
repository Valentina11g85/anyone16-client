/**
 * Mercado Pago Checkout Pro (modo prueba) — creación de Preference en el servidor.
 * El Access Token solo se lee aquí dentro del handler. Importes, moneda y
 * concepto vienen exclusivamente de payment_orders en Foundation.
 * Nunca marca nada como pagado: eso lo hace solo el webhook firmado.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { FOUNDATION_ANON_KEY, FOUNDATION_URL } from "@/integrations/foundation/config";

const PREF_VERSION = 5;
/**
 * Mercado Pago return + webhook URLs ALWAYS use the published AnyOne¹⁶ site.
 * Never derived from the request/browser/preview origin: preview hosts are
 * auth-walled and would reject Mercado Pago's notifications.
 */
const PUBLIC_ORIGIN = "https://code-love-connector.lovable.app";

type OrderRow = {
  id: string;
  buyer_profile_id: string;
  description: string;
  total_charged: number | string;
  currency_code: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

const fail = (message: string) => ({ ok: false as const, message });

export const createMercadoPagoCheckout = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ paymentOrderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const accessToken = process.env["MERCADOPAGO_ACCESS_TOKEN"];
    const serviceKey = process.env["FOUNDATION_SERVICE_ROLE_KEY"];
    if (!accessToken || !serviceKey) return fail("El pago con Mercado Pago no está disponible en este momento.");

    const auth = getRequestHeader("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return fail("Inicia sesión para pagar.");

    // 1. Cliente como el usuario: RLS decide si puede ver la orden.
    const userDb = createClient(FOUNDATION_URL, FOUNDATION_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: me, error: meErr } = await userDb.rpc("current_profile_id");
    if (meErr || !me) return fail("Inicia sesión para pagar.");

    const { data: visible, error: vErr } = await userDb
      .from("payment_orders")
      .select("id")
      .eq("id", data.paymentOrderId)
      .maybeSingle();
    if (vErr || !visible) return fail("No encontramos esta orden de pago.");

    // 2. Lectura autoritativa con la clave de servidor.
    const admin = createClient(FOUNDATION_URL, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (serviceKey.startsWith("sb_") && h.get("Authorization") === `Bearer ${serviceKey}`) h.delete("Authorization");
          h.set("apikey", serviceKey);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: row, error: oErr } = await admin
      .from("payment_orders")
      .select("id,buyer_profile_id,description,total_charged,currency_code,status,metadata")
      .eq("id", data.paymentOrderId)
      .maybeSingle();
    if (oErr || !row) return fail("No encontramos esta orden de pago.");
    const order = row as OrderRow;

    if (order.buyer_profile_id !== me) return fail("Solo quien paga puede iniciar este pago.");
    if (order.status !== "pending") return fail("Esta orden ya no está pendiente de pago.");

    const amount = Number(order.total_charged);
    if (!(amount > 0)) return fail("El total de esta orden no es válido para cobrar.");

    // 3. Reutilizar la Preference existente solo si ya es la versión correcta
    //    (init_point + webhook + URLs de retorno). Las anteriores no se usan.
    const meta = (order.metadata ?? {}) as Record<string, unknown>;
    const existing = meta["mercadopago"] as
      | { checkout_url?: string; preference_id?: string; version?: number; previous_preference_ids?: string[] }
      | undefined;
    if (existing?.version === PREF_VERSION && existing.checkout_url) {
      return { ok: true as const, checkoutUrl: existing.checkout_url };
    }
    const previousIds = [
      ...(existing?.previous_preference_ids ?? []),
      ...(existing?.preference_id ? [existing.preference_id] : []),
    ];

    // Dirección pública https (Mercado Pago descarta direcciones locales).
    // Solo URLs de retorno: la notificación la envía Mercado Pago a la URL de
    // Webhooks configurada en la aplicación — nunca una por checkout.
    const origin = PUBLIC_ORIGIN;
    const back = (r: string) => `${origin}/?pago=${order.id}&resultado=${r}`;

    const body: Record<string, unknown> = {
      items: [
        {
          id: order.id,
          title: (order.description || "Pago AnyOne16").slice(0, 250),
          quantity: 1,
          unit_price: amount,
          currency_id: order.currency_code,
        },
      ],
      external_reference: order.id,
      statement_descriptor: "ANYONE16",
      back_urls: { success: back("exito"), pending: back("pendiente"), failure: back("fallo") },
      auto_return: "approved",
      metadata: { payment_order_id: order.id },
    };

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `pref-v${PREF_VERSION}-${order.id}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[mp-preference] status", res.status, (await res.text()).slice(0, 500));
      return fail("Mercado Pago no pudo preparar el pago. Intenta de nuevo en unos minutos.");
    }
    const pref = (await res.json()) as { id: string; init_point?: string; sandbox_init_point?: string };
    const checkoutUrl = pref.init_point;
    if (!pref.id || !checkoutUrl) return fail("Mercado Pago no devolvió la página de pago.");

    // 4. Asociar la Preference a la orden (sin secretos). No cambia el estado.
    const { error: uErr } = await admin
      .from("payment_orders")
      .update({
        metadata: {
          ...meta,
          mercadopago: {
            preference_id: pref.id,
            checkout_url: checkoutUrl,
            mode: "test",
            version: PREF_VERSION,
            previous_preference_ids: previousIds,
            created_at: new Date().toISOString(),
          },
        },
      })
      .eq("id", order.id)
      .eq("status", "pending");
    if (uErr) {
      console.error("[mp-preference] save", uErr.message);
      return fail("No se pudo registrar el pago en Foundation. Intenta de nuevo.");
    }

    return { ok: true as const, checkoutUrl };
  });
