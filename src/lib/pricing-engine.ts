/**
 * AnyOne¹⁶ — Price recommendation engine (modular, Stage 2).
 *
 * This is deliberately a simple, replaceable heuristic. The signal interface
 * below is what a future engine (distance, demand, worker supply, local market,
 * history) will receive. The client always keeps control of the final price:
 * the range is guidance, never a constraint.
 */

import type { Favor } from "./favor-model";

export type PriceSignals = {
  category: Favor["category"];
  stopCount: number;
  waitingRequired: boolean;
  urgency: Favor["schedule"]["urgency"];
  itemCount: number | null;
  descriptionLength: number;
  currencyCode: string;
  countryCode: string;
  /** Reserved for later stages. */
  distanceKm?: number | null;
  estimatedMinutes?: number | null;
  localDemandIndex?: number | null;
  workerSupplyIndex?: number | null;
};

export type PriceRecommendation = {
  min: number;
  max: number;
  currencyCode: string;
  /** Human readable reasons, used for the "why" hint in the UI. */
  factors: string[];
};

/** Rough per-currency base unit so the engine is never COP-specific. */
const BASE_BY_CURRENCY: Record<string, number> = {
  COP: 20000,
  USD: 6,
  EUR: 6,
  GBP: 5,
  MXN: 100,
  BRL: 30,
  CLP: 5000,
  ARS: 6000,
  PEN: 20,
  CAD: 8,
  AUD: 9,
  JPY: 900,
  CNY: 40,
  CHF: 6,
};

const CATEGORY_WEIGHT: Partial<Record<Favor["category"], number>> = {
  laundry: 1.1,
  packages: 1,
  shopping: 1.25,
  documents: 1,
  waiting: 1.35,
  flowers: 1.1,
  gifts: 1.1,
  pets: 1.3,
  other: 1,
  uncategorized: 1,
};

function roundTo(value: number, currencyCode: string) {
  const step =
    currencyCode === "COP" || currencyCode === "CLP" ? 1000 : currencyCode === "JPY" ? 100 : 1;
  return Math.max(step, Math.round(value / step) * step);
}

export function buildPriceSignals(favor: Favor): PriceSignals {
  return {
    category: favor.category,
    stopCount: favor.additionalStops.length,
    waitingRequired: favor.waitingRequired,
    urgency: favor.schedule.urgency,
    itemCount: favor.itemCount,
    descriptionLength: favor.description.length,
    currencyCode: favor.budget.currencyCode,
    countryCode: favor.countryCode,
  };
}

export function recommendPrice(signals: PriceSignals): PriceRecommendation {
  const base = BASE_BY_CURRENCY[signals.currencyCode] ?? 10;
  const factors: string[] = [];
  let multiplier = CATEGORY_WEIGHT[signals.category] ?? 1;

  if (signals.stopCount > 0) {
    multiplier += signals.stopCount * 0.2;
    factors.push("stops");
  }
  if (signals.waitingRequired) {
    multiplier += 0.3;
    factors.push("waiting");
  }
  if (signals.urgency === "high") {
    multiplier += 0.25;
    factors.push("urgency");
  }
  if (signals.itemCount && signals.itemCount > 3) {
    multiplier += 0.15;
    factors.push("items");
  }
  if (signals.descriptionLength > 240) {
    multiplier += 0.1;
    factors.push("complexity");
  }

  const center = base * multiplier;
  return {
    min: roundTo(center * 0.85, signals.currencyCode),
    max: roundTo(center * 1.25, signals.currencyCode),
    currencyCode: signals.currencyCode,
    factors,
  };
}

export const recommendPriceForFavor = (favor: Favor) => recommendPrice(buildPriceSignals(favor));
