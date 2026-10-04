/**
 * One-shot request to open a specific Oportunidades item (from a notification).
 * Carries only Foundation IDs from the notification row; the screen resolves
 * them against data already filtered by RLS, so nothing the user can't see opens.
 */
import { useSyncExternalStore } from "react";

export type FocusSection = "negotiation" | "contract" | "review" | "chat" | "listing";
export type OpportunityFocus = {
  listingId: string | null;
  offerId: string | null;
  section: FocusSection;
  nonce: number;
};

let current: OpportunityFocus | null = null;
const listeners = new Set<() => void>();

export function requestOpportunityFocus(f: Omit<OpportunityFocus, "nonce">) {
  current = { ...f, nonce: Date.now() };
  listeners.forEach((l) => l());
}

export function clearOpportunityFocus() {
  current = null;
  listeners.forEach((l) => l());
}

export function useOpportunityFocus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}

export function sectionForType(type: string): FocusSection {
  const t = type.toLowerCase();
  if (t.startsWith("service_contract") || t === "service_offer_accepted") return "contract";
  if (t.startsWith("service_review")) return "review";
  if (t.startsWith("service_message")) return "chat";
  if (t.startsWith("service_offer") || t === "service_counter_offer") return "negotiation";
  return "listing";
}
