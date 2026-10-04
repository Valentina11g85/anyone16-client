/**
 * AnyOne¹⁶ — Proveedor de pago SIMULADO (solo desarrollo / vista previa).
 * El navegador solo envía el id de la orden y el resultado deseado.
 * Importes, moneda, comisiones, comprador y proveedor vienen de Foundation.
 * La confirmación usa la misma función segura que el webhook de Mercado Pago
 * (apply_payment_provider_event), con la clave de servidor.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { FOUNDATION_ANON_KEY, FOUNDATION_URL } from "@/integrations/foundation/config";
import { isSimulatorHost } from "./simulator-env";

const PROVIDER = "simulator";
const fail = (message: string) => ({ ok: false as const, message });

export const simulatePayment = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ paymentOrderId: z.string().uuid(), outcome: z.enum(["approved", "rejected", "pending"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    // Nunca en producción: solo en el entorno local o de vista previa.
    if (!isSimulatorHost(new URL(getRequest().url).hostname)) {
      return fail("El simulador de pago no está disponible en este entorno.");
    }
    const serviceKey = process.env["FOUNDATION_SERVICE_ROLE_KEY"];
    if (!serviceKey) return fail("El simulador de pago no está disponible en este momento.");

    const auth = getRequestHeader("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return fail("Inicia sesión para pagar.");

    const userDb = createClient(FOUNDATION_URL, FOUNDATION_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: me, error: meErr } = await userDb.rpc("current_profile_id");
    if (meErr || !me) return fail("Inicia sesión para pagar.");

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
      .select("id,buyer_profile_id,total_charged,currency_code,status")
      .eq("id", data.paymentOrderId)
      .maybeSingle();
    if (oErr || !row) return fail("No encontramos esta orden de pago.");
    if (row.buyer_profile_id !== me) return fail("Solo quien paga puede iniciar este pago.");

    // Idempotencia: una orden ya cerrada devuelve su estado actual, sin nuevo cobro.
    if (row.status !== "pending") {
      return { ok: true as const, orderId: row.id as string, status: row.status as string, repeated: true };
    }
    if (!(Number(row.total_charged) > 0)) return fail("El total de esta orden no es válido.");

    const txStatus = data.outcome === "approved" ? "captured" : data.outcome === "rejected" ? "failed" : "pending";
    const { data: updated, error } = await admin.rpc("apply_payment_provider_event", {
      _payment_order_id: row.id,
      _payment_provider: PROVIDER,
      // Un único id por orden: pulsar dos veces nunca crea dos transacciones.
      _external_transaction_id: `sim-${row.id}`,
      _transaction_status: txStatus,
      _provider_status: `simulated:${data.outcome}`,
      _metadata: { simulated: true, amount: Number(row.total_charged), currency: row.currency_code },
    });
    if (error) {
      console.error("[simulator] payment event", error);
      return fail("No se pudo registrar el pago simulado.");
    }
    const status = (updated as { status?: string } | null)?.status ?? row.status;
    return { ok: true as const, orderId: row.id as string, status: String(status), repeated: false };
  });
