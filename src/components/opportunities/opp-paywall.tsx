import { useState } from "react";
import { Lock, X } from "lucide-react";

import { OPPORTUNITIES_UNLOCK_LABEL, startOpportunitiesUnlock } from "@/lib/opportunities-access";

const PENDING_NOTICE = "El pago estará disponible muy pronto. Aún no se ha realizado ningún cobro.";

function useUnlock() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await startOpportunitiesUnlock();
      if (r.status === "redirect") window.location.assign(r.url);
      else setNotice(PENDING_NOTICE);
    } finally {
      setBusy(false);
    }
  };
  return { busy, notice, run };
}

/**
 * Locked "Ofertas de trabajo" market. Rendered INSTEAD of the cards: no listing
 * (title, category, author…) is ever rendered behind it.
 */
export function LockedOpportunitiesExperience() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <section className="pw-galaxy" aria-label="Oportunidades bloqueadas">
        <i className="pw-nebula" aria-hidden />
        <i className="pw-nebula pw-nebula-b" aria-hidden />
        <i className="pw-stars" aria-hidden />
        <i className="pw-stars pw-stars-b" aria-hidden />
        <i className="pw-swirl" aria-hidden />
        <i className="pw-orbit" aria-hidden />
        <i className="pw-orbit pw-orbit-b" aria-hidden />
        <i className="pw-particles" aria-hidden />
        <i className="pw-dust" aria-hidden />
        <div className="pw-glass">
          <span className="pw-lock"><Lock className="size-6" aria-hidden /></span>
          <h3 className="mt-4 font-display text-xl font-extrabold text-foreground sm:text-2xl">
            Accede a Oportunidades
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">Descubre servicios y ofertas de trabajo.</p>
          <p className="mt-1 text-sm text-muted-foreground">Un solo pago para tu cuenta.</p>
          <p className="pw-price mx-auto mt-4">{OPPORTUNITIES_UNLOCK_LABEL}</p>
          <button type="button" className="pw-btn mt-5 w-full sm:w-auto" onClick={() => setOpen(true)}>
            Desbloquear por $4.000
          </button>
        </div>
      </section>
      {open && <UnlockSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** Unlock panel. Never grants access: the entitlement is only activated by Foundation. */
export function UnlockSheet({ onClose }: { onClose: () => void }) {
  const { busy, notice, run } = useUnlock();
  return (
    <div className="pw-overlay" role="dialog" aria-modal="true" aria-label="Desbloquear oportunidades" onClick={onClose}>
      <div className="pw-sheet" onClick={(e) => e.stopPropagation()}>
        <i className="pw-nebula" aria-hidden />
        <i className="pw-stars" aria-hidden />
        <button type="button" className="pw-close" aria-label="Cerrar" onClick={onClose}>
          <X className="size-5" />
        </button>
        <div className="relative text-center">
          <span className="pw-lock mx-auto mt-3"><Lock className="size-6" aria-hidden /></span>
          <p className="mt-4 font-display text-xl font-extrabold text-foreground">Accede a Oportunidades</p>
          <p className="mt-1 text-sm text-muted-foreground">Descubre servicios y ofertas de trabajo.</p>
          <p className="mt-1 text-sm text-muted-foreground">Un solo pago para tu cuenta.</p>
          <p className="pw-price mx-auto mt-4">{OPPORTUNITIES_UNLOCK_LABEL}</p>
          <button type="button" className="pw-btn mt-5 w-full" onClick={run} disabled={busy}>
            Desbloquear por $4.000
          </button>
          {notice && <p className="mt-3 text-xs text-muted-foreground">{notice}</p>}
        </div>
      </div>
    </div>
  );
}

/** Locked marketplace: only the two market titles, then one continuous galaxy. */
export function LockedUniverse() {
  return (
    <section className="pw-universe" aria-label="Mercado de Oportunidades">
      <div className="pw-universe-heads">
        <div className="pw-universe-head opx-red">
          <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-foreground sm:text-2xl">
            Servicios que se ofrecen
          </h2>
        </div>
        <div className="pw-universe-head opx-blue">
          <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-foreground sm:text-2xl">
            Ofertas de trabajo
          </h2>
        </div>
      </div>
      <LockedOpportunitiesExperience />
    </section>
  );
}
