/**
 * Worker view (red + black) of an active favor: position, route, next stop,
 * ETA and one big button for the current operational step. Location is only
 * shared while the worker turns it on and the favor is active.
 */
import { Navigation, Timer } from "lucide-react";

import { FavorRoute } from "@/components/marketplace/favor-route";
import { FavorRating } from "@/components/client/favor-rating";
import { CompletionCodeEntry } from "@/components/trust/completion-code-entry";
import { EvidenceCapture } from "@/components/trust/evidence-capture";
import { Button } from "@/components/ui/button";
import type { Favor } from "@/lib/favor-model";
import { formatDistance, formatDuration, hasCoords } from "@/lib/geo";
import { localeFor, type TranslationKey, type Translator } from "@/lib/i18n";
import { advanceFavorTracking } from "@/lib/marketplace-store";
import { isTrackingActive, nextTarget, stepFor } from "@/lib/tracking";
import { useLegRoute } from "@/hooks/use-leg-route";
import { useLiveLocation } from "@/hooks/use-live-location";
import { useState } from "react";

export function WorkerTracking({
  favor,
  workerProfileId,
  isDemo,
  languageCode,
  t,
}: {
  favor: Favor;
  workerProfileId: string | null;
  isDemo: boolean;
  languageCode: string;
  t: Translator;
}) {
  const locale = localeFor(languageCode);
  const active = isTrackingActive(favor.status);
  const [sharing, setSharing] = useState(true);
  const { position, accuracyMeters, status } = useLiveLocation({
    enabled: sharing && active,
    favorId: active ? favor.id : null,
    workerProfileId,
    isDemo,
  });

  const target = nextTarget(favor, favor.status);
  const leg = useLegRoute(
    position,
    target && hasCoords(target) ? { latitude: target.latitude, longitude: target.longitude } : null,
    languageCode,
    favor.countryCode,
  );
  const step = stepFor(favor.status);

  return (
    <section className="rounded-[26px] border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">{t("track.title")}</p>
        <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
          {t(`status.${favor.status}` as TranslationKey)}
        </span>
      </div>

      {active && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant={sharing ? "default" : "secondary"}
            size="sm"
            className="h-10 rounded-xl"
            aria-pressed={sharing}
            onClick={() => setSharing((value) => !value)}
          >
            {sharing ? t("track.sharing") : t("track.share")}
          </Button>
        </div>
      )}

      {active && status === "denied" && (
        <p className="mt-3 text-sm text-muted-foreground">{t("track.gpsOff")}</p>
      )}
      {active && status === "unavailable" && (
        <p className="mt-3 text-sm text-muted-foreground">{t("track.gpsOff")}</p>
      )}
      {active && sharing && status === "starting" && (
        <p className="mt-3 text-sm text-muted-foreground">{t("track.noSignal")}</p>
      )}
      {active && status === "live" && accuracyMeters !== null && accuracyMeters > 80 && (
        <p className="mt-3 text-sm text-muted-foreground">{t("track.lowAccuracy")}</p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("track.nextStop")}
          </p>
          <p className="mt-1 break-words text-sm font-bold">
            {target?.label || t("common.notDefined")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t("track.eta")}
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 font-display text-base font-extrabold">
              <Timer className="size-4" aria-hidden="true" />
              {formatDuration(leg?.durationMinutes ?? null) ?? t("track.pendingEta")}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t("track.remaining")}
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 font-display text-base font-extrabold">
              <Navigation className="size-4" aria-hidden="true" />
              {formatDistance(leg?.distanceKm ?? null, locale) ?? t("route.pendingDistance")}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <FavorRoute
          favor={favor}
          viewer="worker"
          languageCode={languageCode}
          t={t}
          livePosition={position}
        />
      </div>

      {step && (
        <Button
          className="mt-5 w-full text-base"
          size="touch"
          onClick={() =>
            advanceFavorTracking({
              favorId: favor.id,
              status: step.to,
              audit: step.audit,
              note: t(step.eventKey),
              author: "worker",
              coords: position,
            })
          }
        >
          {t(step.actionKey)}
        </Button>
      )}
      {(favor.status === "READY_FOR_CONFIRMATION" || favor.status === "CODE_ENTERED") && (
        <CompletionCodeEntry favor={favor} languageCode={languageCode} position={position} />
      )}

      <EvidenceCapture
        favor={favor}
        languageCode={languageCode}
        workerProfileId={workerProfileId}
        position={position}
        canAdd={active}
      />

      {favor.status === "COMPLETED" && (
        <p className="mt-5 rounded-2xl bg-success/15 p-4 text-center text-sm font-bold text-success">
          {t("track.done")}
        </p>
      )}
      {favor.status === "COMPLETED" && !isDemo && (
        <FavorRating favorId={favor.id} languageCode={languageCode} />
      )}
    </section>
  );
}
