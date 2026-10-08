/**
 * Oportunidades — two simultaneous markets.
 * Red (left) = services people offer. Blue (right) = job offers (people who
 * need someone). Both read the existing service_listings feed, split by intent.
 */
import { ArrowRight, Briefcase, Plus, Search } from "lucide-react";

import type { ListingIntent, ServiceListing } from "@/lib/opportunities-model";
import type { WorkerProfile } from "@/lib/marketplace-model";
import { ListingCard } from "./listing-card";
import { LockedOpportunitiesExperience } from "./opp-paywall";

const PREVIEW = 4;

export function MarketColumns({
  listings,
  signedIn,
  providerFor,
  onOpen,
  onNew,
  onSeeAll,
  seekLocked,
}: {
  seekLocked: boolean;
  listings: ServiceListing[];
  signedIn: boolean;
  providerFor: (l: ServiceListing) => WorkerProfile | null;
  onOpen: (id: string) => void;
  onNew: (intent: ListingIntent) => void;
  onSeeAll: (intent: ListingIntent) => void;
}) {
  const offers = listings.filter((l) => l.intent === "OFFER");
  const seeks = listings.filter((l) => l.intent === "SEEK");
  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-2" aria-label="Mercado de Oportunidades">
      <Column
        intent="OFFER"
        title="Servicios que se ofrecen"
        subtitle="Personas que ofrecen sus habilidades, servicios y talentos."
        cta="Ofrecer mi servicio"
        seeAll="Ver todos los servicios"
        empty="Aún no hay servicios publicados."
        items={offers}
        signedIn={signedIn}
        providerFor={providerFor}
        onOpen={onOpen}
        onNew={onNew}
        onSeeAll={onSeeAll}
      />
      <Column
        intent="SEEK"
        title="Ofertas de trabajo"
        subtitle="Personas que buscan a alguien para realizar un servicio."
        cta="Publicar lo que necesito"
        seeAll="Ver todas las ofertas"
        empty="Aún no hay ofertas de trabajo publicadas."
        items={seeks}
        locked={seekLocked}
        signedIn={signedIn}
        providerFor={providerFor}
        onOpen={onOpen}
        onNew={onNew}
        onSeeAll={onSeeAll}
      />
    </section>
  );
}

function Column({
  intent,
  title,
  subtitle,
  cta,
  seeAll,
  empty,
  items,
  signedIn,
  providerFor,
  onOpen,
  onNew,
  onSeeAll,
  locked = false,
}: {
  locked?: boolean;
  intent: ListingIntent;
  title: string;
  subtitle: string;
  cta: string;
  seeAll: string;
  empty: string;
  items: ServiceListing[];
  signedIn: boolean;
  providerFor: (l: ServiceListing) => WorkerProfile | null;
  onOpen: (id: string) => void;
  onNew: (intent: ListingIntent) => void;
  onSeeAll: (intent: ListingIntent) => void;
}) {
  const tone = intent === "OFFER" ? "opx-red" : "opx-blue";
  return (
    <div className={`${tone} opx-column ${intent === "SEEK" ? "order-first lg:order-none" : ""}`}>
      <header className="flex flex-col gap-3">
        <p className="opx-column-kicker">
          <span className="opx-dot" aria-hidden />
          {intent === "OFFER" ? "Yo puedo hacer esto" : "Necesito que alguien haga esto"}
        </p>
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        <button
          type="button"
          className="opx-column-cta"
          disabled={!signedIn}
          onClick={() => onNew(intent)}
        >
          <Plus className="size-4" /> {cta}
        </button>
        {!signedIn && <p className="text-xs text-muted-foreground">Inicia sesión para publicar.</p>}
      </header>

      {locked ? (
        <div className="mt-5"><LockedOpportunitiesExperience /></div>
      ) : items.length === 0 ? (
        <div className="mt-5 rounded-[22px] border border-dashed border-border p-8 text-center">
          {intent === "OFFER" ? (
            <Briefcase className="mx-auto size-7 text-primary" />
          ) : (
            <Search className="mx-auto size-7 text-primary" />
          )}
          <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {items.slice(0, PREVIEW).map((l) => (
            <ListingCard key={l.id} listing={l} provider={providerFor(l)} onOpen={() => onOpen(l.id)} />
          ))}
        </div>
      )}

      {!locked && (
        <button type="button" className="opx-column-more" onClick={() => onSeeAll(intent)}>
          {seeAll} ({items.length}) <ArrowRight className="size-4" />
        </button>
      )}
    </div>
  );
}
