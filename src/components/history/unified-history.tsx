/**
 * Historial unificado — favors, services and payments of the one account,
 * split by role. Everything is read from the existing Foundation-backed stores;
 * nothing is copied or stored locally.
 */
import { useMemo, useState } from "react";

import { AlertTriangle, ArrowRight, Briefcase, Check, Clock3, HandHeart, Inbox, Loader2, ShoppingBag, Wallet, Wrench, X } from "lucide-react";
import { createTranslator } from "@/lib/i18n";
import { useMarketplace } from "@/lib/marketplace-store";
import { useOpportunities } from "@/lib/opportunities-store";
import type { ContractStatus } from "@/lib/opportunities-model";
import { ORDER_STATUS_LABEL, formatPaymentMoney } from "@/lib/payment-model";
import { usePayments } from "@/lib/payment-store";

export type HistoryRole = "client" | "worker" | "buyer" | "provider";
const ROLE_LABEL: Record<HistoryRole, string> = {
  client: "Como Cliente",
  worker: "Como Worker",
  buyer: "Como Contratante",
  provider: "Como Proveedor",
};
const ROLE_ICON = { client: HandHeart, worker: Wrench, buyer: ShoppingBag, provider: Briefcase } as const;
const CONTRACT_LABEL: Record<ContractStatus, string> = {
  agreed: "Precio acordado",
  confirmed: "Contratación confirmada",
  in_progress: "Servicio en progreso",
  completed: "Servicio completado",
  cancelled: "Cancelada",
  disputed: "Disputa abierta",
};

type Item = {
  key: string;
  role: HistoryRole;
  title: string;
  status: string;
  date: string;
  amount: number | null;
  currency: string;
  counterpart: string;
  payment: string | null;
  target: "favors" | "opportunities" | "worker-offers";
};

