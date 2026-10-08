/** AnyOne¹⁶ — Oportunidades observable store. Foundation is the source of truth. */

import { useEffect, useSyncExternalStore } from "react";

import { foundation } from "@/integrations/foundation/client";
import { subscribeLive } from "@/lib/realtime";
import type {
  ContractStatus,
  ServiceContract,
  ServiceListing,
  ServiceOffer,
  ServiceReview,
  Reputation,
} from "./opportunities-model";
import {
  DEMO_LISTINGS,
  ensureContract,
  loadContracts,
  loadServiceReputation,
  loadServiceReviews,
  submitServiceReview,
  notifyParticipant,
  opportunitiesAdapter,
  updateContractStatus,
} from "./opportunities-repo";

export type OpportunitiesAccessState = "loading" | "locked" | "unlocked";

export type OpportunitiesState = {
  /**
   * Everything this account may see, from three separate safe sources:
   * market (premium RPC) ∪ my own listings ∪ concrete related listings (single-listing RPC).
   * Use `market` — never `listings` — to render the general marketplace.
   */
  listings: ServiceListing[];
  /** General marketplace rows only (get_opportunities_market). Empty without premium. */
  market: ServiceListing[];
  /** Server-decided premium access of the current account (UX only, never grants anything). */
  access: OpportunitiesAccessState;
  offers: ServiceOffer[];
  contracts: ServiceContract[];
  reviews: ServiceReview[];
  reputation: Record<string, Reputation>;
  loading: boolean;
  backend: "device" | "foundation";
  error: string | null;
};

const initialState: OpportunitiesState = {
  listings: [],
  market: [],
  access: "loading",
  offers: [],
  contracts: [],
  reviews: [],
  reputation: {},
  loading: true,
  backend: opportunitiesAdapter.kind,
  error: null,
};

let state = initialState;
const listeners = new Set<() => void>();
const set = (update: (s: OpportunitiesState) => OpportunitiesState) => {
  state = update(state);
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const isDemoId = (id: string) => id.startsWith("demo-");

const mergeListings = (...groups: ServiceListing[][]) => {
  const byId = new Map<string, ServiceListing>();
  groups.flat().forEach((l) => byId.set(l.id, l));
  return [...byId.values()];
};

let lastUserId: string | null = null;

async function reload() {
  set((s) => ({ ...s, loading: true }));
  try {
    const { data } = await foundation.auth.getSession();
    const userId = data.session?.user.id ?? null;
    if (userId !== lastUserId) {
      // Account changed: drop everything from the previous account before loading.
      lastUserId = userId;
      set(() => ({ ...initialState, loading: Boolean(userId), access: userId ? "loading" : "locked" }));
    }
    if (!userId) {
      set((s) => ({ ...s, ...initialState, access: "locked", loading: false }));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: me } = await (foundation as any)
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const profileId: string | null = me?.id ?? null;

    const premium = await getMyOpportunitiesAccess();
    // Without premium the marketplace is not even requested.
    const market = premium ? await getMarketplaceListings() : [];
    const own = profileId ? await getMyListings(profileId) : [];
    const contracts = await loadContracts();
    const known = mergeListings(market, own);
    const offers = await opportunitiesAdapter.loadOffers(known);
    // Concrete listings I take part in (offers/contracts), one by one via the single-listing RPC.
    const relatedIds = [
      ...new Set([...offers.map((o) => o.listingId), ...contracts.map((c) => c.listingId)]),
    ].filter((id) => id && !isDemoId(id) && !known.some((l) => l.id === id));
    const related = (await Promise.all(relatedIds.map((id) => getMarketplaceListingById(id)))).filter(
      (l): l is ServiceListing => l !== null,
    );
    const listings = mergeListings(market, own, related);
    const reviews = await loadServiceReviews();
    const ids = new Set<string>();
    listings.forEach((l) => l.authorProfileId && ids.add(l.authorProfileId));
    contracts.forEach((c) => (ids.add(c.buyerProfileId), ids.add(c.providerProfileId)));
    const reputation = await loadServiceReputation([...ids]);
    if (lastUserId !== userId) return; // session changed while loading
    set((s) => ({
      ...s,
      listings,
      market,
      access: premium ? "unlocked" : "locked",
      contracts,
      reviews,
      reputation,
      // Keep in-memory negotiations on example cards (never persisted).
      offers: [...offers, ...s.offers.filter((o) => isDemoId(o.listingId))],
      loading: false,
      error: null,
    }));
  } catch (e) {
    set((s) => ({
      ...s,
      loading: false,
      error: `No se pudieron cargar las oportunidades: ${(e as Error).message}`,
    }));
  }
}

/**
 * Opens ONE concrete listing by id (deep links, contracts, chat). Uses only the
 * single-listing RPC; null means Foundation does not authorize it for this account.
 */
export async function loadListingById(id: string): Promise<ServiceListing | null> {
  const local = findListing(state, id);
  if (local) return local;
  const listing = await getMarketplaceListingById(id);
  if (listing) set((s) => ({ ...s, listings: mergeListings(s.listings, [listing]) }));
  return listing;
}

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  void reload();
  foundation.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
      void reload();
    }
  });
  // Live offers/counteroffers, contracts and listings; 30 s poll only if realtime is down.
  subscribeLive({
    name: "opportunities-live",
    // notifications: every contract transition / review notifies the other party, so it
    // also refreshes them when service_contracts events don't reach this client.
    tables: [
      { table: "service_offers" },
      { table: "service_contracts" },
      { table: "service_listings" },
      { table: "service_reviews" },
      { table: "notifications" },
    ],
    onChange: () => void reload(),
    fallbackMs: 30000,
    debounceMs: 400,
  });
  // Coming back to the app always re-reads the real state from Foundation.
  const onVisible = () => document.visibilityState === "visible" && void reload();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
}

