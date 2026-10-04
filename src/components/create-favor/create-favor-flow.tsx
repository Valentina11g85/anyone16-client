import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Hourglass,
  MapPin,
  PartyPopper,
  Pencil,
  Sparkles,
  Tag,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AnyoneBrand } from "@/components/anyone-brand";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { interpretFavor } from "@/lib/anyone-ai.functions";
import {
  createFavorDraft,
  createLocation,
  formatMoney,
  type Favor,
  type MissingField,
} from "@/lib/favor-model";
import { createTranslator, localeFor, type TranslationKey } from "@/lib/i18n";
import { recommendPriceForFavor } from "@/lib/pricing-engine";
import { withGeo } from "@/lib/geo";
import { FavorEditorSheet, type EditorSection } from "./favor-editor-sheet";
import { RouteEditor } from "./route-editor";
import {
  applyInterpretation,
  budgetLabel,
  pendingFields,
  questionKeyFor,
  scheduleLabel,
} from "./favor-utils";

type FlowStep =
  | "compose"
  | "analyzing"
  | "questions"
  | "route"
  | "review"
  | "final"
  | "published";

const ANALYZING_KEYS: TranslationKey[] = [
  "create.analyzing.1",
  "create.analyzing.2",
  "create.analyzing.3",
  "create.analyzing.4",
];

const EXAMPLE_ES =
  "Necesito que alguien vaya a la lavandería, recoja mi ropa, espere porque todavía no está lista y después me la traiga a mi apartamento esta noche. Le pago 35.000.";

