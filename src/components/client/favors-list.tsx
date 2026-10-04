import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ShoppingBasket,
  CheckCircle2,
  Clock3,
  FileText,
  Flower2,
  Gift,
  Hourglass,
  Package,
  PawPrint,
  Radar,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/marketplace/status-timeline";
import { scheduleLabel } from "@/components/create-favor/favor-utils";
import { formatMoney, type Favor, type FavorCategory, type FavorStatus } from "@/lib/favor-model";
import type { Translator } from "@/lib/i18n";
import {
  hydrateMarketplace,
  offersForFavor,
  workersById,
  type useMarketplace,
} from "@/lib/marketplace-store";
import { FAVOR_EMPTY_ART, favorArt, favorArtVariants, favorVariantIndex, sceneVariant, tiltHandlers } from "@/lib/scene-art";

type MarketplaceState = ReturnType<typeof useMarketplace>;

/** Visual groups mapped from the real backend statuses — no parallel states. */
export type FavorGroup = "all" | "searching" | "offers" | "progress" | "completed" | "cancelled" | "disputed";

const PROGRESS: FavorStatus[] = [
  "WORKER_SELECTED",
  "WORKER_ON_THE_WAY",
  "ARRIVED_AT_PICKUP",
  "IN_PROGRESS",
  "NEAR_DESTINATION",
  "READY_FOR_CONFIRMATION",
  "CODE_ENTERED",
];

export function groupOf(favor: Favor, pendingOffers: number, hasAccepted: boolean): Exclude<FavorGroup, "all"> {
  if (favor.status === "COMPLETED") return "completed";
  if (favor.status === "CANCELLED") return "cancelled";
  if (favor.status === "DISPUTED") return "disputed";
  if (hasAccepted || PROGRESS.includes(favor.status)) return "progress";
  if (pendingOffers > 0 || favor.status === "OFFER_RECEIVED") return "offers";
  return "searching";
}

const CATEGORY_ICON: Record<FavorCategory, LucideIcon> = {
  laundry: ShoppingBasket,
  packages: Package,
  shopping: ShoppingCart,
  documents: FileText,
  waiting: Hourglass,
  flowers: Flower2,
  gifts: Gift,
  pets: PawPrint,
  other: Sparkles,
  uncategorized: Sparkles,
};

const COPY = {
  es: {
    eyebrow: "Pedir ayuda",
    title: "Tus favores",
    subtitle: "Aquí sabes exactamente qué está pasando con cada uno.",
    create: "Crear un favor",
    search: "Buscar por descripción o categoría",
    groups: {
      all: "Todos",
      searching: "Buscando ayuda",
      offers: "Con ofertas",
      progress: "En progreso",
      completed: "Completados",
      cancelled: "Cancelados",
      disputed: "En disputa",
    },
    next: {
      searching: "Buscando a alguien que pueda ayudarte. Te avisaremos cuando alguien se interese.",
      offers: "Revisa quién quiere ayudarte y elige.",
      progress: "Sigue el avance y usa el chat si lo necesitas.",
      completed: "Favor terminado.",
      cancelled: "Este favor ya no está activo.",
      disputed: "Estamos revisando este favor contigo.",
    },
    people: (n: number) => (n === 1 ? "1 persona quiere ayudarte" : `${n} personas quieren ayudarte`),
    helping: "Te ayuda",
    open: "Ver favor",
    loading: "Cargando tus favores",
    errorTitle: "No pudimos cargar tus favores.",
    errorBody: "Revisa tu conexión e intenta nuevamente.",
    retry: "Reintentar",
    empty: {
      all: ["No tienes favores todavía.", "Cuando necesites una mano, puedes crear tu primer favor."],
      searching: ["Ningún favor está buscando ayuda ahora.", "Publica uno y lo mostraremos a personas cerca de ti."],
      offers: ["Todavía no tienes ofertas.", "Cuando alguien quiera ayudarte, aparecerá aquí."],
      progress: ["No tienes favores en progreso.", "Cuando aceptes una oferta, podrás seguirlo desde aquí."],
      completed: ["Todavía no tienes favores completados.", "Tus favores terminados aparecerán aquí."],
      cancelled: ["No tienes favores cancelados.", "Todo en orden por aquí."],
      disputed: ["No tienes favores en disputa.", "Todo en orden por aquí."],
    },
    noResults: ["No encontramos favores con esa búsqueda.", "Prueba con otras palabras o limpia la búsqueda."],
    clear: "Limpiar búsqueda",
  },
  en: {
    eyebrow: "Ask for help",
    title: "Your favors",
    subtitle: "See exactly what is happening with each one.",
    create: "Create a favor",
    search: "Search by description or category",
    groups: {
      all: "All",
      searching: "Looking for help",
      offers: "With offers",
      progress: "In progress",
      completed: "Completed",
      cancelled: "Cancelled",
      disputed: "Disputed",
    },
    next: {
      searching: "Looking for someone who can help. We'll let you know when someone is interested.",
      offers: "Review who wants to help and choose.",
      progress: "Follow the progress and use the chat if you need it.",
      completed: "Favor finished.",
      cancelled: "This favor is no longer active.",
      disputed: "We're reviewing this favor with you.",
    },
    people: (n: number) => (n === 1 ? "1 person wants to help" : `${n} people want to help`),
    helping: "Helping you",
    open: "View favor",
    loading: "Loading your favors",
    errorTitle: "We couldn't load your favors.",
    errorBody: "Check your connection and try again.",
    retry: "Try again",
    empty: {
      all: ["You don't have favors yet.", "Whenever you need a hand, create your first favor."],
      searching: ["No favor is looking for help right now.", "Publish one and we'll show it to people nearby."],
      offers: ["No offers yet.", "When someone wants to help, it will show up here."],
      progress: ["No favors in progress.", "Once you accept an offer, you can follow it here."],
      completed: ["No completed favors yet.", "Your finished favors will appear here."],
      cancelled: ["No cancelled favors.", "All good here."],
      disputed: ["No disputed favors.", "All good here."],
    },
    noResults: ["No favors match that search.", "Try other words or clear the search."],
    clear: "Clear search",
  },
} as const;

