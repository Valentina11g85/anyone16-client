/**
 * AnyOne¹⁶ — Perfil: personal control center of the signed-in account.
 * Presentation only: every number comes from the existing stores; every
 * action calls the existing handler. Same account, several roles.
 */

import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  ChevronRight,
  Coins,
  Globe2,
  HandHeart,
  History,
  Languages,
  Lock,
  LogOut,
  MapPin,
  Receipt,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Star,
  Wallet,
  Wrench,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { useMarketplace } from "@/lib/marketplace-store";
import { AdminFinance } from "@/components/payments/admin-finance";
import { FeeConfigAdmin } from "@/components/payments/fee-config-admin";
import { AdminTrust } from "@/components/trust/admin-trust";
import { PaymentsHistory } from "@/components/payments/payments-history";
import { AdminPaymentSummary, MyEarnings, MyPayments } from "@/components/payments/my-payments";
import { UnifiedHistory } from "@/components/history/unified-history";
import { TrustSafetyCenter } from "@/components/trust/trust-safety-center";
import { useOpportunities } from "@/lib/opportunities-store";
import type { ContractStatus } from "@/lib/opportunities-model";
import { formatPaymentMoney } from "@/lib/payment-model";
import { trustForWorker, useTrust } from "@/lib/trust-store";
import { countries, currencies, formatCurrencyName, languages } from "@/lib/market-config";

const SECTIONS = [
  ["pf-hires", "Contrataciones", BriefcaseBusiness],
  ["pf-history", "Historial", History],
  ["pf-payments", "Pagos", Receipt],
  ["pf-earnings", "Ingresos", Coins],
  ["pf-alerts", "Notificaciones", Bell],
  ["pf-trust", "Confianza", ShieldCheck],
  ["pf-privacy", "Privacidad", Lock],
  ["pf-settings", "Configuración", Settings2],
] as const;

const CONTRACT_STATE: Record<ContractStatus, { label: string; tone: string }> = {
  agreed: { label: "Pendiente", tone: "pending" },
  confirmed: { label: "Pendiente", tone: "pending" },
  in_progress: { label: "En progreso", tone: "progress" },
  completed: { label: "Completado", tone: "done" },
  cancelled: { label: "Cancelado", tone: "cancel" },
  disputed: { label: "En disputa", tone: "dispute" },
};

