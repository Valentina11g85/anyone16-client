import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock, X } from "lucide-react";

import { OPPORTUNITIES_UNLOCK_LABEL } from "@/lib/opportunities-access";
import {
  clearCheckoutReturn,
  isCheckoutReturn,
  startOpportunitiesPremiumCheckout,
  waitForPremiumConfirmation,
} from "@/lib/opportunities-payment";
import { refreshOpportunities } from "@/lib/opportunities-store";

/**
 * Checkout phases. None of them grants access: "active"/"already" are shown only
 * after Foundation (get_my_opportunities_access) confirms it.
 */
type Phase = "intro" | "preparing" | "not_configured" | "paying" | "confirming" | "active" | "already" | "error";

const BENEFITS = [
  "Acceso a servicios que se ofrecen",
  "Acceso a ofertas de trabajo",
  "Acceso desde tu cuenta",
  "Un solo pago",
  "Sin cobros recurrentes",
];

/**
 * Locked "Ofertas de trabajo" market. Rendered INSTEAD of the cards: no listing
 * (title, category, author…) is ever rendered behind it.
 */
export function LockedOpportunitiesExperience() {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<Phase>("intro");
  // Returning from the provider: the URL is only a hint → open in "confirming".
  useEffect(() => {
    if (isCheckoutReturn()) {
      clearCheckoutReturn();
      setInitial("confirming");
      setOpen(true);
    }
  }, []);
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
          <button type="button" className="pw-btn mt-5 w-full sm:w-auto" onClick={() => { setInitial("intro"); setOpen(true); }}>
            Desbloquear por $4.000
          </button>
        </div>
      </section>
      {open && <UnlockSheet initialPhase={initial} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Premium checkout panel. Never grants access: the entitlement is only activated by Foundation. */
export function UnlockSheet({ onClose, initialPhase = "intro" }: { onClose: () => void; initialPhase?: Phase }) {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const go = (p: Phase) => alive.current && setPhase(p);

  const confirm = async () => {
    go("confirming");
    const ok = await waitForPremiumConfirmation();
    go(ok ? "active" : "error");
  };

  useEffect(() => {
    if (initialPhase === "confirming") void confirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    go("preparing");
    try {
      const r = await startOpportunitiesPremiumCheckout();
      if (r.status === "ALREADY_ACTIVE") {
        await refreshOpportunities();
        go("already");
      } else if (r.status === "REDIRECT") {
        go("paying");
        window.location.assign(r.url);
      } else if (r.status === "NOT_CONFIGURED") go("not_configured");
      else go("error");
    } catch {
      go("error");
    }
  };

  const busy = phase === "preparing" || phase === "confirming" || phase === "paying";

  return (
    <div className="pw-overlay" role="dialog" aria-modal="true" aria-label="Oportunidades Premium" onClick={busy ? undefined : onClose}>
      <div className="pw-sheet" onClick={(e) => e.stopPropagation()}>
        <i className="pw-nebula" aria-hidden />
        <i className="pw-stars" aria-hidden />
        {!busy && (
          <button type="button" className="pw-close" aria-label="Cerrar" onClick={onClose}>
            <X className="size-5" />
          </button>
        )}
        <div className="relative text-center" aria-live="polite">
          {phase === "intro" && (
            <>
              <span className="pw-lock mx-auto mt-3"><Lock className="size-6" aria-hidden /></span>
              <p className="mt-4 text-[0.7rem] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
                Oportunidades Premium
              </p>
              <p className="mt-2 font-display text-xl font-extrabold text-foreground">
                Desbloquea Oportunidades por una sola vez.
              </p>
              <p className="pw-price mx-auto mt-4">{OPPORTUNITIES_UNLOCK_LABEL}</p>
              <ul className="mx-auto mt-5 max-w-[17rem] space-y-2 text-left text-sm text-foreground">
                {BENEFITS.map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <span className="pw-check"><Check className="size-3.5" aria-hidden /></span>
                    {b}
                  </li>
                ))}
              </ul>
              <button type="button" className="pw-btn mt-6 w-full" onClick={start}>
                Continuar al pago
              </button>
              <button type="button" className="pw-ghost mt-2 w-full" onClick={onClose}>
                Cancelar
              </button>
            </>
          )}

          {(phase === "preparing" || phase === "paying" || phase === "confirming") && (
            <div className="py-6">
              <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden />
              <p className="mt-4 font-display text-lg font-extrabold text-foreground">
                {phase === "confirming" ? "Estamos confirmando tu pago..." : phase === "paying" ? "Abriendo el pago..." : "Preparando tu pago..."}
              </p>
            </div>
          )}

          {phase === "not_configured" && (
            <>
              <span className="pw-lock mx-auto mt-3"><Lock className="size-6" aria-hidden /></span>
              <p className="mt-4 font-display text-xl font-extrabold text-foreground">Pago próximamente disponible</p>
              <p className="mt-2 text-sm text-muted-foreground">Estamos terminando de habilitar los pagos para Oportunidades.</p>
              <p className="mt-2 text-sm text-muted-foreground">Tu cuenta no ha sido cobrada y Premium no ha sido activado.</p>
              <button type="button" className="pw-btn mt-6 w-full" onClick={onClose}>Entendido</button>
            </>
          )}

          {(phase === "active" || phase === "already") && (
            <>
              <span className="pw-lock mx-auto mt-3"><Check className="size-6" aria-hidden /></span>
              <p className="mt-4 font-display text-xl font-extrabold text-foreground">
                {phase === "active" ? "¡Oportunidades desbloqueado!" : "Ya tienes Oportunidades desbloqueado."}
              </p>
              <button type="button" className="pw-btn mt-6 w-full" onClick={onClose}>Ver Oportunidades</button>
            </>
          )}

          {phase === "error" && (
            <>
              <span className="pw-lock mx-auto mt-3"><Lock className="size-6" aria-hidden /></span>
              <p className="mt-4 font-display text-xl font-extrabold text-foreground">No pudimos confirmar el pago.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Si realizaste un pago, no vuelvas a pagar. Espera unos momentos y vuelve a consultar el estado.
              </p>
              <button type="button" className="pw-btn mt-6 w-full" onClick={() => void confirm()}>Volver a consultar</button>
              <button type="button" className="pw-ghost mt-2 w-full" onClick={onClose}>Cerrar</button>
            </>
          )}
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
