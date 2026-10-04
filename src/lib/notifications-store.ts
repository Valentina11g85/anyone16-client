/**
 * AnyOne¹⁶ — Notifications from Foundation `public.notifications`.
 * Foundation is the only source; this module just caches the last read in memory.
 * RLS decides visibility; we also filter by the signed-in profile_id.
 */
import { useSyncExternalStore } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { foundation as typedFoundation } from "@/integrations/foundation/client";

// Untyped: generated types predate related_service_* / related_payment_order_id.
const foundation = typedFoundation as unknown as SupabaseClient;

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
  relatedFavorId: string | null;
  relatedOfferId: string | null;
  relatedServiceListingId: string | null;
  relatedServiceOfferId: string | null;
  relatedPaymentOrderId: string | null;
};

type State = { status: "idle" | "loading" | "ready" | "error"; items: AppNotification[]; error: string | null; profileId: string | null };

let state: State = { status: "idle", items: [], error: null, profileId: null };
const listeners = new Set<() => void>();
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};

type Row = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  related_favor_id: string | null;
  related_offer_id: string | null;
  related_service_listing_id: string | null;
  related_service_offer_id: string | null;
  related_payment_order_id: string | null;
};

const map = (r: Row): AppNotification => ({
  id: r.id,
  type: r.type,
  title: r.title,
  body: r.body,
  isRead: r.is_read,
  createdAt: r.created_at,
  relatedFavorId: r.related_favor_id,
  relatedOfferId: r.related_offer_id,
  relatedServiceListingId: r.related_service_listing_id,
  relatedServiceOfferId: r.related_service_offer_id,
  relatedPaymentOrderId: r.related_payment_order_id,
});

export async function loadNotifications(profileId: string | null) {
  if (!profileId) return set({ status: "idle", items: [], error: null, profileId: null });
  if (state.profileId !== profileId) set({ items: [], profileId });
  if (state.items.length === 0) set({ status: "loading" });
  const { data, error } = await foundation
    .from("notifications")
    .select(
      "id,type,title,body,is_read,created_at,related_favor_id,related_offer_id,related_service_listing_id,related_service_offer_id,related_payment_order_id",
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (state.profileId !== profileId) return;
  if (error) return set({ status: "error", error: error.message });
  set({ status: "ready", items: ((data ?? []) as Row[]).map(map), error: null });
}

async function markIds(ids: string[]) {
  if (ids.length === 0) return;
  const { data, error } = await foundation
    .from("notifications")
    .update({ is_read: true })
    .in("id", ids)
    .select("id");
  if (error) throw new Error(error.message);
  const done = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  if (done.size === 0) throw new Error("Foundation no permitió marcar la notificación como leída.");
  set({ items: state.items.map((n) => (done.has(n.id) ? { ...n, isRead: true } : n)) });
}

export const markNotificationRead = (id: string) => markIds([id]);
export const markAllNotificationsRead = () => markIds(state.items.filter((n) => !n.isRead).map((n) => n.id));

export function useNotifications() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** Human label for Foundation's real notification types. */
export function notificationKind(type: string): string {
  const t = type.toLowerCase();
  if (t === "payment_paid" || t === "payment_confirmed") return "Pago confirmado";
  if (t === "payment_failed") return "Pago rechazado";
  if (t === "payment_refunded" || t.includes("refund")) return "Pago reembolsado";
  if (t === "payment_pending" || t === "payment_processing" || t === "payment_required") return "Pago pendiente";
  if (t === "payment_cancelled") return "Pago cancelado";
  if (t.startsWith("payment")) return "Pago";
  if (t === "service_counter_offer") return "Contraoferta";
  if (t === "service_offer_accepted") return "Propuesta aceptada";
  if (t === "service_offer_rejected") return "Propuesta rechazada";
  if (t.startsWith("service_offer")) return "Propuesta";
  if (t === "service_contract_confirmed") return "Contratación confirmada";
  if (t === "service_contract_in_progress" || t === "service_contract_started") return "Servicio iniciado";
  if (t === "service_contract_completed") return "Servicio completado";
  if (t === "service_contract_cancelled") return "Contratación cancelada";
  if (t === "service_contract_disputed") return "Disputa";
  if (t.startsWith("service_review")) return "Calificación";
  if (t.startsWith("service_message")) return "Mensaje";
  if (t.startsWith("service")) return "Oportunidades";
  return "Favores";
}
