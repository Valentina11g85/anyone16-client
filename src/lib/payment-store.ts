/** AnyOne¹⁶ — payment orders store. Foundation is the only source of truth. */

import { useEffect, useSyncExternalStore } from "react";

import { foundation } from "@/integrations/foundation/client";
import { subscribeLive } from "@/lib/realtime";
import type { PaymentOrder, PaymentSubjectType } from "./payment-model";
import {
  cancelPaymentOrder,
  createPaymentOrder,
  loadMyPaymentOrders,
  loadProfileNames,
} from "./payment-repo";

export type PaymentStoreState = {
  orders: PaymentOrder[];
  names: Record<string, string>;
  loading: boolean;
  error: string | null;
};

let state: PaymentStoreState = { orders: [], names: {}, loading: true, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<PaymentStoreState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let started = false;

export async function refreshPayments() {
  try {
    const { data } = await foundation.auth.getSession();
    if (!data.session) {
      set({ orders: [], names: {}, loading: false, error: null });
      return;
    }
    const orders = await loadMyPaymentOrders();
    const ids = [...new Set(orders.flatMap((o) => [o.buyerProfileId, o.providerProfileId]).filter(Boolean))] as string[];
    const names = await loadProfileNames(ids);
    set({ orders, names, loading: false, error: null });
  } catch (e) {
    set({ loading: false, error: (e as Error).message });
  }
}

function start() {
  if (started) return;
  started = true;
  void refreshPayments();
  foundation.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") void refreshPayments();
  });
  // Live payment_orders status (read-only: status always comes from Foundation).
  subscribeLive({
    name: "payments-live",
    tables: [{ table: "payment_orders" }],
    onChange: () => void refreshPayments(),
    fallbackMs: 30000,
    debounceMs: 400,
  });
}

export const getPaymentState = () => state;

export function usePayments() {
  useEffect(start, []);
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function activeOrderFor(subjectType: PaymentSubjectType, subjectId: string) {
  return (
    state.orders.find(
      (o) =>
        o.subjectType === subjectType &&
        (subjectType === "favor" ? o.favorId : o.serviceContractId) === subjectId &&
        o.status !== "cancelled" &&
        o.status !== "failed",
    ) ?? null
  );
}

export async function ensurePaymentOrder(subjectType: PaymentSubjectType, subjectId: string) {
  const order = await createPaymentOrder(subjectType, subjectId);
  await refreshPayments();
  return order;
}

export async function cancelOrder(id: string, reason?: string) {
  const order = await cancelPaymentOrder(id, reason);
  await refreshPayments();
  return order;
}
