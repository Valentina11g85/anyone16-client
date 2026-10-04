import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Flag,
  LocateFixed,
  MapPin,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { FavorMap } from "@/components/maps/favor-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cacheCoarsePosition, requestDeviceLocation } from "@/lib/device-location";
import { createLocation, type Favor, type FavorLocation } from "@/lib/favor-model";
import { searchPlaces, type PlaceResult } from "@/lib/geocoding.functions";
import { estimateFavor, formatDistance, formatDuration, hasCoords, withGeo } from "@/lib/geo";
import { useRealRoute } from "@/hooks/use-real-route";
import { localeFor, type Translator } from "@/lib/i18n";

function applyPlace(location: FavorLocation, place: PlaceResult): FavorLocation {
  return {
    ...location,
    label: place.label || place.placeName || place.addressLine,
    placeName: place.placeName,
    ...(place.placeId ? { placeId: place.placeId } : {}),
    addressLine: place.addressLine,
    city: place.city,
    region: place.region,
    postalCode: place.postalCode,
    countryCode: place.countryCode,
    latitude: place.latitude,
    longitude: place.longitude,
    precision: "exact",
    source: "search",
  };
}

/** One route point: pickup, a stop or the destination. */
function LocationField({
  location,
  title,
  icon: Icon,
  t,
  languageCode,
  countryCode,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  location: FavorLocation;
  title: string;
  icon: typeof MapPin;
  t: Translator;
  languageCode: string;
  countryCode: string;
  onChange: (next: FavorLocation) => void;
  onRemove?: (() => void) | undefined;
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
}) {
  const runSearch = useServerFn(searchPlaces);
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [locating, setLocating] = useState(false);
  const confirmed = hasCoords(location);
  const lastQuery = useRef("");

  const search = async (raw?: string) => {
    const query = (raw ?? location.label).trim();
    if (query.length < 3) return;
    lastQuery.current = query;
    setSearching(true);
    try {
      const found = await runSearch({ data: { query, countryCode, languageCode } });
      if (lastQuery.current === query) setResults(found);
    } catch {
      if (lastQuery.current === query) setResults([]);
    } finally {
      if (lastQuery.current === query) setSearching(false);
    }
  };

  /** Suggestions appear while typing, without needing the search button. */
  useEffect(() => {
    const query = location.label.trim();
    if (query.length < 3 || confirmed || query === lastQuery.current) return;
    const timer = window.setTimeout(() => void search(query), 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.label, confirmed, countryCode, languageCode]);


  const useDevice = async () => {
    setLocating(true);
    try {
      const reading = await requestDeviceLocation();
      cacheCoarsePosition(reading.coords);
      onChange({
        ...location,
        latitude: reading.coords.latitude,
        longitude: reading.coords.longitude,
        precision: "exact",
        source: "device",
        label: location.label || t("location.useMyLocation"),
      });
    } catch {
      /* the user can always continue manually */
    } finally {
      setLocating(false);
    }
  };

  const field = (
    key: "placeName" | "addressLine" | "city" | "region" | "postalCode" | "instructions",
    labelKey: Parameters<Translator>[0],
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${location.id}-${key}`}>{t(labelKey)}</Label>
      <Input
        id={`${location.id}-${key}`}
        value={location[key] ?? ""}
        onChange={(event) => onChange({ ...location, [key]: event.target.value })}
      />
    </div>
  );

  return (
    <article className="rounded-[22px] border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
          <Icon className="size-4" aria-hidden="true" />
          {title}
        </p>
        <div className="flex items-center gap-1">
          {onMoveUp && (
            <Button variant="ghost" size="icon" aria-label={t("route.moveUp")} onClick={onMoveUp}>
              <ArrowUp />
            </Button>
          )}
          {onMoveDown && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("route.moveDown")}
              onClick={onMoveDown}
            >
              <ArrowDown />
            </Button>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("route.removeStop")}
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          className="flex-1"
          aria-label={title}
          placeholder={t("location.placeholder")}
          value={location.label}
          onChange={(event) =>
            onChange({
              ...location,
              label: event.target.value,
              ...(location.source === "search" ? { source: "manual" } : {}),
            })
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
        />
        <Button
          variant="secondary"
          size="iconLg"
          aria-label={t("location.search")}
          disabled={searching || location.label.trim().length < 3}
          onClick={() => void search()}
        >
          <Search />
        </Button>
        <Button
          variant="secondary"
          size="iconLg"
          aria-label={t("location.useMyLocation")}
          disabled={locating}
          onClick={() => void useDevice()}
        >
          <LocateFixed />
        </Button>
      </div>

      {searching && <p className="mt-2 text-xs text-muted-foreground">{t("location.searching")}</p>}
      {results !== null && !searching && (
        <div className="mt-2">
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("location.noResults")}</p>
          ) : (
            <ul className="space-y-1.5">
              {results.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    className="w-full rounded-2xl bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                    onClick={() => {
                      onChange(applyPlace(location, place));
                      setResults(null);
                    }}
                  >
                    <span className="block font-semibold text-foreground">
                      {place.placeName || place.addressLine}
                    </span>
                    <span className="block text-xs text-muted-foreground">{place.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p
        className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
          confirmed ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
        }`}
      >
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {confirmed ? t("location.coordsConfirmed") : t("location.coordsPending")}
      </p>

      <Button
        variant="ghost"
        size="sm"
        className="mt-2 h-10 w-full justify-between rounded-xl"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {t("location.optionalFields")}
        <ChevronDown className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
      </Button>

      {expanded && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {field("placeName", "location.placeName")}
          {field("addressLine", "location.addressLine")}
          {field("city", "location.city")}
          {field("region", "location.region")}
          {field("postalCode", "location.postalCode")}
          {field("instructions", "location.instructions")}
        </div>
      )}
    </article>
  );
}

