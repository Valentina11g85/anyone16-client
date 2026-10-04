/**
 * Unread counts for the Favores chat, read straight from Foundation
 * (public.messages.read_at + receiver_profile_id). RLS decides visibility.
 * Opportunities chat (service_messages) only has SELECT/INSERT permission in
 * Foundation, so its read state cannot be saved yet — counts stay Favores-only.
 */
import { useEffect, useSyncExternalStore } from "react";

import { foundation } from "@/integrations/foundation/client";
import { subscribeLive } from "@/lib/realtime";

type State = { byFavor: Record<string, number>; profileId: string | null };
let state: State = { byFavor: {}, profileId: null };
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};

export async function loadFavorUnread(profileId: string | null) {
  if (!profileId) return set({ byFavor: {}, profileId: null });
  const { data, error } = await foundation
    .from("messages")
    .select("favor_id")
    .eq("receiver_profile_id", profileId)
    .is("read_at", null)
    .limit(500);
  if (error) return;
  const byFavor: Record<string, number> = {};
  for (const r of data ?? []) byFavor[r.favor_id] = (byFavor[r.favor_id] ?? 0) + 1;
  set({ byFavor, profileId });
}

/** Marks this favor's messages to me as read. Fails silently if RLS refuses. */
export async function markFavorChatRead(favorId: string) {
  const me = state.profileId;
  if (!me || !state.byFavor[favorId]) return;
  const { error } = await foundation
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("favor_id", favorId)
    .eq("receiver_profile_id", me)
    .is("read_at", null);
  if (!error) await loadFavorUnread(me);
}

let users = 0;
let stop: (() => void) | null = null;
let current: string | null = null;

/** Keeps counts live for the signed-in profile (Realtime + fallback). */
export function useFavorUnread(profileId: string | null) {
  useEffect(() => {
    if (current !== profileId) {
      stop?.();
      stop = null;
      current = profileId;
    }
    users += 1;
    void loadFavorUnread(profileId);
    if (profileId && !stop) {
      stop = subscribeLive({
        name: `chat-unread-${profileId}`,
        tables: [{ table: "messages", filter: `receiver_profile_id=eq.${profileId}` }],
        onChange: () => void loadFavorUnread(profileId),
        fallbackMs: 30000,
      });
    }
    return () => {
      users -= 1;
      if (users <= 0) {
        stop?.();
        stop = null;
        users = 0;
      }
    };
  }, [profileId]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  ).byFavor;
}
