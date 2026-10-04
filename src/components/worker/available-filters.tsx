/**
 * Stage 6 — simple, premium filters for the worker "Available" list.
 * Filtering only: distance, category, date, time, budget and number of stops.
 * No ranking algorithm.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FAVOR_CATEGORIES, type Favor, type FavorCategory } from "@/lib/favor-model";
import { totalRouteKm } from "@/lib/geo";
import type { TranslationKey, Translator } from "@/lib/i18n";
import { distanceKmFor } from "@/lib/marketplace-model";

export type AvailableFilters = {
  maxDistanceKm: number | null;
  category: FavorCategory | null;
  date: string | null;
  time: string | null;
  minBudget: number | null;
  stops: number | null;
};

export const emptyFilters: AvailableFilters = {
  maxDistanceKm: null,
  category: null,
  date: null,
  time: null,
  minBudget: null,
  stops: null,
};

const DISTANCES = [2, 5, 10, 25];
const STOPS = [0, 1, 2];

export function applyFilters(favors: Favor[], filters: AvailableFilters) {
  return favors.filter((favor) => {
    if (filters.category && favor.category !== filters.category) return false;
    if (filters.date && favor.schedule.date !== filters.date) return false;
    if (filters.time && favor.schedule.time !== filters.time) return false;
    if (filters.minBudget !== null && (favor.budget.amount ?? 0) < filters.minBudget) return false;
    if (filters.stops !== null && favor.additionalStops.length !== filters.stops) return false;
    if (filters.maxDistanceKm !== null) {
      const km = totalRouteKm(favor) ?? distanceKmFor(favor);
      if (km > filters.maxDistanceKm) return false;
    }
    return true;
  });
}

export function AvailableFiltersBar({
  filters,
  onChange,
  t,
  results,
}: {
  filters: AvailableFilters;
  onChange: (next: AvailableFilters) => void;
  t: Translator;
  results: number;
}) {
  const set = (patch: Partial<AvailableFilters>) => onChange({ ...filters, ...patch });

  return (
    <section className="mt-5 rounded-[22px] border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {t("filters.title")}
        </p>
        <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => onChange(emptyFilters)}>
          {t("filters.clear")}
        </Button>
      </div>

      <div className="mt-3 space-y-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{t("filters.distance")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-10 rounded-xl"
              variant={filters.maxDistanceKm === null ? "default" : "secondary"}
              aria-pressed={filters.maxDistanceKm === null}
              onClick={() => set({ maxDistanceKm: null })}
            >
              {t("filters.any")}
            </Button>
            {DISTANCES.map((km) => (
              <Button
                key={km}
                size="sm"
                className="h-10 rounded-xl"
                variant={filters.maxDistanceKm === km ? "default" : "secondary"}
                aria-pressed={filters.maxDistanceKm === km}
                onClick={() => set({ maxDistanceKm: km })}
              >
                {km} km
              </Button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground">{t("filters.category")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-10 rounded-xl"
              variant={filters.category === null ? "default" : "secondary"}
              aria-pressed={filters.category === null}
              onClick={() => set({ category: null })}
            >
              {t("filters.any")}
            </Button>
            {FAVOR_CATEGORIES.map((category) => (
              <Button
                key={category}
                size="sm"
                className="h-10 rounded-xl"
                variant={filters.category === category ? "default" : "secondary"}
                aria-pressed={filters.category === category}
                onClick={() => set({ category })}
              >
                {t(`category.${category}` as TranslationKey)}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground">{t("filters.stops")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-10 rounded-xl"
              variant={filters.stops === null ? "default" : "secondary"}
              aria-pressed={filters.stops === null}
              onClick={() => set({ stops: null })}
            >
              {t("filters.any")}
            </Button>
            {STOPS.map((count) => (
              <Button
                key={count}
                size="sm"
                className="h-10 rounded-xl"
                variant={filters.stops === count ? "default" : "secondary"}
                aria-pressed={filters.stops === count}
                onClick={() => set({ stops: count })}
              >
                {count}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="filter-date">{t("filters.date")}</Label>
            <Input
              id="filter-date"
              type="date"
              value={filters.date ?? ""}
              onChange={(event) => set({ date: event.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="filter-time">{t("filters.time")}</Label>
            <Input
              id="filter-time"
              type="time"
              value={filters.time ?? ""}
              onChange={(event) => set({ time: event.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="filter-budget">{t("filters.budget")}</Label>
            <Input
              id="filter-budget"
              inputMode="numeric"
              value={filters.minBudget ?? ""}
              onChange={(event) => {
                const digits = event.target.value.replace(/[^\d]/g, "");
                set({ minBudget: digits ? Number(digits) : null });
              }}
            />
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs font-semibold text-muted-foreground">
        {results} {t("filters.results")}
      </p>
    </section>
  );
}