/**
 * "¿Dónde debemos ir?" — pickup → stops → destination, in any combination.
 * The route is never assumed to be a simple origin → destination trip.
 */
export function RouteEditor({
  favor,
  languageCode,
  t,
  onChange,
}: {
  favor: Favor;
  languageCode: string;
  t: Translator;
  onChange: (next: Favor) => void;
}) {
  const locale = localeFor(languageCode);
  const estimate = estimateFavor(favor);
  const { route } = useRealRoute(favor, languageCode);
  const distanceKm = route?.distanceKm ?? estimate.distanceKm;
  const totalMinutes =
    route === null
      ? estimate.totalMinutes
      : route.durationMinutes + estimate.waitMinutes + estimate.serviceMinutes;
  const update = (next: Favor) => onChange(withGeo(next));

  const setStop = (index: number, value: FavorLocation) => {
    const stops = [...favor.additionalStops];
    stops[index] = value;
    update({ ...favor, additionalStops: stops });
  };

  const moveStop = (index: number, delta: number) => {
    const target = index + delta;
    const stops = [...favor.additionalStops];
    if (target < 0 || target >= stops.length) return;
    const [moved] = stops.splice(index, 1);
    if (moved) stops.splice(target, 0, moved);
    update({ ...favor, additionalStops: stops });
  };

  return (
    <div className="space-y-3">
      <LocationField
        location={favor.pickupLocation ?? createLocation("pickup")}
        title={t("route.pickup")}
        icon={MapPin}
        t={t}
        languageCode={languageCode}
        countryCode={favor.countryCode}
        onChange={(next) => update({ ...favor, pickupLocation: next })}
      />

      {favor.additionalStops.map((stop, index) => (
        <LocationField
          key={stop.id}
          location={stop}
          title={`${t("location.stop")} ${index + 1}`}
          icon={MapPin}
          t={t}
          languageCode={languageCode}
          countryCode={favor.countryCode}
          onChange={(next) => setStop(index, next)}
          onRemove={() =>
            update({
              ...favor,
              additionalStops: favor.additionalStops.filter((item) => item.id !== stop.id),
            })
          }
          onMoveUp={index > 0 ? () => moveStop(index, -1) : undefined}
          onMoveDown={index < favor.additionalStops.length - 1 ? () => moveStop(index, 1) : undefined}
        />
      ))}

      <Button
        variant="soft"
        size="touch"
        className="w-full"
        onClick={() =>
          update({ ...favor, additionalStops: [...favor.additionalStops, createLocation("stop")] })
        }
      >
        <Plus />
        {t("route.addStop")}
      </Button>

      <LocationField
        location={favor.destinationLocation ?? createLocation("destination")}
        title={t("route.destination")}
        icon={Flag}
        t={t}
        languageCode={languageCode}
        countryCode={favor.countryCode}
        onChange={(next) => update({ ...favor, destinationLocation: next })}
      />

      <FavorMap favor={favor} t={t} polyline={route?.polyline ?? null} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("route.totalDistance")}
          </p>
          <p className="mt-1 font-display text-lg font-extrabold">
            {formatDistance(distanceKm, locale) ?? t("route.pendingDistance")}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("route.estimatedTime")}
          </p>
          <p className="mt-1 font-display text-lg font-extrabold">
            {formatDuration(totalMinutes) ?? t("route.pendingTime")}
          </p>
        </div>
      </div>
    </div>
  );
}