export function useOpportunities() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => initialState,
  );
  useEffect(() => {
    start();
  }, []);
  return snapshot;
}

export const refreshOpportunities = reload;

/** Real published listings first, then clearly-flagged examples. */
export const feedListings = (s: OpportunitiesState) => [
  ...s.listings.filter((l) => l.status === "ACTIVE"),
  ...DEMO_LISTINGS,
];

export const findListing = (s: OpportunitiesState, id: string) =>
  s.listings.find((l) => l.id === id) ?? DEMO_LISTINGS.find((l) => l.id === id) ?? null;

const reportError = (prefix: string, e: unknown) => {
  const message = `${prefix}: ${(e as Error).message}`;
  set((s) => ({ ...s, error: message }));
  return new Error(message);
};

/** Throws when Foundation rejects; state only changes after confirmation. */
export async function saveListing(listing: ServiceListing) {
  try {
    const saved = await opportunitiesAdapter.saveListing(listing);
    set((s) => ({
      ...s,
      error: null,
      listings: [saved, ...s.listings.filter((l) => l.id !== saved.id)],
    }));
    return saved;
  } catch (e) {
    throw reportError("No se pudo guardar la publicación", e);
  }
}

export async function setListingStatus(listing: ServiceListing, status: ServiceListing["status"]) {
  try {
    return await saveListing({ ...listing, status });
  } catch {
    return null;
  }
}

export async function deleteListing(listing: ServiceListing) {
  try {
    await opportunitiesAdapter.deleteListing(listing.id);
    set((s) => ({ ...s, listings: s.listings.filter((l) => l.id !== listing.id) }));
  } catch (e) {
    reportError("No se pudo eliminar la publicación", e);
  }
}

