import { BadgeCheck, Globe2, MapPin, Star } from "lucide-react";

import type { WorkerProfile } from "@/lib/marketplace-model";
import { sceneVariant, serviceArt, tiltHandlers } from "@/lib/scene-art";
import {
  AVAILABILITY_LABELS,
  MODALITY_LABELS,
  categoryByCode,
  formatListingPrice,
  type ServiceListing,
} from "@/lib/opportunities-model";
import { useFirstPhoto } from "./listing-media";

export type CardReview = { label: string; rating: number } | null;

/** Real trust data only comes from the author's existing AnyOne¹⁶ worker profile. */
export function ListingCard({
  listing,
  provider,
  contractReview,
  onOpen,
}: {
  listing: ServiceListing;
  provider?: WorkerProfile | null;
  /** When given (even null), the card shows the review of ITS contract instead of author stats. */
  contractReview?: CardReview;
  onOpen?: () => void;
}) {
  return <OpenListingCard listing={listing} provider={provider} contractReview={contractReview} onOpen={onOpen} />;
}

function OpenListingCard({
  listing,
  provider,
  contractReview,
  onOpen,
}: {
  listing: ServiceListing;
  provider?: WorkerProfile | null | undefined;
  contractReview?: CardReview | undefined;
  onOpen?: (() => void) | undefined;
}) {
  const offering = listing.intent === "OFFER";
  const firstPhoto = useFirstPhoto(listing.photos);
  const photo = firstPhoto ?? (listing.photos.length ? null : listing.authorPhotoUrl);
  const Wrapper = onOpen ? "button" : "div";
  return (
    <Wrapper
      type={onOpen ? "button" : undefined}
      onClick={onOpen}
      className={`sv-card group flex w-full flex-col text-left ${offering ? "opx-red" : "opx-blue"}`}
      style={sceneVariant(listing.id)}
      {...tiltHandlers}
    >
      <div className="fv-scene">
        {photo ? (
          <img src={photo} alt="" className="fv-photo" loading="lazy" />
        ) : (
          <img src={serviceArt(listing.categoryCode)} alt="" loading="lazy" width={1024} height={768} />
        )}
        <span className="fv-scene-light" aria-hidden="true" />
        <span className="fv-scene-motes" aria-hidden="true" />
        <span
          className={`absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ${
            "bg-primary text-primary-foreground"
          }`}
        >
          {offering ? "Ofrezco" : "Se busca"}
        </span>
        {listing.isDemo && (
          <span className="absolute right-3 top-3 rounded-full bg-card/90 px-3 py-1 text-[11px] font-bold text-muted-foreground">
            Ejemplo
          </span>
        )}
      </div>
      <div className="fv-body flex flex-1 flex-col gap-2">
        <p className="fv-cat">
          {categoryByCode(listing.categoryCode).name}
        </p>
        <h3 className="font-display text-lg font-bold leading-snug text-foreground">
          {listing.title || "Sin título"}
        </h3>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {listing.authorName}
          {provider?.verification.identityVerified && (
            <span className="inline-flex items-center gap-0.5 font-bold text-success">
              <BadgeCheck className="size-3.5" /> Verificado
            </span>
          )}
        </p>
        <p className="font-display text-xl font-extrabold text-foreground">
          {!offering && <span className="mr-1 text-xs font-bold uppercase text-muted-foreground">Presupuesto</span>}
          {formatListingPrice(listing)}
        </p>
        <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {listing.modality === "remote" ? (
              <Globe2 className="size-3.5" />
            ) : (
              <MapPin className="size-3.5" />
            )}
            {MODALITY_LABELS[listing.modality]}
            {listing.city ? ` · ${listing.city}` : ""}
            {listing.radiusKm && listing.modality !== "remote" ? ` · ${listing.radiusKm} km` : ""}
          </span>
          <span>{AVAILABILITY_LABELS[listing.availabilityType]}</span>
          {contractReview !== undefined ? (
            contractReview ? (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 fill-current text-primary" />
                {contractReview.label} · {contractReview.rating}★
              </span>
            ) : (
              <span>Sin reseñas aún</span>
            )
          ) : provider && provider.rating.count > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-current text-primary" />
              {provider.rating.average.toFixed(1)} · {provider.rating.completedFavors} trabajos
            </span>
          ) : (
            <span>Sin reseñas aún</span>
          )}
        </div>
        {onOpen && (
          <span className="mt-2 text-sm font-bold text-primary">
            {offering ? "Ver servicio →" : "Ver solicitud →"}
          </span>
        )}
      </div>
    </Wrapper>
  );
}
