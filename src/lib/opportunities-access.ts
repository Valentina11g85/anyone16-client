/**
 * Premium access to the Oportunidades marketplace (services and job offers).
 *
 * Authorization lives in Foundation: the browser only ASKS whether the account
 * has access (RPC `get_my_opportunities_access`). Until that RPC exists (pending
 * SQL proposal in docs/foundation-pending), every account is treated as locked.
 * Nothing in browser storage or React state can grant access.
 */
import { useEffect, useState } from "react";

import { foundation } from "@/integrations/foundation/client";
import type { ServiceListing, ServiceOffer, ServiceContract } from "@/lib/opportunities-model";

export const OPPORTUNITIES_UNLOCK_PRICE = 4000;
export const OPPORTUNITIES_UNLOCK_CURRENCY = "COP";
export const OPPORTUNITIES_UNLOCK_LABEL = "$4.000 COP";

export type OpportunitiesAccess = "loading" | "locked" | "unlocked";

export function useOpportunitiesAccess(profileId: string | null): OpportunitiesAccess {
  const [access, setAccess] = useState<OpportunitiesAccess>("loading");
  useEffect(() => {
    let active = true;
    if (!profileId) {
      setAccess("locked");
      return;
    }
    setAccess("loading");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (foundation as any)
      .rpc("get_my_opportunities_access")
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (!active) return;
        const row = Array.isArray(data) ? data[0] : data;
        const ok =
          !error &&
          (row === true ||
            (typeof row === "object" && row !== null && (row as { active?: boolean }).active === true));
        setAccess(ok ? "unlocked" : "locked");
      })
      .catch(() => active && setAccess("locked"));
    return () => {
      active = false;
    };
  }, [profileId]);
  return access;
}

/** Every market listing is premium unless it is mine or I already take part in it. */
export function isPremiumLocked(
  listing: ServiceListing,
  myProfileId: string | null,
  access: OpportunitiesAccess,
  offers: ServiceOffer[],
  contracts: ServiceContract[],
): boolean {
  if (access === "unlocked") return false;
  if (myProfileId && listing.authorProfileId === myProfileId) return false;
  if (
    myProfileId &&
    offers.some((o) => o.listingId === listing.id && o.fromProfileId === myProfileId)
  )
    return false;
  if (contracts.some((c) => c.listingId === listing.id)) return false;
  return true;
}

/** Keeps only the public teaser fields. Real protection requires the pending Foundation SQL. */
export function redactListing(l: ServiceListing): ServiceListing {
  return {
    ...l,
    authorProfileId: null,
    authorName: "",
    authorPhotoUrl: null,
    description: "",
    price: null,
    availabilityNote: "",
    duration: "",
    city: "",
    zone: "",
    radiusKm: null,
    languages: [],
    photos: [],
    portfolio: [],
    premiumLocked: true,
  };
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
