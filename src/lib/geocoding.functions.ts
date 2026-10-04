/**
 * Place search through the Google Maps Platform connector (Places API New).
 *
 * Suggestions come from Autocomplete (which understands partial input and
 * local address formats such as "Carrera 43A # 1-50"), with Text Search as a
 * fallback for broader queries. Real coordinates only — if the provider
 * returns nothing we return an empty list and the location stays
 * "pending to confirm".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  query: z.string().min(2).max(200),
  countryCode: z.string().length(2).optional(),
  languageCode: z.string().min(2).max(5).default("es"),
});

export type PlaceResult = {
  id: string;
  placeId: string;
  label: string;
  placeName: string;
  addressLine: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  latitude: number;
  longitude: number;
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const DETAIL_FIELDS =
  "id,displayName,formattedAddress,shortFormattedAddress,location,addressComponents";

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: AddressComponent[];
};

const componentOf = (components: AddressComponent[], type: string, short = false) => {
  const found = components.find((component) => (component.types ?? []).includes(type));
  if (!found) return "";
  return (short ? found.shortText : found.longText) ?? "";
};

const toResult = (place: GooglePlace, fallbackLabel: string): PlaceResult | null => {
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;

  const components = place.addressComponents ?? [];
  const street = [componentOf(components, "route"), componentOf(components, "street_number")]
    .filter(Boolean)
    .join(" ");

  return {
    id: place.id ?? `${latitude},${longitude}`,
    placeId: place.id ?? "",
    label: place.formattedAddress ?? place.displayName?.text ?? fallbackLabel,
    placeName: place.displayName?.text ?? "",
    addressLine: street || place.shortFormattedAddress || place.formattedAddress || "",
    city:
      componentOf(components, "locality") ||
      componentOf(components, "postal_town") ||
      componentOf(components, "administrative_area_level_2"),
    region: componentOf(components, "administrative_area_level_1"),
    postalCode: componentOf(components, "postal_code"),
    countryCode: componentOf(components, "country", true).toUpperCase(),
    latitude,
    longitude,
  };
};

export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<PlaceResult[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const connectionKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !connectionKey) {
      // Surfaced to the caller instead of an empty list, so a configuration
      // problem is never shown to the user as "no results".
      throw new Error("google_maps_not_configured");
    }

    const region = data.countryCode?.toUpperCase();
    const authHeaders = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Content-Type": "application/json",
    };

    /** Suggestions for partial input, biased to the market's country. */
    const autocomplete = async (): Promise<string[]> => {
      const body: Record<string, unknown> = {
        input: data.query,
        languageCode: data.languageCode,
      };
      if (region) body["includedRegionCodes"] = [region];

      const response = await fetch(`${GATEWAY_URL}/places/v1/places:autocomplete`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "X-Goog-FieldMask": "suggestions.placePrediction.placeId",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        console.error(`Places autocomplete failed [${response.status}]: ${await response.text()}`);
        return [];
      }
      const payload = (await response.json()) as {
        suggestions?: { placePrediction?: { placeId?: string } }[];
      };
      return (payload.suggestions ?? [])
        .map((suggestion) => suggestion.placePrediction?.placeId)
        .filter((id): id is string => Boolean(id))
        .slice(0, 5);
    };

    /** Full address + coordinates for a suggestion. */
    const details = async (placeId: string): Promise<PlaceResult | null> => {
      const params = new URLSearchParams({ languageCode: data.languageCode });
      if (region) params.set("regionCode", region);
      const response = await fetch(
        `${GATEWAY_URL}/places/v1/places/${encodeURIComponent(placeId)}?${params.toString()}`,
        { headers: { ...authHeaders, "X-Goog-FieldMask": DETAIL_FIELDS } },
      );
      if (!response.ok) {
        console.error(`Place details failed [${response.status}]: ${await response.text()}`);
        return null;
      }
      return toResult((await response.json()) as GooglePlace, data.query);
    };

    /** Broader free-text search, used when autocomplete has nothing. */
    const textSearch = async (): Promise<PlaceResult[]> => {
      const body: Record<string, unknown> = {
        textQuery: data.query,
        languageCode: data.languageCode,
        pageSize: 6,
      };
      if (region) body["regionCode"] = region;

      const response = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "X-Goog-FieldMask": DETAIL_FIELDS.split(",")
            .map((field) => `places.${field}`)
            .join(","),
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        console.error(`Places searchText failed [${response.status}]: ${await response.text()}`);
        return [];
      }
      const payload = (await response.json()) as { places?: GooglePlace[] };
      return (payload.places ?? [])
        .map((place) => toResult(place, data.query))
        .filter((place): place is PlaceResult => place !== null);
    };

    try {
      const ids = await autocomplete();
      if (ids.length > 0) {
        const resolved = await Promise.all(ids.map(details));
        const places = resolved.filter((place): place is PlaceResult => place !== null);
        if (places.length > 0) return places;
      }
      return await textSearch();
    } catch (error) {
      console.error("Place search error", error);
      return [];
    }
  });
