/**
 * AnyOne¹⁶ — Payment orders on Foundation. Reads use RLS; every write goes
 * through a Foundation RPC that recalculates amounts server-side.
 */

import { foundation } from "@/integrations/foundation/client";

import type {
  PaymentAdminSummary,
  PaymentDetail,
  PaymentOrder,
  PaymentRefund,
  PaymentSubjectType,
  PaymentSummary,
  PaymentTransaction,
} from "./payment-model";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v == null ? null : String(v));

type RpcClient = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: PgError | null }>;
};
type PgError = { message: string; code?: string; hint?: string | null; details?: string | null };
const db = () => foundation as unknown as RpcClient & typeof foundation;

const MESSAGES: Record<string, string> = {
  not_authenticated: "Inicia sesión para continuar.",
  only_buyer_can_create_payment: "Solo quien contrata puede crear la orden de pago.",
  favor_has_no_selected_offer: "El favor todavía no tiene una oferta seleccionada.",
  favor_not_payable: "Este favor no se puede pagar en su estado actual.",
  demo_not_payable: "Las publicaciones de ejemplo no se pueden pagar.",
  contract_not_payable: "La contratación no se puede pagar en su estado actual.",
  payment_not_cancellable: "Este pago ya no se puede cancelar desde la app.",
  payment_not_refundable: "Solo se puede pedir reembolso de un pago confirmado.",
  refund_exceeds_total: "El reembolso supera el total pagado.",
  refund_reason_required: "Escribe un motivo de al menos 5 caracteres.",
  payment_order_not_found: "No se encontró el pago o no tienes acceso.",
};

export const PAYMENTS_NOT_INSTALLED =
  "El sistema de pagos todavía no está instalado en Foundation.";

function missing(e: PgError) {
  return ["PGRST202", "PGRST205", "42P01", "42883"].includes(e.code ?? "");
}

function paymentError(e: PgError): Error {
  if (missing(e)) return new Error(PAYMENTS_NOT_INSTALLED);
  const key = Object.keys(MESSAGES).find((k) => e.message.includes(k));
  const base = key ? MESSAGES[key]! : e.message;
  const extra = [e.code && `código ${e.code}`, e.hint && `pista: ${e.hint}`].filter(Boolean).join(" · ");
  return new Error(extra ? `${base} (${extra})` : base);
}

export const toOrder = (r: Row): PaymentOrder => ({
  id: String(r["id"]),
  subjectType: String(r["subject_type"]) as PaymentSubjectType,
  favorId: str(r["favor_id"]),
  favorOfferId: str(r["favor_offer_id"]),
  serviceContractId: str(r["service_contract_id"]),
  buyerProfileId: String(r["buyer_profile_id"]),
  providerProfileId: str(r["provider_profile_id"]),
  description: String(r["description"] ?? ""),
  subtotal: num(r["subtotal"]),
  platformFee: num(r["platform_fee"]),
  buyerFee: num(r["buyer_fee"]),
  providerFee: num(r["provider_fee"]),
  totalCharged: num(r["total_charged"]),
  providerPayout: num(r["provider_payout"]),
  currencyCode: String(r["currency_code"]),
  status: String(r["status"]) as PaymentOrder["status"],
  paymentProvider: String(r["payment_provider"] ?? "unconfigured"),
  externalPaymentId: str(r["external_payment_id"]),
  paidAt: str(r["paid_at"]),
  cancelledAt: str(r["cancelled_at"]),
  createdAt: String(r["created_at"]),
  updatedAt: String(r["updated_at"]),
});

const toTransaction = (r: Row): PaymentTransaction => ({
  id: String(r["id"]),
  paymentOrderId: String(r["payment_order_id"]),
  paymentProvider: String(r["payment_provider"]),
  externalTransactionId: str(r["external_transaction_id"]),
  amount: num(r["amount"]),
  currencyCode: String(r["currency_code"]),
  status: String(r["status"]) as PaymentTransaction["status"],
  createdAt: String(r["created_at"]),
});

