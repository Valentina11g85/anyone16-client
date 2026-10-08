/**
 * AnyOne¹⁶ — Oportunidades persistence, backed by Foundation.
 *
 * Tables: public.service_listings / public.service_offers (RLS enforced).
 * service_listings.profile_id and service_offers.*_profile_id reference
 * public.profiles.id. Uses the same Foundation client as the other repos.
 *
 * Example listings live in DEMO_LISTINGS, are flagged `isDemo`, are shown
 * with an "Ejemplo" label and are never written to Foundation.
 */

import { foundation } from "@/integrations/foundation/client";
import type {
  ContractStatus,
  ListingStatus,
  ServiceContract,
  ServiceListing,
  ServiceMessage,
  ServiceOffer,
  ServiceReview,
  Reputation,
} from "./opportunities-model";
import type { OfferStatus } from "./marketplace-model";

export type OpportunitiesAdapter = {
  kind: "device" | "foundation";
  loadListings(): Promise<ServiceListing[]>;
  saveListing(listing: ServiceListing): Promise<ServiceListing>;
  deleteListing(id: string): Promise<void>;
  loadOffers(listings: ServiceListing[]): Promise<ServiceOffer[]>;
  createOffer(offer: ServiceOffer, listing: ServiceListing): Promise<ServiceOffer>;
  updateOfferStatus(offer: ServiceOffer, status: OfferStatus): Promise<void>;
};

// The generated Foundation types don't include these tables yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => foundation as any;

type ListingRow = {
  id: string;
  profile_id: string | null;
  listing_type: string;
  title: string | null;
  description: string | null;
  category_slug: string | null;
  price_amount: number | string | null;
  price_currency: string | null;
  price_type: string | null;
  availability: { type?: string; note?: string; duration?: string } | null;
  duration_minutes: number | null;
  modality: string | null;
  country_code: string | null;
  city: string | null;
  region: string | null;
  zone: string | null;
  service_radius_km: number | string | null;
  language_codes: string[] | null;
  photos: string[] | null;
  portfolio: string[] | null;
  status: string;
  is_demo: boolean | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author?: { full_name?: string | null; avatar_url?: string | null } | null;
};

type OfferRow = {
  id: string;
  service_listing_id: string;
  buyer_profile_id: string | null;
  provider_profile_id: string | null;
  kind: string;
  offered_amount: number | string;
  currency_code: string;
  message: string | null;
  availability?: string | null;
  experience?: string | null;
  status: string;
  created_at: string;
  sender_profile_id?: string | null;
  sender?: { full_name?: string | null } | null;
};

const STATUS_TO_DB: Record<ListingStatus, string> = {
  DRAFT: "draft",
  ACTIVE: "published",
  INACTIVE: "paused",
};
const statusFromDb = (s: string): ListingStatus =>
  s === "published" ? "ACTIVE" : s === "draft" ? "DRAFT" : "INACTIVE";

const num = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : Number(v);

