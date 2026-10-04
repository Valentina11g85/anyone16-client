import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Clock3,
  Flag,
  Hourglass,
  MapPin,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

import { ChatPanel } from "@/components/marketplace/chat-panel";
import { FavorRoute } from "@/components/marketplace/favor-route";
import { LiveTracking } from "@/components/marketplace/live-tracking";
import { useWorkerPosition } from "@/hooks/use-worker-position";
import { isTrackingActive } from "@/lib/tracking";
import { StatusBadge, StatusTimeline } from "@/components/marketplace/status-timeline";
import { WorkerAvatar } from "@/components/marketplace/worker-avatar";
import { WorkerProfileSheet } from "@/components/marketplace/worker-profile-sheet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { budgetLabel, scheduleLabel } from "@/components/create-favor/favor-utils";
import { formatMoney, type Favor } from "@/lib/favor-model";
import { PaymentCheckout } from "@/components/payments/payment-checkout";
import { PaymentOrderPanel } from "@/components/payments/payment-order-checkout";
import { CompletionCodeCard } from "@/components/trust/completion-code-card";
import { EvidenceCapture } from "@/components/trust/evidence-capture";
import { FavorRating } from "@/components/client/favor-rating";
import { DisputeSheet } from "@/components/trust/dispute-sheet";
import { createTrustTranslator } from "@/lib/trust-i18n";
import { PaymentStatusBadge } from "@/components/payments/payment-badges";
import { createPayTranslator } from "@/lib/payments-i18n";
import { paymentForFavor, useFinance } from "@/lib/payments-store";
import { DEMO_CUSTOMER_PROFILE_ID } from "@/lib/marketplace-repo";
import { createTranslator, localeFor, type TranslationKey, type Translator } from "@/lib/i18n";
import {
  estimatedMinutes,
  OFFER_SORTS,
  sortOffers,
  type OfferSort,
  type WorkerOffer,
  type WorkerProfile,
} from "@/lib/marketplace-model";
import {
  acceptOffer,
  cancelFavor,
  keepWaiting,
  messagesForFavor,
  offersForFavor,
  pushMessage,
  rejectOffer,
  useMarketplace,
  workersById,
} from "@/lib/marketplace-store";
import { FavorsList, groupOf } from "@/components/client/favors-list";

const NEXT_STEP = {
  es: {
    now: "Qué está pasando",
    you: "Qué tienes que hacer",
    searching: ["Estamos buscando a alguien que pueda ayudarte.", "Por ahora nada. Te avisaremos cuando llegue la primera oferta."],
    offers: ["Ya hay personas interesadas en ayudarte.", "Revisa las ofertas, mira los perfiles y acepta la que prefieras."],
    selected: ["Ya elegiste a {name} para tu favor.", "Revisa el pago y coordina los detalles por el chat."],
    progress: ["Tu favor está en marcha con {name}.", "Sigue el avance y usa el chat si necesitas algo."],
    confirm: ["{name} indica que tu favor está listo.", "Revisa que todo esté bien y entrega tu código de confirmación."],
    completed: ["Tu favor está terminado.", "No tienes nada pendiente. Si hubo un problema, puedes reportarlo."],
    cancelled: ["Este favor fue cancelado.", "Puedes crear uno nuevo cuando lo necesites."],
    disputed: ["Este favor está en revisión.", "El equipo revisa el caso. No necesitas hacer nada por ahora."],
    someone: "la persona elegida",
  },
  en: {
    now: "What's happening",
    you: "What you need to do",
    searching: ["We're looking for someone who can help you.", "Nothing yet. We'll let you know when the first offer arrives."],
    offers: ["Some people are interested in helping you.", "Review the offers, check the profiles and accept the one you prefer."],
    selected: ["You chose {name} for your favor.", "Check the payment and coordinate details in the chat."],
    progress: ["Your favor is under way with {name}.", "Follow the progress and use the chat if you need anything."],
    confirm: ["{name} says your favor is ready.", "Check everything is fine and share your confirmation code."],
    completed: ["Your favor is done.", "Nothing pending. If something went wrong, you can report it."],
    cancelled: ["This favor was cancelled.", "You can create a new one whenever you need."],
    disputed: ["This favor is under review.", "The team is reviewing the case. Nothing to do for now."],
    someone: "the chosen person",
  },
} as const;

