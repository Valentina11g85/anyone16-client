import { useEffect, useRef, useState } from "react";
import { Flag, MapPin, Navigation } from "lucide-react";

import type { Favor } from "@/lib/favor-model";
import { hasCoords, routePoints, type Coords } from "@/lib/geo";
import { decodePolyline, loadGoogleMaps, type MapsMap } from "@/lib/google-maps-loader";
import type { Translator } from "@/lib/i18n";

/**
 * Brand map rendered with the real Google Maps JavaScript API.
 * Coordinates are never invented: points without latitude and longitude are
 * listed as "pending to confirm" instead of being placed on the map.
 */
export function FavorMap({
  favor,
  t,
  className = "",
  polyline = null,
  livePosition = null,
  liveLabel,
}: {
  favor: Favor;
  t: Translator;
  className?: string;
  /** Encoded polyline of the real driving route, when available. */
  polyline?: string | null;
  /** Real shared position of the worker during an active favor. */
  livePosition?: Coords | null;
  liveLabel?: string;
}) {
  const points = routePoints(favor);
  const placed = points.filter(hasCoords);
  const pending = points.filter((point) => !hasCoords(point));

  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapsMap | null>(null);
  const markersRef = useRef<{ setMap: (map: MapsMap | null) => void }[]>([]);
  const lineRef = useRef<{ setMap: (map: MapsMap | null) => void } | null>(null);
  const [failed, setFailed] = useState(false);

  const signature = placed
    .map((point) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`)
    .join(";");
  const liveKey = livePosition
    ? `${livePosition.latitude.toFixed(5)},${livePosition.longitude.toFixed(5)}`
    : "";

  useEffect(() => {
    if (placed.length === 0 || !container.current) return;
    let active = true;

    loadGoogleMaps()
      .then((maps) => {
        if (!active || !container.current) return;
        const map =
          mapRef.current ??
          new maps.Map(container.current, {
            center: { lat: placed[0]!.latitude, lng: placed[0]!.longitude },
            zoom: 13,
            clickableIcons: false,
            disableDefaultUI: true,
            zoomControl: true,
            styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
          });
        mapRef.current = map;

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = placed.map(
          (point, index) =>
            new maps.Marker({
              map,
              position: { lat: point.latitude, lng: point.longitude },
              label: {
                text: String(index + 1),
                color: "#ffffff",
                fontWeight: "700",
              },
              title:
                index === 0
                  ? t("route.pickup")
                  : index === placed.length - 1
                    ? t("route.destination")
                    : `${t("location.stop")} ${index}`,
            }),
        );

        lineRef.current?.setMap(null);
        const path = polyline
          ? decodePolyline(polyline)
          : placed.map((point) => ({ lat: point.latitude, lng: point.longitude }));
        if (path.length > 1) {
          lineRef.current = new maps.Polyline({
            map,
            path,
            strokeColor: "#2563eb",
            strokeOpacity: polyline ? 0.9 : 0.5,
            strokeWeight: 5,
          });
        }

        if (livePosition) {
          markersRef.current.push(
            new maps.Marker({
              map,
              position: { lat: livePosition.latitude, lng: livePosition.longitude },
              zIndex: 999,
              title: liveLabel ?? t("track.live.here"),
              icon: {
                path: 0, // google.maps.SymbolPath.CIRCLE
                scale: 8,
                fillColor: "#dc2626",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3,
              },
            }),
          );
        }

        const bounds = new maps.LatLngBounds();
        path.forEach((coord) => bounds.extend(coord));
        placed.forEach((point) => bounds.extend({ lat: point.latitude, lng: point.longitude }));
        if (livePosition)
          bounds.extend({ lat: livePosition.latitude, lng: livePosition.longitude });
        if (placed.length === 1 && !livePosition) {
          map.setCenter({ lat: placed[0]!.latitude, lng: placed[0]!.longitude });
          map.setZoom(15);
        } else {
          map.fitBounds(bounds, 48);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, polyline, liveKey]);

  return (
    <section className={`overflow-hidden rounded-[22px] border border-border bg-card ${className}`}>
      <div className="relative bg-surface">
        <div
          ref={container}
          role="img"
          aria-label={t("map.title")}
          className="h-52 w-full sm:h-64"
        />
        {(placed.length === 0 || failed) && (
          <div className="absolute inset-0 grid place-items-center bg-surface px-6 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-soft text-primary">
                <Navigation className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-3 font-display text-sm font-bold">{t("map.noCoords.title")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("map.noCoords.body")}</p>
            </div>
          </div>
        )}
      </div>
      {pending.length > 0 && placed.length > 0 && (
        <ul className="space-y-1 border-t border-border p-4 text-xs text-muted-foreground">
          {pending.map((point) => (
            <li key={point.id} className="flex items-center gap-2">
              {point.kind === "destination" ? (
                <Flag className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate font-semibold text-foreground">{point.label}</span>
              <span>· {t("map.pendingPoint")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
