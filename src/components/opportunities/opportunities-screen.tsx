/**
 * AnyOne¹⁶ — 💼 Oportunidades.
 * Same account offers and hires. Trust info (rating, jobs, verification,
 * reviews) is read from the existing Foundation worker profile of the author.
 */

import { subscribeLive } from "@/lib/realtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { languages as languageOptions } from "@/lib/market-config";
import { useMarketplace } from "@/lib/marketplace-store";
import type { WorkerProfile } from "@/lib/marketplace-model";
import {
  AVAILABILITY_LABELS,
  CATEGORY_GROUPS,
  MODALITY_LABELS,
  categoryByCode,
  emptyListing,
  formatListingPrice,
  formatMoney,
  type AvailabilityType,
  type ListingIntent,
  type Modality,
  type ContractStatus,
  type ServiceContract,
  type ServiceListing,
  type ServiceMessage,
  type ServiceOffer,
} from "@/lib/opportunities-model";
import { loadMessages, sendMessage } from "@/lib/opportunities-repo";
import {
  contractForListing,
  myReviewFor,
  rateContract,
  cardReviewFor,
  setContractStatus,
  feedListings,
  offersForListing,
  sendServiceOffer,
  setListingStatus,
  updateOfferStatus,
  useOpportunities,
  type OpportunitiesState,
} from "@/lib/opportunities-store";
import { MediaList } from "./listing-media";
import {
  clearOpportunityFocus,
  useOpportunityFocus,
  type FocusSection,
} from "@/lib/opportunities-focus";
import { ListingCard } from "./listing-card";
import { sceneVariant, serviceArt, tiltHandlers } from "@/lib/scene-art";
import { ServiceEditor } from "./service-editor";
import { OppHero, OppSkills, type Discover } from "./opp-landing";
import { MarketColumns } from "./opp-market";
import { PaymentOrderPanel } from "@/components/payments/payment-order-checkout";

type View = "home" | "services" | "jobs" | "my-services" | "my-requests" | "contracts";

const NAV: [View, string][] = [
  ["home", "Inicio"],
  ["services", "Servicios"],
  ["jobs", "Ofertas de trabajo"],
  ["my-services", "Mis servicios"],
  ["my-requests", "Mis solicitudes"],
  ["contracts", "Contrataciones"],
];

