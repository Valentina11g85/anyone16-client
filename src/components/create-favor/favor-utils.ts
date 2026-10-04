import type { FavorInterpretation } from "@/lib/anyone-ai.functions";
import {
  createLocation,
  formatMoney,
  type Favor,
  type MissingField,
  type SchedulePreset,
} from "@/lib/favor-model";
import { localeFor, type TranslationKey, type Translator } from "@/lib/i18n";

/** Merge an AnyOne AI interpretation into the working draft, never overwriting with nothing. */
export function applyInterpretation(favor: Favor, ai: FavorInterpretation): Favor {
  const next: Favor = { ...favor };

  if (ai.description.trim()) next.description = ai.description.trim();
  next.category = ai.category;

  if (ai.pickup?.label?.trim()) {
    next.pickupLocation = {
      ...(favor.pickupLocation ?? createLocation("pickup")),
      label: ai.pickup.label.trim(),
      details: ai.pickup.details ?? "",
    };
  }
  if (ai.destination?.label?.trim()) {
    next.destinationLocation = {
      ...(favor.destinationLocation ?? createLocation("destination")),
      label: ai.destination.label.trim(),
      details: ai.destination.details ?? "",
    };
  }
  if (ai.stops.length) {
    next.additionalStops = ai.stops
      .filter((stop) => stop.label.trim())
      .map((stop) => ({ ...createLocation("stop", stop.label.trim()), details: stop.details }));
  }

  next.schedule = {
    preset: ai.schedulePreset ?? favor.schedule.preset,
    date: ai.date ?? favor.schedule.date,
    time: ai.time ?? favor.schedule.time,
    timeWindow: ai.timeWindow ?? favor.schedule.timeWindow,
    urgency: ai.urgency ?? favor.schedule.urgency,
  };

  next.waitingRequired = ai.waitingRequired || favor.waitingRequired;
  next.waitingDuration = ai.waitingDuration ?? favor.waitingDuration;
  next.itemCount = ai.itemCount ?? favor.itemCount;

  next.budget = {
    ...favor.budget,
    amount: ai.budgetAmount ?? favor.budget.amount,
    currencyCode: ai.budgetCurrency?.trim() || favor.budget.currencyCode,
  };

  if (ai.specialInstructions.trim()) next.specialInstructions = ai.specialInstructions.trim();

  next.aiInterpretation = {
    rawInput: favor.aiInterpretation?.rawInput ?? "",
    summary: ai.summary,
    confidence: ai.confidence,
    missingFields: ai.missingFields,
    notes: ai.notes,
    interpretedAt: new Date().toISOString(),
  };
  next.updatedAt = new Date().toISOString();
  return next;
}

/** Recompute which essential details are still missing from the draft itself. */
export function pendingFields(favor: Favor): MissingField[] {
  const declared = favor.aiInterpretation?.missingFields ?? [];
  return declared.filter((field) => {
    if (field === "pickup") return !favor.pickupLocation?.label;
    if (field === "destination") return !favor.destinationLocation?.label;
    if (field === "schedule")
      return !favor.schedule.preset && !favor.schedule.date && !favor.schedule.timeWindow;
    if (field === "budget") return favor.budget.amount === null;
    return !favor.description;
  });
}

export const questionKeyFor = (field: MissingField): TranslationKey =>
  `question.${field}` as TranslationKey;

const PRESET_KEYS: Record<SchedulePreset, TranslationKey> = {
  now: "schedule.now",
  today: "schedule.today",
  afternoon: "schedule.afternoon",
  tonight: "schedule.tonight",
  tomorrow: "schedule.tomorrow",
  custom: "schedule.custom",
};

export function scheduleLabel(favor: Favor, t: Translator, languageCode: string) {
  const parts: string[] = [];
  const preset = favor.schedule.preset;
  if (preset && preset !== "custom") parts.push(t(PRESET_KEYS[preset]));
  if (favor.schedule.date) {
    const date = new Date(`${favor.schedule.date}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      parts.push(
        new Intl.DateTimeFormat(localeFor(languageCode), {
          day: "numeric",
          month: "long",
        }).format(date),
      );
    }
  }
  if (favor.schedule.time) parts.push(favor.schedule.time);
  if (favor.schedule.timeWindow) parts.push(favor.schedule.timeWindow);
  return parts.length ? parts.join(" · ") : t("common.notDefined");
}

export const presetKey = (preset: SchedulePreset) => PRESET_KEYS[preset];

export function budgetLabel(favor: Favor, languageCode: string, t: Translator) {
  if (favor.budget.amount === null) return t("common.notDefined");
  return `${formatMoney(favor.budget.amount, favor.budget.currencyCode, localeFor(languageCode))} ${favor.budget.currencyCode}`;
}
