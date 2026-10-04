/**
 * AnyOne¹⁶ — Stage 4 marketplace store.
 *
 * A small observable store shared by the client and worker experiences.
 * It is hydrated from the real database and every mutation is written back,
 * so favors, offers, messages and statuses survive a page reload.
 */

import { subscribeLive } from "@/lib/realtime";
import { useEffect } from "react";
import { useSyncExternalStore } from "react";

import { supabase } from "@/integrations/foundation/client";

import type { Favor, FavorStatus } from "./favor-model";
import { newId } from "./favor-model";
import type {
  ChatMessage,
  WorkerAvailability,
  WorkerOffer,
  WorkerProfile,
  WorkerReview,
} from "./marketplace-model";
import { createOffer } from "./marketplace-model";
import {
  DEMO_CUSTOMER_PROFILE_ID,
  createNotification,
  loadMarketplace,
  logAudit,
  persistAvailability,
  persistFavor,
  persistFavorStatus,
  persistMessage,
  persistOffer,
  persistOfferAcceptance,
  persistOfferStatus,
} from "./marketplace-repo";
import { recordTrackingEvent } from "./tracking-repo";
import type { Coords } from "./geo";

/**
 * Identity of the signed-in account. Set by the auth provider.
 * Writes are attributed to this account; without it nothing real is written.
 */
export type MarketplaceIdentity = {
  userId: string;
  profileId: string;
  workerProfileId: string | null;
} | null;

const DEMO_WORKER_IDS = {
  andres: "00000000-0000-4000-8000-000000000022",
  laura: "00000000-0000-4000-8000-000000000023",
  julian: "00000000-0000-4000-8000-000000000024",
};

export type MarketplaceState = {
  identity: MarketplaceIdentity;
  favors: Favor[];
  offers: WorkerOffer[];
  messages: ChatMessage[];
  workers: WorkerProfile[];
  reviews: Record<string, WorkerReview[]>;
  availability: WorkerAvailability;
  acceptedOffers: Record<string, string>;
  loading: boolean;
  error: string | null;
};

const emptyAvailability: WorkerAvailability = {
  workerId: "",
  available: true,
  zone: "",
  categories: [],
  updatedAt: new Date().toISOString(),
};

const initialState: MarketplaceState = {
  identity: null,
  favors: [],
  offers: [],
  messages: [],
  workers: [],
  reviews: {},
  availability: emptyAvailability,
  acceptedOffers: {},
  loading: true,
  error: null,
};

let state: MarketplaceState = initialState;

const listeners = new Set<() => void>();

function set(update: (current: MarketplaceState) => MarketplaceState) {
  state = update(state);
  syncWorkerIndex();
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getState = () => state;
const getServerState = () => initialState;

/**
 * Kept as a stable object reference so components can import it directly;
 * its contents are refreshed whenever workers are loaded.
 */
export const workersById: Record<string, WorkerProfile> = {};

function syncWorkerIndex() {
  for (const key of Object.keys(workersById)) delete workersById[key];
  for (const worker of state.workers) workersById[worker.id] = worker;
}

/* ------------------------------------------------------------ hydration -- */

let hydrating: Promise<void> | null = null;

export function hydrateMarketplace(force = false) {
  if (hydrating && !force) return hydrating;
  hydrating = (async () => {
    try {
      const snapshot = await loadMarketplace({
        asWorker: Boolean(state.identity?.workerProfileId),
      });
      const workerProfileId = state.identity?.workerProfileId ?? null;
      const currentWorker = snapshot.workers.find((worker) => worker.id === workerProfileId);
      const acceptedOffers: Record<string, string> = {};
      for (const offer of snapshot.offers) {
        if (offer.status === "ACCEPTED") acceptedOffers[offer.favorId] = offer.id;
      }
      set((current) => ({
        ...current,
        favors: snapshot.favors,
        offers: snapshot.offers,
        messages: snapshot.messages,
        workers: snapshot.workers,
        reviews: snapshot.reviews,
        acceptedOffers,
        availability: currentWorker
          ? {
              workerId: currentWorker.id,
              available: currentWorker.available,
              zone: currentWorker.operationZone,
              categories: currentWorker.categories,
              updatedAt: new Date().toISOString(),
            }
          : current.availability,
        loading: false,
        error: null,
      }));
    } catch (error) {
      set((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "load_failed",
      }));
    }
  })();
  return hydrating;
}

