/**
 * Shared Foundation Realtime subscription with a safe polling fallback.
 * Events only trigger a fresh read from Foundation (RLS still decides what is
 * visible); nothing is taken from the event payload as truth.
 * While the channel is SUBSCRIBED the fallback poll is paused; if the channel
 * errors, times out or closes, polling resumes automatically.
 */
import { foundation } from "@/integrations/foundation/client";

export type LiveTable = { table: string; filter?: string; event?: "*" | "INSERT" | "UPDATE" | "DELETE" };

let seq = 0;

export function subscribeLive(opts: {
  name: string;
  tables: LiveTable[];
  onChange: () => void;
  fallbackMs: number;
  debounceMs?: number;
}): () => void {
  if (typeof window === "undefined") return () => {};
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const fire = () => {
    if (stopped) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(opts.onChange, opts.debounceMs ?? 300);
  };
  const startPoll = () => {
    if (poll || stopped) return;
    poll = setInterval(() => {
      if (document.visibilityState === "visible") opts.onChange();
    }, opts.fallbackMs);
  };
  const stopPoll = () => {
    if (poll) clearInterval(poll);
    poll = null;
  };

  // Poll until realtime confirms the subscription.
  startPoll();
  const channel = foundation.channel(`${opts.name}-${++seq}`);
  for (const t of opts.tables) {
    channel.on(
      "postgres_changes" as never,
      { event: t.event ?? "*", schema: "public", table: t.table, ...(t.filter ? { filter: t.filter } : {}) },
      fire,
    );
  }
  channel.subscribe((status: string) => {
    if (stopped) return;
    if (status === "SUBSCRIBED") {
      stopPoll();
      opts.onChange(); // catch anything missed while connecting
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      startPoll();
    }
  });

  return () => {
    stopped = true;
    stopPoll();
    if (debounce) clearTimeout(debounce);
    void foundation.removeChannel(channel);
  };
}
