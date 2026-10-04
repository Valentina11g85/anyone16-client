/**
 * AnyOne¹⁶ — Stage 6.5 persistence for live location and tracking events.
 *
 * Location points are only written while a favor is active, and access is
 * enforced by the database rules (only the favor participants can read them).
 */

import { supabase } from "@/integrations/foundation/client";

import type { Coords } from "./geo";

export type LivePosition = Coords & {
  accuracyMeters: number | null;
  recordedAt: string;
};

export async function recordLocationUpdate(input: {
  favorId: string;
  workerProfileId: string | null;
  coords: Coords;
  accuracyMeters: number | null;
  isDemo: boolean;
}) {
  const { error } = await supabase.from("location_updates").insert({
    favor_id: input.favorId,
    worker_profile_id: input.workerProfileId,
    latitude: input.coords.latitude,
    longitude: input.coords.longitude,
    accuracy_meters: input.accuracyMeters,
    source: "device",
    is_demo: input.isDemo,
  });
  if (error) throw error;
}

export async function readLatestPosition(favorId: string): Promise<LivePosition | null> {
  const { data, error } = await supabase
    .from("location_updates")
    .select("latitude, longitude, accuracy_meters, recorded_at")
    .eq("favor_id", favorId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    accuracyMeters: data.accuracy_meters === null ? null : Number(data.accuracy_meters),
    recordedAt: data.recorded_at,
  };
}

/**
 * Audit trail for dispute resolution and future admin tooling. Never shown to
 * the end user as a technical screen.
 */
export async function recordTrackingEvent(input: {
  favorId: string;
  action: string;
  actorProfileId: string | null;
  coords?: Coords | null;
  isDemo: boolean;
  extra?: Record<string, unknown>;
}) {
  // The audit trail is written by a trusted backend function: the actor is
  // always derived from the session, never from anything the browser sends.
  await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
  }).rpc("log_app_event", {
    _action: input.action,
    _entity_type: "favor",
    _entity_id: input.favorId,
    _metadata: {
      ...(input.extra ?? {}),
      ...(input.coords
        ? { latitude: input.coords.latitude, longitude: input.coords.longitude }
        : {}),
      at: new Date().toISOString(),
    },
  });
}