const toRefund = (r: Row): PaymentRefund => ({
  id: String(r["id"]),
  paymentOrderId: String(r["payment_order_id"]),
  amount: num(r["amount"]),
  currencyCode: String(r["currency_code"]),
  reason: String(r["reason"]),
  status: String(r["status"]) as PaymentRefund["status"],
  externalRefundId: str(r["external_refund_id"]),
  createdAt: String(r["created_at"]),
  processedAt: str(r["processed_at"]),
});

const ORDER_COLUMNS =
  "id,subject_type,favor_id,favor_offer_id,service_contract_id,buyer_profile_id,provider_profile_id,description,subtotal,platform_fee,buyer_fee,provider_fee,total_charged,provider_payout,currency_code,status,payment_provider,external_payment_id,paid_at,cancelled_at,created_at,updated_at";

/** RLS returns only orders where the user is buyer or provider. */
export async function loadMyPaymentOrders(): Promise<PaymentOrder[]> {
  const { data, error } = await foundation
    .from("payment_orders" as never)
    .select(ORDER_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw paymentError(error as PgError);
  return ((data ?? []) as Row[]).map(toOrder);
}

export async function createPaymentOrder(subjectType: PaymentSubjectType, subjectId: string) {
  const { data, error } = await db().rpc("create_payment_order", {
    _subject_type: subjectType,
    _subject_id: subjectId,
  });
  if (error) throw paymentError(error);
  return toOrder(data as Row);
}

export async function getPaymentOrder(id: string): Promise<PaymentDetail> {
  const { data, error } = await db().rpc("get_payment_order", { _payment_order_id: id });
  if (error) throw paymentError(error);
  const d = data as { order: Row; transactions: Row[]; refunds: Row[]; viewer_role: PaymentDetail["viewerRole"] };
  return {
    order: toOrder(d.order),
    transactions: (d.transactions ?? []).map(toTransaction),
    refunds: (d.refunds ?? []).map(toRefund),
    viewerRole: d.viewer_role,
  };
}

export async function cancelPaymentOrder(id: string, reason?: string) {
  const { data, error } = await db().rpc("cancel_payment_order", {
    _payment_order_id: id,
    _reason: reason ?? null,
  });
  if (error) throw paymentError(error);
  return toOrder(data as Row);
}

export async function requestPaymentRefund(id: string, amount: number, reason: string) {
  const { data, error } = await db().rpc("request_payment_refund", {
    _payment_order_id: id,
    _amount: amount,
    _reason: reason,
  });
  if (error) throw paymentError(error);
  return toRefund(data as Row);
}

export async function loadMyEarnings(): Promise<PaymentSummary[]> {
  const { data, error } = await db().rpc("get_my_payment_earnings");
  if (error) throw paymentError(error);
  return ((data ?? []) as Row[]).map((r) => ({
    currencyCode: String(r["currency_code"]),
    pendingPayout: num(r["pending_payout"]),
    paidPayout: num(r["paid_payout"]),
    totalPayout: num(r["total_payout"]),
    feesDeducted: num(r["fees_deducted"]),
    ordersCount: num(r["orders_count"]),
  }));
}

export async function loadPaymentAdminSummary(): Promise<PaymentAdminSummary[]> {
  const { data, error } = await db().rpc("get_payment_admin_summary");
  if (error) throw paymentError(error);
  return ((data ?? []) as Row[]).map((r) => ({
    currencyCode: String(r["currency_code"]),
    totalVolume: num(r["total_volume"]),
    platformRevenue: num(r["platform_revenue"]),
    pendingCount: num(r["pending_count"]),
    paidCount: num(r["paid_count"]),
    failedCount: num(r["failed_count"]),
    refundedAmount: num(r["refunded_amount"]),
    pendingRefunds: num(r["pending_refunds"]),
  }));
}

/** Names of counterparts, when profiles RLS allows reading them. */
export async function loadProfileNames(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await foundation.from("profiles").select("id, full_name").in("id", ids);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as Row[]) if (r["full_name"]) out[String(r["id"])] = String(r["full_name"]);
  return out;
}
