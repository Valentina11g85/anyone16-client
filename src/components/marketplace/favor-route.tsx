import { Flag, MapPin, Route as RouteIcon, ShieldCheck, Timer } from "lucide-react";

import { FavorMap } from "@/components/maps/favor-map";
import type { Favor, FavorLocation } from "@/lib/favor-model";
import {
  canSeeExactAddress,
  estimateFavor,
  formatDistance,
  formatDuration,
  publicLabel,
  routePoints,
  type Coords,
} from "@/lib/geo";
import { useRealRoute } from "@/hooks/use-real-route";
import { localeFor, type Translator } from "@/lib/i18n";

/**
 * "Ruta del favor" — pickup ↓ stops ↓ destination plus the map.
 * Exact addresses are only rendered for viewers authorised by the favor state.
 */
export function FavorRoute({
  favor,
  viewer,
  languageCode,
  t,
  showMap = true,
  livePosition = null,
}: {
  favor: Favor;
  viewer: "client" | "worker";
  languageCode: string;
  t: Translator;
  showMap?: boolean;
  /** Real shared position of the worker while the favor is active. */
  livePosition?: Coords | null;
}) {
  const locale = localeFor(languageCode);
  const estimate = estimateFavor(favor);
  const { route } = useRealRoute(favor, languageCode);
  const distanceKm = route?.distanceKm ?? estimate.distanceKm;
  const totalMinutes =
    route === null
      ? estimate.totalMinutes
      : route.durationMinutes + estimate.waitMinutes + estimate.serviceMinutes;
  const revealed = canSeeExactAddress(favor, viewer);
  const points = routePoints(favor);

  const labelFor = (point: FavorLocation) =>
    revealed ? point.label || t("common.notDefined") : publicLabel(point) ?? t("privacy.hidden");

  return (
    <section className="rounded-[22px] border border-border bg-card p-4 shadow-soft sm:p-5">
      <h3 className="flex items-center gap-2 font-display text-base font-bold">
        <RouteIcon className="size-4 text-primary" aria-hidden="true" />
        {t("route.favorRoute")}
      </h3>

      {points.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("common.notDefined")}</p>
      ) : (
        <ol className="mt-4 space-y-0">
          {points.map((point, index) => {
            const last = index === points.length - 1;
            const isDestination = point.kind === "destination";
            return (
              <li key={point.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-primary">
                    {isDestination ? (
                      <Flag className="size-4" aria-hidden="true" />
                    ) : (
                      <MapPin className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  {!last && <span className="my-1 w-px flex-1 bg-border" aria-hidden="true" />}
                </div>
                <div className={`min-w-0 flex-1 ${last ? "pb-0" : "pb-5"}`}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {point.kind === "pickup"
                      ? t("route.pickup")
                      : isDestination
                        ? t("route.destination")
                        : `${t("location.stop")} ${index}`}
                  </p>
                  <p className="mt-0.5 break-words text-sm font-semibold">{labelFor(point)}</p>
                  {revealed && point.details && (
                    <p className="text-xs text-muted-foreground">{point.details}</p>
                  )}
                  {revealed && point.instructions && (
                    <p className="text-xs text-muted-foreground">{point.instructions}</p>
                  )}
                  {!revealed && (
                    <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                      <ShieldCheck className="size-3" aria-hidden="true" />
                      {t("privacy.hiddenBody")}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
          {t("route.totalDistance")}:{" "}
          {formatDistance(distanceKm, locale) ?? t("route.pendingDistance")}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
          <Timer className="size-3.5" aria-hidden="true" />
          {formatDuration(totalMinutes) ?? t("route.pendingTime")}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
          {favor.additionalStops.length > 0
            ? `${favor.additionalStops.length} ${t("route.stops")}`
            : t("route.noStops")}
        </span>
      </div>

      {showMap && (
        <FavorMap
          favor={favor}
          t={t}
          className="mt-4"
          polyline={route?.polyline ?? null}
          livePosition={livePosition}
        />
      )}
    </section>
  );
}
