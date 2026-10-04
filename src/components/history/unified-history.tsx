/**
 * Historial unificado — favors, services and payments of the one account,
 * split by role. Everything is read from the existing Foundation-backed stores;
 * nothing is copied or stored locally.
 */
import { useMemo, useState } from "react";

import { Briefcase, HandHeart, ShoppingBag, Wrench } from "lucide-react";
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

  return (
    <div>
      <div className="pf-filters no-scrollbar">
        <button type="button" className="pf-filter" data-on={filter === "all"} onClick={() => setFilter("all")}>
          Todo <b>{items.length}</b>
        </button>
        {(Object.keys(ROLE_LABEL) as HistoryRole[]).map((r) => (
          <button key={r} type="button" className="pf-filter" data-on={filter === r} onClick={() => setFilter(r)}>
            {ROLE_LABEL[r].replace("Como ", "")} <b>{count(r)}</b>
          </button>
        ))}
      </div>
      <ul className="uv-archive mt-4 grid gap-3 sm:grid-cols-2">
        {(m.loading || o.loading) && items.length === 0 &&
          [0, 1].map((k) => <li key={k} className="pf-skel" aria-hidden />)}
        {!m.loading && !o.loading && shown.length === 0 && (
          <li className="pf-empty sm:col-span-2">No hay actividad en esta categoría todavía.</li>
        )}
        {shown.map((i) => {
          const tn = tone(i.status);
          const RoleIcon = ROLE_ICON[i.role];
          return (
            <li key={i.key} className="uv-archive-item" data-tone={tn}>
              <span className="uv-node" aria-hidden="true"><RoleIcon strokeWidth={1.7} /></span>
              <button type="button" onClick={() => onNavigate(i.target)} className="pf-item pf-item-tall" data-tone={tn}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="pf-status" data-tone={tn}>{i.status}</span>
                    <span className="text-[0.7rem] font-bold uppercase tracking-wider text-primary">{ROLE_LABEL[i.role]}</span>
                  </span>
                  <span className="mt-2 block truncate font-bold text-foreground">{i.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">Con {i.counterpart}</span>
                  <span className="mt-3 flex items-end justify-between gap-3">
                    <span>
                      <span className="block font-display text-xl font-extrabold text-foreground">
                        {i.amount != null ? formatPaymentMoney(i.amount, i.currency) : "Monto sin acordar"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(i.date).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                        {i.payment && ` · Pago: ${i.payment}`}
                      </span>
                    </span>
                    <span className="pf-go shrink-0">Ver detalle →</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