function fromRow(row: ListingRow): ServiceListing {
  const a = row.availability ?? {};
  return {
    id: row.id,
    intent: row.listing_type === "request" ? "SEEK" : "OFFER",
    authorProfileId: row.profile_id,
    authorName: row.author?.full_name || "Usuario AnyOne",
    authorPhotoUrl: row.author?.avatar_url ?? null,
    title: row.title ?? "",
    categoryCode: row.category_slug ?? "other",
    description: row.description ?? "",
    price: num(row.price_amount),
    currencyCode: row.price_currency ?? "COP",
    priceType: (row.price_type as ServiceListing["priceType"]) ?? "service",
    availabilityType: (a.type as ServiceListing["availabilityType"]) ?? "all_week",
    availabilityNote: a.note ?? "",
    duration: a.duration ?? (row.duration_minutes ? String(row.duration_minutes) : ""),
    modality: (row.modality as ServiceListing["modality"]) ?? "in_person",
    countryCode: row.country_code ?? "CO",
    city: row.city ?? "",
    zone: row.zone ?? "",
    radiusKm: num(row.service_radius_km),
    languages: Array.isArray(row.language_codes) ? row.language_codes : [],
    photos: Array.isArray(row.photos) ? row.photos : [],
    portfolio: Array.isArray(row.portfolio) ? row.portfolio : [],
    status: statusFromDb(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDemo: Boolean(row.is_demo),
  };
}

function toRow(l: ServiceListing, previous: ServiceListing | null) {
  const minutes = Number.parseInt(l.duration, 10);
  const publishing = l.status === "ACTIVE" && previous?.status !== "ACTIVE";
  return {
    id: l.id,
    profile_id: l.authorProfileId,
    listing_type: l.intent === "SEEK" ? "request" : "offer",
    title: l.title,
    description: l.description,
    category_slug: l.categoryCode || null,
    price_amount: l.price,
    price_currency: l.currencyCode,
    price_type: l.priceType,
    availability: { type: l.availabilityType, note: l.availabilityNote, duration: l.duration },
    duration_minutes: Number.isFinite(minutes) ? minutes : null,
    modality: l.modality,
    country_code: l.countryCode,
    city: l.city,
    region: null,
    zone: l.zone,
    service_radius_km: l.radiusKm,
    language_codes: l.languages,
    photos: l.photos,
    portfolio: l.portfolio,
    status: STATUS_TO_DB[l.status],
    is_demo: false,
    ...(publishing ? { published_at: new Date().toISOString() } : {}),
  };
}

const LISTING_SELECT = "*, author:profile_id(full_name, avatar_url)";

const OFFER_STATUS_TO_DB: Record<OfferStatus, string> = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  WITHDRAWN: "withdrawn",
};
const offerStatusFromDb = (s: string) => (s.toUpperCase() as OfferStatus) ?? "PENDING";

/**
 * Uses the real author (sender_profile_id, stamped by Foundation) when the
 * column exists. Without it the sender can't be known, so it stays null and
 * the UI shows it as unknown — nothing is inferred.
 */
function mapOffers(rows: OfferRow[], listings: ServiceListing[]): ServiceOffer[] {
  return [...rows]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => {
      const listing = listings.find((l) => l.id === r.service_listing_id);
      const sender = r.sender_profile_id ?? null;
      const isAuthor = sender !== null && sender === listing?.authorProfileId;
      const senderName = r.sender?.full_name?.trim();
      return {
        id: r.id,
        listingId: r.service_listing_id,
        fromProfileId: sender,
        fromName: sender === null
          ? "Autor no registrado"
          : senderName
            ? senderName
            : isAuthor
              ? (listing?.authorName ?? "Participante")
              : "Participante",
        amount: Number(r.offered_amount),
        currencyCode: r.currency_code,
        message: r.message ?? "",
        availability: r.availability ?? null,
        experience: r.experience ?? null,
        kind: r.kind === "counter" ? "counter" : "offer",
        status: offerStatusFromDb(r.status),
        createdAt: r.created_at,
        buyerProfileId: r.buyer_profile_id,
        providerProfileId: r.provider_profile_id,
      };
    });
}

/** Adds author name/photo to rows returned by RPCs (they carry no profile join). */
async function withAuthors(rows: ListingRow[]): Promise<ListingRow[]> {
  const ids = [...new Set(rows.map((r) => r.profile_id).filter(Boolean))] as string[];
  if (ids.length === 0) return rows;
  const { data } = await db().from("profiles").select("id, full_name, avatar_url").in("id", ids);
  const byId = new Map(((data ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null }>).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, author: r.profile_id ? (byId.get(r.profile_id) ?? null) : null }));
}

/**
 * Premium access of the CURRENT account, decided by Foundation
 * (RPC get_my_opportunities_access). Any error or missing RPC → locked.
 */
export async function getMyOpportunitiesAccess(): Promise<boolean> {
  try {
    const { data, error } = await db().rpc("get_my_opportunities_access");
    if (error) return false;
    const row = Array.isArray(data) ? data[0] : data;
    return row === true || (typeof row === "object" && row !== null && (row as { active?: boolean }).active === true);
  } catch {
    return false;
  }
}

