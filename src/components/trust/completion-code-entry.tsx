/**
 * Worker card 🔴⚫ — enters the client's confirmation code.
 * The app cannot complete a favor by itself: only the backend function
 * validate_favor_completion_code can move the favor to COMPLETED.
 */

import { useMemo, useState } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Favor } from "@/lib/favor-model";
import type { Coords } from "@/lib/geo";
import { hydrateMarketplace, pushMessage } from "@/lib/marketplace-store";
import { createTrustTranslator } from "@/lib/trust-i18n";
import { isCompleteCode, normalizeCode, type CodeValidationError } from "@/lib/trust-model";
import { submitCompletionCode } from "@/lib/trust-repo";

export function CompletionCodeEntry({
  favor,
  languageCode,
  position,
}: {
  favor: Favor;
  languageCode: string;
  position?: Coords | null;
}) {
  const t = useMemo(() => createTrustTranslator(languageCode), [languageCode]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CodeValidationError | null>(null);
  const [attempts, setAttempts] = useState<{ failed: number; max: number } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await submitCompletionCode({
      favorId: favor.id,
      code: value,
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
    });
    setBusy(false);
    if (result.ok) {
      pushMessage({
        favorId: favor.id,
        author: "system",
        kind: "system",
        body: t("trust.code.success"),
      });
      await hydrateMarketplace(true);
      return;
    }
    setError(result.error);
    if (result.failedAttempts !== undefined && result.maxAttempts !== undefined) {
      setAttempts({ failed: result.failedAttempts, max: result.maxAttempts });
    }
  };

  return (
    <section className="mt-4 rounded-[26px] border border-foreground/20 bg-foreground/5 p-5">
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground">
        <KeyRound className="size-4" aria-hidden="true" />
        {t("trust.code.title")}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{t("trust.code.workerIntro")}</p>

      <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {t("trust.code.enter")}
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          className="mt-1 h-14 text-center font-display text-2xl tracking-[0.35em]"
          value={value}
          onChange={(event) => setValue(normalizeCode(event.target.value))}
          placeholder="••••••"
        />
      </label>

      {error && (
        <p className="mt-2 text-sm font-semibold text-destructive" role="alert">
          {t(`trust.error.${error}` as never)}
        </p>
      )}
      {attempts && attempts.failed < attempts.max && (
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          {t("trust.code.attemptsLeft")}: {Math.max(0, attempts.max - attempts.failed)}
        </p>
      )}
      {attempts && attempts.failed >= attempts.max && (
        <p className="mt-1 text-xs font-bold text-destructive">{t("trust.code.warning")}</p>
      )}

      <Button
        className="mt-4 w-full text-base"
        size="touch"
        variant="dark"
        disabled={!isCompleteCode(value) || busy}
        onClick={() => void submit()}
      >
        {busy ? t("trust.code.checking") : t("trust.code.submit")}
      </Button>
    </section>
  );
}
