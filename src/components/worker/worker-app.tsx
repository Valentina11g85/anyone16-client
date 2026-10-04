import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  Clock3,
  Flag,
  Hourglass,
  MapPin,
  MessageSquare,
  Star,
  Timer,
  UserRound,
  Wallet,
  Zap,
} from "lucide-react";

import { ChatPanel } from "@/components/marketplace/chat-panel";
import { FavorRoute } from "@/components/marketplace/favor-route";
import {
  applyFilters,
  AvailableFiltersBar,
  emptyFilters,
  type AvailableFilters,
} from "@/components/worker/available-filters";
import { StatusBadge } from "@/components/marketplace/status-timeline";
import { WorkerTracking } from "@/components/worker/worker-tracking";
import { WorkerAvatar } from "@/components/marketplace/worker-avatar";
import { budgetLabel, scheduleLabel } from "@/components/create-favor/favor-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatMoney, type Favor } from "@/lib/favor-model";
import { WorkerEarnings } from "@/components/payments/worker-earnings";
import { WorkerTrustPanel } from "@/components/trust/worker-trust-panel";
import { createTranslator, localeFor, type TranslationKey, type Translator } from "@/lib/i18n";
import { formatDistance, formatDuration, totalRouteKm } from "@/lib/geo";
import { createOffer, distanceKmFor, estimatedMinutes } from "@/lib/marketplace-model";
import {
  addOffer,
  currentWorkerFrom,
  messagesForFavor,
  offersByWorker,
  openFavorsForWorker,
  pushMessage,
  setAvailability,
  useMarketplace,
} from "@/lib/marketplace-store";

type WorkerTab = "available" | "offers" | "profile";

/** Lets other screens (notifications, history) open worker mode on a given tab. */
let requestedWorkerTab: WorkerTab | null = null;
export function requestWorkerTab(tab: WorkerTab) {
  requestedWorkerTab = tab;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-extrabold text-foreground">{value}</p>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <article className="flex gap-3 rounded-2xl border border-border bg-card p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-semibold leading-relaxed">{value}</p>
      </div>
    </article>
  );
}

function FavorCard({
  favor,
  languageCode,
  t,
  locale,
  onOpen,
}: {
  favor: Favor;
  languageCode: string;
  t: Translator;
  locale: string;
  onOpen: () => void;
}) {
  const distanceKm = distanceKmFor(favor);
  return (
    <article className="rounded-[22px] border border-border bg-card p-4 shadow-soft transition-shadow hover:shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary">
          {t(`category.${favor.category}` as TranslationKey)}
        </span>
        <StatusBadge status={favor.status} t={t} />
      </div>
      <p className="mt-3 text-sm font-semibold leading-relaxed text-foreground">
        {favor.description}
      </p>
      <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          {favor.pickupLocation?.label || t("common.notDefined")}
        </div>
        <div className="flex items-center gap-2">
          <Flag className="size-3.5 shrink-0" aria-hidden="true" />
          {favor.destinationLocation?.label || t("common.notDefined")}
        </div>
        <div className="flex items-center gap-2">
          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
          {scheduleLabel(favor, t, languageCode)}
        </div>
        <div className="flex items-center gap-2">
          <Timer className="size-3.5 shrink-0" aria-hidden="true" />
          {formatDistance(totalRouteKm(favor) ?? distanceKm, languageCode)} · ≈{" "}
          {formatDuration(favor.geo.totalMinutes ?? estimatedMinutes(favor))}
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          {favor.geo.zoneLabel ?? favor.geo.city ?? t("privacy.zone")}
        </div>
        <div className="flex items-center gap-2">
          <Flag className="size-3.5 shrink-0" aria-hidden="true" />
          {favor.additionalStops.length} {t("filters.stops")}
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("worker.offer.clientPrice")}
          </p>
          <p className="font-display text-lg font-extrabold text-foreground">
            {formatMoney(favor.budget.amount, favor.budget.currencyCode, locale)}{" "}
            {favor.budget.currencyCode}
          </p>
        </div>
        <Button size="touch" onClick={onOpen}>
          <Zap />
          {t("worker.viewFavor")}
        </Button>
      </div>
    </article>
  );
}

