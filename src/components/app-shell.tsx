import type { ReactNode } from "react";
import { ArrowLeft, Globe2 } from "lucide-react";

import appIcon from "@/assets/anyone-app-icon.jpg";
import { AnyoneBrand, Wordmark } from "@/components/anyone-brand";
import { Button } from "@/components/ui/button";

/** Shared onboarding / auth panel: brand aside on desktop, single card on mobile. */
export function Shell({
  children,
  onBack,
  progress,
  stepKey,
}: {
  children: ReactNode;
  onBack?: (() => void) | undefined;
  progress?: { current: number; total: number } | undefined;
  stepKey?: string;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-4 sm:px-6 sm:py-8 lg:grid lg:place-items-center lg:py-10">
      <div className="ambient-grid" aria-hidden="true" />
      <span aria-hidden="true" className="aura -left-32 -top-32 size-[28rem] bg-neon-blue/25" />
      <span aria-hidden="true" className="aura -bottom-40 -right-24 size-[26rem] bg-neon-red/20 [animation-delay:-4s]" />
      <div className="relative mx-auto w-full max-w-[1160px] lg:grid lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-14">
        <aside className="relative hidden flex-col items-center text-center lg:flex">
          <div className="relative">
            <span aria-hidden="true" className="absolute inset-8 rounded-full bg-neon-blue/30 blur-3xl" />
            <img
              src={appIcon}
              alt="AnyOne16"
              width={1024}
              height={1024}
              className="mark-float relative w-[420px] rounded-[26%] ring-1 ring-stage-foreground/10 shadow-[0_40px_120px_-30px_var(--neon-blue)]"
            />
          </div>
          <p className="mt-10 font-display text-[2.6rem] font-bold leading-[1.05] tracking-[-0.03em]">
            <span className="neon-text">Anyone</span> can help.
          </p>
          <div className="glass-chip mt-7 inline-flex items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold text-foreground/80">
            <Globe2 className="size-4 text-neon-blue" />
            Pensado para Colombia. Preparado para el mundo.
          </div>
        </aside>
        <section className="app-panel mx-auto min-h-[calc(100vh-2rem)] w-full max-w-[500px] lg:min-h-[720px]">
          <div className="mb-8 flex min-h-12 items-center justify-between">
            {onBack ? (
              <Button aria-label="Volver" variant="ghost" size="iconLg" onClick={onBack}>
                <ArrowLeft />
              </Button>
            ) : (
              <AnyoneBrand compact />
            )}
            {onBack && (
              <span className="text-sm text-muted-foreground">
                <Wordmark />
              </span>
            )}
          </div>
          {progress && (
            <div
              className="mb-7"
              aria-label={`Paso ${progress.current} de ${progress.total}`}
            >
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Tu experiencia</span>
                <span>
                  Paso {progress.current} de {progress.total}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: progress.total }).map((_, index) => (
                  <span
                    key={index}
                    className={
                      index < progress.current
                        ? "h-1.5 rounded-full bg-primary"
                        : "h-1.5 rounded-full bg-muted"
                    }
                  />
                ))}
              </div>
            </div>
          )}
          <div key={stepKey} className="step-enter">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