/** Called by the auth provider whenever the session or worker profile changes. */
export function setIdentity(identity: MarketplaceIdentity) {
  const previous = state.identity;
  const same =
    previous?.userId === identity?.userId &&
    previous?.workerProfileId === identity?.workerProfileId;
  set((current) => ({ ...current, identity }));
  if (!same) void hydrateMarketplace(true);
}

export function useMarketplace() {
  const snapshot = useSyncExternalStore(subscribe, getState, getServerState);
  useEffect(() => {
    void hydrateMarketplace();
    return startRealtime();
  }, []);
  return snapshot;
}

/* ------------------------------------------------------------- realtime -- */

let realtimeUsers = 0;
let realtimeStop: (() => void) | null = null;

/**
 * Re-reads the marketplace from Foundation when favors, offers or messages
 * change, so Client and Worker see status changes without reloading. RLS still
 * decides what each person can read; events only trigger a fresh load.
 */
function startRealtime() {
  realtimeUsers += 1;
  if (!realtimeStop) {
    // Realtime on favors/offers/messages; 20 s polling only while realtime is down.
    realtimeStop = subscribeLive({
      name: "marketplace-live",
      tables: [{ table: "favors" }, { table: "offers" }, { table: "messages" }],
      onChange: () => void hydrateMarketplace(true),
      fallbackMs: 20000,
      debounceMs: 400,
    });
  }
  return () => {
    realtimeUsers -= 1;
    if (realtimeUsers <= 0 && realtimeStop) {
      realtimeStop();
      realtimeStop = null;
      realtimeUsers = 0;
    }
  };
}

/* -------------------------------------------------------------- helpers -- */

const touch = (favor: Favor, status: FavorStatus): Favor => ({
  ...favor,
  status,
  updatedAt: new Date().toISOString(),
});

function updateFavor(favorId: string, update: (favor: Favor) => Favor) {
  set((current) => ({
    ...current,
    favors: current.favors.map((favor) => (favor.id === favorId ? update(favor) : favor)),
  }));
}

const report = (error: unknown) => {
  console.error("[marketplace]", error);
};

/* ------------------------------------------------------------ mutations -- */

/** Demo helper: other people in the city start sending offers after publishing. */
function scheduleDemoOffers(favor: Favor) {
  const budget = favor.budget.amount;
  const base = budget ?? favor.budget.recommendedMin ?? 30000;
  const plan = [
    {
      workerId: DEMO_WORKER_IDS.andres,
      amount: Math.round(base * 0.92),
      message: "Voy saliendo para allá, puedo hacerlo por un poco menos.",
      delay: 2500,
      km: 2.4,
      eta: 14,
    },
    {
      workerId: DEMO_WORKER_IDS.laura,
      amount: budget ?? base,
      message: "Acepto tu precio. Tengo disponibilidad completa.",
      delay: 6000,
      km: 4.1,
      eta: 22,
    },
    {
      workerId: DEMO_WORKER_IDS.julian,
      amount: Math.round(base * 1.15),
      message: "Puedo hacerlo con espera incluida, por eso propongo un poco más.",
      delay: 10000,
      km: 6.8,
      eta: 31,
    },
  ];

  plan.forEach((item) => {
    setTimeout(() => {
      const target = state.favors.find((entry) => entry.id === favor.id);
      if (!target) return;
      if (
        target.status !== "PUBLISHED" &&
        target.status !== "RECEIVING_OFFERS" &&
        target.status !== "OFFER_RECEIVED"
      )
        return;
      addOffer(
        createOffer({
          favorId: favor.id,
          workerId: item.workerId,
          amount: item.amount,
          currencyCode: favor.budget.currencyCode,
          clientBudget: budget,
          message: item.message,
          distanceKm: item.km,
          etaMinutes: item.eta,
        }),
      );
    }, item.delay);
  });
}

/**
 * Publishes a favor. The favor only enters the local state after the database
 * confirms the write; if it fails, the error is thrown to the caller.
 */
export async function publishFavor(favor: Favor): Promise<Favor> {
  const owner = state.identity;
  const published: Favor = {
    ...touch(favor, "PUBLISHED"),
    userId: owner ? owner.profileId : DEMO_CUSTOMER_PROFILE_ID,
  };
  await persistFavor(
    published,
    !owner,
    owner ? { profileId: owner.profileId, userId: owner.userId } : null,
  );
  set((current) => ({ ...current, favors: [published, ...current.favors] }));
  void logAudit(
    "favor.published",
    "favor",
    published.id,
    owner ? { profileId: owner.profileId, isDemo: false } : null,
  ).catch(report);
  // Simulated offers are for the demo only: a real account never sees invented offers.
  if (!owner) scheduleDemoOffers(published);
  return published;
}



