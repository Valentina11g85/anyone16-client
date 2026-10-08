import { useState } from "react";
import { Check, Lock, Sparkles, X } from "lucide-react";

import { categoryByCode, type ServiceListing } from "@/lib/opportunities-model";
import {
  OPPORTUNITIES_UNLOCK_LABEL,
  startOpportunitiesUnlock,
  type OpportunitiesAccess,
} from "@/lib/opportunities-access";

function useUnlock() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await startOpportunitiesUnlock();
      if (r.status === "redirect") window.location.assign(r.url);
      else setNotice("El pago estará disponible muy pronto. Aún no se ha realizado ningún cobro.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, notice, run };
}

/** Teaser card: category and title readable, everything else behind a galactic veil. */
export function LockedListingCard({
  listing,
  onOpen,
}: {
  listing: ServiceListing;
  onOpen?: (() => void) | undefined;
}) {
  return (
    <button type="button" onClick={onOpen} className="pw-card opx-blue text-left">
      <div className="pw-card-head">
        <p className="fv-cat">{categoryByCode(listing.categoryCode).name}</p>
        <h3 className="font-display text-lg font-bold leading-snug text-foreground">
          {listing.title || "Oportunidad disponible"}
        </h3>
      </div>
      <div className="pw-veil-wrap">
        <div className="pw-ghost" aria-hidden>
          <span /><span /><span /><span />
        </div>
        <div className="pw-veil" aria-hidden>
          <i className="pw-nebula" />
          <i className="pw-stars" />
        </div>
        <div className="pw-center">
          <span className="pw-lock"><Lock className="size-5" aria-hidden /></span>
          <p className="font-display text-base font-extrabold text-foreground">Desbloquea esta oportunidad</p>
          <p className="pw-price">{OPPORTUNITIES_UNLOCK_LABEL}</p>
          <span className="pw-btn">Ver contenido completo</span>
        </div>
      </div>
    </button>
  );
}

/** Banner on top of the job-offers market. */
export function PremiumAccessBanner({ access }: { access: OpportunitiesAccess }) {
  const { busy, notice, run } = useUnlock();
  if (access === "loading") return null;
  if (access === "unlocked") {
    return (
      <p className="pw-active">
        <Check className="size-4" aria-hidden /> Acceso desbloqueado
      </p>
    );
  }
  return (
    <section className="pw-banner" aria-label="Acceso a oportunidades">
      <i className="pw-nebula" aria-hidden />
      <i className="pw-stars" aria-hidden />
      <div className="relative">
        <p className="pw-kicker"><Sparkles className="size-3.5" aria-hidden /> Acceso a Oportunidades</p>
        <h3 className="mt-2 font-display text-xl font-extrabold text-foreground sm:text-2xl">
          Accede a todas las oportunidades
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Desbloquea el contenido completo de las ofertas de trabajo por {OPPORTUNITIES_UNLOCK_LABEL}. Un solo pago, para tu cuenta.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="pw-price">{OPPORTUNITIES_UNLOCK_LABEL}</span>
          <button type="button" className="pw-btn" onClick={run} disabled={busy}>
            Desbloquear por $4.000
          </button>
        </div>
        {notice && <p className="mt-3 text-xs text-muted-foreground">{notice}</p>}
      </div>
    </section>
  );
}

/** Opened when someone taps a locked card. */
export function PaywallSheet({ listing, onClose }: { listing: ServiceListing; onClose: () => void }) {
  const { busy, notice, run } = useUnlock();
  return (
    <div className="pw-overlay" role="dialog" aria-modal="true" aria-label="Desbloquear oportunidad" onClick={onClose}>
      <div className="pw-sheet" onClick={(e) => e.stopPropagation()}>
        <i className="pw-nebula" aria-hidden />
        <i className="pw-stars" aria-hidden />
        <button type="button" className="pw-close" aria-label="Cerrar" onClick={onClose}>
          <X className="size-5" />
        </button>
        <div className="relative text-center">
          <p className="fv-cat">{categoryByCode(listing.categoryCode).name}</p>
          <h3 className="mt-1 font-display text-xl font-extrabold text-foreground">{listing.title}</h3>
          <span className="pw-lock mx-auto mt-5"><Lock className="size-6" aria-hidden /></span>
          <p className="mt-3 font-display text-lg font-extrabold text-foreground">Desbloquea esta oportunidad</p>
          <p className="mt-1 text-sm text-muted-foreground">Accede al contenido completo de todas las ofertas de trabajo.</p>
          <p className="pw-price mx-auto mt-4">{OPPORTUNITIES_UNLOCK_LABEL}</p>
          <button type="button" className="pw-btn mt-5 w-full" onClick={run} disabled={busy}>
            Desbloquear Oportunidades — {OPPORTUNITIES_UNLOCK_LABEL}
          </button>
          {notice && <p className="mt-3 text-xs text-muted-foreground">{notice}</p>}
        </div>
      </div>
    </div>
  );
}