function SectionHead({ id, icon: Icon, kicker, title, aside }: { id: string; icon: typeof Bell; kicker: string; title: string; aside?: ReactNode }) {
  return (
    <div id={id} className="pf-head scroll-mt-24">
      <span className="pf-head-icon"><Icon strokeWidth={1.7} /></span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-[0.65rem] font-bold uppercase">{kicker}</p>
        <h2 className="font-display text-xl font-extrabold text-foreground sm:text-2xl">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

export function ProfileScreen({
  onSwitchToWorker,
  onOpenNotifications = () => {},
  unreadNotifications = 0,
  onNavigate = () => {},
}: {
  onSwitchToWorker: () => void;
  onOpenNotifications?: () => void;
  unreadNotifications?: number;
  onNavigate?: (t: "favors" | "opportunities" | "worker-offers") => void;
}) {
  const { profile, worker, mode, updatePreferences, signOut } = useAuth();
  const [saving, setSaving] = useState(false);
  const marketplace = useMarketplace();
  const opps = useOpportunities();
  const trust = useTrust();
  const [trustOpen, setTrustOpen] = useState(false);

  const favorTitles = Object.fromEntries(
    marketplace.favors.map((favor) => [favor.id, favor.description || "Favor"]),
  );
  const workerNames = Object.fromEntries(
    marketplace.workers.map((item) => [item.id, item.name]),
  );

  if (!profile) return null;
  const workerTrust = worker ? trustForWorker(trust, worker.id) : null;
  const serviceRep = opps.reputation[profile.id];
  const roleCount = {
    client: marketplace.favors.filter((f) => f.userId === profile.id).length,
    worker: worker
      ? marketplace.favors.filter((f) => {
          const oid = marketplace.acceptedOffers[f.id];
          return oid && marketplace.offers.find((o) => o.id === oid)?.workerId === worker.id;
        }).length
      : 0,
    buyer: opps.contracts.filter((c) => c.buyerProfileId === profile.id).length,
    provider: opps.contracts.filter((c) => c.providerProfileId === profile.id).length,
  };
  const totalActivity = roleCount.client + roleCount.worker + roleCount.buyer + roleCount.provider;
  const completed =
    (workerTrust?.completedFavors ?? 0) +
    opps.contracts.filter((c) => c.status === "completed" && (c.buyerProfileId === profile.id || c.providerProfileId === profile.id)).length;
  const rating = workerTrust && workerTrust.rating > 0 ? workerTrust.rating : serviceRep && serviceRep.count > 0 ? serviceRep.average : null;
  const verified = workerTrust?.identityVerified ?? false;

  const country = countries.find((item) => item.code === profile.countryCode);
  const language = languages.find((item) => item.code === profile.languageCode);
  const currency = currencies.find((item) => item.code === profile.currencyCode);

  const save = (patch: { languageCode?: string; currencyCode?: string; countryCode?: string }) => {
    setSaving(true);
    void updatePreferences(patch).finally(() => setSaving(false));
  };

  const listingTitle = (id: string) => opps.listings.find((l) => l.id === id)?.title ?? "Servicio";
  const hired = opps.contracts.filter((c) => c.buyerProfileId === profile.id);
  const providing = opps.contracts.filter((c) => c.providerProfileId === profile.id);

  const roles = [
    { key: "client", label: "Cliente", line: "Pides ayuda y gestionas tus favores.", n: roleCount.client, unit: "favores", Icon: HandHeart, accent: "blue", on: true },
    { key: "worker", label: "Worker", line: "Ayudas a otras personas.", n: roleCount.worker, unit: "favores", Icon: Wrench, accent: "red", on: !!worker },
    { key: "buyer", label: "Contratante", line: "Contratas servicios.", n: roleCount.buyer, unit: "servicios", Icon: ShoppingBag, accent: "blue", on: true },
    { key: "provider", label: "Proveedor", line: "Ofreces tu conocimiento, oficio o talento.", n: roleCount.provider, unit: "servicios", Icon: BriefcaseBusiness, accent: "red", on: true },
  ];
  const activeRole = mode === "worker" ? "worker" : "client";

  const settings = [
    { label: "Idioma", Icon: Languages, value: profile.languageCode, items: languages.map((l) => [l.code, l.name] as [string, string]), key: "languageCode" as const },
    { label: "Moneda", Icon: Wallet, value: profile.currencyCode, items: currencies.map((c) => [c.code, formatCurrencyName(c)] as [string, string]), key: "currencyCode" as const },
    { label: "País", Icon: MapPin, value: profile.countryCode, items: countries.map((c) => [c.code, c.name] as [string, string]), key: "countryCode" as const },
  ];

  return (
    <section className="pf mx-auto w-full max-w-4xl px-5 pb-28 pt-6 sm:px-8">
      {/* Identity */}
      <header className="pf-id pf-rise">
        <span className="pf-id-glow" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="pf-avatar">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="size-full rounded-[1.4rem] object-cover" />
            ) : (
              <span className="font-display text-3xl font-extrabold">
                {(profile.fullName ?? profile.email ?? "A").slice(0, 1).toUpperCase()}
              </span>
            )}
            {verified && <BadgeCheck className="pf-avatar-badge" aria-label="Identidad verificada" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-[0.65rem] font-bold uppercase">Identidad AnyOne¹⁶</p>
            <h1 className="mt-1 truncate font-display text-3xl font-extrabold text-foreground sm:text-4xl">
              {profile.fullName ?? "Tu cuenta"}
            </h1>
            <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {roles.filter((r) => r.on && (r.n > 0 || r.key === activeRole)).map((r) => (
                <span key={r.key} className="pf-chip" data-accent={r.accent}>{r.label}</span>
              ))}
              <span className="pf-chip" data-state={verified ? "ok" : "muted"}>
                {verified ? <><BadgeCheck className="size-3.5" /> Identidad verificada</> : "Sin verificación de identidad"}
              </span>
            </div>
          </div>
        </div>
        <div className="pf-stats relative mt-6">
          <div>
            <span className="pf-num">{rating != null ? rating.toFixed(1) : "—"}</span>
            <span className="pf-stat-label"><Star className="size-3.5 fill-current text-primary" /> {rating != null ? "Reputación" : "Sin reseñas aún"}</span>
          </div>
          <div>
            <span className="pf-num">{totalActivity}</span>
            <span className="pf-stat-label">Interacciones</span>
          </div>
          <div>
            <span className="pf-num">{completed}</span>
            <span className="pf-stat-label">Completadas</span>
          </div>
          <div>
            <span className="pf-num">{workerTrust ? `${Math.round(workerTrust.completionRate * (workerTrust.completionRate <= 1 ? 100 : 1))}%` : "—"}</span>
            <span className="pf-stat-label">{workerTrust ? "Cumplimiento" : "Sin datos de cumplimiento"}</span>
          </div>
        </div>
      </header>

      {/* Mode */}
      <div className="pf-mode pf-rise mt-5" data-mode={activeRole}>
        <div className="min-w-[15rem] flex-1">
          <p className="eyebrow text-[0.65rem] font-bold uppercase">Tu modo actual</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
            <span className="pf-live" aria-hidden />
            {mode === "worker" ? "Trabajador" : "Cliente"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "worker" ? "Ayudas a otras personas y ganas por tus favores." : "Pides ayuda y gestionas tus favores. Una sola cuenta para todo."}
          </p>
        </div>
        <button type="button" className="pf-mode-btn" onClick={onSwitchToWorker}>
          {worker ? "Cambiar a modo trabajador" : "Conviértete en trabajador"}
          <ArrowRight className="size-4" />
        </button>
      </div>

      {/* Roles */}
      <div className="pf-roles pf-rise mt-5">
        {roles.map(({ key, label, line, n, unit, Icon, accent, on }) => (
          <div key={key} className="pf-role" data-accent={accent} data-active={key === activeRole} data-off={!on}>
            <span className="pf-role-icon"><Icon strokeWidth={1.7} /></span>
            <p className="mt-3 font-display text-base font-extrabold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{line}</p>
            <p className="mt-3 font-display text-2xl font-extrabold text-foreground">
              {on ? n : "—"} <span className="text-xs font-semibold text-muted-foreground">{on ? unit : "No activado"}</span>
            </p>
            {key === activeRole && <span className="pf-role-active">Activo</span>}
          </div>
        ))}
      </div>

      {/* Section nav */}
      <nav className="pf-nav no-scrollbar mt-6" aria-label="Secciones del perfil">
        {SECTIONS.map(([id, label, Icon]) => (
          <a key={id} href={`#${id}`} className="pf-nav-item">
            <Icon className="size-4" strokeWidth={1.7} /> {label}
          </a>
        ))}
      </nav>

      {/* Contrataciones */}
      <div className="mt-10">
        <SectionHead id="pf-hires" icon={BriefcaseBusiness} kicker="Oportunidades" title="Mis contrataciones" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {([
            ["Servicios que contraté", hired, "blue", "provider"],
            ["Servicios que estoy prestando", providing, "red", "buyer"],
          ] as const).map(([title, list, accent, other]) => (
            <div key={title} className="pf-world" data-accent={accent}>
              <p className="flex items-center justify-between font-display text-sm font-extrabold text-foreground">
                {title} <span className="pf-count">{list.length}</span>
              </p>
              {list.length === 0 ? (
                <div className="pf-empty mt-3">
                  <p>Todavía no hay contrataciones aquí.</p>
                  <button type="button" className="pf-link" onClick={() => onNavigate("opportunities")}>
                    Ir a Oportunidades <ArrowRight className="size-3.5" />
                  </button>
                </div>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {list.slice(0, 6).map((c) => {
                    const st = CONTRACT_STATE[c.status] ?? { label: c.status, tone: "pending" };
                    void other;
                    return (
                      <li key={c.id}>
                        <button type="button" className="pf-item" data-tone={st.tone} onClick={() => onNavigate("opportunities")}>
                          <span className="pf-item-icon"><BriefcaseBusiness strokeWidth={1.7} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold text-foreground">{listingTitle(c.listingId)}</span>
                            <span className="pf-status mt-1" data-tone={st.tone}>{st.label}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {new Date(c.updatedAt || c.createdAt).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="block font-display text-base font-extrabold text-foreground">{formatPaymentMoney(c.amount, c.currencyCode)}</span>
                            <span className="pf-go">Ver detalle <ChevronRight className="size-3.5" /></span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Historial */}
      <div className="mt-10">
        <SectionHead id="pf-history" icon={History} kicker="Tu actividad" title="Historial" />
        <div className="mt-4">
          <UnifiedHistory profileId={profile.id} languageCode={profile.languageCode} onNavigate={onNavigate} />
        </div>
      </div>

      {/* Pagos */}
      <div className="mt-10 space-y-4">
        <SectionHead id="pf-payments" icon={Receipt} kicker="Centro financiero" title="Mis pagos" />
        <MyPayments profileId={profile.id} />
        <PaymentsHistory
          profileId={profile.id}
          languageCode={profile.languageCode}
          favorTitles={favorTitles}
          workerNames={workerNames}
        />
      </div>

      {/* Ingresos */}
      <div className="mt-10 space-y-4">
        <SectionHead id="pf-earnings" icon={Coins} kicker="Lo que ganas" title="Mis ingresos" />
        <MyEarnings />
        <AdminPaymentSummary />
        <div className="admin-theme contents">
          <AdminFinance languageCode={profile.languageCode} />
          <FeeConfigAdmin />
          <AdminTrust languageCode={profile.languageCode} adminProfileId={profile.id} />
        </div>
      </div>

      {/* Notificaciones + Confianza */}
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div>
          <SectionHead id="pf-alerts" icon={Bell} kicker="Bandeja" title="Notificaciones" />
          <button type="button" className="pf-tile mt-4" data-accent="blue" onClick={onOpenNotifications}>
            <span className="pf-tile-icon"><Bell strokeWidth={1.7} />{unreadNotifications > 0 && <i className="pf-dot" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-3xl font-extrabold text-foreground">{unreadNotifications}</span>
              <span className="text-sm text-muted-foreground">{unreadNotifications > 0 ? "sin leer · propuestas, pagos, contrataciones" : "Estás al día"}</span>
            </span>
            <span className="pf-go">Abrir bandeja <ChevronRight className="size-3.5" /></span>
          </button>
        </div>
        <div>
          <SectionHead id="pf-trust" icon={ShieldCheck} kicker="Trust & Safety" title="Confianza y Seguridad" />
          <button type="button" className="pf-tile pf-trust mt-4" data-accent="red" onClick={() => setTrustOpen(true)}>
            <span className="pf-shield" aria-hidden><ShieldCheck strokeWidth={1.5} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-base font-extrabold text-foreground">Tu cuenta está protegida</span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {workerTrust ? (
                  ([
                    ["Identidad", workerTrust.identityVerified],
                    ["Teléfono", workerTrust.phoneVerified],
                    ["Residencia", workerTrust.residenceVerified],
                    ["Antecedentes", workerTrust.backgroundChecked],
                  ] as const).map(([l, ok]) => (
                    <span key={l} className="pf-chip" data-state={ok ? "ok" : "muted"}>{ok ? "✓" : "○"} {l}</span>
                  ))
                ) : (
                  <span className="pf-chip" data-state="ok">✓ Contraseña protegida</span>
                )}
              </span>
            </span>
            <span className="pf-go">Verificación y reportes <ChevronRight className="size-3.5" /></span>
          </button>
        </div>
      </div>

      {/* Privacidad */}
      <div className="mt-10">
        <SectionHead id="pf-privacy" icon={Lock} kicker="Tus datos" title="Privacidad" />
        <div className="uv-console mt-4 grid gap-3 sm:grid-cols-3">
          {[
            [Lock, "Datos personales", "Tus datos son solo tuyos."],
            [ShieldCheck, "Seguridad", "Contraseña protegida."],
            [Smartphone, "Teléfono", profile.phone ?? "Sin teléfono registrado"],
          ].map(([Icon, t, d]) => {
            const I = Icon as typeof Lock;
            return (
              <div key={t as string} className="pf-mini">
                <span className="pf-tile-icon"><I strokeWidth={1.7} /></span>
                <p className="mt-3 font-bold text-foreground">{t as string}</p>
                <p className="text-xs text-muted-foreground">{d as string}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Configuración */}
      <div className="mt-10">
        <SectionHead
          id="pf-settings"
          icon={Settings2}
          kicker="Preferencias"
          title="Configuración"
          aside={<span className="text-xs text-muted-foreground">{saving ? "Guardando…" : ""}</span>}
        />
        <div className="uv-console mt-4 grid gap-3 sm:grid-cols-3">
          {settings.map(({ label, Icon, value, items, key }) => (
            <div key={label} className="pf-mini">
              <span className="pf-tile-icon"><Icon strokeWidth={1.7} /></span>
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
              <Select value={value} onValueChange={(v) => save({ [key]: v })}>
                <SelectTrigger className="pf-select mt-1.5 h-12 rounded-2xl px-3 text-sm font-semibold" aria-label={label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72 rounded-2xl">
                  {items.map(([code, name]) => (
                    <SelectItem className="min-h-11 rounded-xl" key={code} value={code}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <div className="uv-console-row pf-mini mt-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="pf-tile-icon"><Globe2 strokeWidth={1.7} /></span>
            <div>
              <p className="font-bold text-foreground">Apariencia</p>
              <p className="text-xs text-muted-foreground">Tema claro u oscuro, solo en este dispositivo.</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          El idioma, la moneda y el país son independientes entre sí. Ahora: {language?.name ?? profile.languageCode} · {currency ? formatCurrencyName(currency) : profile.currencyCode} · {country?.name ?? profile.countryCode}
        </p>
      </div>

      <button type="button" className="pf-signout mt-10" onClick={() => void signOut()}>
        <LogOut className="size-4" /> Cerrar sesión
      </button>
      <TrustSafetyCenter open={trustOpen} onOpenChange={setTrustOpen} onNavigate={onNavigate} />
    </section>
  );
}
