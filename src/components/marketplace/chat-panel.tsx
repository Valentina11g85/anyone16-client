import { useEffect, useState } from "react";
import { Camera, MapPin, Send, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cacheCoarsePosition, requestDeviceLocation } from "@/lib/device-location";
import type { Translator } from "@/lib/i18n";
import type { ChatMessage, ChatMessageKind } from "@/lib/marketplace-model";
import { useAuth } from "@/lib/auth-context";
import { markFavorChatRead, useFavorUnread } from "@/lib/chat-unread";

/**
 * Chat UI for client ↔ worker. Messages live in the local store for now; the
 * component is already shaped for real messages, photos, location sharing,
 * notifications and confirmations.
 */
export function ChatPanel({
  messages,
  author,
  t,
  onSend,
  favorId,
}: {
  favorId?: string;
  messages: ChatMessage[];
  author: "client" | "worker";
  t: Translator;
  onSend: (body: string, kind?: ChatMessageKind) => void;
}) {
  const [draft, setDraft] = useState("");
  const { profile } = useAuth();
  const unreadMap = useFavorUnread(profile?.id ?? null);
  const unread = favorId ? (unreadMap[favorId] ?? 0) : 0;
  // Opening the conversation marks it read in Foundation (also for new arrivals).
  useEffect(() => {
    if (favorId && unread > 0) {
      const t = setTimeout(() => void markFavorChatRead(favorId), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [favorId, unread, messages.length]);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);

  /** One-off position share. No continuous tracking in this stage. */
  const shareLocation = async () => {
    setSharing(true);
    setShareError(false);
    try {
      const reading = await requestDeviceLocation();
      cacheCoarsePosition(reading.coords);
      onSend(
        `${t("chat.locationShared")}: ${reading.coords.latitude.toFixed(5)}, ${reading.coords.longitude.toFixed(5)}`,
        "location",
      );
    } catch {
      setShareError(true);
    } finally {
      setSharing(false);
    }
  };
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
  const stamp = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : timeFmt.format(d);
  };
  return (
    <section className="chat-shell" aria-label={t("chat.title")}>
      <header className="chat-head">
        <span className="chat-head-icon" aria-hidden="true">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold text-foreground">{t("chat.title")}</h3>
          <p className="text-xs text-muted-foreground">
            {author === "client" ? "Solo tú y la persona que te ayuda" : "Solo tú y quien pidió el favor"}
          </p>
        </div>
        {unread > 0 && (
          <span className="rounded-full bg-destructive px-2 text-[11px] font-bold leading-5 text-destructive-foreground">{unread} sin leer</span>
        )}
      </header>
      <div className="chat-log no-scrollbar" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("chat.empty")}</p>
        )}
        {messages.map((message) =>
          message.author === "system" ? (
            <p key={message.id} className="chat-system">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
              {message.body}
            </p>
          ) : (
            <div
              key={message.id}
              className={`chat-bubble ${message.author === author ? "chat-mine" : "chat-theirs"}`}
            >
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              <time dateTime={message.createdAt} className="chat-time">{stamp(message.createdAt)}</time>
            </div>
          ),
        )}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const body = draft.trim();
          if (!body) return;
          onSend(body);
          setDraft("");
        }}
      >
        <Input
          className="h-12 flex-1"
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.placeholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" size="iconLg" aria-label={t("chat.send")}>
          <Send />
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" className="h-10 rounded-xl" disabled>
          <Camera />
          {t("chat.photo")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-10 rounded-xl"
          disabled={sharing}
          onClick={() => void shareLocation()}
        >
          <MapPin />
          {sharing ? t("common.loading") : t("chat.shareLocation")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {shareError ? t("chat.locationFailed") : t("chat.attachSoon")}
      </p>
    </section>
  );
}
