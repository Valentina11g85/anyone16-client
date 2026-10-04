/**
 * AnyOne¹⁶ — Favor data model (Stage 2).
 *
 * The shape below mirrors the future persistence layer. Nothing is stored yet,
 * but every screen reads and writes this structure so a backend can be added
 * later without reworking the UI.
 */

export const FAVOR_STATUSES = [
  "DRAFT",
  "AI_PROCESSING",
  "READY_FOR_REVIEW",
  "READY_TO_PUBLISH",
  "PUBLISHED",
  "RECEIVING_OFFERS",
  "OFFER_RECEIVED",
  "WORKER_SELECTED",
  "WORKER_ON_THE_WAY",
  "ARRIVED_AT_PICKUP",
  "IN_PROGRESS",
  "NEAR_DESTINATION",
  /** The worker finished the work; only the client confirmation code completes it. */
  "READY_FOR_CONFIRMATION",
  "CODE_ENTERED",
  "COMPLETED",
  "CANCELLED",
  "DISPUTED",
] as const;

export type FavorStatus = (typeof FAVOR_STATUSES)[number];

export const FAVOR_CATEGORIES = [
  "laundry",
  "packages",
  "shopping",
  "documents",
  "waiting",
  "flowers",
  "gifts",
  "pets",
  "other",
  "uncategorized",
] as const;

export type FavorCategory = (typeof FAVOR_CATEGORIES)[number];

export type LocationKind = "pickup" | "destination" | "stop";

/**
 * International location structure. Nothing here is Colombia-specific: every
 * field is optional except the visible label, so CO, MX, US, ES, BR, AR, CL,
 * PE, CA, UK, Europe and Asia all fit the same shape.
 */
export type FavorLocation = {
  id: string;
  kind: LocationKind;
  /** Free text written, searched or picked by the user. */
  label: string;
  details?: string;
  /** Named place ("Lavandería del centro"). */
  placeName?: string;
  /** Google place identifier when the point came from a place search. */
  placeId?: string;
  addressLine?: string;
  city?: string;
  /** State / province / department — never assumed mandatory. */
  region?: string;
  countryCode?: string;
  postalCode?: string;
  /** Arrival instructions for the worker. */
  instructions?: string;
  latitude?: number | null;
  longitude?: number | null;
  /** exact addresses are only revealed to authorised parties. */
  precision?: "exact" | "approximate";
  source?: "manual" | "device" | "search" | "map";
};

export type FavorSchedule = {
  /** now | today | tonight | afternoon | tomorrow | custom */
  preset: SchedulePreset | null;
  date: string | null;
  time: string | null;
  timeWindow: string | null;
  urgency: Urgency;
};

export const SCHEDULE_PRESETS = [
  "now",
  "today",
  "afternoon",
  "tonight",
  "tomorrow",
  "custom",
] as const;
export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number];

export const URGENCY_LEVELS = ["low", "normal", "high"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export type FavorBudget = {
  /** Always stored as amount + currency_code, never as a bare symbol. */
  amount: number | null;
  currencyCode: string;
  recommendedMin: number | null;
  recommendedMax: number | null;
};

export type AIInterpretation = {
  rawInput: string;
  summary: string;
  confidence: number;
  missingFields: MissingField[];
  notes: string[];
  interpretedAt: string;
};

export const MISSING_FIELDS = [
  "pickup",
  "destination",
  "schedule",
  "budget",
  "description",
] as const;
export type MissingField = (typeof MISSING_FIELDS)[number];

export type Favor = {
  id: string;
  userId: string | null;
  description: string;
  category: FavorCategory;
  status: FavorStatus;
  countryCode: string;
  languageCode: string;
  currencyCode: string;
  pickupLocation: FavorLocation | null;
  destinationLocation: FavorLocation | null;
  additionalStops: FavorLocation[];
  schedule: FavorSchedule;
  waitingRequired: boolean;
  waitingDuration: string | null;
  itemCount: number | null;
  budget: FavorBudget;
  specialInstructions: string;
  aiInterpretation: AIInterpretation | null;
  /** Coarse, public-safe geography. Exact addresses stay in the locations. */
  geo: FavorGeo;
  createdAt: string;
  updatedAt: string;
};

export type FavorGeo = {
  city: string | null;
  region: string | null;
  zoneLabel: string | null;
  stopCount: number;
  routeDistanceKm: number | null;
  travelMinutes: number | null;
  waitMinutes: number | null;
  totalMinutes: number | null;
};

export const emptyGeo = (): FavorGeo => ({
  city: null,
  region: null,
  zoneLabel: null,
  stopCount: 0,
  routeDistanceKm: null,
  travelMinutes: null,
  waitMinutes: null,
  totalMinutes: null,
});

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;

export function createFavorDraft(config: {
  countryCode: string;
  languageCode: string;
  currencyCode: string;
}): Favor {
  const now = new Date().toISOString();
  return {
    id: newId(),
    userId: null,
    description: "",
    category: "uncategorized",
    status: "DRAFT",
    countryCode: config.countryCode,
    languageCode: config.languageCode,
    currencyCode: config.currencyCode,
    pickupLocation: null,
    destinationLocation: null,
    additionalStops: [],
    schedule: { preset: null, date: null, time: null, timeWindow: null, urgency: "normal" },
    waitingRequired: false,
    waitingDuration: null,
    itemCount: null,
    budget: {
      amount: null,
      currencyCode: config.currencyCode,
      recommendedMin: null,
      recommendedMax: null,
    },
    specialInstructions: "",
    aiInterpretation: null,
    geo: emptyGeo(),
    createdAt: now,
    updatedAt: now,
  };
}

export function createLocation(kind: LocationKind, label = ""): FavorLocation {
  return { id: newId(), kind, label, source: "manual", precision: "approximate" };
}

const ZERO_DECIMAL = new Set(["COP", "CLP", "JPY", "KRW", "PYG", "VND"]);

export function formatMoney(amount: number | null, currencyCode: string, locale = "es-CO") {
  if (amount === null || Number.isNaN(amount)) return "—";
  const fractionDigits = ZERO_DECIMAL.has(currencyCode) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale)} ${currencyCode}`;
  }
}