function NextStep({
  favor,
  languageCode,
  pending,
  workerName,
}: {
  favor: Favor;
  languageCode: string;
  pending: number;
  workerName: string | null;
}) {
  const c = languageCode.startsWith("es") ? NEXT_STEP.es : NEXT_STEP.en;
  const group = groupOf(favor, pending, Boolean(workerName));
  // Finer copy inside "progress", derived only from the existing statuses.
  const key =
    group !== "progress"
      ? group
      : favor.status === "WORKER_SELECTED"
        ? "selected"
        : favor.status === "READY_FOR_CONFIRMATION" || favor.status === "CODE_ENTERED"
          ? "confirm"
          : "progress";
  const [now, you] = c[key];
  return (
    <section className="next-step mt-4" data-group={group} aria-live="polite">
      <div className="next-step-now">
        <span className="next-step-dot" aria-hidden="true" />
        <div>
          <p className="next-step-label">{c.now}</p>
          <p className="mt-1 font-display text-base font-bold leading-snug text-foreground">
            {now.replace("{name}", workerName ?? c.someone)}
          </p>
        </div>
      </div>
      <div className="next-step-you">
        <p className="next-step-label">{c.you}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{you}</p>
      </div>
    </section>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <article className="review-card">
      <span className="review-icon">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-foreground">
          {value}
        </p>
      </div>
    </article>
  );
}

function OfferCard({
  offer,
  worker,
  favor,
  t,
  locale,
  onAccept,
  onReject,
  onProfile,
}: {
  offer: WorkerOffer;
  worker: WorkerProfile;
  favor: Favor;
  t: Translator;
  locale: string;
  onAccept: () => void;
  onReject: () => void;
  onProfile: () => void;
}) {
  const matches = favor.budget.amount !== null && offer.amount === favor.budget.amount;
  const hasHistory = worker.rating.completedFavors > 0;
  return (
    <article className="offer-card" aria-label={`${worker.name} — ${formatMoney(offer.amount, offer.currencyCode, locale)}`}>
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={onProfile}
          className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`${t("offer.viewProfile")}: ${worker.name}`}
        >
          <WorkerAvatar worker={worker} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-display text-base font-bold text-foreground">
            {worker.name}
            {worker.verification.identityVerified && (
              <BadgeCheck className="size-4 shrink-0 text-primary" aria-label={t("offer.verified")} />
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {hasHistory ? (
              <>
                <span className="inline-flex items-center gap-1 font-bold text-foreground">
                  <Star className="size-3.5 fill-current text-primary" aria-hidden="true" />
                  {worker.rating.average.toFixed(1)}
                </span>
                <span>
                  {worker.rating.completedFavors} {t("offer.completed")}
                </span>
                <span>
                  {worker.rating.completionRate}% {t("offer.completion")}
                </span>
              </>
            ) : (
              <span>{locale.startsWith("es") ? "Aún sin favores completados" : "No completed favors yet"}</span>
            )}
          </p>
        </div>
        <div className="offer-price">
          <p className="font-display text-lg font-extrabold leading-none text-foreground">
            {formatMoney(offer.amount, offer.currencyCode, locale)}
          </p>
          <p className={`mt-1 text-[11px] font-bold ${matches ? "text-success" : "text-primary"}`}>
            {matches ? t("offer.matches") : t("offer.counter")}
          </p>
        </div>
      </header>

      {offer.message && <p className="offer-quote">“{offer.message}”</p>}

      <ul className="mt-3 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Detalles">
        <li className="offer-chip">
          <MapPin className="size-3.5" aria-hidden="true" /> {offer.distanceKm.toFixed(1)} km
        </li>
        <li className="offer-chip">
          <Timer className="size-3.5" aria-hidden="true" /> {t("offer.eta")} {offer.etaMinutes} {t("offer.minutes")}
        </li>
        <li className={`offer-chip ${worker.verification.identityVerified ? "offer-chip-ok" : ""}`}>
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {worker.verification.identityVerified ? t("offer.verified") : t("offer.unverified")}
        </li>
        {worker.languages.length > 0 && (
          <li className="offer-chip">
            {t("offer.languages")}: {worker.languages.join(", ")}
          </li>
        )}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(offer.createdAt),
        )}
      </p>

      {offer.status === "PENDING" ? (
        <div className="offer-actions">
          <Button className="offer-accept" size="touch" onClick={onAccept}>
            <Check /> {t("offer.accept")}
          </Button>
          <Button variant="soft" size="touch" onClick={onProfile}>
            <UserRound /> {t("offer.viewProfile")}
          </Button>
          <Button variant="ghost" size="touch" className="text-muted-foreground hover:text-destructive" onClick={onReject}>
            <X /> {t("offer.reject")}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {offer.status === "ACCEPTED" ? t("detail.selected") : t("offer.rejected")}
        </p>
      )}
    </article>
  );
}

