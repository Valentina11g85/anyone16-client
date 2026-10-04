/**
 * Real road route (Google Routes API) for a favor: distance, duration and the
 * drawable polyline. Falls back to null while loading or when the provider
 * cannot compute a route, so screens keep showing the local estimate.
 */
import { useEffect, useRef, useState } from "react";

import type { Favor } from "@/lib/favor-model";
import { hasCoords, routePoints } from "@/lib/geo";
import { computeRealRoute, type RealRoute } from "@/lib/routing.functions";

const cache = new Map<string, RealRoute | null>();

export function useRealRoute(favor: Favor, languageCode: string) {
  const points = routePoints(favor)
    .filter(hasCoords)
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }));

  const key =
    points.length >= 2
      ? `${languageCode}|${points.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(";")}`
      : "";

  const [route, setRoute] = useState<RealRoute | null>(() => cache.get(key) ?? null);
  const [loading, setLoading] = useState(false);
  const lastKey = useRef("");

  useEffect(() => {
    if (!key) {
      setRoute(null);
      return;
    }
    if (cache.has(key)) {
      setRoute(cache.get(key) ?? null);
      return;
    }
    if (lastKey.current === key) return;
    lastKey.current = key;

    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      computeRealRoute({
        data: { points, languageCode, ...(favor.countryCode ? { regionCode: favor.countryCode } : {}) },
      })
        .then((result) => {
          cache.set(key, result);
          if (active) setRoute(result);
        })
        .catch(() => {
          if (active) setRoute(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 500);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { route, loading };
}