/**
 * MARKETPLACE (general listing). Only source for "Servicios que se ofrecen" and
 * "Ofertas de trabajo": RPC get_opportunities_market. Foundation returns 0 rows
 * without premium access and never includes the caller's own listings.
 * No fallback: if the RPC fails or is not installed yet, the market is empty.
 */
export async function getMarketplaceListings(
  listingType: "offer" | "request" | null = null,
  limit = 100,
  offset = 0,
): Promise<ServiceListing[]> {
  const { data, error } = await db().rpc("get_opportunities_market", {
    _listing_type: listingType,
    _limit: limit,
    _offset: offset,
  });
  if (error) return [];
  const rows = ((data ?? []) as ListingRow[]).filter((r) => !r.is_demo);
  return (await withAuthors(rows)).map(fromRow);
}

/**
 * ONE concrete listing the app already knows it needs (contract, chat, offer,
 * notification, history). RPC get_service_listing_for_me: Foundation returns it
 * only with premium access or a real relationship with THAT listing. null = not
 * available for this account. Never used to list, search or as market fallback.
 */
export async function getMarketplaceListingById(id: string): Promise<ServiceListing | null> {
  if (!id) return null;
  const { data, error } = await db().rpc("get_service_listing_for_me", { _listing_id: id });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as ListingRow | undefined;
  if (!row || row.is_demo) return null;
  const [withAuthor] = await withAuthors([row]);
  return fromRow(withAuthor);
}

/** The caller's OWN listings ("Mis servicios" / "Mis solicitudes"); RLS lets authors read their rows. */
export async function getMyListings(profileId: string): Promise<ServiceListing[]> {
  const { data, error } = await db()
    .from("service_listings")
    .select(LISTING_SELECT)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ListingRow[]).filter((r) => !r.is_demo).map(fromRow);
}

