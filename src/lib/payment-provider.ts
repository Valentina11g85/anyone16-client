/**
 * AnyOne¹⁶ — External payment provider: Mercado Pago Checkout Pro (modo prueba).
 * The browser only receives the Checkout URL. Confirmation comes solely from
 * the signed webhook, which calls apply_payment_provider_event.
 */

import type { PaymentOrder } from "./payment-model";
import { createMercadoPagoCheckout } from "./mercadopago.functions";
import { simulatePayment } from "./simulator.functions";
import { simulatorAvailableInBrowser } from "./simulator-env";

export type ProviderResult =
  | { ok: true; redirectUrl?: string; externalId: string }
  | { ok: false; reason: "unconfigured" | "error"; message: string };

export interface PaymentProvider {
  readonly id: string;
  readonly configured: boolean;
  readonly label: string;
  createPayment(order: PaymentOrder): Promise<ProviderResult>;
}

export const mercadoPagoProvider: PaymentProvider = {
  id: "mercadopago",
  configured: true,
  label: "Pagar con Mercado Pago",
  createPayment: async (order) => {
    try {
      const r = await createMercadoPagoCheckout({ data: { paymentOrderId: order.id } });
      if (!r.ok) return { ok: false, reason: "error", message: r.message };
      return { ok: true, redirectUrl: r.checkoutUrl, externalId: order.id };
    } catch {
      return { ok: false, reason: "error", message: "No se pudo preparar el pago. Intenta de nuevo." };
    }
  },
};

/** Default real provider. */
export const activePaymentProvider = mercadoPagoProvider;

export type SimulatedOutcome = "approved" | "rejected" | "pending";

/** SIMULATOR — only offered where simulatorAvailableInBrowser() is true; the server re-checks. */
export const simulatorProvider = {
  id: "simulator",
  label: "Simulador de pago",
  isAvailable: simulatorAvailableInBrowser,
  simulate: async (orderId: string, outcome: SimulatedOutcome) => {
    try {
      return await simulatePayment({ data: { paymentOrderId: orderId, outcome } });
    } catch {
      return { ok: false as const, message: "No se pudo registrar el pago simulado." };
    }
  },
};