export function CreateFavorFlow({
  initialText = "",
  countryCode,
  languageCode,
  currencyCode,
  onClose,
  onPublished,
}: {
  initialText?: string;
  countryCode: string;
  languageCode: string;
  currencyCode: string;
  onClose: () => void;
  /** Stage 3: hands the published favor to the marketplace store. */
  onPublished?: (favor: Favor) => Promise<Favor | void> | Favor | void;
}) {
  const t = useMemo(() => createTranslator(languageCode), [languageCode]);
  const interpret = useServerFn(interpretFavor);

  const [step, setStep] = useState<FlowStep>("compose");
  const [text, setText] = useState(initialText);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditorSection | null>(null);
  const [favor, setFavor] = useState<Favor>(() =>
    createFavorDraft({ countryCode, languageCode, currencyCode }),
  );
  const conversation = useRef(initialText);

  useEffect(() => {
    if (step !== "analyzing") return;
    setPhase(0);
    const timer = setInterval(() => setPhase((value) => Math.min(value + 1, 3)), 900);
    return () => clearInterval(timer);
  }, [step]);

  const missing = pendingFields(favor);
  const currentQuestion: MissingField | undefined = missing[0];

  useEffect(() => {
    if (step === "questions" && !currentQuestion) setStep("route");
  }, [step, currentQuestion]);

  async function runInterpretation(fullText: string) {
    setError(false);
    setStep("analyzing");
    setFavor((current) => ({ ...current, status: "AI_PROCESSING" }));
    try {
      const result = await interpret({
        data: { text: fullText, languageCode, countryCode, currencyCode },
      });
      setFavor((current) => {
        const merged = applyInterpretation({ ...current, status: "READY_FOR_REVIEW" }, result);
        const recommendation = recommendPriceForFavor(merged);
        return {
          ...merged,
          aiInterpretation: merged.aiInterpretation
            ? { ...merged.aiInterpretation, rawInput: fullText }
            : null,
          budget: {
            ...merged.budget,
            recommendedMin: recommendation.min,
            recommendedMax: recommendation.max,
          },
        };
      });
      const stillMissing = pendingFields(
        applyInterpretation({ ...favor, status: "READY_FOR_REVIEW" }, result),
      );
      setStep(stillMissing.length > 0 ? "questions" : "route");
    } catch {
      setError(true);
      setStep("compose");
      setFavor((current) => ({ ...current, status: "DRAFT" }));
    }
  }

  function submitAnswer(skip = false) {
    if (!currentQuestion) return;
    if (skip) {
      setFavor((current) => ({
        ...current,
        aiInterpretation: current.aiInterpretation
          ? {
              ...current.aiInterpretation,
              missingFields: current.aiInterpretation.missingFields.filter(
                (field) => field !== currentQuestion,
              ),
            }
          : null,
      }));
      setAnswer("");
      return;
    }
    const value = answer.trim();
    if (!value) return;
    const combined = `${conversation.current}\n${t(questionKeyFor(currentQuestion))} ${value}`;
    conversation.current = combined;
    setAnswer("");
    void runInterpretation(combined);
  }

  const startManually = () => {
    setFavor((current) => ({
      ...current,
      description: text.trim(),
      status: "READY_FOR_REVIEW",
      pickupLocation: current.pickupLocation ?? createLocation("pickup"),
    }));
    setStep("route");
  };

  const reviewRows: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    section: EditorSection;
  }> = [
    {
      icon: Sparkles,
      label: t("field.favor"),
      value: favor.description || t("common.notDefined"),
      section: "description",
    },
    {
      icon: Tag,
      label: t("field.category"),
      value: t(`category.${favor.category}` as TranslationKey),
      section: "category",
    },
    {
      icon: MapPin,
      label: t("field.pickup"),
      value: favor.pickupLocation?.label || t("common.notDefined"),
      section: "pickup",
    },
    {
      icon: MapPin,
      label: t("field.destination"),
      value: favor.destinationLocation?.label || t("common.notDefined"),
      section: "destination",
    },
    {
      icon: MapPin,
      label: t("field.stops"),
      value: favor.additionalStops.length
        ? favor.additionalStops.map((stop) => stop.label || "—").join(" · ")
        : t("common.notDefined"),
      section: "stops",
    },
    {
      icon: Hourglass,
      label: t("field.waiting"),
      value: favor.waitingRequired
        ? `${t("common.yes")}${favor.waitingDuration ? ` · ${favor.waitingDuration}` : ""}`
        : t("waiting.no"),
      section: "waiting",
    },
    {
      icon: Clock3,
      label: t("field.when"),
      value: scheduleLabel(favor, t, languageCode),
      section: "schedule",
    },
    {
      icon: Wallet,
      label: t("field.budget"),
      value: budgetLabel(favor, languageCode, t),
      section: "budget",
    },
    {
      icon: Pencil,
      label: t("field.instructions"),
      value: favor.specialInstructions || t("common.notDefined"),
      section: "instructions",
    },
  ];

  const back = () => {
    if (step === "compose") return onClose();
    if (step === "questions") return setStep("compose");
    if (step === "route") return setStep(missing.length ? "questions" : "compose");
    if (step === "review") return setStep("route");
    if (step === "final") return setStep("review");
    onClose();
  };

  const recommendation = recommendPriceForFavor(favor);
  const locale = localeFor(languageCode);

  return (
    <main className="relative min-h-screen bg-background pb-28">
      <div className="ambient-grid" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-2xl px-5 pt-5 sm:px-8 lg:max-w-3xl lg:pt-8">
        <header className="flex items-center justify-between">
          <Button variant="ghost" size="iconLg" aria-label={t("common.back")} onClick={back}>
            <ArrowLeft />
          </Button>
          <AnyoneBrand compact />
          <Button variant="ghost" size="iconLg" aria-label={t("common.close")} onClick={onClose}>
            <X />
          </Button>
        </header>

        <div key={step} className="step-enter mt-8">
          {step === "compose" && (
            <section>
              <p className="eyebrow">{t("create.entry.eyebrow")}</p>
              <h1 className="screen-title text-[2.25rem] sm:text-[2.6rem]">
                {t("create.entry.title")}
              </h1>
              <p className="screen-copy max-w-xl">{t("create.entry.subtitle")}</p>

              <div className="mt-7 rounded-[28px] bg-card p-4 shadow-panel sm:p-5">
                <label className="sr-only" htmlFor="favor-text">
                  {t("create.entry.placeholder")}
                </label>
                <Textarea
                  id="favor-text"
                  autoFocus
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={t("create.entry.placeholder")}
                  className="min-h-44 resize-none rounded-2xl border-transparent bg-surface p-4 text-base leading-relaxed sm:min-h-52"
                />
                <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
                  {t("create.entry.hint")}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4"
                >
                  <strong className="text-sm font-bold text-destructive">
                    {t("create.error.title")}
                  </strong>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {t("create.error.body")}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-11 px-2"
                    onClick={startManually}
                  >
                    {t("create.error.manual")}
                  </Button>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
                <Button
                  className="w-full sm:w-auto sm:min-w-56"
                  size="touch"
                  disabled={text.trim().length < 3}
                  onClick={() => {
                    conversation.current = text.trim();
                    void runInterpretation(text.trim());
                  }}
                >
                  {t("create.entry.cta")}
                  <ChevronRight />
                </Button>
                {languageCode === "es" && (
                  <Button
                    variant="ghost"
                    size="touch"
                    className="w-full sm:w-auto"
                    onClick={() => setText(EXAMPLE_ES)}
                  >
                    {t("create.entry.example")}
                  </Button>
                )}
              </div>
            </section>
          )}

          {step === "analyzing" && (
            <section className="grid min-h-[60vh] place-items-center text-center">
              <div>
                <span className="mx-auto grid size-20 animate-pulse place-items-center rounded-[28px] bg-brand-soft text-primary">
                  <Sparkles className="size-9" />
                </span>
                <p className="mt-8 font-display text-2xl font-extrabold text-foreground">
                  {t(ANALYZING_KEYS[phase] ?? ANALYZING_KEYS[0]!)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("create.analyzing.caption")}
                </p>
                <div className="mx-auto mt-7 grid w-44 grid-cols-4 gap-1.5">
                  {ANALYZING_KEYS.map((key, index) => (
                    <span
                      key={key}
                      className={
                        index <= phase
                          ? "h-1.5 rounded-full bg-primary"
                          : "h-1.5 rounded-full bg-muted"
                      }
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {step === "questions" && currentQuestion && (
            <section>
              <p className="eyebrow">{t("create.questions.eyebrow")}</p>
              <h1 className="screen-title">{t(questionKeyFor(currentQuestion))}</h1>
              <p className="screen-copy">{t("create.questions.subtitle")}</p>
              <Textarea
                autoFocus
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={t("create.questions.placeholder")}
                className="mt-6 min-h-28 rounded-2xl bg-card p-4 text-base shadow-soft"
              />
              <Button
                className="mt-4 w-full"
                size="touch"
                disabled={!answer.trim()}
                onClick={() => submitAnswer()}
              >
                {t("common.continue")}
                <ChevronRight />
              </Button>
              <Button
                className="mt-2 w-full"
                variant="ghost"
                size="touch"
                onClick={() => submitAnswer(true)}
              >
                {t("create.questions.skip")}
              </Button>
            </section>
          )}

          {step === "route" && (
            <section>
              <p className="eyebrow">{t("review.eyebrow")}</p>
              <h1 className="screen-title">{t("route.title")}</h1>
              <p className="screen-copy">{t("route.subtitle")}</p>
              <div className="mt-6">
                <RouteEditor
                  favor={favor}
                  languageCode={languageCode}
                  t={t}
                  onChange={(next) => setFavor(next)}
                />
              </div>
              <Button
                className="mt-6 w-full sm:w-auto sm:min-w-52"
                size="touch"
                onClick={() => {
                  setFavor((current) => withGeo(current));
                  setStep("review");
                }}
              >
                {t("route.done")}
                <ChevronRight />
              </Button>
            </section>
          )}

          {(step === "review" || step === "final") && (
            <section>
              <p className="eyebrow">
                {step === "review" ? t("review.eyebrow") : t("final.eyebrow")}
              </p>
              <h1 className="screen-title">
                {step === "review" ? t("review.title") : t("final.title")}
              </h1>
              <p className="screen-copy">
                {step === "review" ? t("review.subtitle") : t("final.subtitle")}
              </p>

              {favor.aiInterpretation?.summary && (
                <div className="mt-6 flex gap-3 rounded-2xl bg-brand-soft p-4 text-sm leading-relaxed text-brand-dark">
                  <Sparkles className="mt-0.5 size-5 shrink-0" />
                  <p>{favor.aiInterpretation.summary}</p>
                </div>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {reviewRows.map((row) => (
                  <article key={row.section} className="review-card">
                    <span className="review-icon">
                      <row.icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {row.label}
                      </p>
                      <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-foreground">
                        {row.value}
                      </p>
                    </div>
                    {step === "review" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 shrink-0 px-2 text-primary"
                        onClick={() => setEditing(row.section)}
                      >
                        {t("common.edit")}
                      </Button>
                    )}
                  </article>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  {t("budget.recommended")}
                </p>
                <p className="mt-1 font-display text-lg font-extrabold text-brand-dark">
                  {formatMoney(recommendation.min, recommendation.currencyCode, locale)} —{" "}
                  {formatMoney(recommendation.max, recommendation.currencyCode, locale)}{" "}
                  {recommendation.currencyCode}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t("budget.note")}
                </p>
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row-reverse">
                {step === "review" ? (
                  <>
                    <Button
                      className="w-full sm:w-auto sm:min-w-52"
                      size="touch"
                      onClick={() => {
                        setFavor((current) => ({ ...current, status: "READY_TO_PUBLISH" }));
                        setStep("final");
                      }}
                    >
                      {t("review.cta")}
                      <ChevronRight />
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      variant="ghost"
                      size="touch"
                      onClick={() => setStep("compose")}
                    >
                      {t("review.rewrite")}
                    </Button>
                  </>
                ) : (
                  <>
                    {publishError && (
                      <p role="alert" className="w-full text-sm font-semibold text-destructive">
                        No pudimos publicar tu favor. Inténtalo de nuevo.
                      </p>
                    )}
                    <Button
                      className="w-full sm:w-auto sm:min-w-52"
                      size="touch"
                      disabled={publishing}
                      onClick={async () => {
                        const draft: Favor = withGeo({ ...favor, status: "PUBLISHED" });
                        setPublishing(true);
                        setPublishError(null);
                        try {
                          // Success is shown only after the database confirms the write.
                          const saved = await onPublished?.(draft);
                          setFavor(saved ?? draft);
                          setStep("published");
                        } catch (error) {
                          console.error("[create-favor] publish failed", error);
                          setPublishError(error instanceof Error ? error.message : "publish_failed");
                        } finally {
                          setPublishing(false);
                        }
                      }}
                    >
                      {t("final.publish")}
                      <Check />
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      variant="secondary"
                      size="touch"
                      onClick={() => setStep("review")}
                    >
                      {t("final.secondary")}
                    </Button>
                  </>
                )}
              </div>
            </section>
          )}

          {step === "published" && (
            <section className="mx-auto w-full max-w-md py-6 text-center">
              <span className="mx-auto grid size-20 place-items-center rounded-[28px] bg-brand-soft text-primary">
                <PartyPopper className="size-9" />
              </span>
              <h1 className="mt-7 font-display text-3xl font-extrabold text-foreground">
                {t("published.title")}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t("published.body")}
              </p>
              <span className="mt-5 inline-flex rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-primary">
                {t(`status.${favor.status}` as TranslationKey)}
              </span>
              <div className="mt-7 grid gap-3 text-left">
                {reviewRows
                  .filter((row) => row.value && row.value !== t("common.notDefined"))
                  .map((row) => (
                    <div
                      key={row.label}
                      className="rounded-2xl border border-border bg-card p-4 shadow-soft"
                    >
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {row.label}
                      </p>
                      <p className="mt-1 text-sm font-semibold leading-relaxed text-foreground">
                        {row.value}
                      </p>
                    </div>
                  ))}
              </div>
              <Button className="mt-8 w-full" size="touch" onClick={onClose}>
                {t("published.cta")}
              </Button>
            </section>
          )}

        </div>
      </div>

      <FavorEditorSheet
        section={editing}
        favor={favor}
        t={t}
        languageCode={languageCode}
        onChange={setFavor}
        onClose={() => setEditing(null)}
      />
    </main>
  );
}