function WorkerFavorDetail({
  favor,
  languageCode,
  t,
  locale,
  alreadyOffered,
  onBack,
  onAccept,
  onCounter,
}: {
  favor: Favor;
  languageCode: string;
  t: Translator;
  locale: string;
  alreadyOffered: boolean;
  onBack: () => void;
  onAccept: () => void;
  onCounter: () => void;
}) {
  const distanceKm = distanceKmFor(favor);
  const budget = favor.budget.amount;
  return (
    <section className="mt-6">
      <div className="flex items-center gap-3">
        <Button aria-label={t("common.back")} variant="ghost" size="iconLg" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <StatusBadge status={favor.status} t={t} />
      </div>
      <p className="mt-5 text-xs font-bold uppercase tracking-wide text-primary">
        {t(`category.${favor.category}` as TranslationKey)}
      </p>
      <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
        {favor.description}
      </h1>

      <div className="mt-5">
        <FavorRoute favor={favor} viewer="worker" languageCode={languageCode} t={t} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <DetailRow
          icon={Clock3}
          label={t("field.when")}
          value={scheduleLabel(favor, t, languageCode)}
        />
        <DetailRow
          icon={Timer}
          label={t("detail.duration")}
          value={`${distanceKm.toFixed(1)} km · ≈ ${estimatedMinutes(favor)} ${t("offer.minutes")}`}
        />
        <DetailRow
          icon={Hourglass}
          label={t("field.waiting")}
          value={favor.waitingRequired ? favor.waitingDuration || t("common.yes") : t("common.no")}
        />
        <DetailRow
          icon={Briefcase}
          label={t("worker.info")}
          value={favor.specialInstructions || t("common.notDefined")}
        />
      </div>

      <div className="mt-5 rounded-[22px] border border-primary/40 bg-surface p-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {t("worker.offer.clientPrice")}
        </p>
        <p className="font-display text-3xl font-extrabold">
          {formatMoney(budget, favor.budget.currencyCode, locale)} {favor.budget.currencyCode}
        </p>
        {alreadyOffered ? (
          <p className="mt-4 text-sm font-semibold text-muted-foreground">
            {t("worker.offer.already")}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {budget !== null && (
              <Button className="sm:flex-1" size="touch" onClick={onAccept}>
                {t("worker.offer.acceptPrice")}{" "}
                {formatMoney(budget, favor.budget.currencyCode, locale)} {favor.budget.currencyCode}
              </Button>
            )}
            <Button className="sm:flex-1" variant="dark" size="touch" onClick={onCounter}>
              {t("worker.offer.counter")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function OfferSheet({
  favor,
  mode,
  workerId,
  t,
  locale,
  onClose,
}: {
  favor: Favor;
  mode: "accept" | "counter";
  workerId: string;
  t: Translator;
  locale: string;
  onClose: (sent?: boolean) => void;
}) {
  const budget = favor.budget.amount;
  const [amount, setAmount] = useState(budget !== null ? String(budget) : "");
  const [message, setMessage] = useState("");
  const [review, setReview] = useState(mode === "accept");
  const distanceKm = distanceKmFor(favor);
  const parsed = Number(amount.replace(/[^\d]/g, ""));
  const finalAmount = mode === "accept" ? (budget ?? 0) : parsed;

  const send = () => {
    addOffer(
      createOffer({
        favorId: favor.id,
        workerId,
        amount: finalAmount,
        currencyCode: favor.budget.currencyCode,
        clientBudget: budget,
        message: message.trim(),
        distanceKm,
        etaMinutes: Math.max(8, Math.round(distanceKm * 5)),
      }),
    );
    if (message.trim()) {
      pushMessage({ favorId: favor.id, author: "worker", kind: "text", body: message.trim() });
    }
    onClose(true);
  };

  const money = `${formatMoney(finalAmount, favor.budget.currencyCode, locale)} ${favor.budget.currencyCode}`;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose(false)}>
      <SheetContent
        side="bottom"
        className="worker-theme max-h-[92vh] overflow-y-auto rounded-t-[28px] border-border bg-background p-6 text-foreground sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md sm:rounded-[28px]"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">
            {review
              ? mode === "accept"
                ? t("worker.acceptConfirm.title")
                : t("worker.review.title")
              : t("worker.offer.counter")}
          </SheetTitle>
        </SheetHeader>
        <p className="mt-1 text-sm text-muted-foreground">{favor.description}</p>

        <div className="mt-5 rounded-2xl bg-surface p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("worker.offer.clientPrice")}
          </p>
          <p className="font-display text-xl font-extrabold">
            {formatMoney(budget, favor.budget.currencyCode, locale)} {favor.budget.currencyCode}
          </p>
        </div>

        {!review ? (
          <>
            <div className="mt-5 space-y-2">
              <Label htmlFor="offer-amount">{t("worker.offer.amount")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="offer-amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <span className="font-display text-sm font-extrabold text-muted-foreground">
                  {favor.budget.currencyCode}
                </span>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="offer-message">{t("worker.offer.message")}</Label>
              <Textarea
                id="offer-message"
                rows={3}
                placeholder={t("worker.offer.messagePlaceholder")}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </div>
            <Button
              className="mt-5 w-full"
              size="touch"
              disabled={!parsed}
              onClick={() => setReview(true)}
            >
              {t("common.continue")}
            </Button>
          </>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("worker.review.price")}
                </p>
                <p className="font-display text-2xl font-extrabold">{money}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("worker.review.message")}
                </p>
                <p className="mt-1 text-sm leading-relaxed">
                  {message.trim() || t("worker.review.noMessage")}
                </p>
              </div>
            </div>
            <Button className="mt-5 w-full" size="touch" onClick={send}>
              {mode === "accept" ? t("worker.acceptConfirm.cta") : t("worker.review.send")}
            </Button>
            {mode === "counter" && (
              <Button
                className="mt-2 w-full"
                variant="secondary"
                size="touch"
                onClick={() => setReview(false)}
              >
                {t("common.edit")}
              </Button>
            )}
          </>
        )}
        <Button className="mt-2 w-full" variant="ghost" size="touch" onClick={() => onClose(false)}>
          {t("common.cancel")}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

export function WorkerApp({ languageCode, onExit }: { languageCode: string; onExit: () => void }) {
  const t = useMemo(() => createTranslator(languageCode), [languageCode]);
  const locale = localeFor(languageCode);
  const marketplace = useMarketplace();
  const [tab, setTab] = useState<WorkerTab>(() => {
    const next = requestedWorkerTab ?? "available";
    requestedWorkerTab = null;
    return next;
  });
  const [openFavorId, setOpenFavorId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AvailableFilters>(emptyFilters);
  const [offering, setOffering] = useState<{ favorId: string; mode: "accept" | "counter" } | null>(
    null,
  );

  const worker = currentWorkerFrom(marketplace);
  const workerId = worker?.id ?? "";
  const availability = marketplace.availability;
  const myOffers = offersByWorker(marketplace, workerId);
  const compatible = openFavorsForWorker(marketplace, workerId).filter((favor) => {
    if (availability.categories.length === 0) return true;
    return (
      availability.categories.includes(favor.category) ||
      favor.category === "other" ||
      favor.category === "uncategorized"
    );
  });
  const available = availability.available ? applyFilters(compatible, filters) : [];
  const acceptedOffers = myOffers.filter((offer) => offer.status === "ACCEPTED");
  const acceptedFavors = marketplace.favors.filter((favor) =>
    acceptedOffers.some((offer) => offer.favorId === favor.id),
  );
  const inProgressCount = acceptedFavors.filter((favor) =>
    ["WORKER_SELECTED", "WORKER_ON_THE_WAY", "ARRIVED_AT_PICKUP", "IN_PROGRESS", "NEAR_DESTINATION"].includes(
      favor.status,
    ),
  ).length;
  const completedCount = acceptedFavors.filter((favor) => favor.status === "COMPLETED").length;
  const pendingValue = acceptedOffers.reduce((total, offer) => total + offer.amount, 0);
  const pendingCurrency = acceptedOffers[0]?.currencyCode ?? worker?.currencyCode ?? "COP";
  const openFavor = marketplace.favors.find((favor) => favor.id === openFavorId) ?? null;
  const offeringFavor = marketplace.favors.find((favor) => favor.id === offering?.favorId) ?? null;
  const alreadyOffered = openFavor
    ? myOffers.some((offer) => offer.favorId === openFavor.id)
    : false;

  if (!worker) {
    return (
      <main className="worker-theme grid min-h-screen place-items-center bg-background px-6 text-foreground">
        <div className="text-center">
          <p className="font-display text-lg font-extrabold">
            AnyOne<sup>16</sup>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {marketplace.loading ? t("common.loading") : t("worker.empty.body")}
          </p>
          <Button className="mt-5" variant="secondary" size="touch" onClick={onExit}>
            {t("worker.exit")}
          </Button>
        </div>
      </main>
    );
  }


  return (
    <main className="worker-theme min-h-screen bg-background pb-24 text-foreground">
      <div className="mx-auto w-full max-w-5xl px-5 pb-10 pt-6 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button aria-label={t("worker.exit")} variant="ghost" size="iconLg" onClick={onExit}>
              <ArrowLeft />
            </Button>
            <div>
              <p className="font-display text-lg font-extrabold">
                AnyOne<sup>16</sup>
              </p>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                {t("worker.mode")}
              </p>
            </div>
          </div>
          <Button
            size="touch"
            variant={availability.available ? "default" : "secondary"}
            onClick={() => setAvailability({ available: !availability.available })}
            aria-pressed={availability.available}
          >
            <Zap />
            <span className="max-w-[9rem] truncate sm:max-w-none">
              {availability.available ? t("worker.available") : t("worker.unavailable")}
            </span>
          </Button>
        </header>

        {tab === "available" && openFavor && (
          <WorkerFavorDetail
            favor={openFavor}
            languageCode={languageCode}
            t={t}
            locale={locale}
            alreadyOffered={alreadyOffered}
            onBack={() => setOpenFavorId(null)}
            onAccept={() => setOffering({ favorId: openFavor.id, mode: "accept" })}
            onCounter={() => setOffering({ favorId: openFavor.id, mode: "counter" })}
          />
        )}

        {tab === "available" && !openFavor && (
          <section className="mt-8">
            <h1 className="font-display text-2xl font-extrabold">{t("worker.dashboard.title")}</h1>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat label={t("worker.tab.available")} value={String(available.length)} />
              <Stat label={t("worker.dashboard.offers")} value={String(myOffers.length)} />
              <Stat label={t("worker.dashboard.accepted")} value={String(acceptedOffers.length)} />
              <Stat label={t("worker.dashboard.inProgress")} value={String(inProgressCount)} />
              <Stat label={t("worker.dashboard.completed")} value={String(completedCount)} />
              <Stat
                label={t("worker.dashboard.earnings")}
                value={`${formatMoney(pendingValue, pendingCurrency, locale)} ${pendingCurrency}`}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("worker.dashboard.earningsNote")}
            </p>
            <h2 className="mt-8 font-display text-xl font-extrabold">
              {t("worker.tab.available")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {availability.zone} · {availability.categories.length} {t("worker.categories")}
            </p>

            {availability.available && (
              <AvailableFiltersBar
                filters={filters}
                onChange={setFilters}
                t={t}
                results={available.length}
              />
            )}

            {!availability.available ? (
              <div className="mt-6 rounded-[22px] border border-dashed border-border bg-card p-8 text-center">
                <p className="font-display text-base font-bold">{t("worker.offline.title")}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t("worker.offline.body")}</p>
              </div>
            ) : available.length === 0 ? (
              <div className="mt-6 rounded-[22px] border border-dashed border-border bg-card p-8 text-center">
                <p className="font-display text-base font-bold">{t("worker.empty.title")}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t("worker.empty.body")}</p>
              </div>
            ) : (
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {available.map((favor) => (
                  <FavorCard
                    key={favor.id}
                    favor={favor}
                    languageCode={languageCode}
                    t={t}
                    locale={locale}
                    onOpen={() => setOpenFavorId(favor.id)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "offers" && (
          <section className="mt-8">
            <h1 className="font-display text-2xl font-extrabold">{t("worker.tab.offers")}</h1>
            {myOffers.length === 0 ? (
              <p className="mt-6 rounded-[22px] border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                {t("worker.offers.empty")}
              </p>
            ) : (
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {myOffers.map((offer) => {
                  const favor = marketplace.favors.find((item) => item.id === offer.favorId);
                  const stateKey: TranslationKey =
                    offer.status === "ACCEPTED"
                      ? "worker.offer.accepted"
                      : offer.status === "PENDING"
                        ? "worker.offer.pending"
                        : "worker.offer.rejectedState";
                  return (
                    <article
                      key={offer.id}
                      className="rounded-[22px] border border-border bg-card p-4 shadow-soft"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
                          {t(stateKey)}
                        </span>
                        <span className="font-display text-lg font-extrabold">
                          {formatMoney(offer.amount, offer.currencyCode, locale)}{" "}
                          {offer.currencyCode}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {favor?.description}
                      </p>
                      {offer.status === "ACCEPTED" && favor && (
                        <div className="mt-4 space-y-4">
                          <WorkerTracking
                            favor={favor}
                            workerProfileId={workerId || null}
                            isDemo={!marketplace.identity}
                            languageCode={languageCode}
                            t={t}
                          />
                          <ChatPanel
                            favorId={favor.id}
            messages={messagesForFavor(marketplace, favor.id)}
                            author="worker"
                            t={t}
                            onSend={(body, kind) =>
                              pushMessage({
                                favorId: favor.id,
                                author: "worker",
                                kind: kind ?? "text",
                                body,
                              })
                            }
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "profile" && (
          <section className="mt-8">
            <div className="flex items-center gap-4">
              <WorkerAvatar worker={worker} size="lg" />
              <div>
                <h1 className="font-display text-2xl font-extrabold">{worker.name}</h1>
                <p className="text-sm text-muted-foreground">{worker.headline}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{worker.bio}</p>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label={t("worker.stats.rating")}
                value={`${worker.rating.average.toFixed(1)} ★`}
              />
              <Stat
                label={t("worker.stats.completed")}
                value={String(worker.rating.completedFavors)}
              />
              <Stat
                label={t("worker.stats.completion")}
                value={`${worker.rating.completionRate}%`}
              />
              <Stat
                label={t("worker.stats.cancellation")}
                value={`${worker.rating.cancellationRate}%`}
              />
            </div>

            {(marketplace.reviews[worker.id] ?? []).length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("profile.reviews")}
                </p>
                <div className="mt-2 space-y-2">
                  {(marketplace.reviews[worker.id] ?? []).map((review) => (
                    <article key={review.id} className="rounded-2xl border border-border bg-card p-4">
                      <p className="flex items-center justify-between gap-3 text-sm font-bold">
                        {review.author}
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Star className="size-3.5 fill-current" aria-hidden="true" />
                          {review.rating.toFixed(1)}
                        </span>
                      </p>
                      {review.body && (
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">“{review.body}”</p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              <WorkerEarnings
                workerProfileId={worker.id}
                languageCode={languageCode}
                fallbackCurrency={worker.currencyCode}
              />
            </div>

            <div className="mt-5">
              <WorkerTrustPanel
                workerProfileId={worker.id}
                countryCode={worker.countryCode ?? "CO"}
                languageCode={languageCode}
                isDemo={!marketplace.identity}
              />
            </div>





            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("worker.verification")}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
                    {t("offer.verified")}
                  </li>
                  <li className="flex items-center gap-2">
                    <UserRound className="size-4 text-primary" aria-hidden="true" />
                    {worker.verification.level.toUpperCase()}
                  </li>
                  <li className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-primary" aria-hidden="true" />
                    {t("worker.joined")}{" "}
                    {new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
                      new Date(worker.joinedAt),
                    )}
                  </li>
                </ul>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("worker.availability")}
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {availability.available ? t("worker.available") : t("worker.unavailable")}
                </p>
                <div className="mt-3 space-y-2">
                  <Label htmlFor="zone">{t("worker.zone")}</Label>
                  <Input
                    id="zone"
                    value={availability.zone}
                    onChange={(event) => setAvailability({ zone: event.target.value })}
                  />
                </div>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("worker.categories")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      "laundry",
                      "packages",
                      "shopping",
                      "documents",
                      "waiting",
                      "flowers",
                      "gifts",
                      "pets",
                      "other",
                    ] as const
                  ).map((category) => {
                    const on = availability.categories.includes(category);
                    return (
                      <Button
                        key={category}
                        size="sm"
                        className="h-10 rounded-xl"
                        variant={on ? "default" : "secondary"}
                        aria-pressed={on}
                        onClick={() =>
                          setAvailability({
                            categories: on
                              ? availability.categories.filter((item) => item !== category)
                              : [...availability.categories, category],
                          })
                        }
                      >
                        {t(`category.${category}` as TranslationKey)}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <Star className="size-4 text-primary" aria-hidden="true" />
                  {worker.languages.join(" · ")}
                </p>
                <p className="mt-2 flex items-center gap-2 text-muted-foreground">
                  <MapPin className="size-4" aria-hidden="true" />
                  {worker.operationZone}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Wallet className="size-4" aria-hidden="true" />
                  {worker.currencyCode}
                </p>
                <p className="mt-2 flex items-center gap-2">
                  <Timer className="size-4" aria-hidden="true" />
                  {t("confirm.conditionsBody")}
                </p>
              </div>
            </div>
          </section>
        )}
      </div>

      {offering && offeringFavor && (
        <OfferSheet
          favor={offeringFavor}
          mode={offering.mode}
          workerId={workerId}
          t={t}
          locale={locale}
          onClose={(sent) => {
            setOffering(null);
            if (sent) {
              setOpenFavorId(null);
              setTab("offers");
            }
          }}
        />
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        aria-label={t("worker.mode")}
      >
        <div className="glass-nav mx-auto grid h-[72px] max-w-md grid-cols-3 rounded-[28px] px-2">
          {(
            [
              ["available", Briefcase, t("worker.tab.available")],
              ["offers", MessageSquare, t("worker.tab.offers")],
              ["profile", UserRound, t("worker.tab.profile")],
            ] as const
          ).map(([key, Icon, label]) => (
            <Button
              key={key}
              variant={tab === key ? "navActive" : "nav"}
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
            >
              <Icon />
              <span>{label}</span>
            </Button>
          ))}
        </div>
      </nav>
    </main>
  );
}
