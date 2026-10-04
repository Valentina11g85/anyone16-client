/**
 * Real driving routes through the Google Maps Platform connector (Routes API).
 *
 * Returns the real road distance, the real travel duration and the encoded
 * route polyline. When the provider cannot compute a route we return null and
 * the UI keeps showing the local estimate as "pending".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const pointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const inputSchema = z.object({
  points: z.array(pointSchema).min(2).max(12),
  languageCode: z.string().min(2).max(5).default("es"),
  regionCode: z.string().length(2).optional(),
});

export type RealRoute = {
  distanceKm: number;
  durationMinutes: number;
  polyline: string | null;
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const waypoint = (point: { latitude: number; longitude: number }) => ({
  location: { latLng: { latitude: point.latitude, longitude: point.longitude } },
});

export const computeRealRoute = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<RealRoute | null> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const connectionKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !connectionKey) return null;

    const [origin, ...rest] = data.points;
    const destination = rest.pop()!;
    const body: Record<string, unknown> = {
      origin: waypoint(origin!),
      destination: waypoint(destination),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      languageCode: data.languageCode,
      units: "METRIC",
    };
    if (rest.length > 0) body["intermediates"] = rest.map(waypoint);
    if (data.regionCode) body["regionCode"] = data.regionCode.toUpperCase();

    try {
      const response = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connectionKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`Routes computeRoutes failed [${response.status}]: ${text}`);
        return null;
      }

      const payload = (await response.json()) as {
        routes?: {
          distanceMeters?: number;
          duration?: string;
          polyline?: { encodedPolyline?: string };
        }[];
      };
      const route = payload.routes?.[0];
      if (!route || typeof route.distanceMeters !== "number") return null;

      const seconds = Number(String(route.duration ?? "0s").replace("s", ""));
      return {
        distanceKm: Math.round((route.distanceMeters / 1000) * 10) / 10,
        durationMinutes: Math.max(1, Math.round((Number.isFinite(seconds) ? seconds : 0) / 60)),
        polyline: route.polyline?.encodedPolyline ?? null,
      };
    } catch (error) {
      console.error("Routes computeRoutes error", error);
      return null;
    }
  });