export function addOffer(offer: WorkerOffer) {
  set((current) => ({ ...current, offers: [...current.offers, offer] }));
  const mine = state.identity && state.identity.workerProfileId === offer.workerId;
  const favor = state.favors.find((item) => item.id === offer.favorId);
  // Prevent duplicate offers from the same worker on the same favor.
  if (
    mine &&
    state.offers.some(
      (o) => o.id !== offer.id && o.favorId === offer.favorId && o.workerId === offer.workerId,
    )
  ) {
    set((current) => ({ ...current, offers: current.offers.filter((o) => o.id !== offer.id) }));
    return;
  }
  void persistOffer(offer, !mine, mine ? state.identity?.userId ?? null : null)
    .then(() =>
      createNotification({
        profileId: favor?.userId ?? null,
        type: "offer.received",
        title: "Nueva oferta recibida",
        favorId: offer.favorId,
        offerId: offer.id,
        isDemo: !mine,
      }),
    )
    .catch((error) => {
      report(error);
      // Roll back the optimistic offer so the UI reflects Foundation.
      set((current) => ({ ...current, offers: current.offers.filter((o) => o.id !== offer.id) }));
    });
  // Only the favor owner may move these statuses (favors_field_guard); a real
  // worker must not attempt it.
  if (mine) return;
  if (favor && (favor.status === "PUBLISHED" || favor.status === "RECEIVING_OFFERS")) {
    updateFavor(offer.favorId, (item) => touch(item, "OFFER_RECEIVED"));
    void persistFavorStatus(offer.favorId, "OFFER_RECEIVED").catch(report);
  }
}

export function rejectOffer(offerId: string) {
  set((current) => ({
    ...current,
    offers: current.offers.map((offer) =>
      offer.id === offerId ? { ...offer, status: "REJECTED" } : offer,
    ),
  }));
  void persistOfferStatus(offerId, "REJECTED").catch(report);
}

export function acceptOffer(offerId: string) {
  const offer = state.offers.find((item) => item.id === offerId);
  if (!offer) return;
  set((current) => ({
    ...current,
    offers: current.offers.map((item) =>
      item.id === offerId
        ? { ...item, status: "ACCEPTED" }
        : item.favorId === offer.favorId && item.status === "PENDING"
          ? { ...item, status: "REJECTED" }
          : item,
    ),
    acceptedOffers: { ...current.acceptedOffers, [offer.favorId]: offerId },
  }));
  updateFavor(offer.favorId, (favor) => ({
    ...touch(favor, "WORKER_SELECTED"),
    budget: { ...favor.budget, amount: offer.amount, currencyCode: offer.currencyCode },
  }));
  void persistOfferAcceptance({
    favorId: offer.favorId,
    offerId: offer.id,
    workerProfileId: offer.workerId,
    amount: offer.amount,
    currencyCode: offer.currencyCode,
  })
    .then(() => {
      void logAudit("offer.accepted", "offer", offer.id).catch(report);
      const workerProfile = state.workers.find((w) => w.id === offer.workerId)?.profileId ?? null;
      void createNotification({
        profileId: workerProfile,
        type: "offer.accepted",
        title: "Tu oferta fue aceptada",
        favorId: offer.favorId,
        offerId: offer.id,
      }).catch(report);
    })
    .catch((error) => {
      report(error);
      // Foundation rejected the acceptance: reload the real state.
      void hydrateMarketplace(true);
    });
  // The exact address becomes visible to the selected worker: leave a trace.
  void recordTrackingEvent({
    favorId: offer.favorId,
    action: "favor.address_revealed",
    actorProfileId: state.identity?.profileId ?? null,
    isDemo: !state.identity,
    extra: { workerProfileId: offer.workerId, offerId: offer.id },
  }).catch(report);
  pushMessage({
    favorId: offer.favorId,
    author: "system",
    kind: "system",
    body: "Aceptaste la oferta. Ya pueden coordinar los detalles por aquí.",
  });
}

export function keepWaiting(favorId: string) {
  updateFavor(favorId, (favor) => touch(favor, "RECEIVING_OFFERS"));
  void persistFavorStatus(favorId, "RECEIVING_OFFERS").catch(report);
}

