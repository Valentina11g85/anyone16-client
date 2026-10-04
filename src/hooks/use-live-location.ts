/**
 * Worker live location while a favor is active.
 *
 * Location is only watched when sharing is explicitly on and there is an
 * active favor; it stops as soon as the favor ends. Points are written at most
 * once every 15 seconds to keep the collected data to a minimum.
 */
import { useEffect, useRef, useState } from "react";

import { cacheCoarsePosition } from "@/lib/device-location";
import type { Coords } from "@/lib/geo";
import { recordLocationUpdate } from "@/lib/tracking-repo";

export type LiveLocationStatus = "idle" | "starting" | "live" | "denied" | "unavailable" | "stale";

const MIN_INTERVAL_MS = 15000;

export function useLiveLocation(input: {
  enabled: boolean;
  favorId: string | null;
  workerProfileId: string | null;
  isDemo: boolean;
}) {
  const { enabled, favorId, workerProfileId, isDemo } = input;
  const [position, setPosition] = useState<Coords | null>(null);
  const [accuracyMeters, setAccuracy] = useState<number | null>(null);
  const [status, setStatus] = useState<LiveLocationStatus>("idle");
  const lastWrite = useRef(0);

  useEffect(() => {
    if (!enabled || !favorId) {
      setStatus("idle");
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("starting");
    let active = true;

    const watchId = navigator.geolocation.watchPosition(
      (reading) => {
        if (!active) return;
        const coords: Coords = {
          latitude: reading.coords.latitude,
          longitude: reading.coords.longitude,
        };
        setPosition(coords);
        setAccuracy(reading.coords.accuracy ?? null);
        setStatus("live");
        cacheCoarsePosition(coords);

        const now = Date.now();
        if (now - lastWrite.current < MIN_INTERVAL_MS) return;
        lastWrite.current = now;
        void recordLocationUpdate({
          favorId,
          workerProfileId,
          coords,
          accuracyMeters: reading.coords.accuracy ?? null,
          isDemo,
        }).catch(() => {
          /* a dropped point never breaks the experience */
        });
      },
      () => {
        if (active) setStatus("denied");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, favorId, workerProfileId, isDemo]);

  return { position, accuracyMeters, status };
}