export const offersForListing = (s: OpportunitiesState, listingId: string) =>
  s.offers
    .filter((o) => o.listingId === listingId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export async function sendServiceOffer(input: Omit<ServiceOffer, "id" | "createdAt" | "status">) {
  let offer: ServiceOffer = {
    ...input,
    id: crypto.randomUUID(),
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
  const listing = findListing(state, input.listingId);
  try {
    // A counteroffer is a new row; earlier proposals are never touched, so a
    // failed insert leaves no partial change.
    if (listing && !listing.isDemo) {
      offer = await opportunitiesAdapter.createOffer(offer, listing);
      await notifySafe(
        offer.id,
        offer.kind === "counter" ? "service_counter_offer" : "service_offer",
        offer.kind === "counter" ? "Contraoferta recibida" : "Nueva propuesta recibida",
        `${listing.title} · ${offer.amount} ${offer.currencyCode}`,
      );
    }
    set((s) => ({ ...s, error: null, offers: [...s.offers, offer] }));
    return offer;
  } catch (e) {
    reportError("No se pudo enviar la propuesta", e);
    return null;
  }
}

/** Notification failures never undo the negotiation step; they are reported. */
async function notifySafe(offerId: string, type: string, title: string, body: string) {
  try {
    await notifyParticipant(offerId, type, title, body);
  } catch (e) {
    reportError("No se pudo enviar la notificación", e);
  }
}

export async function updateOfferStatus(
  offer: ServiceOffer,
  status: ServiceOffer["status"],
  opts: { notify?: boolean } = {},
) {
  if (!isDemoId(offer.listingId)) {
    try {
      await opportunitiesAdapter.updateOfferStatus(offer, status);
    } catch (e) {
      reportError("No se pudo actualizar la propuesta", e);
      return false;
    }
  }
  const next = { ...offer, status };
  set((s) => ({ ...s, offers: s.offers.map((o) => (o.id === offer.id ? next : o)) }));
  if (!isDemoId(offer.listingId) && opts.notify) {
    if (status === "ACCEPTED") {
      await notifySafe(offer.id, "service_offer_accepted", "Precio acordado", `${offer.amount} ${offer.currencyCode}`);
      try {
        const contract = await ensureContract(next);
        set((s) => ({
          ...s,
          contracts: [contract, ...s.contracts.filter((c) => c.id !== contract.id)],
        }));
      } catch (e) {
        reportError("No se pudo crear la contratación", e);
      }
    } else if (status === "REJECTED") {
      await notifySafe(offer.id, "service_offer_rejected", "Propuesta rechazada", "");
    }
  }
  return true;
}

export const contractForListing = (s: OpportunitiesState, listingId: string) =>
  s.contracts
    .filter((c) => c.listingId === listingId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

export async function setContractStatus(
  contract: ServiceContract,
  status: ContractStatus,
  reason?: string,
) {
  try {
    const next = await updateContractStatus(contract.id, status, reason);
    set((s) => ({ ...s, error: null, contracts: s.contracts.map((c) => (c.id === next.id ? next : c)) }));
    void reload();
    return next;
  } catch (e) {
    reportError("No se pudo actualizar la contratación", e);
    return null;
  }
}

export const reviewsFor = (s: OpportunitiesState, profileId: string | null) =>
  profileId ? s.reviews.filter((r) => r.reviewedProfileId === profileId) : [];

export const myReviewFor = (s: OpportunitiesState, contractId: string, me: string | null) =>
  s.reviews.find((r) => r.contractId === contractId && r.reviewerProfileId === me) ?? null;

/** Saves through Foundation, then reloads the aggregate it computed. */
export async function rateContract(contract: ServiceContract, rating: number, comment: string) {
  try {
    const review = await submitServiceReview(contract.id, rating, comment);
    const reputation = await loadServiceReputation([review.reviewedProfileId]);
    set((s) => ({
      ...s,
      error: null,
      reviews: [review, ...s.reviews.filter((r) => r.id !== review.id)],
      reputation: { ...s.reputation, ...reputation },
    }));
    return review;
  } catch (e) {
    reportError("No se pudo guardar la calificación", e);
    return null;
  }
}

/**
 * Review shown on a listing card: only reviews of THAT listing's contract, picked
 * for the viewer (the listing author): the one they received first, else the one they wrote.
 */
export function cardReviewFor(s: OpportunitiesState, listing: ServiceListing) {
  const viewer = listing.authorProfileId;
  if (!viewer || listing.isDemo) return null;
  const contract = contractForListing(s, listing.id);
  if (!contract) return null;
  const forContract = s.reviews.filter((r) => r.contractId === contract.id);
  const received = forContract.find((r) => r.reviewedProfileId === viewer);
  if (received) return { label: "Calificación recibida", rating: received.rating };
  const written = forContract.find((r) => r.reviewerProfileId === viewer);
  if (written) return { label: "Tu calificación", rating: written.rating };
  return null;
}
