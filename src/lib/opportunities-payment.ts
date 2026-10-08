/**
 * Oportunidades Premium — checkout layer (provider-agnostic).
 *
 * This module NEVER grants access. Its only jobs are:
 *  1. ask the (future) server-side checkout for a payment URL, and
 *  2. after returning from the provider, RE-READ Foundation until it confirms.
 *
 * The real flow, once the provider is connected:
 *   UI → server checkout (createServerFn) → provider → signed webhook → backend
 *   → activate_opportunities_access(...) → Foundation → get_my_opportunities_access().
 *
 * URL params on return (e.g. ?opp_checkout=return) are only a UX hint to show
 * "confirmando"; they never unlock anything. Nothing is stored in the browser.
 */
import { getMyOpportunitiesAccess } from "./opportunities-repo";
import { refreshOpportunities } from "./opportunities-store";

export type PremiumCheckoutResult =
  | { status: "NOT_CONFIGURED" }
  | { status: "REDIRECT"; url: string }
  | { status: "ALREADY_ACTIVE" }
  | { status: "ERROR"; message: string };

/** Query param the future provider return URL will carry (display hint only). */
export const CHECKOUT_RETURN_PARAM = "opp_checkout";

/** Foundation is the only source of truth. Errors → false (locked). */
export async function hasPremiumAccess(): Promise<boolean> {
  try {
    return await getMyOpportunitiesAccess();
  } catch {
    return false;
  }
}

/**
 * Starts the purchase. Today no provider is connected, so it returns
 * NOT_CONFIGURED. To connect the provider, replace ONLY the marked block with a
 * call to a server function that creates the checkout session and returns its URL.
 */
export async function startOpportunitiesPremiumCheckout(): Promise<PremiumCheckoutResult> {
  if (await hasPremiumAccess()) return { status: "ALREADY_ACTIVE" };
  // ── Provider integration point ────────────────────────────────────────────
  // const { url } = await createOpportunitiesCheckout(); // server-side, authenticated
  // return { status: "REDIRECT", url };
  return { status: "NOT_CONFIGURED" };
}

/** True when the page was opened as the provider's return URL (hint only). */
export function isCheckoutReturn(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has(CHECKOUT_RETURN_PARAM);
}

/** Removes the return hint from the address bar without reloading. */
export function clearCheckoutReturn() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete(CHECKOUT_RETURN_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

/**
 * Re-reads Foundation a limited number of times (no infinite polling).
 * Resolves true only when Foundation confirms access; then reloads the store so
 * the marketplace is fetched through get_opportunities_market().
 */
export async function waitForPremiumConfirmation(attempts = 6, intervalMs = 4000): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await hasPremiumAccess()) {
      await refreshOpportunities();
      return true;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
