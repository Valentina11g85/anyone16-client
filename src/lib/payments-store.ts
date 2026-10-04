/**
 * AnyOne¹⁶ — Stage 7 payments store.
 *
 * Observable snapshot of the financial records (payments, settlements,
 * refunds, disputes, fee configuration) hydrated from the backend, so every
 * amount survives navigation, reload and sign-out/sign-in.
 */

import { useEffect, useSyncExternalStore } from "react";

import {
  computeSettlement,
  pickCancellationPolicy,
  pickFeeRule,
  type CancellationPolicy,
  type Dispute,
  type Payment,
  type PaymentEvent,
  type PaymentStatus,
  type PlatformFeeRule,
  type Refund,
  type Settlement,
  type SettlementBreakdown,
} from "./payments-model";
import {
  createPaymentForFavor,
  createRefund,
  createSettlement,
  isAdminUser,
  loadFinance,
  openDispute,
  releaseSettlement,
  updatePaymentStatus,
} from "./payments-repo";

export type FinanceState = {
  payments: Payment[];
  settlements: Settlement[];
  refunds: Refund[];
  disputes: Dispute[];
  events: PaymentEvent[];
  feeRules: PlatformFeeRule[];
  policies: CancellationPolicy[];
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
};

const initialState: FinanceState = {
  payments: [],
  settlements: [],
  refunds: [],
  disputes: [],
  events: [],
  feeRules: [],
  policies: [],
  isAdmin: false,
  loading: true,
  error: null,
};

let state: FinanceState = initialState;
const listeners = new Set<() => void>();

function set(update: (current: FinanceState) => FinanceState) {
  state = update(state);
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getState = () => state;
const getServerState = () => initialState;

let hydrating: Promise<void> | null = null;

export function hydrateFinance(force = false) {
  if (hydrating && !force) return hydrating;
  hydrating = (async () => {
    try {
      const [snapshot, admin] = await Promise.all([loadFinance(), isAdminUser()]);
      set((current) => ({
        ...current,
        ...snapshot,
        isAdmin: admin,
        loading: false,
        error: null,
      }));
    } catch (error) {
      set((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "finance_load_failed",
      }));
    }
  })();
  return hydrating;
}

export function useFinance() {
  const snapshot = useSyncExternalStore(subscribe, getState, getServerState);
  useEffect(() => {
    void hydrateFinance();
  }, []);
  return snapshot;
}

const refresh = () => hydrateFinance(true);

/* ------------------------------------------------------------- queries -- */

export const paymentForFavor = (finance: FinanceState, favorId: string) =>
  finance.payments.find(
    (payment) => payment.favorId === favorId && payment.status !== "cancelled",
  ) ?? null;

export const settlementForPayment = (finance: FinanceState, paymentId: string) =>
  finance.settlements.find((settlement) => settlement.paymentId === paymentId) ?? null;

export const refundsForPayment = (finance: FinanceState, paymentId: string) =>
  finance.refunds.filter((refund) => refund.paymentId === paymentId);

export const disputesForFavor = (finance: FinanceState, favorId: string) =>
  finance.disputes.filter((dispute) => dispute.favorId === favorId);

export const paymentsForCustomer = (finance: FinanceState, profileId: string | null) =>
  finance.payments.filter((payment) =>
    profileId ? payment.customerProfileId === profileId : payment.isDemo,
  );

export const settlementsForWorker = (finance: FinanceState, workerProfileId: string | null) =>
  finance.settlements.filter((settlement) =>
    workerProfileId ? settlement.workerProfileId === workerProfileId : settlement.isDemo,
  );

/** Breakdown preview: commission always comes from the configurable rules. */
export function quoteFavorPayment(
  finance: FinanceState,
  input: {
    amount: number;
    currencyCode: string;
    countryCode?: string | null;
    categorySlug?: string | null;
    city?: string | null;
  },
): SettlementBreakdown {
  const rule = pickFeeRule(finance.feeRules, {
    countryCode: input.countryCode ?? null,
    currencyCode: input.currencyCode,
    categorySlug: input.categorySlug ?? null,
    city: input.city ?? null,
  });
  return computeSettlement({ amount: input.amount, currencyCode: input.currencyCode, rule });
}

export const cancellationPolicyFor = (
  finance: FinanceState,
  input: { actor: string; trigger: string; countryCode?: string | null },
) => pickCancellationPolicy(finance.policies, input);

/* ----------------------------------------------------------- mutations -- */

export async function startFavorPayment(input: {
  favorId: string;
  offerId: string | null;
  customerProfileId: string | null;
  workerProfileId: string | null;
  breakdown: SettlementBreakdown;
  method: string;
  isDemo: boolean;
}) {
  const payment = await createPaymentForFavor({
    favorId: input.favorId,
    offerId: input.offerId,
    customerProfileId: input.customerProfileId,
    workerProfileId: input.workerProfileId,
    breakdown: input.breakdown,
    method: input.method,
    actorProfileId: input.customerProfileId,
    isDemo: input.isDemo,
  });
  await refresh();
  return payment;
}

export async function advancePayment(
  payment: Payment,
  next: PaymentStatus,
  actorProfileId: string | null,
  method?: string,
) {
  const updated = await updatePaymentStatus(payment, next, { actorProfileId, ...(method ? { method } : {}) });
  await refresh();
  return updated;
}

/** Test flow: pending -> paid -> held, and prepares the settlement. */
export async function runTestPayment(payment: Payment, actorProfileId: string | null) {
  let current = payment;
  if (current.status === "unpaid") current = await updatePaymentStatus(current, "payment_pending", { actorProfileId });
  if (current.status === "payment_pending") current = await updatePaymentStatus(current, "authorized", { actorProfileId });
  if (current.status === "authorized") current = await updatePaymentStatus(current, "paid", { actorProfileId });
  if (current.status === "paid") current = await updatePaymentStatus(current, "held", { actorProfileId });
  await createSettlement(current, actorProfileId);
  await refresh();
  return current;
}

export async function releaseFavorSettlement(settlement: Settlement, actorProfileId: string | null) {
  const released = await releaseSettlement(settlement, actorProfileId);
  const payment = state.payments.find((item) => item.id === settlement.paymentId);
  if (payment && (payment.status === "held" || payment.status === "paid")) {
    await updatePaymentStatus(payment, "released", { actorProfileId });
  }
  await refresh();
  return released;
}

export async function refundPayment(input: {
  payment: Payment;
  amount: number;
  reason: string;
  kind: "full" | "partial";
  actorProfileId: string | null;
}) {
  const refund = await createRefund(input);
  const next = input.kind === "full" ? "refunded" : "partially_refunded";
  try {
    await updatePaymentStatus(input.payment, next, { actorProfileId: input.actorProfileId });
  } catch {
    // Invalid transition (for example already refunded): the refund record stands.
  }
  await refresh();
  return refund;
}

export async function cancelPayment(payment: Payment, actorProfileId: string | null) {
  const updated = await updatePaymentStatus(payment, "cancelled", { actorProfileId });
  await refresh();
  return updated;
}

export async function openFavorDispute(input: {
  favorId: string;
  paymentId: string | null;
  openedByProfileId: string | null;
  openedByRole: string;
  reason: string;
  description?: string;
  isDemo: boolean;
}) {
  const dispute = await openDispute(input);
  await refresh();
  return dispute;
}
