/**
 * AnyOne¹⁶ — Stage 4 persistence layer.
 *
 * Maps the UI data model (favor-model / marketplace-model) to the real
 * database tables. Every write goes through here, so components and the
 * store never talk to the backend directly.
 *
 * Money is always stored as amount + currency_code.
 * Demo records are flagged with is_demo so they never mix with real data.
 */

import { supabase } from "@/integrations/foundation/client";

import { emptyGeo } from "./favor-model";
import { withGeo } from "./geo";
import type {
  Favor,
  FavorCategory,
  FavorLocation,
  FavorStatus,
  SchedulePreset,
  Urgency,
} from "./favor-model";
import type {
  ChatMessage,
  WorkerOffer,
  WorkerProfile,
  WorkerReview,
  WorkerVerificationLevel,
} from "./marketplace-model";

export const DEMO_CUSTOMER_PROFILE_ID = "00000000-0000-4000-8000-000000000001";

/* -------------------------------------------------------------- status -- */

export const statusToDb = (status: FavorStatus) => status.toLowerCase();

const DB_TO_STATUS: Record<string, FavorStatus> = {
  draft: "DRAFT",
  ai_processing: "AI_PROCESSING",
  ready_for_review: "READY_FOR_REVIEW",
  ready_to_publish: "READY_TO_PUBLISH",
  published: "PUBLISHED",
  receiving_offers: "RECEIVING_OFFERS",
  offer_received: "OFFER_RECEIVED",
  worker_selected: "WORKER_SELECTED",
  on_the_way: "WORKER_ON_THE_WAY",
  arrived: "ARRIVED_AT_PICKUP",
  in_progress: "IN_PROGRESS",
  near_destination: "NEAR_DESTINATION",
  ready_for_confirmation: "READY_FOR_CONFIRMATION",
  code_entered: "CODE_ENTERED",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  disputed: "DISPUTED",
};

const STATUS_TO_DB: Record<FavorStatus, string> = {
  DRAFT: "draft",
  AI_PROCESSING: "ai_processing",
  READY_FOR_REVIEW: "ready_for_review",
  READY_TO_PUBLISH: "ready_to_publish",
  PUBLISHED: "published",
  RECEIVING_OFFERS: "receiving_offers",
  OFFER_RECEIVED: "offer_received",
  WORKER_SELECTED: "worker_selected",
  WORKER_ON_THE_WAY: "on_the_way",
  ARRIVED_AT_PICKUP: "arrived",
  IN_PROGRESS: "in_progress",
  NEAR_DESTINATION: "near_destination",
  READY_FOR_CONFIRMATION: "ready_for_confirmation",
  CODE_ENTERED: "code_entered",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  DISPUTED: "disputed",
};

const OFFER_STATUS_TO_DB = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  WITHDRAWN: "withdrawn",
} as const;

/* ---------------------------------------------------------- row shapes -- */

type LocationRow = {
  id: string;
  label: string;
  details: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  place_name?: string | null;
  instructions?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country_code?: string | null;
  postal_code?: string | null;
  precision?: string | null;
};

const toLocation = (
  row: LocationRow | null | undefined,
  kind: FavorLocation["kind"],
): FavorLocation | null =>
  row
    ? {
        id: row.id,
        kind,
        label: row.label,
        ...(row.details ? { details: row.details } : {}),
        ...(row.place_name ? { placeName: row.place_name } : {}),
        ...(row.address ? { addressLine: row.address } : {}),
        ...(row.city ? { city: row.city } : {}),
        ...(row.region ? { region: row.region } : {}),
        ...(row.country_code ? { countryCode: row.country_code } : {}),
        ...(row.postal_code ? { postalCode: row.postal_code } : {}),
        ...(row.instructions ? { instructions: row.instructions } : {}),
        latitude: row.latitude,
        longitude: row.longitude,
        source: (row.source as FavorLocation["source"]) ?? "manual",
        precision:
          row.precision === "exact" || row.latitude !== null ? "exact" : "approximate",
      }
    : null;

const verificationLevel = (row: {
  identity_verified: boolean;
  background_checked: boolean;
  phone_verified: boolean;
}): WorkerVerificationLevel => {
  if (row.identity_verified && row.background_checked) return "pro";
  if (row.identity_verified) return "verified";
  if (row.phone_verified) return "basic";
  return "none";
};

/* --------------------------------------------------------------- reads -- */

