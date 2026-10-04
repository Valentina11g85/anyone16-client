/**
 * AnyOne¹⁶ — Stage 6.5 live tracking layer.
 *
 * Maps the operational steps of an active favor onto the existing favor
 * statuses, so the worker advances the favor with big explicit buttons and the
 * client sees a human sentence for every step. Nothing is advanced
 * automatically by GPS: proximity only softens the wording.
 */

import type { Favor, FavorStatus } from "./favor-model";
import type { TranslationKey } from "./i18n";
import { hasCoords, haversineKm, type Coords } from "./geo";

export const TRACKING_STATUSES: FavorStatus[] = [
  "WORKER_SELECTED",
  "WORKER_ON_THE_WAY",
  "ARRIVED_AT_PICKUP",
  "IN_PROGRESS",
  "NEAR_DESTINATION",
  "READY_FOR_CONFIRMATION",
  "CODE_ENTERED",
  "COMPLETED",
];

export const isTrackingActive = (status: FavorStatus) =>
  TRACKING_STATUSES.includes(status) && status !== "COMPLETED";

export type TrackingStep = {
  /** Status the favor is in while this action is offered. */
  from: FavorStatus;
  /** Status reached when the worker confirms. */
  to: FavorStatus;
  /** Big button label for the worker. */
  actionKey: TranslationKey;
  /** Confirmation written into the shared chat + audit trail. */
  eventKey: TranslationKey;
  /** Audit action name. */
  audit: string;
};

export const TRACKING_STEPS: TrackingStep[] = [
  {
    from: "WORKER_SELECTED",
    to: "WORKER_ON_THE_WAY",
    actionKey: "track.action.start",
    eventKey: "track.event.start",
    audit: "favor.worker_started",
  },
  {
    from: "WORKER_ON_THE_WAY",
    to: "ARRIVED_AT_PICKUP",
    actionKey: "track.action.arrivedPickup",
    eventKey: "track.event.arrivedPickup",
    audit: "favor.arrived_pickup",
  },
  {
    from: "ARRIVED_AT_PICKUP",
    to: "IN_PROGRESS",
    actionKey: "track.action.pickedUp",
    eventKey: "track.event.pickedUp",
    audit: "favor.pickup_completed",
  },
  {
    from: "IN_PROGRESS",
    to: "NEAR_DESTINATION",
    actionKey: "track.action.nearDestination",
    eventKey: "track.event.nearDestination",
    audit: "favor.near_destination",
  },
  {
    from: "NEAR_DESTINATION",
    // The worker can only declare the work finished. Completion is decided by
    // the backend when the client confirmation code is validated.
    to: "READY_FOR_CONFIRMATION",
    actionKey: "track.action.finishWork",
    eventKey: "track.event.finishWork",
    audit: "favor.ready_for_confirmation",
  },
];

export const stepFor = (status: FavorStatus): TrackingStep | null =>
  TRACKING_STEPS.find((step) => step.from === status) ?? null;

/** Client-facing sentence for the current status. */
export const clientMessageKey = (status: FavorStatus): TranslationKey | null => {
  switch (status) {
    case "WORKER_SELECTED":
      return "track.client.selected";
    case "WORKER_ON_THE_WAY":
      return "track.client.onTheWay";
    case "ARRIVED_AT_PICKUP":
      return "track.client.arrivedPickup";
    case "IN_PROGRESS":
      return "track.client.inProgress";
    case "NEAR_DESTINATION":
      return "track.client.nearDestination";
    case "READY_FOR_CONFIRMATION":
      return "track.client.readyForConfirmation";
    case "CODE_ENTERED":
      return "track.client.codeEntered";
    case "COMPLETED":
      return "track.client.completed";
    default:
      return null;
  }
};

/** The point the worker is heading to right now. */
export function nextTarget(favor: Favor, status: FavorStatus) {
  const headingToPickup = status === "WORKER_SELECTED" || status === "WORKER_ON_THE_WAY";
  if (headingToPickup && hasCoords(favor.pickupLocation)) return favor.pickupLocation;
  const stop = favor.additionalStops.find(hasCoords);
  if (status === "IN_PROGRESS" && stop) return stop;
  if (hasCoords(favor.destinationLocation)) return favor.destinationLocation;
  return null;
}

const NEAR_KM = 0.4;

/** GPS only softens wording; it never advances the favor by itself. */
export function isNear(position: Coords | null, target: Coords | null) {
  if (!position || !target) return false;
  return haversineKm(position, target) <= NEAR_KM;
}
