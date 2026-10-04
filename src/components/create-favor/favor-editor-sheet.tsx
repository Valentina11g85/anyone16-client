import { RouteEditor } from "@/components/create-favor/route-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  formatMoney,
  FAVOR_CATEGORIES,
  SCHEDULE_PRESETS,
  URGENCY_LEVELS,
  type Favor,
} from "@/lib/favor-model";
import { localeFor, type TranslationKey, type Translator } from "@/lib/i18n";
import { currencies, formatCurrencyName } from "@/lib/market-config";
import { recommendPriceForFavor } from "@/lib/pricing-engine";
import { presetKey } from "./favor-utils";

export type EditorSection =
  | "description"
  | "category"
  | "pickup"
  | "destination"
  | "stops"
  | "schedule"
  | "waiting"
  | "budget"
  | "instructions";

const SECTION_TITLES: Record<EditorSection, TranslationKey> = {
  description: "field.favor",
  category: "category.title",
  pickup: "route.title",
  destination: "route.title",
  stops: "route.title",
  schedule: "schedule.title",
  waiting: "waiting.title",
  budget: "budget.title",
  instructions: "instructions.title",
};

const ROUTE_SECTIONS: EditorSection[] = ["pickup", "destination", "stops"];

export function FavorEditorSheet({
  section,
  favor,
  t,
  languageCode,
  onChange,
  onClose,
}: {
  section: EditorSection | null;
  favor: Favor;
  t: Translator;
  languageCode: string;
  onChange: (next: Favor) => void;
  onClose: () => void;
}) {
  const update = (patch: Partial<Favor>) =>
    onChange({ ...favor, ...patch, updatedAt: new Date().toISOString() });
  const recommendation = recommendPriceForFavor(favor);
  const locale = localeFor(languageCode);

  return (
    <Sheet open={section !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className={`max-h-[92vh] overflow-y-auto rounded-t-[28px] border-border p-6 sm:bottom-6 sm:left-auto sm:right-6 sm:top-6 sm:rounded-[28px] ${
          section && ROUTE_SECTIONS.includes(section) ? "sm:max-w-2xl" : "sm:max-w-md"
        }`}
      >
        <SheetHeader className="px-0">
          <SheetTitle className="font-display text-2xl">
            {section ? t(SECTION_TITLES[section]) : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5 pb-4">
          {section === "description" && (
            <Textarea
              className="min-h-36 rounded-2xl bg-surface text-base"
              value={favor.description}
              onChange={(event) => update({ description: event.target.value })}
            />
          )}

          {section === "category" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {FAVOR_CATEGORIES.map((category) => (
                  <Button
                    key={category}
                    type="button"
                    size="touch"
                    variant={favor.category === category ? "default" : "soft"}
                    onClick={() => update({ category })}
                  >
                    {t(`category.${category}` as TranslationKey)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("category.hint")}</p>
            </div>
          )}

          {section && ROUTE_SECTIONS.includes(section) && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("route.subtitle")}</p>
              <RouteEditor
                favor={favor}
                languageCode={languageCode}
                t={t}
                onChange={onChange}
              />
            </div>
          )}


          {section === "schedule" && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {SCHEDULE_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    className="h-11 rounded-full px-4"
                    variant={favor.schedule.preset === preset ? "default" : "soft"}
                    onClick={() => update({ schedule: { ...favor.schedule, preset } })}
                  >
                    {t(presetKey(preset))}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="favor-date">{t("schedule.date")}</Label>
                  <Input
                    id="favor-date"
                    type="date"
                    value={favor.schedule.date ?? ""}
                    onChange={(event) =>
                      update({
                        schedule: {
                          ...favor.schedule,
                          date: event.target.value || null,
                          preset: "custom",
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="favor-time">{t("schedule.time")}</Label>
                  <Input
                    id="favor-time"
                    type="time"
                    value={favor.schedule.time ?? ""}
                    onChange={(event) =>
                      update({
                        schedule: { ...favor.schedule, time: event.target.value || null },
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="favor-window">{t("schedule.window")}</Label>
                <Input
                  id="favor-window"
                  value={favor.schedule.timeWindow ?? ""}
                  placeholder={t("schedule.windowPlaceholder")}
                  onChange={(event) =>
                    update({
                      schedule: { ...favor.schedule, timeWindow: event.target.value || null },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("schedule.urgency")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {URGENCY_LEVELS.map((level) => (
                    <Button
                      key={level}
                      type="button"
                      size="touch"
                      variant={favor.schedule.urgency === level ? "default" : "soft"}
                      onClick={() => update({ schedule: { ...favor.schedule, urgency: level } })}
                    >
                      {t(`urgency.${level}` as TranslationKey)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === "waiting" && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Button
                  type="button"
                  size="touch"
                  variant={favor.waitingRequired ? "default" : "soft"}
                  onClick={() => update({ waitingRequired: true })}
                >
                  {t("waiting.yes")}
                </Button>
                <Button
                  type="button"
                  size="touch"
                  variant={!favor.waitingRequired ? "default" : "soft"}
                  onClick={() => update({ waitingRequired: false, waitingDuration: null })}
                >
                  {t("waiting.no")}
                </Button>
              </div>
              {favor.waitingRequired && (
                <div className="space-y-2">
                  <Label htmlFor="favor-wait">{t("waiting.duration")}</Label>
                  <Input
                    id="favor-wait"
                    value={favor.waitingDuration ?? ""}
                    placeholder={t("waiting.durationPlaceholder")}
                    onChange={(event) => update({ waitingDuration: event.target.value || null })}
                  />
                </div>
              )}
            </div>
          )}

          {section === "budget" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="favor-amount">{t("budget.amount")}</Label>
                <Input
                  id="favor-amount"
                  inputMode="numeric"
                  value={favor.budget.amount ?? ""}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/[^\d.]/g, "");
                    update({
                      budget: { ...favor.budget, amount: digits ? Number(digits) : null },
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("budget.currency")}</Label>
                <Select
                  value={favor.budget.currencyCode}
                  onValueChange={(value) =>
                    update({
                      budget: { ...favor.budget, currencyCode: value },
                      currencyCode: value,
                    })
                  }
                >
                  <SelectTrigger className="h-14 rounded-2xl border-border bg-surface px-4 text-base shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 rounded-2xl">
                    {currencies.map((currency) => (
                      <SelectItem
                        key={currency.code}
                        value={currency.code}
                        className="min-h-11 rounded-xl"
                      >
                        {formatCurrencyName(currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-2xl bg-brand-soft p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  {t("budget.recommended")}
                </p>
                <p className="mt-1 font-display text-lg font-extrabold text-brand-dark">
                  {formatMoney(recommendation.min, recommendation.currencyCode, locale)} —{" "}
                  {formatMoney(recommendation.max, recommendation.currencyCode, locale)}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-10 px-2"
                  onClick={() =>
                    update({
                      budget: {
                        ...favor.budget,
                        amount: Math.round((recommendation.min + recommendation.max) / 2),
                        recommendedMin: recommendation.min,
                        recommendedMax: recommendation.max,
                      },
                    })
                  }
                >
                  {t("budget.useRecommended")}
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("budget.note")}</p>
            </div>
          )}

          {section === "instructions" && (
            <Textarea
              className="min-h-32 rounded-2xl bg-surface text-base"
              value={favor.specialInstructions}
              placeholder={t("instructions.placeholder")}
              onChange={(event) => update({ specialInstructions: event.target.value })}
            />
          )}
        </div>

        <Button className="w-full" size="touch" onClick={onClose}>
          {t("common.save")}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
