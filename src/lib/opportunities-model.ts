/**
 * AnyOne¹⁶ — Oportunidades (services marketplace) domain model.
 *
 * One account can both offer and hire. Country, city, currency and language
 * are independent fields on every listing (never derived from each other).
 * Colombia / COP / Spanish are only the initial defaults.
 */

import type { OfferStatus } from "./marketplace-model";

export type ListingIntent = "OFFER" | "SEEK"; // Ofrezco / Busco-Contrato

export type PriceType = "hour" | "day" | "week" | "month" | "project" | "service" | "negotiable";

export type AvailabilityType = "specific_days" | "hours" | "all_week" | "recurring" | "indefinite";

export type Modality = "in_person" | "remote" | "hybrid";

export type ListingStatus = "DRAFT" | "ACTIVE" | "INACTIVE";

export type ServiceCategory = {
  code: string;
  name: string;
  group: string;
  /** Regulated professions may require credentials once Foundation supports it. */
  requiresCredentials?: boolean;
};

export type ServiceListing = {
  id: string;
  intent: ListingIntent;
  /** profiles.id of the author — the same single AnyOne¹⁶ account. */
  authorProfileId: string | null;
  authorName: string;
  authorPhotoUrl: string | null;
  title: string;
  categoryCode: string;
  description: string;
  price: number | null;
  currencyCode: string;
  priceType: PriceType;
  availabilityType: AvailabilityType;
  availabilityNote: string;
  duration: string;
  modality: Modality;
  countryCode: string;
  city: string;
  zone: string;
  radiusKm: number | null;
  languages: string[];
  photos: string[];
  portfolio: string[];
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
  /** Examples are flagged and never mixed with real data. */
  isDemo: boolean;
};

/** Negotiation on a listing — mirrors the existing favor offer shape. */
export type ServiceOffer = {
  id: string;
  listingId: string;
  fromProfileId: string | null;
  fromName: string;
  amount: number;
  currencyCode: string;
  message: string;
  /** Optional; null/empty on older proposals. */
  availability?: string | null;
  experience?: string | null;
  kind: "offer" | "counter";
  status: OfferStatus;
  createdAt: string;
  buyerProfileId?: string | null;
  providerProfileId?: string | null;
};

export type ContractStatus =
  | "agreed"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "disputed";

/** Hiring after an accepted proposal (public.service_contracts). */
export type ServiceContract = {
  id: string;
  listingId: string;
  acceptedOfferId: string;
  buyerProfileId: string;
  providerProfileId: string;
  amount: number;
  currencyCode: string;
  status: ContractStatus;
  createdAt: string;
  updatedAt: string;
};

/** Review of a completed contract (public.service_reviews). */
export type ServiceReview = {
  id: string;
  contractId: string;
  reviewerProfileId: string;
  reviewedProfileId: string;
  reviewerRole: "buyer" | "provider";
  reviewerName: string;
  rating: number;
  comment: string;
  createdAt: string;
};

/** Aggregates computed by Foundation (get_service_reputation). */
export type Reputation = { average: number; count: number };

/** Opportunities chat (public.service_messages), separate from favors chat. */
export type ServiceMessage = {
  id: string;
  listingId: string;
  senderProfileId: string | null;
  receiverProfileId: string | null;
  body: string;
  createdAt: string;
};

/**
 * Monetization prepared for Admin configuration. Not charged yet; the
 * existing payments system is untouched. The ~USD 1 access fee is separate.
 */
export type ServiceFeeConfig = {
  providerCommissionPct: number;
  hirerCommissionPct: number;
  currencyCode: string;
};

