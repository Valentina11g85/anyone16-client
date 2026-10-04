/**
 * AnyOne¹⁶ — Stage 3 marketplace data model.
 *
 * Client (blue) and worker (red/black) experiences share these structures.
 * Nothing is persisted on a server yet: the shapes mirror the future backend
 * so the UI can be wired to real data without changes.
 */

import type { Favor, FavorCategory, FavorStatus } from "./favor-model";
import { newId } from "./favor-model";

export type WorkerVerificationLevel = "none" | "basic" | "verified" | "pro";

export type WorkerVerification = {
  level: WorkerVerificationLevel;
  identityVerified: boolean;
  phoneVerified: boolean;
  backgroundChecked: boolean;
  verifiedAt: string | null;
};

export type WorkerRating = {
  /** 0 – 5 */
  average: number;
  count: number;
  completedFavors: number;
  /** 0 – 100 */
  completionRate: number;
  /** 0 – 100 */
  cancellationRate: number;
};

export type WorkerProfile = {
  /** worker_profiles.id */
  id: string;
  /** profiles.id — the single account behind both the client and worker roles. */
  profileId: string;
  name: string;
  /** Initials are rendered while real photo uploads arrive in a later stage. */
  photoUrl: string | null;
  headline: string;
  bio: string;
  rating: WorkerRating;
  languages: string[];
  categories: FavorCategory[];
  operationZone: string;
  available: boolean;
  verification: WorkerVerification;
  joinedAt: string;
  countryCode: string;
  currencyCode: string;
  /** Demo records are flagged so they never mix with real marketplace data. */
  isDemo: boolean;
};

export type WorkerAvailability = {
  workerId: string;
  available: boolean;
  zone: string;
  categories: FavorCategory[];
  updatedAt: string;
};

export type OfferKind = "accept" | "counter";
export type OfferStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";

export type WorkerOffer = {
  id: string;
  favorId: string;
  workerId: string;
  kind: OfferKind;
  /** Always amount + currency_code, never a bare symbol. */
  amount: number;
  currencyCode: string;
  message: string;
  distanceKm: number;
  etaMinutes: number;
  status: OfferStatus;
  createdAt: string;
};

/** A counter-offer is an offer whose amount differs from the client budget. */
export type CounterOffer = WorkerOffer & { kind: "counter" };

export const isCounterOffer = (offer: WorkerOffer): offer is CounterOffer =>
  offer.kind === "counter";

export type ChatMessageKind = "text" | "photo" | "location" | "confirmation" | "system";

export type ChatMessage = {
  id: string;
  favorId: string;
  author: "client" | "worker" | "system";
  kind: ChatMessageKind;
  body: string;
  createdAt: string;
};

export type OfferSort = "price" | "rating" | "distance" | "experience" | "eta" | "verification";

export const OFFER_SORTS: OfferSort[] = [
  "price",
  "rating",
  "distance",
  "experience",
  "eta",
  "verification",
];

const VERIFICATION_SCORE: Record<WorkerVerificationLevel, number> = {
  pro: 3,
  verified: 2,
  basic: 1,
  none: 0,
};

export function sortOffers(
  offers: WorkerOffer[],
  workers: Record<string, WorkerProfile>,
  sort: OfferSort,
): WorkerOffer[] {
  const score = (offer: WorkerOffer) => workers[offer.workerId];
  return [...offers].sort((a, b) => {
    const wa = score(a);
    const wb = score(b);
    switch (sort) {
      case "price":
        return a.amount - b.amount;
      case "rating":
        return (wb?.rating.average ?? 0) - (wa?.rating.average ?? 0);
      case "distance":
        return a.distanceKm - b.distanceKm;
      case "experience":
        return (wb?.rating.completedFavors ?? 0) - (wa?.rating.completedFavors ?? 0);
      case "eta":
        return a.etaMinutes - b.etaMinutes;
      case "verification":
        return (
          VERIFICATION_SCORE[wb?.verification.level ?? "none"] -
          VERIFICATION_SCORE[wa?.verification.level ?? "none"]
        );
      default:
        return 0;
    }
  });
}

/** Visual progress line shown to both client and worker. */
export const FAVOR_TIMELINE: FavorStatus[] = [
  "PUBLISHED",
  "RECEIVING_OFFERS",
  "WORKER_SELECTED",
  "WORKER_ON_THE_WAY",
  "ARRIVED_AT_PICKUP",
  "IN_PROGRESS",
  "NEAR_DESTINATION",
  "READY_FOR_CONFIRMATION",
  "COMPLETED",
];

export const timelineIndex = (status: FavorStatus) => {
  if (status === "OFFER_RECEIVED") return FAVOR_TIMELINE.indexOf("RECEIVING_OFFERS");
  // Code entered is still the confirmation step while the backend validates it.
  if (status === "CODE_ENTERED") return FAVOR_TIMELINE.indexOf("READY_FOR_CONFIRMATION");
  return FAVOR_TIMELINE.indexOf(status);
};

/** Placeholder duration estimator; replaced by the routing engine in a later stage. */
export function estimatedMinutes(favor: Favor) {
  let minutes = 30;
  minutes += favor.additionalStops.length * 15;
  if (favor.waitingRequired) minutes += 20;
  if (favor.schedule.urgency === "high") minutes -= 5;
  return Math.max(15, minutes);
}

/** Deterministic placeholder distance until the maps/GPS stage lands. */
export function distanceKmFor(favor: Favor) {
  const seed = favor.id.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return Math.round((1.2 + (seed % 70) / 10) * 10) / 10;
}

export type WorkerReview = {
  id: string;
  author: string;
  rating: number;
  body: string;
  createdAt: string;
};

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function createOffer(input: {
  favorId: string;
  workerId: string;
  amount: number;
  currencyCode: string;
  clientBudget: number | null;
  message?: string;
  distanceKm: number;
  etaMinutes: number;
}): WorkerOffer {
  return {
    id: newId(),
    favorId: input.favorId,
    workerId: input.workerId,
    kind: input.clientBudget !== null && input.amount === input.clientBudget ? "accept" : "counter",
    amount: input.amount,
    currencyCode: input.currencyCode,
    message: input.message ?? "",
    distanceKm: input.distanceKm,
    etaMinutes: input.etaMinutes,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
}