function FavorDetail({
  favor,
  languageCode,
  onBack,
}: {
  favor: Favor;
  languageCode: string;
  onBack: () => void;
}) {
  const t = useMemo(() => createTranslator(languageCode), [languageCode]);
  const payT = useMemo(() => createPayTranslator(languageCode), [languageCode]);
  const locale = localeFor(languageCode);
  const marketplace = useMarketplace();
  const finance = useFinance();
  const [sort, setSort] = useState<OfferSort>("rating");
  const [confirming, setConfirming] = useState<WorkerOffer | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [dispute, setDispute] = useState(false);
  const trustT = useMemo(() => createTrustTranslator(languageCode), [languageCode]);
  const favorPayment = paymentForFavor(finance, favor.id);

  const offers = offersForFavor(marketplace, favor.id);
  const pending = offers.filter((offer) => offer.status === "PENDING");
  const visible = sortOffers(pending, workersById, sort);
  const acceptedId = marketplace.acceptedOffers[favor.id];
  const accepted = offers.find((offer) => offer.id === acceptedId);
  const acceptedWorker = accepted ? workersById[accepted.workerId] : undefined;
  const messages = messagesForFavor(marketplace, favor.id);
  const confirmWorker = confirming ? workersById[confirming.workerId] : undefined;
  const active = favor.status !== "CANCELLED" && favor.status !== "COMPLETED";
  const workerPosition = useWorkerPosition(favor.id, Boolean(accepted) && isTrackingActive(favor.status));

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-28 pt-6 sm:px-8">
      <div className="flex items-center gap-3">
        <Button aria-label={t("common.back")} variant="ghost" size="iconLg" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <StatusBadge status={favor.status} t={t} />
      </div>

      <h1 className="mt-5 font-display text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">
        {favor.description || t("common.notDefined")}
      </h1>

      <NextStep
        favor={favor}
        languageCode={languageCode}
        pending={pending.length}
        workerName={acceptedWorker?.name ?? null}
      />

      <div className="mt-5">
        <FavorRoute
          favor={favor}
          viewer="client"
          languageCode={languageCode}
          t={t}
          livePosition={workerPosition}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Row icon={Clock3} label={t("field.when")} value={scheduleLabel(favor, t, languageCode)} />
        <Row
          icon={Timer}
          label={t("detail.duration")}
          value={`≈ ${estimatedMinutes(favor)} ${t("offer.minutes")}`}
        />
        <Row
          icon={Wallet}
          label={t("detail.clientBudget")}
          value={budgetLabel(favor, languageCode, t)}
        />
        <Row
          icon={Hourglass}
          label={t("field.waiting")}
          value={favor.waitingRequired ? favor.waitingDuration || t("common.yes") : t("common.no")}
        />
      </div>

      <div className="mt-4">
        <StatusTimeline status={favor.status} t={t} />
      </div>

      {accepted && acceptedWorker && (
        <section className="helper-card mt-5" aria-label={t("detail.selected")}>
          <p className="next-step-label text-primary">
            {languageCode.startsWith("es") ? "Esta persona realizará tu favor" : "This person will do your favor"}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <WorkerAvatar worker={acceptedWorker} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate font-display text-lg font-bold text-foreground">
                {acceptedWorker.name}
                {acceptedWorker.verification.identityVerified && (
                  <BadgeCheck className="size-4 shrink-0 text-primary" aria-label={t("offer.verified")} />
                )}
              </p>
              <p className="text-sm font-semibold text-muted-foreground">
                {formatMoney(accepted.amount, accepted.currencyCode, locale)} {accepted.currencyCode}
              </p>
            </div>
            <StatusBadge status={favor.status} t={t} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="touch" variant="soft" onClick={() => document.getElementById("favor-chat")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <MessageCircle /> {t("chat.title")}
            </Button>
            <Button size="touch" variant="ghost" onClick={() => setProfileId(acceptedWorker.id)}>
              <UserRound /> {t("offer.viewProfile")}
            </Button>
          </div>
        </section>
      )}

      {accepted && acceptedWorker && (
        <section className="mt-4 rounded-[22px] border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {payT("pay.title")}
            </p>
            {favorPayment && <PaymentStatusBadge status={favorPayment.status} t={payT} />}
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {formatMoney(accepted.amount, accepted.currencyCode, locale)} {accepted.currencyCode}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{payT("pay.demoNote")}</p>
          <Button className="mt-3 w-full" size="touch" onClick={() => setCheckout(true)}>
            {favorPayment ? payT("pay.detail") : payT("pay.confirm")}
          </Button>
          <PaymentCheckout
            favor={favor}
            offerId={accepted.id}
            workerName={acceptedWorker.name}
            workerProfileId={accepted.workerId}
            agreedAmount={accepted.amount}
            currencyCode={accepted.currencyCode}
            customerProfileId={marketplace.identity?.profileId ?? null}
            languageCode={languageCode}
            open={checkout}
            onOpenChange={setCheckout}
          />
          <div className="mt-3">
            <PaymentOrderPanel
              subjectType="favor"
              subjectId={favor.id}
              summary={favor.description || "Favor"}
              canPay
            />
          </div>
        </section>
      )}

      {accepted && acceptedWorker && (
        <div className="mt-5">
          <LiveTracking
            favor={favor}
            worker={acceptedWorker}
            position={workerPosition}
            languageCode={languageCode}
            t={t}
          />
        </div>
      )}

      {accepted && active && (
        <div className="mt-5">
          <CompletionCodeCard favor={favor} languageCode={languageCode} />
        </div>
      )}

      {accepted && (
        <>
          <EvidenceCapture
            favor={favor}
            languageCode={languageCode}
            customerProfileId={marketplace.identity?.profileId ?? null}
            canAdd
          />
          <Button
            variant="secondary"
            className="mt-3 w-full"
            size="touch"
            onClick={() => setDispute(true)}
          >
            {trustT("trust.dispute.title")}
          </Button>
          <DisputeSheet
            favor={favor}
            open={dispute}
            onOpenChange={setDispute}
            languageCode={languageCode}
            profileId={marketplace.identity?.profileId ?? null}
            role="customer"
          />
        </>
      )}


      {accepted && favor.status === "COMPLETED" && marketplace.identity && (
        <FavorRating favorId={favor.id} languageCode={languageCode} />
      )}

      {accepted && (
        <div className="mt-5 scroll-mt-24" id="favor-chat">
          <ChatPanel
            favorId={favor.id}
            messages={messages}
            author="client"
            t={t}
            onSend={(body, kind) =>
              pushMessage({ favorId: favor.id, author: "client", kind: kind ?? "text", body })
            }
          />
        </div>
      )}

      {!accepted && active && (
        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">{t("detail.compare")}</p>
              <h2 className="font-display text-xl font-bold text-foreground">
                {pending.length > 0
                  ? `${pending.length} ${pending.length === 1 ? t("favors.oneOffer") : t("favors.offers")}`
                  : t("favors.noOffersYet")}
              </h2>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("detail.offersSubtitle")}</p>

          {pending.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("detail.sortBy")}
              </p>
              <div
                className="mt-2 flex flex-wrap gap-2"
                role="group"
                aria-label={t("detail.sortBy")}
              >
                {OFFER_SORTS.map((option) => (
                  <Button
                    key={option}
                    size="sm"
                    className="h-10 rounded-xl"
                    variant={sort === option ? "default" : "secondary"}
                    aria-pressed={sort === option}
                    onClick={() => setSort(option)}
                  >
                    {t(`sort.${option}` as TranslationKey)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {visible.map((offer) => {
              const worker = workersById[offer.workerId];
              if (!worker) return null;
              return (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  worker={worker}
                  favor={favor}
                  t={t}
                  locale={locale}
                  onAccept={() => setConfirming(offer)}
                  onProfile={() => setProfileId(worker.id)}
                  onReject={() => rejectOffer(offer.id)}
                />
              );
            })}
          </div>

          {pending.length === 0 && (
            <div className="mt-4 grid place-items-center rounded-[22px] border border-dashed border-border bg-card p-8 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-primary">
                <Sparkles className="size-6" aria-hidden="true" />
              </span>
              <p className="mt-4 font-display text-base font-bold text-foreground">
                {t("detail.waiting.title")}
              </p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {t("detail.waiting.body")}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" size="touch" onClick={() => keepWaiting(favor.id)}>
              {t("detail.keepWaiting")}
            </Button>
            <Button variant="ghost" size="touch" onClick={() => cancelFavor(favor.id)}>
              {t("detail.cancelFavor")}
            </Button>
          </div>
        </section>
      )}

      {favor.status === "CANCELLED" && (
        <p className="mt-6 rounded-2xl bg-muted p-4 text-sm font-semibold text-muted-foreground">
          {t("detail.cancelled")}
        </p>
      )}

      {profileId && workersById[profileId] && (
        <WorkerProfileSheet
          worker={workersById[profileId]}
          t={t}
          locale={locale}
          onClose={() => setProfileId(null)}
        />
      )}

      <Sheet open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] overflow-y-auto rounded-t-[28px] border-border p-6 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md sm:rounded-[28px]"
        >
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">{t("confirm.title")}</SheetTitle>
          </SheetHeader>
          <p className="mt-1 text-sm text-muted-foreground">{t("confirm.subtitle")}</p>
          {confirming && confirmWorker && (
            <div className="mt-5 space-y-3">
              <Row icon={Sparkles} label={t("field.favor")} value={favor.description} />
              <Row icon={Star} label={t("confirm.worker")} value={confirmWorker.name} />
              <Row
                icon={Wallet}
                label={t("confirm.price")}
                value={`${formatMoney(confirming.amount, confirming.currencyCode, locale)} ${confirming.currencyCode}`}
              />
              <Row
                icon={MapPin}
                label={t("field.pickup")}
                value={favor.pickupLocation?.label || t("common.notDefined")}
              />
              <Row
                icon={Flag}
                label={t("field.destination")}
                value={favor.destinationLocation?.label || t("common.notDefined")}
              />
              <Row
                icon={Clock3}
                label={t("field.when")}
                value={scheduleLabel(favor, t, languageCode)}
              />
              <p className="rounded-2xl bg-surface p-3 text-xs leading-relaxed text-muted-foreground">
                <strong className="block text-foreground">{t("confirm.conditions")}</strong>
                {t("confirm.conditionsBody")}
              </p>
              <Button
                className="w-full"
                size="touch"
                onClick={() => {
                  acceptOffer(confirming.id);
                  setConfirming(null);
                }}
              >
                {t("confirm.cta")}
              </Button>
              <Button
                className="w-full"
                variant="ghost"
                size="touch"
                onClick={() => setConfirming(null)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function FavorsScreen({
  languageCode,
  onCreate,
  initialFavorId = null,
}: {
  languageCode: string;
  onCreate: () => void;
  /** Favor to open right away, e.g. the one the user just published. */
  initialFavorId?: string | null;
}) {
  const t = useMemo(() => createTranslator(languageCode), [languageCode]);
  const locale = localeFor(languageCode);
  const marketplace = useMarketplace();
  const [openId, setOpenId] = useState<string | null>(initialFavorId);
  useEffect(() => {
    if (initialFavorId) setOpenId(initialFavorId);
  }, [initialFavorId]);
  const open = marketplace.favors.find((favor) => favor.id === openId);
  /**
   * Real favors of the signed-in account. Demo favors only show up in an
   * anonymous/demo session, never mixed with a real account's favors.
   */
  const myFavors = marketplace.favors
    .filter((favor) =>
      marketplace.identity
        ? favor.userId === marketplace.identity.profileId
        : favor.userId === DEMO_CUSTOMER_PROFILE_ID,
    )
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (open) {
    return <FavorDetail favor={open} languageCode={languageCode} onBack={() => setOpenId(null)} />;
  }

  return (
    <FavorsList
      favors={myFavors}
      marketplace={marketplace}
      languageCode={languageCode}
      locale={locale}
      t={t}
      onOpen={setOpenId}
      onCreate={onCreate}
    />
  );
}
