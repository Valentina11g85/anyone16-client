/**
 * Client-side view of the worker position for an active favor.
 * Uses Foundation realtime for new points, with a slow poll as fallback when
 * realtime is not enabled for location_updates. Nothing is read when the
 * favor is not in a tracking state.
 */
import { useEffect, useState } from "react";

import { subscribeLive } from "@/lib/realtime";
import { readLatestPosition, type LivePosition } from "@/lib/tracking-repo";

const POLL_MS = 15000;

export function useWorkerPosition(favorId: string | null, active: boolean) {
  const [position, setPosition] = useState<LivePosition | null>(null);

  useEffect(() => {
    if (!favorId || !active) {
      setPosition(null);
      return;
    }
    let alive = true;
    const read = () => {
      void readLatestPosition(favorId).then((next) => {
        if (alive && next) setPosition(next);
      });
    };
    read();
    const stop = subscribeLive({
      name: `loc-${favorId}`,
      tables: [{ table: "location_updates", event: "INSERT", filter: `favor_id=eq.${favorId}` }],
      onChange: read,
      fallbackMs: POLL_MS,
      debounceMs: 100,
    });
    return () => {
      alive = false;
      stop();
    };
  }, [favorId, active]);

  return position;
}