export function cancelFavor(favorId: string) {
  updateFavor(favorId, (favor) => touch(favor, "CANCELLED"));
  void persistFavorStatus(favorId, "CANCELLED")
    .then(() => logAudit("favor.cancelled", "favor", favorId))
    .catch(report);
}

export function setFavorStatus(favorId: string, status: FavorStatus) {
  updateFavor(favorId, (favor) => touch(favor, status));
  void persistFavorStatus(favorId, status).catch(report);
}

/**
 * A worker confirms an operational step of an active favor. The status moves,
 * the client receives the confirmation in the shared chat and the event is
 * written to the audit trail with the position when it is available.
 */
export function advanceFavorTracking(input: {
  favorId: string;
  status: FavorStatus;
  audit: string;
  note: string;
  author: "client" | "worker";
  coords?: Coords | null;
}) {
  setFavorStatus(input.favorId, input.status);
  pushMessage({
    favorId: input.favorId,
    author: input.author,
    kind: "confirmation",
    body: input.note,
  });
  const identity = state.identity;
  void recordTrackingEvent({
    favorId: input.favorId,
    action: input.audit,
    actorProfileId: identity?.profileId ?? null,
    coords: input.coords ?? null,
    isDemo: !identity,
    extra: { status: input.status },
  }).catch(report);
}

export function pushMessage(input: Omit<ChatMessage, "id" | "createdAt">) {
  const message: ChatMessage = { ...input, id: newId(), createdAt: new Date().toISOString() };
  set((current) => ({ ...current, messages: [...current.messages, message] }));
  // Real accounts write real (is_demo = false) messages; RLS rejects demo rows from them.
  void persistMessage(message, !state.identity, receiverFor(message)).catch(report);
}

/**
 * The other participant of the favor, from data already loaded from Foundation:
 * client → selected Worker's profile (accepted offer), Worker → favor's customer.
 * Returns null when it isn't known — never guessed.
 */
function receiverFor(message: ChatMessage): string | null {
  const favor = state.favors.find((f) => f.id === message.favorId);
  if (!favor) return null;
  if (message.author === "worker") return favor.userId ?? null;
  if (message.author === "client") {
    const offerId = state.acceptedOffers[favor.id];
    const offer = offerId ? state.offers.find((o) => o.id === offerId) : undefined;
    return offer ? (state.workers.find((w) => w.id === offer.workerId)?.profileId ?? null) : null;
  }
  return null;
}

export function setAvailability(update: Partial<WorkerAvailability>) {
  set((current) => ({
    ...current,
    availability: { ...current.availability, ...update, updatedAt: new Date().toISOString() },
  }));
  const workerProfileId = state.identity?.workerProfileId;
  if (!workerProfileId) return;
  void persistAvailability(workerProfileId, {
    available: update.available,
    zone: update.zone,
    categories: update.categories,
  }).catch(report);
}

/* -------------------------------------------------------------- queries -- */

export const offersForFavor = (marketplace: MarketplaceState, favorId: string) =>
  marketplace.offers.filter((offer) => offer.favorId === favorId);

export const pendingOffersForFavor = (marketplace: MarketplaceState, favorId: string) =>
  offersForFavor(marketplace, favorId).filter((offer) => offer.status === "PENDING");

export const messagesForFavor = (marketplace: MarketplaceState, favorId: string) =>
  marketplace.messages.filter((message) => message.favorId === favorId);

export const currentWorkerProfileId = (marketplace: MarketplaceState) =>
  marketplace.identity?.workerProfileId ?? null;

export const currentWorkerFrom = (marketplace: MarketplaceState) => {
  const id = marketplace.identity?.workerProfileId;
  return (id && marketplace.workers.find((worker) => worker.id === id)) || null;
};

/** Favors a worker can still offer on. */
export function openFavorsForWorker(marketplace: MarketplaceState, workerId: string) {
  return marketplace.favors.filter((favor) => {
    const open =
      favor.status === "PUBLISHED" ||
      favor.status === "RECEIVING_OFFERS" ||
      favor.status === "OFFER_RECEIVED";
    if (!open) return false;
    return !marketplace.offers.some(
      (offer) => offer.favorId === favor.id && offer.workerId === workerId,
    );
  });
}

export function offersByWorker(marketplace: MarketplaceState, workerId: string) {
  return marketplace.offers.filter((offer) => offer.workerId === workerId);
}
