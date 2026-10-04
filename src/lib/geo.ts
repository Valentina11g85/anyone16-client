/**
 * AnyOne¹⁶ — Stage 6 geography layer.
 *
 * Distances and estimates are computed from real coordinates only. When a
 * location has no coordinates yet we report `null` and the UI shows
 * "pending to confirm" — coordinates are never invented.
 */

import type { Favor, FavorLocation } from "./favor-model";

export type Coords = { latitude: number; longitude: number };

export const hasCoords = (
  location: FavorLocation | null | undefined,
): location is FavorLocation & Coords =>
  !!location &&
  typeof location.latitude === "number" &&
  typeof location.longitude === "number" &&
  Number.isFinite(location.latitude) &&
  Number.isFinite(location.longitude);

/** Ordered route: pickup → stop 1 → stop 2 → … → destination. */
export function routePoints(favor: Favor): FavorLocation[] {
  return [favor.pickupLocation, ...favor.additionalStops, favor.destinationLocation].filter(
    (point): point is FavorLocation => !!point && (!!point.label || hasCoords(point)),
  );
}

const EARTH_RADIUS_KM = 6371;
const toRad = (value: number) => (value * Math.PI) / 180;

/** Great-circle distance between two real coordinates, in kilometres. */
export function haversineKm(a: Coords, b: Coords) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type RouteLeg = {
  from: FavorLocation;
  to: FavorLocation;
  distanceKm: number | null;
};

export function routeLegs(favor: Favor): RouteLeg[] {
  const points = routePoints(favor);
  const legs: RouteLeg[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    legs.push({
      from,
      to,
      distanceKm: hasCoords(from) && hasCoords(to) ? haversineKm(from, to) : null,
    });
  }
  return legs;
}

/**
 * Total route distance across every leg (pickup → stops → destination).
 * Returns null when any leg is missing coordinates: partial totals would be
 * misleading, so the UI shows the estimate as pending instead.
 */
export function totalRouteKm(favor: Favor): number | null {
  const legs = routeLegs(favor);
  if (legs.length === 0) return null;
  if (legs.some((leg) => leg.distanceKm === null)) return null;
  const total = legs.reduce((sum, leg) => sum + (leg.distanceKm ?? 0), 0);
  return Math.round(total * 10) / 10;
}

/** Straight-line distance between a viewer position and the route start. */
export function distanceFrom(origin: Coords | null, favor: Favor): number | null {
  if (!origin) return null;
  const start = routePoints(favor).find(hasCoords);
  if (!start) return null;
  return Math.round(haversineKm(origin, start) * 10) / 10;
}

/** Average urban speed placeholder until a real routing service is connected. */
const URBAN_KMH = 22;

export function travelMinutesFor(distanceKm: number | null): number | null {
  if (distanceKm === null) return null;
  return Math.max(5, Math.round((distanceKm / URBAN_KMH) * 60));
}

export function waitMinutesFor(favor: Favor): number {
  if (!favor.waitingRequired) return 0;
  const parsed = Number((favor.waitingDuration ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

export type FavorEstimate = {
  distanceKm: number | null;
  travelMinutes: number | null;
  waitMinutes: number;
  /** Time spent doing the favor itself (handover, queue, shopping…). */
  serviceMinutes: number;
  totalMinutes: number | null;
};

export function estimateFavor(favor: Favor): FavorEstimate {
  const distanceKm = totalRouteKm(favor);
  const travelMinutes = travelMinutesFor(distanceKm);
  const waitMinutes = waitMinutesFor(favor);
  const serviceMinutes = 15 + favor.additionalStops.length * 10;
  return {
    distanceKm,
    travelMinutes,
    waitMinutes,
    serviceMinutes,
    totalMinutes: travelMinutes === null ? null : travelMinutes + waitMinutes + serviceMinutes,
  };
}

export function formatDistance(distanceKm: number | null, locale: string) {
  if (distanceKm === null) return null;
  if (distanceKm < 1) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(distanceKm * 1000)} m`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(distanceKm)} km`;
}

export function formatDuration(minutes: number | null) {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Human zone label: neighbourhood/zone → city → region → country. */
export function zoneOf(location: FavorLocation | null | undefined): string | null {
  if (!location) return null;
  return location.city || location.region || null;
}

export function favorZoneLabel(favor: Favor): string | null {
  for (const point of routePoints(favor)) {
    const zone = zoneOf(point);
    if (zone) return zone;
  }
  return null;
}

/** Coarse geography refreshed whenever the route changes. */
export function computeGeo(favor: Favor) {
  const estimate = estimateFavor(favor);
  const start = favor.pickupLocation ?? routePoints(favor)[0] ?? null;
  return {
    city: start?.city ?? null,
    region: start?.region ?? null,
    zoneLabel: favorZoneLabel(favor),
    stopCount: favor.additionalStops.length,
    routeDistanceKm: estimate.distanceKm,
    travelMinutes: estimate.travelMinutes,
    waitMinutes: estimate.waitMinutes,
    totalMinutes: estimate.totalMinutes,
  };
}

export function withGeo(favor: Favor): Favor {
  return { ...favor, geo: computeGeo(favor) };
}

/**
 * Privacy: before a worker is selected, only the zone/city is public. The
 * exact street address is revealed progressively once the favor is assigned.
 */
export function canSeeExactAddress(favor: Favor, viewer: "client" | "worker") {
  if (viewer === "client") return true;
  return [
    "WORKER_SELECTED",
    "WORKER_ON_THE_WAY",
    "ARRIVED_AT_PICKUP",
    "IN_PROGRESS",
    "NEAR_DESTINATION",
    "COMPLETED",
  ].includes(favor.status);
}

export function publicLabel(location: FavorLocation | null | undefined): string | null {
  if (!location) return null;
  return location.city || location.region || location.placeName || null;
}

/** Simple, explainable compatibility — no opaque ranking algorithm. */
export type Compatibility = {
  zoneMatch: boolean;
  categoryMatch: boolean;
  withinRadius: boolean | null;
  distanceKm: number | null;
};

export function compatibilityFor(input: {
  favor: Favor;
  workerZone: string;
  workerCategories: string[];
  workerCoords: Coords | null;
  radiusKm: number;
}): Compatibility {
  const distanceKm = distanceFrom(input.workerCoords, input.favor);
  const zone = (input.favor.geo.zoneLabel ?? favorZoneLabel(input.favor) ?? "").toLowerCase();
  const workerZone = input.workerZone.trim().toLowerCase();
  return {
    zoneMatch: !zone || !workerZone ? true : zone.includes(workerZone) || workerZone.includes(zone),
    categoryMatch:
      input.workerCategories.length === 0 || input.workerCategories.includes(input.favor.category),
    withinRadius: distanceKm === null ? null : distanceKm <= input.radiusKm,
    distanceKm,
  };
}
