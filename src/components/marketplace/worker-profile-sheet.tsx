import { BadgeCheck, CalendarDays, MapPin, Star } from "lucide-react";

import { WorkerAvatar } from "@/components/marketplace/worker-avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { TranslationKey, Translator } from "@/lib/i18n";
import type { WorkerProfile } from "@/lib/marketplace-model";
import { useMarketplace } from "@/lib/marketplace-store";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-extrabold">{value}</p>
    </div>
  );
}

/** Worker profile keeps the worker identity (red + black) even inside the client app. */
export function WorkerProfileSheet({
  worker,
  t,
  locale,
  onClose,
}: {
  worker: WorkerProfile;
  t: Translator;
  locale: string;
  onClose: () => void;
}) {
  const marketplace = useMarketplace();
  const reviews = marketplace.reviews[worker.id] ?? [];
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="worker-theme max-h-[92vh] overflow-y-auto rounded-t-[28px] border-border bg-background p-6 text-foreground sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md sm:rounded-[28px]"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">{t("profile.title")}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex items-center gap-4">
          <WorkerAvatar worker={worker} size="lg" />
          <div className="min-w-0">
            <p className="font-display text-xl font-extrabold">{worker.name}</p>
            <p className="text-sm text-muted-foreground">{worker.headline}</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{worker.bio}</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Stat label={t("worker.stats.rating")} value={`${worker.rating.average.toFixed(1)} ★`} />
          <Stat label={t("worker.stats.completed")} value={String(worker.rating.completedFavors)} />
          <Stat label={t("worker.stats.completion")} value={`${worker.rating.completionRate}%`} />
          <Stat
            label={t("worker.stats.cancellation")}
            value={`${worker.rating.cancellationRate}%`}
          />
        </div>

        <ul className="mt-5 space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
            {worker.verification.identityVerified ? t("offer.verified") : t("offer.unverified")}
          </li>
          <li className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            {t("profile.zone")}: {worker.operationZone}
          </li>
          <li className="flex items-center gap-2">
            <Star className="size-4 text-primary" aria-hidden="true" />
            {t("offer.languages")}: {worker.languages.join(", ")}
          </li>
          <li className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
            {t("worker.joined")}{" "}
            {new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
              new Date(worker.joinedAt),
            )}
          </li>
        </ul>

        <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {t("profile.types")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {worker.categories.map((category) => (
            <span
              key={category}
              className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-primary"
            >
              {t(`category.${category}` as TranslationKey)}
            </span>
          ))}
        </div>

        <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {t("profile.reviews")}
        </p>
        <div className="mt-2 space-y-2">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="flex items-center justify-between gap-3 text-sm font-bold">
                {review.author}
                <span className="inline-flex items-center gap-1 text-primary">
                  <Star className="size-3.5 fill-current" aria-hidden="true" />
                  {review.rating.toFixed(1)}
                </span>
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">“{review.body}”</p>
            </article>
          ))}
        </div>

        <Button className="mt-5 w-full" variant="secondary" size="touch" onClick={onClose}>
          {t("common.close")}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
