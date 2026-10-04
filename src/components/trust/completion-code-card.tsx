/**
 * Client card 🔵 — the mandatory confirmation code.
 * The code is read straight from the backend and only the favor owner can
 * read it (row level security). The worker never receives it through the app.
 */

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Favor } from "@/lib/favor-model";
import { createTrustTranslator } from "@/lib/trust-i18n";
import { ensureCompletionCode, readCompletionCode, type CompletionCode } from "@/lib/trust-repo";

export function CompletionCodeCard({
  favor,
  languageCode,
}: {
  favor: Favor;
  languageCode: string;
}) {
  const t = useMemo(() => createTrustTranslator(languageCode), [languageCode]);
  const [code, setCode] = useState<CompletionCode | null>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const row = await readCompletionCode(favor.id);
        if (alive) {
          setCode(row);
          setError(null);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [favor.id, favor.status]);

  const regenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      await ensureCompletionCode(favor.id);
      setCode(await readCompletionCode(favor.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegenerating(false);
    }
  };

  const used = code?.status === "used";

  return (
    <section className="rounded-[26px] border border-primary/30 bg-brand-soft p-5 shadow-soft">
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
        <ShieldCheck className="size-4" aria-hidden="true" />
        {t("trust.code.title")}
      </p>

      {!code && !error && (
        <p className="mt-3 text-sm text-muted-foreground">{t("trust.code.pending")}</p>
      )}

      {error && (
        <p className="mt-3 text-sm font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}

      {code && used && (
        <p className="mt-3 rounded-2xl bg-success/15 p-4 text-sm font-bold text-success">
          {t("trust.code.used")}
        </p>
      )}

      {code && !used && code.status === "expired" && (
        <p className="mt-3 text-sm font-semibold text-destructive">{t("trust.code.expired")}</p>
      )}

      {code && !used && code.status === "active" && (
        <>
          <p className="mt-2 text-sm text-muted-foreground">{t("trust.code.clientIntro")}</p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-card p-4">
            <span
              className="font-display text-3xl font-extrabold tracking-[0.35em] text-brand-dark"
              aria-live="polite"
            >
              {visible ? code.code : "••••••"}
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="h-11 rounded-xl"
              aria-pressed={visible}
              onClick={() => setVisible((value) => !value)}
            >
              {visible ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
              {visible ? t("trust.code.hide") : t("trust.code.hidden")}
            </Button>
          </div>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">
            {t("trust.code.neverShare")}
          </p>
          {code.failedAttempts > 0 && (
            <p className="mt-1 text-xs font-semibold text-destructive">
              {t("trust.code.attemptsLeft")}: {Math.max(0, code.maxAttempts - code.failedAttempts)}
            </p>
          )}
        </>
      )}

      <Button
        variant="secondary"
        size="sm"
        className="mt-4 h-11 rounded-xl"
        disabled={regenerating}
        onClick={() => void regenerate()}
      >
        Generar código nuevo
      </Button>
    </section>
  );
}
