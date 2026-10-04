/**
 * Device location, always asked with context and never blocking the app.
 * The user can always continue manually.
 */
import type { Coords } from "./geo";

export type LocationPermissionState = "unknown" | "prompt" | "granted" | "denied" | "unavailable";

export async function readPermissionState(): Promise<LocationPermissionState> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "unavailable";
  if (!("permissions" in navigator)) return "prompt";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state as LocationPermissionState;
  } catch {
    return "prompt";
  }
}

export type DeviceReading = { coords: Coords; accuracyMeters: number | null };

export function requestDeviceLocation(): Promise<DeviceReading> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          accuracyMeters: position.coords.accuracy ?? null,
        }),
      (error) => reject(new Error(error.message || "denied")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

const STORAGE_KEY = "anyone16.device-location";

/** Cached coarse position for distance hints; never a substitute for the backend. */
export function cacheCoarsePosition(coords: Coords) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(coords));
  } catch {
    /* storage unavailable — distances simply stay pending */
  }
}

export function readCachedPosition(): Coords | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Coords;
    return typeof parsed?.latitude === "number" && typeof parsed?.longitude === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
}
