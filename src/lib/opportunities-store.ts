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

export type OpportunitiesState = {
  listings: ServiceListing[];
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

async function reload() {
  set((s) => ({ ...s, loading: true }));
  try {
    const { data } = await foundation.auth.getSession();
    if (!data.session) {
      set((s) => ({ ...s, listings: [], offers: [], contracts: [], reviews: [], reputation: {}, loading: false, error: null }));
      return;
    }
    const listings = await opportunitiesAdapter.loadListings();
    const offers = await opportunitiesAdapter.loadOffers(listings);
    const contracts = await loadContracts();
    const reviews = await loadServiceReviews();
    const ids = new Set<string>();
    listings.forEach((l) => l.authorProfileId && ids.add(l.authorProfileId));
    contracts.forEach((c) => (ids.add(c.buyerProfileId), ids.add(c.providerProfileId)));
    const reputation = await loadServiceReputation([...ids]);
    set((s) => ({
      ...s,
      listings,
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
    tables: [{ table: "service_offers" }, { table: "service_contracts" }, { table: "service_listings" }],
    onChange: () => void reload(),
    fallbackMs: 30000,
    debounceMs: 400,
  });
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