export const favorsCopy = (languageCode: string) => (languageCode.startsWith("es") ? COPY.es : COPY.en);

export function FavorsList({
  favors,
  marketplace,
  languageCode,
  locale,
  t,
  onOpen,
  onCreate,
}: {
  favors: Favor[];
  marketplace: MarketplaceState;
  languageCode: string;
  locale: string;
  t: Translator;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const c = favorsCopy(languageCode);
  const [group, setGroup] = useState<FavorGroup>("all");
  const [query, setQuery] = useState("");

  // Deterministic scene variant: id → variant; nudged so neighbours of the same category differ.
  const variants = useMemo(() => {
    const map: Record<string, number> = {};
    const last: Record<string, number> = {};
    favors.forEach((favor) => {
      const n = favorArtVariants(favor.category).length;
      let v = favorVariantIndex(favor.category, favor.id);
      if (last[favor.category] === v && n > 1) v = (v + 1) % n;
      map[favor.id] = v;
      last[favor.category] = v;
    });
    return map;
  }, [favors]);

  const rows = useMemo(
    () =>
      favors.map((favor) => {
        const offers = offersForFavor(marketplace, favor.id);
        const pending = offers.filter((o) => o.status === "PENDING").length;
        const acceptedId = marketplace.acceptedOffers[favor.id];
        const accepted = offers.find((o) => o.id === acceptedId);
        const worker = accepted ? workersById[accepted.workerId] : undefined;
        return { favor, pending, worker, group: groupOf(favor, pending, Boolean(accepted)) };
      }),
    [favors, marketplace],
  );

  const counts = useMemo(() => {
    const map: Record<FavorGroup, number> = { all: rows.length, searching: 0, offers: 0, progress: 0, completed: 0, cancelled: 0, disputed: 0 };
    rows.forEach((r) => (map[r.group] += 1));
    return map;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (group === "all" || r.group === group) &&
      (!q ||
        r.favor.description.toLowerCase().includes(q) ||
        catLabel(r.favor.category, t).toLowerCase().includes(q) ||
        r.favor.category.includes(q)),
  );

  const chips: FavorGroup[] = ["all", "searching", "offers", "progress", "completed", "cancelled"];
  if (counts.disputed > 0) chips.push("disputed");

  const showLoading = marketplace.loading && favors.length === 0;
  const showError = Boolean(marketplace.error) && favors.length === 0 && !marketplace.loading;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-32 pt-6 sm:px-8">
      <header className="fv-head">
        <span className="fv-head-orb" aria-hidden="true" />
        <div className="relative min-w-0">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-[-0.03em] text-foreground sm:text-5xl">
            {c.title}
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{c.subtitle}</p>
        </div>
        <button type="button" className="fv-cta relative shrink-0" onClick={onCreate}>
          <Plus className="size-5" aria-hidden="true" /> {c.create}
        </button>
      </header>

      {favors.length > 0 && (
        <>
          <label className="favors-search mt-7">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{c.search}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={c.search}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label={c.title}>
            {chips.map((g) => {
              const ChipIcon = GROUP_ICON[g];
              return (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={group === g}
                  className="fv-chip"
                  data-g={g}
                  data-active={group === g}
                  onClick={() => setGroup(g)}
                >
                  <ChipIcon className="size-3.5" aria-hidden="true" />
                  {c.groups[g]}
                  <span className="fv-chip-count">{counts[g]}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {showLoading ? (
        <div className="fv-grid mt-6" aria-busy="true" aria-label={c.loading}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="fv-card fv-skel" aria-hidden="true">
              <div className="fv-scene" />
              <div className="fv-body">
                <div className="h-3 w-24 rounded-full bg-muted" />
                <div className="mt-3 h-5 w-3/4 rounded-full bg-muted" />
                <div className="mt-3 h-3 w-1/2 rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : showError ? (
        <EmptyState icon={AlertTriangle} title={c.errorTitle} body={c.errorBody}>
          <Button size="touch" variant="secondary" onClick={() => void hydrateMarketplace(true)}>
            <RefreshCw aria-hidden="true" /> {c.retry}
          </Button>
        </EmptyState>
      ) : visible.length === 0 ? (
        q ? (
          <EmptyState icon={Search} title={c.noResults[0]} body={c.noResults[1]}>
            <Button size="touch" variant="secondary" onClick={() => setQuery("")}>
              {c.clear}
            </Button>
          </EmptyState>
        ) : (
          <EmptyState art title={c.empty[group][0]} body={c.empty[group][1]}>
            <button type="button" className="fv-cta" onClick={onCreate}>
              <Plus className="size-5" aria-hidden="true" /> {c.create}
            </button>
          </EmptyState>
        )
      ) : (
        <div className="fv-grid mt-6">
          {visible.map(({ favor, pending, worker, group: g }) => {
            const Icon = CATEGORY_ICON[favor.category] ?? Sparkles;
            return (
              <button
                key={favor.id}
                type="button"
                className="fv-card group"
                data-group={g}
                data-confirm={favor.status === "READY_FOR_CONFIRMATION" || favor.status === "CODE_ENTERED"}
                style={sceneVariant(favor.id)}
                onClick={() => onOpen(favor.id)}
                {...tiltHandlers}
              >
                <div className="fv-scene">
                  <img src={favorArt(favor.category, variants[favor.id] ?? 0)} alt="" loading="lazy" width={1024} height={768} />
                  <span className="fv-scene-light" aria-hidden="true" />
                  <span className="fv-scene-motes" aria-hidden="true" />
                  <span className="fv-status">
                    <StatusBadge status={favor.status} t={t} />
                  </span>
                  {favor.budget.amount !== null && (
                    <span className="fv-price">
                      {formatMoney(favor.budget.amount, favor.budget.currencyCode, locale)}
                      <small>{favor.budget.currencyCode}</small>
                    </span>
                  )}
                </div>
                <div className="fv-body">
                  <p className="fv-cat">
                    <Icon className="size-3.5" aria-hidden="true" /> {catLabel(favor.category, t)}
                    <span className="fv-time">
                      <Clock3 className="size-3" aria-hidden="true" /> {scheduleLabel(favor, t, languageCode)}
                    </span>
                  </p>
                  <p className="mt-2 line-clamp-2 font-display text-lg font-bold leading-snug text-foreground">
                    {favor.description || t("common.notDefined")}
                  </p>
                  <div className="fv-next">
                    {g === "offers" && pending > 0 ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                        <Users className="size-4 text-primary" aria-hidden="true" /> {c.people(pending)}
                      </span>
                    ) : g === "progress" && worker ? (
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                        <span className="text-muted-foreground">{c.helping}:</span>
                        <span className="font-semibold text-foreground">{worker.name}</span>
                      </span>
                    ) : g === "completed" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> {c.next.completed}
                      </span>
                    ) : g === "cancelled" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <XCircle className="size-4" aria-hidden="true" /> {c.next.cancelled}
                      </span>
                    ) : (
                      <span className="line-clamp-1 min-w-0">
                        {g === "searching" && <span className="favor-card-pulse" aria-hidden="true" />}
                        {c.next[g]}
                      </span>
                    )}
                    <span className="fv-go">
                      {c.open} <ArrowRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  art,
  title,
  body,
  children,
}: {
  icon?: LucideIcon;
  art?: boolean;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="fv-empty mt-6">
      {art ? (
        <div className="fv-empty-art">
          <img src={FAVOR_EMPTY_ART} alt="" width={1280} height={640} />
        </div>
      ) : (
        Icon && (
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-primary">
            <Icon className="size-6" aria-hidden="true" />
          </span>
        )
      )}
      <p className="mt-5 font-display text-xl font-bold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

const GROUP_ICON: Record<FavorGroup, LucideIcon> = {
  all: Sparkles,
  searching: Radar,
  offers: Users,
  progress: Activity,
  completed: CheckCircle2,
  cancelled: XCircle,
  disputed: AlertTriangle,
};

const catLabel = (category: FavorCategory, t: Translator) =>
  t((category === "uncategorized" ? "category.none" : `category.${category}`) as never);
