/**
 * Client view (blue) of an active favor: who is helping, where they are and
 * when they arrive. Positions come from the worker's real shared location; if
 * nothing has been shared yet the card simply shows the status.
 */
import { BadgeCheck, Navigation, Star, Timer } from "lucide-react";

import { WorkerAvatar } from "@/components/marketplace/worker-avatar";
import type { Favor } from "@/lib/favor-model";
import { formatDistance, formatDuration, hasCoords, type Coords } from "@/lib/geo";
import { localeFor, type Translator } from "@/lib/i18n";
import type { WorkerProfile } from "@/lib/marketplace-model";
import { clientMessageKey, isNear, nextTarget } from "@/lib/tracking";
import { useLegRoute } from "@/hooks/use-leg-route";

export function LiveTracking({
  favor,
  worker,
  position,
  languageCode,
  t,
}: {
  favor: Favor;
  worker: WorkerProfile;
  position: Coords | null;
  languageCode: string;
  t: Translator;
}) {
  const locale = localeFor(languageCode);
  const target = nextTarget(favor, favor.status);
  const leg = useLegRoute(
    position,
    target && hasCoords(target) ? { latitude: target.latitude, longitude: target.longitude } : null,
    languageCode,
    favor.countryCode,
  );
  const messageKey = clientMessageKey(favor.status);
  const near =
    target && hasCoords(target)
      ? isNear(position, { latitude: target.latitude, longitude: target.longitude })
      : false;

  return (
    <section className="rounded-[26px] border border-primary/30 bg-brand-soft p-5 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wide text-primary">{t("track.title")}</p>

      <div className="mt-3 flex items-center gap-3">
        <WorkerAvatar worker={worker} />
        <div className="min-w-0">
          <p className="font-display text-lg font-extrabold leading-tight text-foreground">
            {worker.name}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5" aria-hidden="true" />
              {worker.rating.average.toFixed(1)}
            </span>
            {worker.verification.level !== "none" && (
              <span className="inline-flex items-center gap-1 text-primary">
                <BadgeCheck className="size-3.5" aria-hidden="true" />
                {worker.verification.identityVerified
                  ? t("offer.verified")
                  : t("offer.unverified")}
              </span>
            )}
          </p>
        </div>
      </div>

      {messageKey && (
        <p
          className="mt-4 font-display text-base font-bold leading-snug text-brand-dark"
          aria-live="polite"
        >
          {worker.name} {t(messageKey)}
        </p>
      )}
      {near && favor.status !== "COMPLETED" && (
        <p className="mt-1 text-sm font-semibold text-primary">{t("track.near")}</p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-card p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("track.eta")}
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 font-display text-lg font-extrabold">
            <Timer className="size-4 text-primary" aria-hidden="true" />
            {formatDuration(leg?.durationMinutes ?? null) ?? t("track.pendingEta")}
          </p>
        </div>
        <div className="rounded-2xl bg-card p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("track.remaining")}
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 font-display text-lg font-extrabold">
            <Navigation className="size-4 text-primary" aria-hidden="true" />
            {formatDistance(leg?.distanceKm ?? null, locale) ?? t("route.pendingDistance")}
          </p>
        </div>
      </div>

      {!position && favor.status !== "COMPLETED" && (
        <p className="mt-3 text-xs text-muted-foreground">{t("track.noSignal")}</p>
      )}
      {position && "recordedAt" in position && typeof position.recordedAt === "string" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Última actualización:{" "}
          {new Date(position.recordedAt).toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </section>
  );
}