export const foundationAdapter: OpportunitiesAdapter = {
  kind: "foundation",
  /** Marketplace only (see getMarketplaceListings). */
  async loadListings() {
    return getMarketplaceListings();
  },
  async saveListing(listing) {
    const { data: existing } = await db()
      .from("service_listings")
      .select("status")
      .eq("id", listing.id)
      .maybeSingle();
    const prev = existing ? ({ status: statusFromDb(existing.status) } as ServiceListing) : null;
    const row = toRow(listing, prev);
    const query = existing
      ? db().from("service_listings").update(row).eq("id", listing.id)
      : db().from("service_listings").insert(row);
    const { data, error } = await query.select(LISTING_SELECT).single();
    if (error) throw new Error(error.message);
    return fromRow(data as ListingRow);
  },
  async deleteListing(id) {
    const { error } = await db().from("service_listings").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
  async loadOffers(listings) {
    const { data, error } = await db()
      .from("service_offers")
      .select("*, sender:sender_profile_id(full_name)")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return mapOffers((data ?? []) as OfferRow[], listings);
  },
  async createOffer(offer, listing) {
    const author = listing.authorProfileId;
    const sender = offer.fromProfileId;
    const senderIsAuthor = sender === author;
    // For an existing negotiation, keep the counterpart fixed.
    const counterpart = senderIsAuthor ? null : sender;
    const buyer = listing.intent === "OFFER" ? (senderIsAuthor ? null : counterpart) : author;
    const provider = listing.intent === "OFFER" ? author : senderIsAuthor ? null : counterpart;
    let buyerId = buyer;
    let providerId = provider;
    if (senderIsAuthor) {
      const { data } = await db()
        .from("service_offers")
        .select("buyer_profile_id, provider_profile_id")
        .eq("service_listing_id", listing.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      buyerId = buyerId ?? data?.buyer_profile_id ?? null;
      providerId = providerId ?? data?.provider_profile_id ?? null;
    }
    const { data, error } = await db()
      .from("service_offers")
      .insert({
        id: offer.id,
        service_listing_id: listing.id,
        buyer_profile_id: buyerId,
        provider_profile_id: providerId,
        kind: offer.kind,
        offered_amount: offer.amount,
        currency_code: offer.currencyCode,
        message: offer.message,
        status: OFFER_STATUS_TO_DB[offer.status],
        is_demo: false,
        // Only sent when filled, so proposals keep working before/without the columns.
        ...(offer.availability?.trim() ? { availability: offer.availability.trim() } : {}),
        ...(offer.experience?.trim() ? { experience: offer.experience.trim() } : {}),
      })
      .select("created_at, sender_profile_id")
      .single();
    if (error) {
      throw new Error(
        [error.message, error.code && `código ${error.code}`, error.details, error.hint]
          .filter(Boolean)
          .join(" · "),
      );
    }
    return {
      ...offer,
      fromProfileId: data?.sender_profile_id ?? offer.fromProfileId,
      createdAt: data?.created_at ?? offer.createdAt,
      buyerProfileId: buyerId,
      providerProfileId: providerId,
    };
  },
  async updateOfferStatus(offer, status) {
    const { error } = await db()
      .from("service_offers")
      .update({ status: OFFER_STATUS_TO_DB[status] })
      .eq("id", offer.id);
    if (error) throw new Error(error.message);
  },
};

/** Notifies only the other party; Foundation resolves the target. */
export async function notifyParticipant(offerId: string, type: string, title: string, body: string) {
  const { error } = await db().rpc("notify_service_participant", {
    _service_offer_id: offerId,
    _type: type,
    _title: title,
    _body: body,
  });
  if (error) throw new Error(error.message);
}

type ContractRow = {
  id: string;
  service_listing_id: string;
  accepted_offer_id: string;
  buyer_profile_id: string;
  provider_profile_id: string;
  agreed_amount: number | string;
  currency_code: string;
  status: string;
  created_at: string;
  updated_at: string;
};

const contractFromRow = (r: ContractRow): ServiceContract => ({
  id: r.id,
  listingId: r.service_listing_id,
  acceptedOfferId: r.accepted_offer_id,
  buyerProfileId: r.buyer_profile_id,
  providerProfileId: r.provider_profile_id,
  amount: Number(r.agreed_amount),
  currencyCode: r.currency_code,
  status: r.status as ContractStatus,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function loadContracts(): Promise<ServiceContract[]> {
  const { data, error } = await db().from("service_contracts").select("*");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ContractRow[]).map(contractFromRow);
}

/** Idempotent: one contract per accepted_offer_id. */
export async function ensureContract(offer: ServiceOffer): Promise<ServiceContract> {
  const find = async () => {
    const { data, error } = await db()
      .from("service_contracts")
      .select("*")
      .eq("accepted_offer_id", offer.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? contractFromRow(data as ContractRow) : null;
  };
  const existing = await find();
  if (existing) return existing;
  if (!offer.buyerProfileId || !offer.providerProfileId) {
    throw new Error("La propuesta no tiene comprador y proveedor registrados.");
  }
  const { data, error } = await db()
    .from("service_contracts")
    .insert({
      service_listing_id: offer.listingId,
      accepted_offer_id: offer.id,
      buyer_profile_id: offer.buyerProfileId,
      provider_profile_id: offer.providerProfileId,
      agreed_amount: offer.amount,
      currency_code: offer.currencyCode,
      status: "agreed",
    })
    .select("*")
    .single();
  if (error) {
    const again = await find();
    if (again) return again;
    throw new Error(error.message);
  }
  return contractFromRow(data as ContractRow);
}

/** Keeps Foundation's message, code and hint visible to the user. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function foundationError(error: any): Error {
  const parts = [error?.message, error?.code && `código ${error.code}`, error?.hint && `pista: ${error.hint}`];
  return new Error(parts.filter(Boolean).join(" · ") || "Error desconocido de Foundation");
}

const missingFunction = (e: { code?: string } | null) => e?.code === "PGRST202";

/**
 * Status changes go only through Foundation's transition_service_contract
 * RPC, which checks participation and allowed transitions server-side.
 * There is no direct-write fallback: if the RPC fails, the operation fails.
 */
export async function updateContractStatus(id: string, status: ContractStatus, reason?: string) {
  const rpc = await db().rpc("transition_service_contract", {
    _contract_id: id,
    _status: status,
    _reason: reason ?? null,
  });
  if (rpc.error) throw foundationError(rpc.error);
  return contractFromRow(rpc.data as ContractRow);
}

type ReviewRow = {
  id: string;
  service_contract_id: string;
  reviewer_profile_id: string;
  reviewed_profile_id: string;
  reviewer_role: "buyer" | "provider";
  reviewer_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};

const reviewFromRow = (r: ReviewRow): ServiceReview => ({
  id: r.id,
  contractId: r.service_contract_id,
  reviewerProfileId: r.reviewer_profile_id,
  reviewedProfileId: r.reviewed_profile_id,
  reviewerRole: r.reviewer_role,
  reviewerName: r.reviewer_name?.trim() || "Usuario AnyOne",
  rating: r.rating,
  comment: r.comment ?? "",
  createdAt: r.created_at,
});

/** Returns [] while Foundation doesn't have service_reviews yet (feature stays hidden). */
export async function loadServiceReviews(): Promise<ServiceReview[]> {
  const { data, error } = await db()
    .from("service_reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw foundationError(error);
  }
  return ((data ?? []) as ReviewRow[]).map(reviewFromRow);
}

export async function loadServiceReputation(profileIds: string[]): Promise<Record<string, Reputation>> {
  if (profileIds.length === 0) return {};
  const { data, error } = await db().rpc("get_service_reputation", { _profile_ids: profileIds });
  if (error) {
    if (missingFunction(error)) return {};
    throw foundationError(error);
  }
  const out: Record<string, Reputation> = {};
  for (const r of (data ?? []) as Array<{ profile_id: string; average: number | string; review_count: number }>) {
    out[r.profile_id] = { average: Number(r.average), count: r.review_count };
  }
  return out;
}

/** Author, target and eligibility are all decided by Foundation. */
export async function submitServiceReview(contractId: string, rating: number, comment: string) {
  const { data, error } = await db().rpc("submit_service_review", {
    _contract_id: contractId,
    _rating: rating,
    _comment: comment.trim() || null,
  });
  if (error) throw foundationError(error);
  return reviewFromRow(data as ReviewRow);
}

type MessageRow = {
  id: string;
  service_listing_id: string;
  sender_profile_id: string | null;
  receiver_profile_id: string | null;
  body: string;
  created_at: string;
};

const messageFromRow = (r: MessageRow): ServiceMessage => ({
  id: r.id,
  listingId: r.service_listing_id,
  senderProfileId: r.sender_profile_id,
  receiverProfileId: r.receiver_profile_id,
  body: r.body,
  createdAt: r.created_at,
});

export async function loadMessages(listingId: string): Promise<ServiceMessage[]> {
  const { data, error } = await db()
    .from("service_messages")
    .select("*")
    .eq("service_listing_id", listingId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MessageRow[]).map(messageFromRow);
}

/** Sender is stamped by Foundation; the browser only names the receiver. */
export async function sendMessage(listingId: string, receiverProfileId: string, body: string) {
  const { data, error } = await db()
    .from("service_messages")
    .insert({ service_listing_id: listingId, receiver_profile_id: receiverProfileId, body })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return messageFromRow(data as MessageRow);
}

export const opportunitiesAdapter: OpportunitiesAdapter = foundationAdapter;

const demo = (
  partial: Pick<
    ServiceListing,
    | "id"
    | "intent"
    | "authorName"
    | "title"
    | "categoryCode"
    | "description"
    | "price"
    | "priceType"
    | "modality"
    | "city"
    | "zone"
    | "availabilityType"
    | "availabilityNote"
  >,
): ServiceListing => ({
  authorProfileId: null,
  authorPhotoUrl: null,
  currencyCode: "COP",
  duration: "",
  countryCode: "CO",
  radiusKm: partial.modality === "remote" ? null : 8,
  languages: ["es"],
  photos: [],
  portfolio: [],
  status: "ACTIVE",
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
  isDemo: true,
  ...partial,
});

export const DEMO_LISTINGS: ServiceListing[] = [
  demo({
    id: "demo-op-1",
    intent: "OFFER",
    authorName: "Ejemplo · Fotógrafo",
    title: "Fotógrafo disponible este fin de semana",
    categoryCode: "photography",
    description: "Sesiones de retrato, eventos pequeños y producto.",
    price: 250000,
    priceType: "day",
    modality: "in_person",
    city: "Bogotá",
    zone: "Chapinero",
    availabilityType: "specific_days",
    availabilityNote: "Sábado y domingo",
  }),
  demo({
    id: "demo-op-2",
    intent: "OFFER",
    authorName: "Ejemplo · Diseñadora",
    title: "Diseñadora gráfica ofrece sus servicios",
    categoryCode: "designer",
    description: "Logos, identidad visual y piezas para redes.",
    price: 400000,
    priceType: "project",
    modality: "remote",
    city: "Medellín",
    zone: "",
    availabilityType: "all_week",
    availabilityNote: "",
  }),
  demo({
    id: "demo-op-3",
    intent: "SEEK",
    authorName: "Ejemplo · Contratante",
    title: "Busco profesor de inglés",
    categoryCode: "languages",
    description: "Clases de conversación dos veces por semana.",
    price: 50000,
    priceType: "hour",
    modality: "hybrid",
    city: "Bogotá",
    zone: "Usaquén",
    availabilityType: "recurring",
    availabilityNote: "Martes y jueves en la tarde",
  }),
  demo({
    id: "demo-op-4",
    intent: "OFFER",
    authorName: "Ejemplo · Electricista",
    title: "Electricista disponible hoy",
    categoryCode: "electrician",
    description: "Instalaciones, revisión de tomas y breakers.",
    price: null,
    priceType: "negotiable",
    modality: "in_person",
    city: "Cali",
    zone: "Granada",
    availabilityType: "hours",
    availabilityNote: "8:00 – 18:00",
  }),
  demo({
    id: "demo-op-5",
    intent: "OFFER",
    authorName: "Ejemplo · Programador",
    title: "Programador freelance",
    categoryCode: "developer",
    description: "Sitios web y apps. Trabajo con clientes de cualquier país.",
    price: 35,
    priceType: "hour",
    modality: "remote",
    city: "Barranquilla",
    zone: "",
    availabilityType: "indefinite",
    availabilityNote: "",
  }),
  demo({
    id: "demo-op-6",
    intent: "OFFER",
    authorName: "Ejemplo · Limpieza",
    title: "Persona ofrece servicio de limpieza",
    categoryCode: "cleaning",
    description: "Limpieza de apartamentos y casas.",
    price: 90000,
    priceType: "service",
    modality: "in_person",
    city: "Bogotá",
    zone: "Suba",
    availabilityType: "all_week",
    availabilityNote: "",
  }),
  demo({
    id: "demo-op-7",
    intent: "OFFER",
    authorName: "Ejemplo · Cuidador",
    title: "Cuidador de mascotas disponible",
    categoryCode: "pet_care",
    description: "Paseos y cuidado en casa.",
    price: 30000,
    priceType: "hour",
    modality: "in_person",
    city: "Medellín",
    zone: "Laureles",
    availabilityType: "all_week",
    availabilityNote: "",
  }),
  demo({
    id: "demo-op-8",
    intent: "OFFER",
    authorName: "Ejemplo · Abogado",
    title: "Abogado ofrece consulta",
    categoryCode: "lawyer",
    description: "Orientación en temas laborales y civiles.",
    price: 120000,
    priceType: "service",
    modality: "hybrid",
    city: "Bogotá",
    zone: "Centro",
    availabilityType: "hours",
    availabilityNote: "Lunes a viernes",
  }),
].map((item, index) => (index === 4 ? { ...item, currencyCode: "USD" } : item));
