/**
 * Premium access to the Oportunidades marketplace (services and job offers).
 *
 * Authorization lives in Foundation: the browser only ASKS whether the account
 * has access (RPC `get_my_opportunities_access`). Until that RPC exists (pending
 * SQL in docs/foundation-pending), every account is treated as locked. The
 * marketplace data itself comes only from Foundation's premium RPC.
 * Nothing in browser storage or React state can grant access.
 */
import { useOpportunities, type OpportunitiesAccessState } from "@/lib/opportunities-store";

export const OPPORTUNITIES_UNLOCK_PRICE = 4000;
export const OPPORTUNITIES_UNLOCK_CURRENCY = "COP";
export const OPPORTUNITIES_UNLOCK_LABEL = "$4.000 COP";

export type OpportunitiesAccess = OpportunitiesAccessState;

/**
 * Access as decided by Foundation (get_my_opportunities_access, loaded by the
 * Oportunidades store together with the data it gates). Read-only for the UI.
 */
export function useOpportunitiesAccess(): OpportunitiesAccess {
  return useOpportunities().access;
}

export type UnlockResult =
  | { status: "redirect"; url: string }
  | { status: "provider_pending" };

/**
 * Provider-agnostic purchase entry point. It never grants access: the real
 * provider must create the order server-side and the entitlement is only
 * activated by Foundation after a confirmed payment. No provider is connected yet.
 */
export async function startOpportunitiesUnlock(): Promise<UnlockResult> {
  return { status: "provider_pending" };
}