export type MarketplaceSnapshot = {
  favors: Favor[];
  offers: WorkerOffer[];
  messages: ChatMessage[];
  workers: WorkerProfile[];
  reviews: Record<string, WorkerReview[]>;
};

/**
 * Demo content is isolated behind an explicit, server-side demo context.
 * Only accounts that have no real profile yet (the guided demo experience)
 * opt into it; everyone else never sees demo records.
 */
async function ensureDemoContextIfNeeded(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profile) return;
  await supabase.rpc("enter_demo_context");
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FavorRow = any;

const rowToFavor = (row: FavorRow): Favor =>
  withGeo({
    id: row.id,
    userId: row.customer_profile_id,
    description: row.description,
    category: (row.category_slug ?? "uncategorized") as FavorCategory,
    status: DB_TO_STATUS[row.status] ?? "DRAFT",
    countryCode: row.country_code,
    languageCode: row.language_code,
    currencyCode: row.currency_code,
    pickupLocation: toLocation(row.pickup as LocationRow | null, "pickup"),
    destinationLocation: toLocation(row.destination as LocationRow | null, "destination"),
    additionalStops: (row.additional_stops as unknown as FavorLocation[]) ?? [],
    schedule: {
      preset: (row.scheduled_preset as SchedulePreset | null) ?? null,
      date: row.scheduled_date,
      time: row.scheduled_time,
      timeWindow: row.time_window,
      urgency: (row.urgency as Urgency) ?? "normal",
    },
    waitingRequired: row.waiting_required,
    waitingDuration: row.waiting_duration,
    itemCount: row.item_count,
    budget: {
      amount: row.customer_budget_amount === null ? null : Number(row.customer_budget_amount),
      currencyCode: row.customer_budget_currency,
      recommendedMin: row.recommended_min === null ? null : Number(row.recommended_min),
      recommendedMax: row.recommended_max === null ? null : Number(row.recommended_max),
    },
    specialInstructions: row.special_instructions ?? "",
    aiInterpretation: null,
    geo: emptyGeo(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

/** Open favors a worker may offer on, from Foundation's marketplace RPC. */
export async function listMarketplaceFavors(): Promise<Favor[]> {
  const { data, error } = await rpc("list_marketplace_favors", { _limit: 100, _offset: 0 });
  if (error || !Array.isArray(data)) {
    if (error) console.error("[marketplace] list_marketplace_favors", error);
    return [];
  }
  return (data as FavorRow[]).map((raw) => {
    const row: FavorRow = raw["favor"] && typeof raw["favor"] === "object" ? raw["favor"] : raw;
    return rowToFavor({
      customer_profile_id: null,
      description: "",
      country_code: "CO",
      language_code: "es",
      currency_code: "COP",
      customer_budget_currency: row["currency_code"] ?? "COP",
      urgency: "normal",
      waiting_required: false,
      waiting_duration: null,
      item_count: null,
      additional_stops: [],
      ...row,
      id: row["id"] ?? row["favor_id"],
      status: row["status"] ?? "receiving_offers",
    });
  });
}

export async function submitFavorRating(favorId: string, rating: number, comment: string) {
  const { data, error } = await rpc("submit_favor_rating", {
    _favor_id: favorId,
    _rating: rating,
    _comment: comment || null,
  });
  if (error) throw error;
  const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!result || result["ok"] !== true) {
    throw new Error(String(result?.["error"] ?? "unknown"));
  }
  return result;
}

export async function getFavorRatingStatus(favorId: string) {
  const { data, error } = await rpc("get_favor_rating_status", { _favor_id: favorId });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
}

export async function loadMarketplace(
  opts: { asWorker?: boolean } = {},
): Promise<MarketplaceSnapshot> {
  await ensureDemoContextIfNeeded().catch(() => undefined);
  const [workersRes, favorsRes, offersRes, messagesRes, reviewsRes] = await Promise.all([
    // Internal Trust & Safety columns (risk score, restriction, exact coords)
    // are not readable by the app: only the public profile is selected.
    supabase
      .from("worker_profiles")
      .select(
        "id, profile_id, display_name, headline, bio, avatar_url, rating, rating_count, completed_favors, completion_rate, cancellation_rate, verification_status, identity_verified, phone_verified, background_checked, residence_verified, vehicle_verified, trust_level, languages, service_zone, availability_status, available_categories, specialties, is_demo, joined_at, created_at, updated_at, city, region, country_code, service_radius_km",
      )
      .order("rating", { ascending: false }),
    supabase
      .from("favors")
      .select("*, pickup:pickup_location_id(*), destination:destination_location_id(*)")
      .order("created_at", { ascending: false }),
    supabase.from("offers").select("*").order("created_at", { ascending: true }),
    supabase.from("messages").select("*").order("created_at", { ascending: true }),
    supabase.from("reviews").select("*").order("created_at", { ascending: false }),
  ]);

  const workers: WorkerProfile[] = (workersRes.data ?? []).map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    name: row.display_name,
    photoUrl: row.avatar_url,
    headline: row.headline ?? "",
    bio: row.bio ?? "",
    rating: {
      average: Number(row.rating),
      count: row.rating_count,
      completedFavors: row.completed_favors,
      completionRate: Number(row.completion_rate),
      cancellationRate: Number(row.cancellation_rate),
    },
    languages: row.languages ?? [],
    categories: (row.available_categories ?? []) as FavorCategory[],
    operationZone: row.service_zone ?? "",
    available: row.availability_status === "available",
    verification: {
      level: verificationLevel(row),
      identityVerified: row.identity_verified,
      phoneVerified: row.phone_verified,
      backgroundChecked: row.background_checked,
      verifiedAt: row.verification_status === "verified" ? row.updated_at : null,
    },
    joinedAt: row.joined_at,
    countryCode: "CO",
    currencyCode: "COP",
    isDemo: row.is_demo,
  }));

  const workerByProfileId = new Map(workers.map((worker) => [worker.profileId, worker.id]));

  const favors: Favor[] = (favorsRes.data ?? []).map((row) => rowToFavor(row as FavorRow));

  // Workers cannot read open favors of other customers through the favors
  // table (RLS). Discovery goes through Foundation's list_marketplace_favors,
  // which enforces auth, worker role, status and the worker's filters.
  if (opts.asWorker) {
    const known = new Set(favors.map((favor) => favor.id));
    for (const favor of await listMarketplaceFavors()) {
      if (!known.has(favor.id)) favors.push(favor);
    }
  }

  const offers: WorkerOffer[] = (offersRes.data ?? []).map((row) => ({
    id: row.id,
    favorId: row.favor_id,
    workerId: row.worker_profile_id,
    kind: row.kind === "accept" ? "accept" : "counter",
    amount: Number(row.offered_amount),
    currencyCode: row.currency_code,
    message: row.message ?? "",
    distanceKm: Number(row.distance_km ?? 0),
    etaMinutes: row.estimated_arrival_minutes ?? 0,
    status: row.status.toUpperCase() as WorkerOffer["status"],
    createdAt: row.created_at,
  }));

  const messages: ChatMessage[] = (messagesRes.data ?? []).map((row) => ({
    id: row.id,
    favorId: row.favor_id,
    author: row.author_role as ChatMessage["author"],
    kind: row.message_type as ChatMessage["kind"],
    body: row.body,
    createdAt: row.created_at,
  }));

  const reviews: Record<string, WorkerReview[]> = {};
  for (const row of reviewsRes.data ?? []) {
    // Only real reviews received by the worker (reviewed_profile_id = profiles.id).
    if (row.is_demo || row.reviewer_role !== "customer") continue;
    const workerId = row.reviewed_profile_id
      ? workerByProfileId.get(row.reviewed_profile_id)
      : undefined;
    if (!workerId) continue;
    (reviews[workerId] ??= []).push({
      id: row.id,
      author: row.author_name ?? "Anónimo",
      rating: row.rating,
      body: row.review ?? "",
      createdAt: row.created_at,
    });
  }

  return { favors, offers, messages, workers, reviews };
}

