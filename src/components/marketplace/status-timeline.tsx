import { AlertTriangle, Check, XCircle } from "lucide-react";

import type { FavorStatus } from "@/lib/favor-model";
import { FAVOR_TIMELINE, timelineIndex } from "@/lib/marketplace-model";
import type { TranslationKey, Translator } from "@/lib/i18n";

export function StatusBadge({ status, t }: { status: FavorStatus; t: Translator }) {
  const tone =
    status === "CANCELLED" || status === "DISPUTED"
      ? "bg-muted text-muted-foreground"
      : status === "COMPLETED"
        ? "bg-success/15 text-success"
        : "bg-brand-soft text-primary";
  return (
    <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${tone}`}>
      {t(`status.${status}` as TranslationKey)}
    </span>
  );
}

export function StatusTimeline({ status, t }: { status: FavorStatus; t: Translator }) {
  if (status === "CANCELLED" || status === "DISPUTED") {
    const Icon = status === "CANCELLED" ? XCircle : AlertTriangle;
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm font-semibold text-muted-foreground">
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        {t(`status.${status}` as TranslationKey)}
      </div>
    );
  }
  const current = Math.max(timelineIndex(status), 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {t("detail.progress")}
      </p>
      <ol className="mt-3 space-y-0">
        {FAVOR_TIMELINE.map((entry, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={entry} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full border-2 text-[10px] font-bold ${
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : active
                        ? "border-primary bg-brand-soft text-primary"
                        : "border-border bg-card text-muted-foreground"
                  }`}
                  aria-hidden="true"
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                {index < FAVOR_TIMELINE.length - 1 && (
                  <span
                    className={`w-0.5 flex-1 ${index < current ? "bg-primary" : "bg-border"}`}
                    aria-hidden="true"
                  />
                )}
              </div>
              <p
                className={`pb-3 text-sm ${
                  active
                    ? "font-bold text-foreground"
                    : done
                      ? "font-semibold text-muted-foreground"
                      : "text-muted-foreground"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {t(`status.${entry}` as TranslationKey)}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