export function UnifiedHistory({
  profileId,
  languageCode,
  onNavigate,
}: {
  profileId: string;
  languageCode: string;
  onNavigate: (target: "favors" | "opportunities" | "worker-offers") => void;
}) {
  const m = useMarketplace();
  const o = useOpportunities();
  const p = usePayments();
  const t = createTranslator(languageCode);
  const [filter, setFilter] = useState<HistoryRole | "all">("all");

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const orderFor = (kind: "favor" | "contract", id: string) =>
      p.orders.find((x) => (kind === "favor" ? x.favorId : x.serviceContractId) === id) ?? null;
    const payText = (kind: "favor" | "contract", id: string) => {
      const ord = orderFor(kind, id);
      return ord ? `${ORDER_STATUS_LABEL[ord.status]} · ${formatPaymentMoney(ord.totalCharged, ord.currencyCode)}` : null;
    };
    const workerName = (id: string) => m.workers.find((w) => w.id === id)?.name ?? "Worker";
    const myWorker = m.identity?.workerProfileId ?? null;
    // Names Foundation already returned (payments, proposal senders); else "Participante".
    const PLACEHOLDER = new Set(["Autor no registrado", "Participante", "Usuario AnyOne", ""]);
    const personName = (id: string) => {
      if (p.names[id]) return p.names[id];
      const fromOffer = o.offers.find((x) => x.fromProfileId === id && !PLACEHOLDER.has(x.fromName))?.fromName;
      const fromListing = o.listings.find((l) => l.authorProfileId === id && !PLACEHOLDER.has(l.authorName))?.authorName;
      return fromOffer ?? fromListing ?? "Participante";
    };

    for (const f of m.favors) {
      const offerId = m.acceptedOffers[f.id];
      const offer = offerId ? m.offers.find((x) => x.id === offerId) : undefined;
      const base = {
        title: f.description || "Favor",
        status: t(`status.${f.status}`),
        date: f.updatedAt || f.createdAt,
        amount: offer?.amount ?? null,
        currency: offer?.currencyCode ?? f.currencyCode,
        payment: payText("favor", f.id),
        target: "favors" as const,
      };
      if (f.userId === profileId)
        out.push({ ...base, key: `fc-${f.id}`, role: "client", counterpart: offer ? workerName(offer.workerId) : "Sin Worker seleccionado" });
      if (myWorker && offer?.workerId === myWorker)
        out.push({ ...base, target: "worker-offers" as const, key: `fw-${f.id}`, role: "worker", counterpart: "Cliente" });
    }
    for (const c of o.contracts) {
      const listing = o.listings.find((l) => l.id === c.listingId);
      const base = {
        title: listing?.title ?? "Servicio",
        status: CONTRACT_LABEL[c.status] ?? c.status,
        date: c.updatedAt || c.createdAt,
        amount: c.amount,
        currency: c.currencyCode,
        payment: payText("contract", c.id),
        target: "opportunities" as const,
      };
      if (c.buyerProfileId === profileId)
        out.push({ ...base, key: `cb-${c.id}`, role: "buyer", counterpart: personName(c.providerProfileId) });
      if (c.providerProfileId === profileId)
        out.push({ ...base, key: `cp-${c.id}`, role: "provider", counterpart: personName(c.buyerProfileId) });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [m, o, p, profileId, t]);

  const shown = filter === "all" ? items : items.filter((i) => i.role === filter);
  const count = (r: HistoryRole) => items.filter((i) => i.role === r).length;

  const tone = (s: string) => {
    const v = s.toLowerCase();
    if (/cancel/.test(v)) return "cancel";
    if (/disput/.test(v)) return "dispute";
    if (/complet|finaliz/.test(v)) return "done";
    if (/progreso|camino|lleg|confirm/.test(v)) return "progress";
    return "pending";
  };

  const TONE_ICON = { done: Check, cancel: X, dispute: AlertTriangle, progress: Loader2, pending: Clock3 } as const;
  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(today) - start(d)) / 86400000);
    if (diff === 0) return "Hoy";
    if (diff === 1) return "Ayer";
    return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  };
  const groups: { label: string; items: Item[] }[] = [];
  for (const i of shown) {
    const label = dayLabel(i.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(i);
    else groups.push({ label, items: [i] });
  }
  const filters: { id: HistoryRole | "all"; label: string; n: number }[] = [
    { id: "all", label: "Todo", n: items.length },
    ...(Object.keys(ROLE_LABEL) as HistoryRole[]).map((r) => ({ id: r, label: ROLE_LABEL[r].replace("Como ", ""), n: count(r) })),
  ];

  return (
    <div className="hx">
      <div className="hx-filters no-scrollbar" role="tablist" aria-label="Filtrar historial">
        {filters.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className="hx-filter"
            data-on={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label} <b>{f.n}</b>
          </button>
        ))}
      </div>

      {(m.loading || o.loading) && items.length === 0 && (
        <div className="hx-timeline mt-5" aria-hidden="true">
          {[0, 1].map((k) => <div key={k} className="pf-skel hx-skel" />)}
        </div>
      )}

      {!m.loading && !o.loading && shown.length === 0 && (
        <div className="hx-empty">
          <span className="hx-empty-icon"><Inbox strokeWidth={1.6} /></span>
          <p className="font-display text-base font-bold text-foreground">Todavía no hay actividad</p>
          <p className="text-sm text-muted-foreground">Cuando completes o participes en un servicio, aparecerá aquí.</p>
        </div>
      )}

      <div key={filter} className="hx-groups">
        {groups.map((g) => (
          <section key={g.label} className="hx-group">
            <h3 className="hx-day"><span>{g.label}</span></h3>
            <ol className="hx-timeline">
              {g.items.map((i, idx) => {
                const tn = tone(i.status);
                const RoleIcon = ROLE_ICON[i.role];
                const ToneIcon = TONE_ICON[tn as keyof typeof TONE_ICON];
                return (
                  <li key={i.key} className="hx-item" data-tone={tn} style={{ animationDelay: `${Math.min(idx, 8) * 45}ms` }}>
                    <span className="hx-dot" aria-hidden="true"><ToneIcon strokeWidth={2.2} /></span>
                    <button type="button" onClick={() => onNavigate(i.target)} className="hx-card">
                      <span className="hx-row">
                        <span className="hx-status" data-tone={tn}>{i.status}</span>
                        <span className="hx-role"><RoleIcon strokeWidth={1.8} />{ROLE_LABEL[i.role].replace("Como ", "")}</span>
                      </span>
                      <span className="hx-title">{i.title}</span>
                      <span className="hx-sub">Con {i.counterpart}</span>
                      <span className="hx-foot">
                        <span className="min-w-0">
                          <span className="hx-amount">
                            {i.amount != null ? formatPaymentMoney(i.amount, i.currency) : "Monto sin acordar"}
                          </span>
                          <span className="hx-meta">
                            {new Date(i.date).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                          </span>
                          {i.payment && (
                            <span className="hx-meta hx-pay"><Wallet strokeWidth={1.8} />Pago: {i.payment}</span>
                          )}
                        </span>
                        <span className="hx-go">Ver detalle <ArrowRight strokeWidth={2} /></span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