/* -------------------------------------------------------------- writes -- */

async function upsertLocation(
  location: FavorLocation | null,
  isDemo: boolean,
  userId: string | null = null,
) {
  if (!location) return null;
  const { data, error } = await supabase
    .from("locations")
    .upsert({
      id: location.id,
      label: location.label,
      details: location.details ?? null,
      place_name: location.placeName ?? null,
      address: location.addressLine ?? null,
      city: location.city ?? null,
      region: location.region ?? null,
      country_code: location.countryCode ?? null,
      postal_code: location.postalCode ?? null,
      instructions: location.instructions ?? null,
      kind: location.kind,
      precision: location.latitude !== null ? "exact" : (location.precision ?? "approximate"),
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      source: location.source ?? "manual",
      created_by_user_id: userId,
      is_demo: isDemo,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export type FavorOwner = { profileId: string; userId: string } | null;

/** Keeps favor_locations in sync: pickup → stops (ordered) → destination. */
async function syncFavorLocations(
  favor: Favor,
  ids: { pickupId: string | null; stopIds: (string | null)[]; destinationId: string | null },
  isDemo: boolean,
) {
  const rows: Record<string, unknown>[] = [];
  if (ids.pickupId)
    rows.push({
      favor_id: favor.id,
      location_id: ids.pickupId,
      kind: "pickup",
      position: 0,
      instructions: favor.pickupLocation?.instructions ?? null,
      is_demo: isDemo,
    });
  ids.stopIds.forEach((stopId, index) => {
    if (!stopId) return;
    rows.push({
      favor_id: favor.id,
      location_id: stopId,
      kind: "stop",
      position: index + 1,
      instructions: favor.additionalStops[index]?.instructions ?? null,
      is_demo: isDemo,
    });
  });
  if (ids.destinationId)
    rows.push({
      favor_id: favor.id,
      location_id: ids.destinationId,
      kind: "destination",
      position: ids.stopIds.length + 1,
      instructions: favor.destinationLocation?.instructions ?? null,
      is_demo: isDemo,
    });

  await supabase.from("favor_locations").delete().eq("favor_id", favor.id);
  if (rows.length > 0) await supabase.from("favor_locations").insert(rows as never);
}

/**
 * favors.customer_profile_id has a foreign key to public.profiles(id)
 * (favors_customer_profile_id_fkey), so it receives the account's profiles.id.
 */
export async function persistFavor(favor: Favor, isDemo: boolean, owner: FavorOwner = null) {
  const userId = owner?.userId ?? null;
  const customerProfileId = owner ? owner.profileId : DEMO_CUSTOMER_PROFILE_ID;
  const [pickupId, destinationId, ...stopIds] = await Promise.all([
    upsertLocation(favor.pickupLocation, isDemo, userId),
    upsertLocation(favor.destinationLocation, isDemo, userId),
    ...favor.additionalStops.map((stop) => upsertLocation(stop, isDemo, userId)),
  ]);

  const { error } = await supabase.from("favors").upsert({
    id: favor.id,
    customer_profile_id: customerProfileId,
    owner_user_id: owner?.userId ?? null,
    category_slug: favor.category === "uncategorized" ? null : favor.category,

    description: favor.description,
    status: STATUS_TO_DB[favor.status] as never,
    country_code: favor.countryCode,
    language_code: favor.languageCode,
    currency_code: favor.currencyCode,
    pickup_location_id: pickupId,
    destination_location_id: destinationId,
    additional_stops: favor.additionalStops as never,
    scheduled_preset: favor.schedule.preset,
    scheduled_date: favor.schedule.date,
    scheduled_time: favor.schedule.time,
    time_window: favor.schedule.timeWindow,
    urgency: favor.schedule.urgency,
    waiting_required: favor.waitingRequired,
    waiting_duration: favor.waitingDuration,
    item_count: favor.itemCount,
    customer_budget_amount: favor.budget.amount,
    customer_budget_currency: favor.budget.currencyCode,
    recommended_min: favor.budget.recommendedMin,
    recommended_max: favor.budget.recommendedMax,
    special_instructions: favor.specialInstructions,
    city: favor.geo.city,
    region: favor.geo.region,
    zone_label: favor.geo.zoneLabel,
    stop_count: favor.additionalStops.length,
    route_distance_km: favor.geo.routeDistanceKm,
    estimated_travel_minutes: favor.geo.travelMinutes,
    estimated_wait_minutes: favor.geo.waitMinutes,
    estimated_total_minutes: favor.geo.totalMinutes,
    origin_latitude: favor.pickupLocation?.latitude ?? null,
    origin_longitude: favor.pickupLocation?.longitude ?? null,
    is_demo: isDemo,
    published_at: favor.status === "PUBLISHED" ? new Date().toISOString() : null,
  } as never);
  if (error) throw error;

  await syncFavorLocations(favor, { pickupId, stopIds, destinationId }, isDemo);
}

export async function persistFavorStatus(favorId: string, status: FavorStatus) {
  const patch: Record<string, unknown> = { status: STATUS_TO_DB[status] };
  if (status === "CANCELLED") patch['cancelled_at'] = new Date().toISOString();
  if (status === "COMPLETED") patch['completed_at'] = new Date().toISOString();
  const { error } = await supabase.from("favors").update(patch as never).eq("id", favorId);
  if (error) throw error;
}

export async function persistOffer(
  offer: WorkerOffer,
  isDemo: boolean,
  workerUserId: string | null = null,
) {
  const { error } = await supabase.from("offers").upsert({
    id: offer.id,
    favor_id: offer.favorId,
    worker_profile_id: offer.workerId,
    worker_user_id: workerUserId,
    kind: offer.kind,

    offered_amount: offer.amount,
    currency_code: offer.currencyCode,
    message: offer.message,
    distance_km: offer.distanceKm,
    estimated_arrival_minutes: offer.etaMinutes,
    status: OFFER_STATUS_TO_DB[offer.status] as never,
    is_demo: isDemo,
  });
  if (error) throw error;
}

export async function persistOfferStatus(offerId: string, status: WorkerOffer["status"]) {
  const { error } = await supabase
    .from("offers")
    .update({ status: OFFER_STATUS_TO_DB[status] as never })
    .eq("id", offerId);
  if (error) throw error;
}

/** Accepting an offer keeps the full history: other offers are rejected, never deleted. */
export async function persistOfferAcceptance(input: {
  favorId: string;
  offerId: string;
  workerProfileId: string;
  amount: number;
  currencyCode: string;
}) {
  // Order matters: the favor guard requires the selected offer to be accepted
  // and to belong to this favor. RLS only lets the favor owner do this.
  const accepted = await supabase
    .from("offers")
    .update({ status: "accepted" as never })
    .eq("id", input.offerId)
    .eq("favor_id", input.favorId)
    .eq("status", "pending" as never)
    .select("id");
  if (accepted.error) throw accepted.error;
  if (!accepted.data || accepted.data.length !== 1) throw new Error("offer_not_eligible");
  const rejected = await supabase
    .from("offers")
    .update({ status: "rejected" as never })
    .eq("favor_id", input.favorId)
    .eq("status", "pending" as never);
  if (rejected.error) throw rejected.error;
  const { error } = await supabase
    .from("favors")
    .update({
      status: "worker_selected" as never,
      selected_worker_profile_id: input.workerProfileId,
      selected_offer_id: input.offerId,
      customer_budget_amount: input.amount,
      customer_budget_currency: input.currencyCode,
    } as never)
    .eq("id", input.favorId);
  if (error) throw error;
}

export async function persistMessage(
  message: ChatMessage,
  isDemo: boolean,
  receiverProfileId: string | null = null,
) {
  const { error } = await supabase.from("messages").insert({
    id: message.id,
    receiver_profile_id: receiverProfileId,
    favor_id: message.favorId,
    author_role: message.author,
    message_type: message.kind as never,
    body: message.body,
    is_demo: isDemo,
  });
  if (error) throw error;
}

export async function persistAvailability(
  workerProfileId: string,
  patch: {
    available?: boolean | undefined;
    zone?: string | undefined;
    categories?: string[] | undefined;
  },
) {
  const update: Record<string, unknown> = {};
  if (patch.available !== undefined)
    update['availability_status'] = patch.available ? "available" : "unavailable";
  if (patch.zone !== undefined) update['service_zone'] = patch.zone;
  if (patch.categories !== undefined) update['available_categories'] = patch.categories;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase
    .from("worker_profiles")
    .update(update as never)
    .eq("id", workerProfileId);
  if (error) throw error;
}

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  }).rpc(fn, args);

/**
 * Audit events are never written by the browser. `log_app_event` stamps the
 * actor from the authenticated session and rejects administrative actions.
 */
export async function logAudit(
  action: string,
  entityType: string,
  entityId: string,
  _actor: { profileId: string; isDemo: boolean } | null = null,
) {
  await rpc("log_app_event", {
    _action: action,
    _entity_type: entityType,
    _entity_id: entityId,
    _metadata: {},
  });
}

/**
 * Notifications can only be delivered to a participant of the same favor, and
 * the backend validates both sender and recipient.
 */
export async function createNotification(input: {
  profileId?: string | null;
  type: string;
  title: string;
  body?: string;
  favorId?: string;
  offerId?: string;
  isDemo?: boolean;
}) {
  if (!input.favorId || !input.profileId) return;
  await rpc("notify_favor_participant", {
    _favor_id: input.favorId,
    _profile_id: input.profileId,
    _type: input.type,
    _title: input.title,
    _body: input.body ?? null,
    _offer_id: input.offerId ?? null,
  });
}



