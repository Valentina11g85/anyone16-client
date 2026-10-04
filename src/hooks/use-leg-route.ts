/**
 * Real road ETA between a live position and the next point of the favor.
 * Recomputed when the position moves meaningfully, so the worker and the
 * client always see a real distance and a real travel time.
 */
import { useEffect, useRef, useState } from "react";

import type { Coords } from "@/lib/geo";
import { computeRealRoute, type RealRoute } from "@/lib/routing.functions";

export function useLegRoute(
  origin: Coords | null,
  target: Coords | null,
  languageCode: string,
  regionCode?: string,
) {
  const [route, setRoute] = useState<RealRoute | null>(null);
  const lastKey = useRef("");

  /** ~100 m grid so tiny GPS jitter does not trigger a new request. */
  const key =
    origin && target
      ? `${languageCode}|${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)}|${target.latitude.toFixed(4)},${target.longitude.toFixed(4)}`
      : "";

  useEffect(() => {
    if (!key || !origin || !target) {
      setRoute(null);
      return;
    }
    if (lastKey.current === key) return;
    lastKey.current = key;

    let active = true;
    computeRealRoute({
      data: {
        points: [origin, target],
        languageCode,
        ...(regionCode ? { regionCode } : {}),
      },
    })
      .then((result) => {
        if (active) setRoute(result);
      })
      .catch(() => {
        if (active) setRoute(null);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return route;
}