/** Prepared for later payments; nothing is charged. */
export function feeBreakdown(agreedPrice: number, config: ServiceFeeConfig, publishedPrice?: number | null) {
  const provider = Math.round((agreedPrice * config.providerCommissionPct) / 100);
  const hirer = Math.round((agreedPrice * config.hirerCommissionPct) / 100);
  return {
    publishedPrice: publishedPrice ?? null,
    agreedPrice,
    providerCommission: provider,
    hirerCommission: hirer,
    hirerPays: agreedPrice + hirer,
    providerNet: agreedPrice - provider,
    platformIncome: provider + hirer,
    // Legacy field names
    provider,
    hirer,
    total: provider + hirer,
  };
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { group: "Profesionales", code: "doctor", name: "Médico", requiresCredentials: true },
  { group: "Profesionales", code: "lawyer", name: "Abogado", requiresCredentials: true },
  { group: "Profesionales", code: "accountant", name: "Contador", requiresCredentials: true },
  { group: "Profesionales", code: "designer", name: "Diseñador" },
  { group: "Profesionales", code: "developer", name: "Programador" },
  { group: "Profesionales", code: "photographer", name: "Fotógrafo" },
  { group: "Profesionales", code: "architect", name: "Arquitecto", requiresCredentials: true },
  { group: "Profesionales", code: "consultant", name: "Consultor" },
  { group: "Técnicos", code: "mechanic", name: "Mecánico" },
  { group: "Técnicos", code: "electrician", name: "Electricista", requiresCredentials: true },
  { group: "Técnicos", code: "plumber", name: "Plomero" },
  { group: "Técnicos", code: "construction", name: "Construcción" },
  { group: "Técnicos", code: "repairs", name: "Reparaciones" },
  { group: "Técnicos", code: "technician", name: "Técnico" },
  { group: "Servicios", code: "cleaning", name: "Limpieza" },
  { group: "Servicios", code: "nanny", name: "Niñera" },
  { group: "Servicios", code: "pet_care", name: "Cuidado de mascotas" },
  { group: "Servicios", code: "cook", name: "Cocinero" },
  { group: "Servicios", code: "driver", name: "Conductor" },
  { group: "Servicios", code: "manicure", name: "Manicurista" },
  { group: "Servicios", code: "hair", name: "Peluquería" },
  { group: "Servicios", code: "makeup", name: "Maquillaje" },
  { group: "Educación", code: "teacher", name: "Profesor" },
  { group: "Educación", code: "tutor", name: "Tutor" },
  { group: "Educación", code: "languages", name: "Idiomas" },
  { group: "Educación", code: "translation", name: "Traducción" },
  { group: "Creativos", code: "photography", name: "Fotografía" },
  { group: "Creativos", code: "video", name: "Video" },
  { group: "Creativos", code: "design", name: "Diseño" },
  { group: "Creativos", code: "music", name: "Música" },
  { group: "Creativos", code: "editing", name: "Edición" },
  { group: "Otro", code: "other", name: "Otro" },
];

export const CATEGORY_GROUPS = Array.from(new Set(SERVICE_CATEGORIES.map((c) => c.group)));

const OTHER_CATEGORY: ServiceCategory = { group: "Otro", code: "other", name: "Otro" };

export const categoryByCode = (code: string): ServiceCategory =>
  SERVICE_CATEGORIES.find((c) => c.code === code) ?? OTHER_CATEGORY;

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  hour: "Por hora",
  day: "Por día",
  week: "Por semana",
  month: "Por mes",
  project: "Por proyecto",
  service: "Por servicio",
  negotiable: "Negociable",
};

export const AVAILABILITY_LABELS: Record<AvailabilityType, string> = {
  specific_days: "Días específicos",
  hours: "Horarios determinados",
  all_week: "Toda la semana",
  recurring: "Recurrente",
  indefinite: "Indefinida",
};

export const MODALITY_LABELS: Record<Modality, string> = {
  in_person: "Presencial",
  remote: "Remoto",
  hybrid: "Híbrido",
};

export function formatListingPrice(
  listing: Pick<ServiceListing, "price" | "currencyCode" | "priceType">,
) {
  if (listing.price === null || (listing.priceType === "negotiable" && !listing.price))
    return "A convenir";
  const amount = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: listing.currencyCode,
    maximumFractionDigits: 0,
  }).format(listing.price);
  return listing.priceType === "negotiable"
    ? `${amount} · negociable`
    : `${amount} ${PRICE_TYPE_LABELS[listing.priceType].toLowerCase()}`;
}

export function formatMoney(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function emptyListing(input: {
  intent: ListingIntent;
  authorProfileId: string | null;
  authorName: string;
  countryCode: string;
  currencyCode: string;
  languageCode: string;
}): ServiceListing {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    intent: input.intent,
    authorProfileId: input.authorProfileId,
    authorName: input.authorName,
    authorPhotoUrl: null,
    title: "",
    categoryCode: "",
    description: "",
    price: null,
    currencyCode: input.currencyCode,
    priceType: "service",
    availabilityType: "all_week",
    availabilityNote: "",
    duration: "",
    modality: "in_person",
    countryCode: input.countryCode,
    city: "",
    zone: "",
    radiusKm: 5,
    languages: [input.languageCode],
    photos: [],
    portfolio: [],
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
    isDemo: false,
  };
}
