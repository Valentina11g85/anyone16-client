/**
 * AnyOne¹⁶ — Payment domain (payment_orders / payment_transactions / payment_refunds).
 * Amounts are computed by Foundation. The app only displays them.
 */

export type PaymentSubjectType = "favor" | "service_contract";

export type PaymentOrderStatus =
  | "pending"
  | "processing"
  | "authorized"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export type PaymentTransactionStatus =
  | "pending"
  | "processing"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "refunded";

export type PaymentRefundStatus = "pending" | "processing" | "succeeded" | "failed" | "cancelled";

export type PaymentOrder = {
  id: string;
  subjectType: PaymentSubjectType;
  favorId: string | null;
  favorOfferId: string | null;
  serviceContractId: string | null;
  buyerProfileId: string;
  providerProfileId: string | null;
  description: string;
  subtotal: number;
  platformFee: number;
  buyerFee: number;
  providerFee: number;
  totalCharged: number;
  providerPayout: number;
  currencyCode: string;
  status: PaymentOrderStatus;
  paymentProvider: string;
  externalPaymentId: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentTransaction = {
  id: string;
  paymentOrderId: string;
  paymentProvider: string;
  externalTransactionId: string | null;
  amount: number;
  currencyCode: string;
  status: PaymentTransactionStatus;
  createdAt: string;
};

export type PaymentRefund = {
  id: string;
  paymentOrderId: string;
  amount: number;
  currencyCode: string;
  reason: string;
  status: PaymentRefundStatus;
  externalRefundId: string | null;
  createdAt: string;
  processedAt: string | null;
};

export type PaymentDetail = {
  order: PaymentOrder;
  transactions: PaymentTransaction[];
  refunds: PaymentRefund[];
  viewerRole: "buyer" | "provider" | "admin";
};

/** Earnings per currency — never mixed, never converted. */
export type PaymentSummary = {
  currencyCode: string;
  pendingPayout: number;
  paidPayout: number;
  totalPayout: number;
  feesDeducted: number;
  ordersCount: number;
};

export type PaymentAdminSummary = {
  currencyCode: string;
  totalVolume: number;
  platformRevenue: number;
  pendingCount: number;
  paidCount: number;
  failedCount: number;
  refundedAmount: number;
  pendingRefunds: number;
};

export const ORDER_STATUS_LABEL: Record<PaymentOrderStatus, string> = {
  pending: "Esperando pago",
  processing: "Procesando pago",
  authorized: "Pago autorizado",
  paid: "Pagado",
  failed: "Pago fallido",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial",
};

export const REFUND_STATUS_LABEL: Record<PaymentRefundStatus, string> = {
  pending: "Reembolso pendiente",
  processing: "Reembolso en proceso",
  succeeded: "Reembolso confirmado",
  failed: "Reembolso fallido",
  cancelled: "Reembolso cancelado",
};

export type PaymentFilter = "all" | "pending" | "paid" | "failed" | "refunded";

export function matchesFilter(status: PaymentOrderStatus, filter: PaymentFilter) {
  switch (filter) {
    case "all":
      return true;
    case "pending":
      return status === "pending" || status === "processing" || status === "authorized";
    case "paid":
      return status === "paid";
    case "failed":
      return status === "failed" || status === "cancelled";
    case "refunded":
      return status === "refunded" || status === "partially_refunded";
  }
}

/** Display only. Uses the order's own currency; never converts. */
export function formatPaymentMoney(amount: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("es", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "symbol",
    }).format(amount);
  } catch {
    return `${amount} ${currencyCode}`;
  }
}
