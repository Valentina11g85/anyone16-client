/**
 * Loads the Google Maps JavaScript API once, asynchronously, with the managed
 * browser key. Places libraries are never loaded in the browser: place search
 * runs on the backend through the connector gateway.
 */

/** Minimal structural type for the parts of the Maps API we use. */
export type GoogleMapsApi = {
  Map: new (el: HTMLElement, options: Record<string, unknown>) => MapsMap;
  Marker: new (options: Record<string, unknown>) => { setMap: (map: MapsMap | null) => void };
  Polyline: new (options: Record<string, unknown>) => { setMap: (map: MapsMap | null) => void };
  LatLngBounds: new () => MapsBounds;
};

export type MapsBounds = { extend: (coord: { lat: number; lng: number }) => void };

export type MapsMap = {
  setCenter: (coord: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: MapsBounds, padding?: number) => void;
};

type MapsWindow = Window & { google?: { maps?: GoogleMapsApi } };

let loader: Promise<GoogleMapsApi> | null = null;

const CALLBACK = "__anyone16InitMap";

export function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("no-window"));
  if (loader) return loader;

  const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as
    | string
    | undefined;
  if (!key) return Promise.reject(new Error("missing-browser-key"));

  const channel = (import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"] ?? "") as string;

  const scope = window as MapsWindow;

  loader = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existing = scope.google?.maps;
    if (existing?.Map) {
      resolve(existing);
      return;
    }
    (window as unknown as Record<string, unknown>)[CALLBACK] = () => {
      const maps = scope.google?.maps;
      if (maps) resolve(maps);
      else reject(new Error("maps-load-failed"));
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({ key, loading: "async", callback: CALLBACK });
    if (channel) params.set("channel", channel);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => reject(new Error("maps-load-failed"));
    document.head.appendChild(script);
  });

  return loader;
}

/** Decodes an encoded polyline from the Routes API into coordinates. */
export function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}