export function OpportunitiesScreen({
  countryCode,
  languageCode,
  currencyCode,
}: {
  countryCode: string;
  languageCode: string;
  currencyCode: string;
}) {
  const { profile, worker } = useAuth();
  const marketplace = useMarketplace();
  const opportunities = useOpportunities();
  const [view, setView] = useState<View>("home");
  const [editing, setEditing] = useState<ServiceListing | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [preset, setPreset] = useState<Discover & { nonce: number }>({ nonce: 0 });
  const focus = useOpportunityFocus();
  const [focusSection, setFocusSection] = useState<FocusSection | null>(null);
  const [focusMissing, setFocusMissing] = useState(false);

  // Notification deep link: resolve its IDs against RLS-filtered data only.
  useEffect(() => {
    if (!focus) return;
    const viaOffer = focus.offerId
      ? opportunities.offers.find((o) => o.id === focus.offerId)?.listingId
      : undefined;
    const listingId = focus.listingId ?? viaOffer ?? null;
    const found = listingId ? opportunities.listings.find((l) => l.id === listingId) : undefined;
    if (found) {
      setEditing(null);
      setFocusMissing(false);
      setFocusSection(focus.section);
      setOpenId(found.id);
      clearOpportunityFocus();
    } else if (!opportunities.loading) {
      setFocusMissing(true);
      clearOpportunityFocus();
    }
  }, [focus, opportunities.listings, opportunities.offers, opportunities.loading]);

  const providerFor = (listing: ServiceListing): WorkerProfile | null =>
    (listing.authorProfileId &&
      marketplace.workers.find((w) => !w.isDemo && w.profileId === listing.authorProfileId)) ||
    null;

  const myProfileId = profile?.id ?? null;
  const mine = opportunities.listings.filter((l) => l.authorProfileId === myProfileId);
  const open = openId
    ? ([...opportunities.listings, ...feedListings(opportunities)].find((l) => l.id === openId) ??
      null)
    : null;

  const startNew = (intent: ListingIntent) =>
    setEditing(
      emptyListing({
        intent,
        authorProfileId: myProfileId,
        authorName: worker?.displayName || profile?.fullName || "Usuario AnyOne",
        countryCode: profile?.countryCode ?? countryCode,
        currencyCode: profile?.currencyCode ?? currencyCode,
        languageCode: profile?.languageCode ?? languageCode,
      }),
    );

  if (editing) {
    return (
      <ServiceEditor
        initial={editing}
        onClose={(saved) => {
          setEditing(null);
          if (saved) setView(saved.intent === "OFFER" ? "my-services" : "my-requests");
        }}
      />
    );
  }

  const discover = (d: Discover) => {
    setView("services");
    setPreset({ ...d, nonce: Date.now() });
    requestAnimationFrame(() =>
      document.getElementById("opx-feed")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const go = (next: View) => {
    setView(next);
    setPreset({ nonce: Date.now() });
    requestAnimationFrame(() =>
      document.getElementById("opx-feed")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const feed = feedListings(opportunities);
  const signedIn = Boolean(myProfileId);

  return (
    <section className="mx-auto w-full max-w-6xl overflow-x-clip px-5 pb-10 pt-6 sm:px-8">
      <OppHero signedIn={signedIn} onOffer={() => startNew("OFFER")} onHire={() => startNew("SEEK")} />

      <nav id="opx-feed" className="opx-nav mt-6 scroll-mt-24" aria-label="Oportunidades">
        {NAV.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={view === key ? "page" : undefined}
            onClick={() => go(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {focusMissing && (
        <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-xs text-muted-foreground">
          Esta notificación hace referencia a un elemento que ya no está disponible para tu cuenta.
        </p>
      )}
      {opportunities.error && (
        <p className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-xs text-destructive">
          {opportunities.error}
        </p>
      )}

      {view === "home" && (
        <>
          <MarketColumns
            listings={feed}
            signedIn={signedIn}
            providerFor={providerFor}
            onOpen={setOpenId}
            onNew={startNew}
            onSeeAll={(intent) => go(intent === "OFFER" ? "services" : "jobs")}
          />
          <OppSkills onDiscover={discover} />
        </>
      )}

      {(view === "services" || view === "jobs") && (
        <div className={view === "services" ? "opx-red" : "opx-blue"}>
          <h2 className="mt-8 font-display text-2xl font-extrabold uppercase text-foreground sm:text-3xl">
            {view === "services" ? "Servicios que se ofrecen" : "Ofertas de trabajo"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === "services"
              ? "Personas que ofrecen sus habilidades, servicios y talentos."
              : "Personas que buscan a alguien para realizar un servicio."}
          </p>
          <HireSide
            key={`${view}-${preset.nonce}`}
            intent={view === "services" ? "OFFER" : "SEEK"}
            initialGroup={preset.group}
            initialQuery={preset.query}
            listings={feed}
            providerFor={providerFor}
            onOpen={setOpenId}
            onNew={startNew}
          />
        </div>
      )}

      {(view === "my-services" || view === "my-requests") && (
        <div className={view === "my-services" ? "opx-red" : "opx-blue"}>
          <OfferSide
            intent={view === "my-services" ? "OFFER" : "SEEK"}
            mine={mine.filter((l) => l.intent === (view === "my-services" ? "OFFER" : "SEEK"))}
            state={opportunities}
            signedIn={signedIn}
            onNew={startNew}
            onEdit={setEditing}
            onOpen={setOpenId}
          />
        </div>
      )}

      {view === "contracts" &&
        (myProfileId && opportunities.contracts.length > 0 ? (
          <MyContracts state={opportunities} myProfileId={myProfileId} onOpen={setOpenId} />
        ) : (
          <p className="mt-8 rounded-[24px] bg-card p-8 text-center text-sm text-muted-foreground shadow-panel">
            {signedIn ? "Aún no tienes contrataciones." : "Inicia sesión para ver tus contrataciones."}
          </p>
        ))}

      {open && (
        <ListingDetail
          listing={open}
          provider={providerFor(open)}
          state={opportunities}
          myProfileId={myProfileId}
          myName={worker?.displayName || profile?.fullName || "Usuario AnyOne"}
          focusSection={focusSection}
          onClose={() => {
            setOpenId(null);
            setFocusSection(null);
          }}
        />
      )}
    </section>
  );
}

function OfferSide({
  intent,
  mine,
  state,
  signedIn,
  onNew,
  onEdit,
  onOpen,
}: {
  intent: ListingIntent;
  mine: ServiceListing[];
  state: OpportunitiesState;
  signedIn: boolean;
  onNew: (intent: ListingIntent) => void;
  onEdit: (l: ServiceListing) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="touch" disabled={!signedIn} onClick={() => onNew(intent)}>
          {intent === "OFFER" ? (
            <>
              <Plus /> Ofrecer mi servicio
            </>
          ) : (
            <>
              <Search /> Publicar lo que necesito
            </>
          )}
        </Button>
      </div>
      {!signedIn && (
        <p className="mt-3 text-sm text-muted-foreground">Inicia sesión para publicar.</p>
      )}
      <h2 className="mt-8 font-display text-xl font-bold text-foreground">
        {intent === "OFFER" ? "Mis servicios" : "Mis solicitudes"}
      </h2>
      {mine.length === 0 ? (
        <div className="mt-4 rounded-[24px] bg-card p-8 text-center shadow-panel">
          <Briefcase className="mx-auto size-8 text-primary" />
          <p className="mt-3 font-semibold text-foreground">Aún no has publicado nada</p>
          <p className="text-sm text-muted-foreground">
            {intent === "OFFER" ? "Cuéntale al mundo qué sabes hacer." : "Publica lo que necesitas y cuánto quieres pagar."}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((listing) => {
            const pending = offersForListing(state, listing.id).filter(
              (o) => o.status === "PENDING" && o.fromProfileId !== listing.authorProfileId,
            ).length;
            return (
              <div key={listing.id} className="space-y-2">
                <ListingCard
                  listing={listing}
                  contractReview={cardReviewFor(state, listing)}
                  onOpen={() => onOpen(listing.id)}
                />
                <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
                  <span className="rounded-full bg-surface px-2.5 py-1 font-bold text-muted-foreground">
                    {listing.status === "ACTIVE"
                      ? "Publicada"
                      : listing.status === "DRAFT"
                        ? "Borrador"
                        : "Pausada"}
                  </span>
                  {pending > 0 && (
                    <span className="rounded-full bg-primary px-2.5 py-1 font-bold text-primary-foreground">
                      {pending} propuesta{pending > 1 ? "s" : ""}
                    </span>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onEdit(listing)}>
                    <Pencil /> Editar
                  </Button>
                  {listing.status !== "DRAFT" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void setListingStatus(
                          listing,
                          listing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                        )
                      }
                    >
                      {listing.status === "ACTIVE" ? (
                        <>
                          <Pause /> Pausar
                        </>
                      ) : (
                        <>
                          <Play /> Activar
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HireSide({
  intent: fixedIntent,
  listings,
  providerFor,
  onOpen,
  onNew,
  initialGroup,
  initialQuery,
}: {
  initialGroup?: string | undefined;
  initialQuery?: string | undefined;
  listings: ServiceListing[];
  providerFor: (l: ServiceListing) => WorkerProfile | null;
  onOpen: (id: string) => void;
  onNew: (intent: ListingIntent) => void;
  intent: ListingIntent;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [group, setGroup] = useState<string>(initialGroup ?? "all");
    const [modality, setModality] = useState<"all" | Modality>("all");
  const [availability, setAvailability] = useState<"all" | AvailabilityType>("all");
  const [city, setCity] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const max = Number(maxPrice.replace(/\D/g, "")) || null;
    return listings.filter((l) => {
      const cat = categoryByCode(l.categoryCode);
      if (group !== "all" && cat.group !== group) return false;
      if (l.intent !== fixedIntent) return false;
      if (modality !== "all" && l.modality !== modality) return false;
      if (availability !== "all" && l.availabilityType !== availability) return false;
      if (
        city.trim() &&
        ![l.city, l.zone, l.countryCode].join(" ").toLowerCase().includes(city.trim().toLowerCase())
      )
        return false;
      if (max && l.price !== null && l.price > max) return false;
      if (
        q &&
        ![l.title, l.description, cat.name, l.authorName, l.city]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [listings, query, group, fixedIntent, modality, availability, city, maxPrice]);

  const chip = (active: boolean) =>
    `opx-chip ${active ? "opx-chip-on" : ""}`;

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        <div className="opx-search relative flex-1">
          <Search className="field-icon" />
          <Input
            className="h-14 bg-card pl-12 text-base shadow-panel"
            placeholder={fixedIntent === "OFFER" ? "Busca un servicio o profesional…" : "Busca una oferta de trabajo…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button
          variant={showFilters ? "default" : "soft"}
          size="iconLg"
          aria-label="Filtros"
          className="size-14"
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal />
        </Button>
      </div>
      <div className="examples-scroller mt-4 flex gap-2">
        <button type="button" className={chip(group === "all")} onClick={() => setGroup("all")}>
          Todas
        </button>
        {CATEGORY_GROUPS.map((g) => (
          <button key={g} type="button" className={chip(group === g)} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
      </div>
      {showFilters && (
        <div className="mt-4 grid gap-3 rounded-[24px] bg-card p-4 shadow-panel sm:grid-cols-3 lg:grid-cols-5">
          <FilterSelect
            value={modality}
            onChange={setModality}
            options={{ all: "Toda modalidad", ...MODALITY_LABELS }}
          />
          <FilterSelect
            value={availability}
            onChange={setAvailability}
            options={{ all: "Cualquier disponibilidad", ...AVAILABILITY_LABELS }}
          />
          <Input
            className="h-12 rounded-2xl bg-surface"
            placeholder="Ciudad"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <Input
            className="h-12 rounded-2xl bg-surface"
            inputMode="numeric"
            placeholder={fixedIntent === "OFFER" ? "Precio máximo" : "Presupuesto máximo"}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>
      )}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} {fixedIntent === "OFFER" ? "servicios" : "ofertas de trabajo"}
        </p>
        <Button
          variant="link"
          className="h-auto whitespace-normal text-right"
          onClick={() => onNew(fixedIntent === "OFFER" ? "SEEK" : "OFFER")}
        >
          {fixedIntent === "OFFER" ? "¿No encuentras? Publica lo que necesitas" : "¿Sabes hacerlo? Ofrece tu servicio"}
        </Button>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((l) => (
          <ListingCard
            key={l.id}
            listing={l}
            provider={providerFor(l)}
            onOpen={() => onOpen(l.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FilterSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Record<string, string>;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className="h-12 rounded-2xl bg-surface">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-2xl">
        {Object.entries(options).map(([k, v]) => (
          <SelectItem key={k} value={k}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ListingDetail({
  listing,
  provider,
  state,
  myProfileId,
  myName,
  focusSection,
  onClose,
}: {
  listing: ServiceListing;
  provider: WorkerProfile | null;
  state: OpportunitiesState;
  myProfileId: string | null;
  myName: string;
  focusSection?: FocusSection | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!focusSection || focusSection === "listing") return;
    const t = setTimeout(() => {
      document
        .getElementById(`opd-${focusSection}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
    return () => clearTimeout(t);
  }, [focusSection, listing.id]);
  const isAuthor = Boolean(myProfileId) && listing.authorProfileId === myProfileId;
  const offers = offersForListing(state, listing.id);
  const accepted = offers.find((o) => o.status === "ACCEPTED") ?? null;
  const pending = offers.filter((o) => o.status === "PENDING").at(-1) ?? null;
  const [amount, setAmount] = useState(String(listing.price ?? ""));
  const [message, setMessage] = useState("");
  const [availability, setAvailability] = useState("");
  const [experience, setExperience] = useState("");
  const [composing, setComposing] = useState(false);
  const cat = categoryByCode(listing.categoryCode);
  const [notice, setNotice] = useState<string | null>(null);
  const contract = listing.isDemo ? null : contractForListing(state, listing.id);
  // General reviews/reputation belong to the person's profile, not to a listing detail.
  const party = [...offers].reverse().find((o) => o.buyerProfileId && o.providerProfileId);
  const isParticipant =
    Boolean(myProfileId) &&
    Boolean(party) &&
    (party!.buyerProfileId === myProfileId || party!.providerProfileId === myProfileId);
  const counterpartId = isParticipant
    ? party!.buyerProfileId === myProfileId
      ? party!.providerProfileId!
      : party!.buyerProfileId!
    : null;

  const respond = async (offer: ServiceOffer, status: "ACCEPTED" | "REJECTED") => {
    const ok = await updateOfferStatus(offer, status, { notify: true });
    if (ok) setNotice(status === "ACCEPTED" ? "Precio acordado" : "Propuesta rechazada");
  };

  const moveContract = async (status: ContractStatus, reason?: string) => {
    if (!contract) return false;
    const next = await setContractStatus(contract, status, reason);
    if (next) setNotice(CONTRACT_NOTICE[status]);
    return Boolean(next);
  };

  const send = async (kind: ServiceOffer["kind"]) => {
    const value = Number(amount.replace(/\D/g, ""));
    if (!value) return;
    const sent = await sendServiceOffer({
      listingId: listing.id,
      fromProfileId: myProfileId,
      fromName: myName,
      amount: value,
      currencyCode: listing.currencyCode,
      message: message.trim(),
      availability: availability.trim() || null,
      experience: experience.trim() || null,
      kind,
    });
    // On failure keep the form open so the user can retry; the error is shown.
    if (!sent) return;
    setMessage("");
    setAvailability("");
    setExperience("");
    setComposing(false);
    setNotice(kind === "counter" ? "Contraoferta enviada" : "Propuesta enviada");
  };

  // The party that must respond is whoever did NOT send the latest proposal.
  const canRespond =
    pending &&
    pending.fromProfileId !== myProfileId &&
    (isAuthor || offers.some((o) => o.fromProfileId === myProfileId));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">{listing.title}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5 pb-8">
          {listing.photos.length > 0 && (
            <MediaList
              refs={listing.photos}
              className="examples-scroller flex gap-2"
              itemClassName="h-40 w-64 shrink-0 rounded-2xl object-cover"
            />
          )}
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft font-display font-extrabold text-primary">
              {listing.authorName.slice(0, 1)}
            </span>
            <div>
              <p className="font-semibold text-foreground">{listing.authorName}</p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                {provider?.verification.identityVerified ? (
                  <span className="inline-flex items-center gap-1 font-bold text-success">
                    <BadgeCheck className="size-3.5" /> Verificado
                  </span>
                ) : (
                  <span>Sin verificación todavía</span>
                )}
                {provider && provider.rating.count > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3.5 fill-current text-primary" />{" "}
                    {provider.rating.average.toFixed(1)} · {provider.rating.completedFavors}{" "}
                    trabajos
                  </span>
                )}
              </p>
            </div>
          </div>
          <p className="font-display text-2xl font-extrabold text-foreground">
            {formatListingPrice(listing)}
          </p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {listing.description}
          </p>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-surface p-4 text-sm">
            {[
              ["Categoría", cat.name],
              ["Modalidad", MODALITY_LABELS[listing.modality]],
              ["Ubicación", [listing.zone, listing.city].filter(Boolean).join(", ") || "Remoto"],
              [
                "Disponibilidad",
                `${AVAILABILITY_LABELS[listing.availabilityType]}${listing.availabilityNote ? ` · ${listing.availabilityNote}` : ""}`,
              ],
              ["Duración", listing.duration || "—"],
              [
                "Idiomas",
                listing.languages
                  .map((c) => languageOptions.find((l) => l.code === c)?.name ?? c)
                  .join(", "),
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-semibold text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          {listing.portfolio.length > 0 && (
            <div>
              <h3 className="font-display font-bold text-foreground">Portafolio</h3>
              <MediaList
                refs={listing.portfolio}
                className="mt-2 grid grid-cols-3 gap-2"
                itemClassName="aspect-square w-full rounded-xl object-cover"
              />
            </div>
          )}

          {offers.length > 0 && (
            <div id="opd-negotiation" className="scroll-mt-4">
              <h3 className="font-display font-bold text-foreground">Negociación</h3>
              <ul className="mt-2 space-y-2">
                {offers.map((o) => (
                  <li key={o.id} className="rounded-2xl bg-surface p-3 text-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">
                      {o.kind === "counter" ? "Contrapropuesta" : "Oferta"}
                      {o.id === offers.at(-1)?.id ? " · más reciente" : ""}
                    </p>
                    <p className="font-display text-base font-extrabold text-foreground">
                      {formatMoney(o.amount, o.currencyCode)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {o.fromName} · {new Date(o.createdAt).toLocaleString("es-CO")}
                    </p>
                    {o.availability && (
                      <p className="text-muted-foreground"><span className="font-bold text-foreground">Disponibilidad:</span> {o.availability}</p>
                    )}
                    {o.experience && (
                      <p className="text-muted-foreground"><span className="font-bold text-foreground">Experiencia:</span> {o.experience}</p>
                    )}
                    {o.message && <p className="text-muted-foreground">{o.message}</p>}
                    <p className="text-xs font-bold text-muted-foreground">
                      Estado:{" "}
                      {o.status === "PENDING" && o.id !== pending?.id
                        ? "Reemplazada por una propuesta más reciente"
                        : o.status === "PENDING"
                        ? "Pendiente"
                        : o.status === "ACCEPTED"
                          ? "Precio acordado"
                          : o.status === "WITHDRAWN"
                            ? "Retirada"
                            : "Rechazada"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {notice && (
            <p className="rounded-2xl bg-brand-soft p-3 text-sm font-semibold text-primary">
              {notice}
            </p>
          )}
          {state.error && (
            <p className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
              {state.error}
            </p>
          )}

          {listing.isDemo ? (
            <p className="rounded-2xl bg-brand-soft p-4 text-sm text-primary">
              Esta es una publicación de ejemplo; no se puede contratar.
            </p>
          ) : accepted ? (
            <div id="opd-contract" className="scroll-mt-4 space-y-3 rounded-2xl bg-success/15 p-4 text-sm">
              <p className="font-semibold text-success">
                Precio acordado: {formatMoney(accepted.amount, accepted.currencyCode)}.
              </p>
              {contract && (
                <>
                  <p className="font-semibold text-foreground">
                    Estado: {CONTRACT_LABELS[contract.status]}
                  </p>
                  {contract.status === "disputed" && (
                    <p className="text-sm text-destructive">
                      Disputa abierta. La contratación queda detenida hasta que se resuelva.
                    </p>
                  )}
                  {isParticipant && contract.status !== "cancelled" && (
                    <PaymentOrderPanel
                      subjectType="service_contract"
                      subjectId={contract.id}
                      summary={listing.title}
                      canPay={contract.buyerProfileId === myProfileId}
                    />
                  )}
                  {isParticipant && (
                    <ContractActions
                      contract={contract}
                      myProfileId={myProfileId}
                      onMove={moveContract}
                    />
                  )}
                  {isParticipant && contract.status === "completed" && myProfileId && (
                    <div id="opd-review" className="scroll-mt-4">
                      <ReviewPanel state={state} contract={contract} myProfileId={myProfileId} />
                    </div>
                  )}
                </>
              )}
            </div>
          ) : !myProfileId ? (
            <p className="text-sm text-muted-foreground">Inicia sesión para contratar.</p>
          ) : (
            <div className="space-y-3">
              {canRespond && pending && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => void respond(pending, "ACCEPTED")}
                  >
                    Aceptar
                  </Button>
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => void respond(pending, "REJECTED")}
                  >
                    Rechazar
                  </Button>
                  <Button
                    className="flex-1"
                    variant="soft"
                    onClick={() => {
                      setAmount(String(pending.amount));
                      setComposing(true);
                    }}
                  >
                    Contraofertar
                  </Button>
                </div>
              )}
              {!isAuthor && !pending && !composing && (
                <Button size="touch" className="w-full" onClick={() => setComposing(true)}>
                  Contratar
                </Button>
              )}
              {composing && (
                <div className="space-y-2 rounded-2xl bg-surface p-4">
                  <label className="block text-xs font-bold text-muted-foreground">Precio propuesto</label>
                  <Input
                    className="h-12 rounded-2xl bg-card"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Precio en ${listing.currencyCode}`}
                  />
                  <label className="block text-xs font-bold text-muted-foreground">Disponibilidad</label>
                  <Input
                    className="h-12 rounded-2xl bg-card"
                    maxLength={500}
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                    placeholder="Ej.: lunes a viernes, desde el 10 de octubre"
                  />
                  <label className="block text-xs font-bold text-muted-foreground">Experiencia relevante</label>
                  <Textarea
                    className="rounded-2xl bg-card"
                    maxLength={1000}
                    placeholder="Trabajos similares, años de experiencia (opcional)"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                  />
                  <label className="block text-xs font-bold text-muted-foreground">Mensaje</label>
                  <Textarea
                    className="rounded-2xl bg-card"
                    placeholder="Mensaje (opcional)"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    onClick={() => void send(pending ? "counter" : "offer")}
                  >
                    {pending ? "Enviar contraoferta" : "Enviar propuesta"}
                  </Button>
                </div>
              )}
              {pending && !canRespond && (
                <p className="text-sm text-muted-foreground">Esperando respuesta a tu propuesta.</p>
              )}
            </div>
          )}
          {!listing.isDemo && isParticipant && counterpartId && myProfileId && (
            <div id="opd-chat" className="scroll-mt-4">
            <ServiceChat
              listingId={listing.id}
              myProfileId={myProfileId}
              counterpartId={counterpartId}
            />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const CONTRACT_LABELS: Record<ContractStatus, string> = {
  agreed: "Precio acordado",
  confirmed: "Contratación confirmada",
  in_progress: "Servicio en progreso",
  completed: "Servicio completado",
  cancelled: "Contrato cancelado",
  disputed: "Disputa abierta",
};
const CONTRACT_NOTICE = CONTRACT_LABELS;
const NEXT_STATUS: Partial<Record<ContractStatus, ContractStatus>> = {
  agreed: "confirmed",
  confirmed: "in_progress",
  in_progress: "completed",
};
const NEXT_LABEL: Partial<Record<ContractStatus, string>> = {
  agreed: "Confirmar contratación",
  confirmed: "Iniciar servicio",
  in_progress: "Marcar completado",
};
/** Who may advance each step (mirrored server-side in transition_service_contract). */
const NEXT_ACTOR: Partial<Record<ContractStatus, "buyer" | "provider" | "any">> = {
  agreed: "buyer",
  confirmed: "provider",
  in_progress: "any",
};
const WAITING_LABEL: Partial<Record<ContractStatus, string>> = {
  agreed: "Esperando que el contratante confirme la contratación.",
  confirmed: "Contratación confirmada. El profesional iniciará el servicio.",
};

function ContractActions({
  contract,
  myProfileId,
  onMove,
}: {
  contract: ServiceContract;
  myProfileId: string | null;
  onMove: (status: ContractStatus, reason?: string) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState<"cancelled" | "disputed" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const open = !["completed", "cancelled", "disputed"].includes(contract.status);
  const myRole =
    myProfileId === contract.buyerProfileId
      ? "buyer"
      : myProfileId === contract.providerProfileId
        ? "provider"
        : null;
  const actor = NEXT_ACTOR[contract.status];
  const canAdvance = Boolean(myRole) && (actor === "any" || actor === myRole);
  const run = async (status: ContractStatus, why?: string) => {
    setBusy(true);
    const ok = await onMove(status, why);
    setBusy(false);
    if (ok) {
      setConfirming(null);
      setReason("");
    }
  };
  if (!open) return null;
  if (confirming) {
    return (
      <div className="space-y-2 rounded-2xl bg-card p-3">
        <p className="font-semibold text-foreground">
          {confirming === "cancelled"
            ? "¿Seguro que quieres cancelar esta contratación? No se puede deshacer."
            : "Cuéntanos qué pasó para abrir la disputa."}
        </p>
        {confirming === "disputed" && (
          <Textarea
            className="rounded-2xl bg-surface"
            maxLength={1000}
            placeholder="Motivo de la disputa"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        <div className="flex gap-2">
          <Button
            variant="destructive"
            disabled={busy || (confirming === "disputed" && reason.trim().length < 5)}
            onClick={() => void run(confirming, confirming === "disputed" ? reason.trim() : undefined)}
          >
            {confirming === "cancelled" ? "Sí, cancelar" : "Abrir disputa"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setConfirming(null)}>
            Volver
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {NEXT_STATUS[contract.status] && !canAdvance && WAITING_LABEL[contract.status] && (
        <p className="text-sm text-muted-foreground">{WAITING_LABEL[contract.status]}</p>
      )}
    <div className="flex flex-wrap gap-2">
      {NEXT_STATUS[contract.status] && canAdvance && (
        <Button disabled={busy} onClick={() => void run(NEXT_STATUS[contract.status]!)}>
          {NEXT_LABEL[contract.status]}
        </Button>
      )}
      <Button variant="outline" disabled={busy} onClick={() => setConfirming("cancelled")}>
        Cancelar
      </Button>
      <Button variant="outline" disabled={busy} onClick={() => setConfirming("disputed")}>
        Abrir disputa
      </Button>
    </div>
    </div>
  );
}

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div className="flex gap-1" role={onChange ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
          onClick={() => onChange?.(n)}
        >
          <Star
            className={`size-7 ${n <= value ? "fill-current text-primary" : "text-muted-foreground"}`}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * The only place a contract's reviews render (one copy each):
 * "Tu calificación" = reviewer is me; "Calificación recibida" = reviewed is me.
 * The target is decided by Foundation (submit_service_review) from service_contracts.
 */
function ReviewPanel({
  state,
  contract,
  myProfileId,
}: {
  state: OpportunitiesState;
  contract: ServiceContract;
  myProfileId: string;
}) {
  const mine = myReviewFor(state, contract.id, myProfileId);
  const received = state.reviews.find(
    (r) => r.contractId === contract.id && r.reviewedProfileId === myProfileId,
  );
  const iAmProvider = contract.providerProfileId === myProfileId;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async () => {
    if (!rating) return;
    setBusy(true);
    const saved = await rateContract(contract, rating, comment);
    setBusy(false);
    if (saved) setDone(true);
  };
  return (
    <div className="space-y-3 rounded-2xl bg-card p-4">
      {mine ? (
        <div>
          <p className="font-semibold text-foreground">
            {iAmProvider ? "Tu calificación al contratante" : "Tu calificación al profesional"}
          </p>
          <Stars value={mine.rating} />
          {mine.comment && <p className="text-muted-foreground">{mine.comment}</p>}
          {done && <p className="text-xs font-bold text-success">¡Gracias! Calificación guardada.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="font-display font-bold text-foreground">
            {iAmProvider ? "Calificar al contratante" : "Calificar al profesional"}
          </p>
          <Stars value={rating} onChange={setRating} />
          <Textarea
            className="rounded-2xl bg-surface"
            maxLength={1000}
            placeholder="Cuéntanos cómo fue tu experiencia"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Button disabled={!rating || busy} onClick={() => void submit()}>
            Enviar calificación
          </Button>
        </div>
      )}
      {received && (
        <div>
          <p className="font-semibold text-foreground">Calificación recibida</p>
          <Stars value={received.rating} />
          <p className="text-xs text-muted-foreground">
            {received.reviewerName} · {new Date(received.createdAt).toLocaleDateString("es-CO")}
          </p>
          {received.comment && <p className="text-muted-foreground">{received.comment}</p>}
        </div>
      )}
    </div>
  );
}

function MyContracts({
  state,
  myProfileId,
  onOpen,
}: {
  state: OpportunitiesState;
  myProfileId: string;
  onOpen: (listingId: string) => void;
}) {
  const sorted = [...state.contracts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const groups: Array<[string, ServiceContract[]]> = [
    ["Servicios que contraté", sorted.filter((c) => c.buyerProfileId === myProfileId)],
    ["Servicios que estoy prestando", sorted.filter((c) => c.providerProfileId === myProfileId)],
  ];
  return (
    <div className="mt-10">
      <p className="eyebrow text-xs font-bold uppercase">Tu actividad</p>
      <h2 className="mt-1 font-display text-2xl font-extrabold text-foreground sm:text-3xl">Mis contrataciones</h2>
      {groups.map(([title, list], gi) => (
        <div key={title} className="mt-6">
          <p className="sv-group" data-tone={gi === 0 ? "blue" : "red"}>
            <span aria-hidden="true" />
            {title}
            <b>{list.length}</b>
          </p>
          {list.length === 0 ? (
            <p className="sv-none">Nada por aquí todavía.</p>
          ) : (
            <div className="sv-grid mt-3">
              {list.map((c) => {
                const listing = state.listings.find((l) => l.id === c.listingId);
                const buying = c.buyerProfileId === myProfileId;
                const counterpart =
                  listing && listing.authorProfileId !== myProfileId
                    ? listing.authorName
                    : (state.offers.find(
                        (o) =>
                          o.listingId === c.listingId &&
                          o.fromProfileId === (buying ? c.providerProfileId : c.buyerProfileId),
                      )?.fromName ?? "Participante");
                const cat = categoryByCode(listing?.categoryCode ?? "other");
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="sv-card group"
                    data-status={c.status}
                    style={sceneVariant(c.id)}
                    onClick={() => onOpen(c.listingId)}
                    {...tiltHandlers}
                  >
                    <div className="fv-scene">
                      <img src={serviceArt(cat.code)} alt="" loading="lazy" width={1024} height={768} />
                      <span className="fv-scene-light" aria-hidden="true" />
                      <span className="fv-scene-motes" aria-hidden="true" />
                      <span className="sv-state">{CONTRACT_LABELS[c.status]}</span>
                    </div>
                    <div className="fv-body">
                      <p className="fv-cat">{cat.name}</p>
                      <p className="mt-1.5 line-clamp-2 font-display text-lg font-bold leading-snug text-foreground">
                        {listing?.title || "Servicio"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {buying ? "Proveedor" : "Cliente"}: <span className="font-semibold text-foreground">{counterpart}</span>
                      </p>
                      <div className="fv-next">
                        <span className="font-display text-xl font-extrabold text-foreground">
                          {formatMoney(c.amount, c.currencyCode)} <small className="text-xs font-bold text-muted-foreground">{c.currencyCode}</small>
                        </span>
                        <span className="fv-go">
                          Ver detalle <ArrowRight className="size-3.5" aria-hidden="true" />
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Creada {new Date(c.createdAt).toLocaleDateString("es-CO")} · actualizada{" "}
                        {new Date(c.updatedAt).toLocaleString("es-CO")}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ServiceChat({
  listingId,
  myProfileId,
  counterpartId,
}: {
  listingId: string;
  myProfileId: string;
  counterpartId: string;
}) {
  const [messages, setMessages] = useState<ServiceMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMessages(await loadMessages(listingId));
      setError(null);
    } catch (e) {
      setError(`No se pudo cargar el chat: ${(e as Error).message}`);
    }
  }, [listingId]);

  useEffect(() => {
    void refresh();
    return subscribeLive({
      name: `svc-chat-${listingId}`,
      tables: [{ table: "service_messages", event: "INSERT", filter: `service_listing_id=eq.${listingId}` }],
      onChange: () => void refresh(),
      fallbackMs: 10000,
      debounceMs: 150,
    });
  }, [refresh]);

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const m = await sendMessage(listingId, counterpartId, text);
      setMessages((prev) => [...prev, m]);
      setBody("");
      setError(null);
    } catch (e) {
      setError(`No se pudo enviar el mensaje: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const visible = messages.filter(
    (m) =>
      (m.senderProfileId === myProfileId && m.receiverProfileId === counterpartId) ||
      (m.senderProfileId === counterpartId && m.receiverProfileId === myProfileId),
  );

  return (
    <div>
      <h3 className="font-display font-bold text-foreground">Chat</h3>
      <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
        {visible.length === 0 && (
          <li className="text-sm text-muted-foreground">Aún no hay mensajes.</li>
        )}
        {visible.map((m) => (
          <li
            key={m.id}
            className={`rounded-2xl p-3 text-sm ${m.senderProfileId === myProfileId ? "ml-8 bg-brand-soft" : "mr-8 bg-surface"}`}
          >
            <p className="text-xs font-bold text-muted-foreground">
              {m.senderProfileId === myProfileId ? "Tú" : "La otra persona"} ·{" "}
              {new Date(m.createdAt).toLocaleString()}
            </p>
            <p className="whitespace-pre-line text-foreground">{m.body}</p>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Input
          className="h-11 rounded-2xl bg-card"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribe un mensaje"
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
        <Button disabled={sending || !body.trim()} onClick={() => void submit()}>
          Enviar
        </Button>
      </div>
    </div>
  );
}
