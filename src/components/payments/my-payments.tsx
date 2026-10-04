/** "Mis pagos", payment detail and "Mis ingresos" — real data from Foundation. */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ORDER_STATUS_LABEL,
  REFUND_STATUS_LABEL,
  formatPaymentMoney,
  matchesFilter,
  type PaymentAdminSummary,
  type PaymentDetail,
  type PaymentFilter,
  type PaymentSummary,
} from "@/lib/payment-model";
import {
  getPaymentOrder,
  loadMyEarnings,
  loadPaymentAdminSummary,
  requestPaymentRefund,
} from "@/lib/payment-repo";
import { refreshPayments, usePayments } from "@/lib/payment-store";
import { OrderBreakdown } from "./payment-order-checkout";

const FILTERS: Array<[PaymentFilter, string]> = [
  ["all", "Todos"],
  ["pending", "Pendientes"],
  ["paid", "Pagados"],
  ["failed", "Fallidos"],
  ["refunded", "Reembolsados"],
];

const date = (iso: string) => new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });

export function MyPayments({ profileId }: { profileId: string }) {
  const { orders, names, loading, error } = usePayments();
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = orders.filter((o) => matchesFilter(o.status, filter));

  return (
    <div className="pf-world" data-accent="blue">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {FILTERS.filter(([k]) => k !== "all").map(([k, label]) => (
          <button
            key={k}
            type="button"
            className="pf-metric text-left"
            data-tone={PAY_TONE[k]}
            data-on={filter === k}
            onClick={() => setFilter(filter === k ? "all" : k)}
          >
            <span className="pf-status" data-tone={PAY_TONE[k]}>{PAY_ICON[k]} {label}</span>
            <span className="pf-count-in mt-2 block font-display text-3xl font-extrabold text-foreground">
              {orders.filter((o) => matchesFilter(o.status, k)).length}
            </span>
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {loading ? (
        <div className="pf-skel mt-4" aria-hidden />
      ) : list.length === 0 ? (
        <div className="pf-empty mt-4">No hay pagos en esta categoría.</div>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {list.map((o) => {
            const iAmBuyer = o.buyerProfileId === profileId;
            const other = iAmBuyer ? o.providerProfileId : o.buyerProfileId;
            const k = payTone(o.status);
            return (
              <li key={o.id}>
                <button className="pf-item" data-tone={PAY_TONE[k]} onClick={() => setOpenId(o.id)}>
                  <span className="pf-item-icon font-display text-base font-extrabold">{PAY_ICON[k]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-foreground">{o.description || "Pago"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {o.subjectType === "favor" ? "Favor" : "Oportunidad"} · {iAmBuyer ? "Pagas a" : "Te paga"}{" "}
                      {(other && names[other]) || "Participante"} · {date(o.createdAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-lg font-extrabold text-foreground">{formatPaymentMoney(o.totalCharged, o.currencyCode)}</span>
                    <span className="pf-status" data-tone={PAY_TONE[k]}>{ORDER_STATUS_LABEL[o.status]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <PaymentDetailSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function PaymentDetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (orderId: string) => {
    setError(null);
    try {
      setDetail(await getPaymentOrder(orderId));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    setDetail(null);
    setReason("");
    if (id) void load(id);
  }, [id]);

  const o = detail?.order;
  const refundable = o && detail?.viewerRole === "buyer" && (o.status === "paid" || o.status === "partially_refunded");

  return (
    <Sheet open={!!id} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-[28px]">
        <SheetHeader>
          <SheetTitle className="font-display text-xl font-extrabold">Detalle del pago</SheetTitle>
        </SheetHeader>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {o && (
          <div className="mt-4 space-y-3 text-sm">
            <p className="font-semibold">{o.description || "Pago"}</p>
            <p className="text-xs text-muted-foreground">ID del pago: {o.id}</p>
            <p className="text-xs text-muted-foreground">Fecha: {date(o.createdAt)}</p>
            <OrderBreakdown order={o} />
            <p className="text-xs text-muted-foreground">
              Proveedor de pago:{" "}
              {o.paymentProvider === "unconfigured"
                ? "Pendiente de configuración"
                : o.paymentProvider === "simulator"
                  ? "Simulador de pago"
                  : o.paymentProvider === "mercadopago"
                    ? "Mercado Pago"
                    : o.paymentProvider}
              {o.externalPaymentId && ` · Referencia externa: ${o.externalPaymentId}`}
            </p>
            {detail!.refunds.map((r) => (
              <p key={r.id} className="rounded-2xl bg-muted p-3">
                {REFUND_STATUS_LABEL[r.status]}: {formatPaymentMoney(r.amount, r.currencyCode)}
                {r.status === "pending" && " — queda pendiente hasta que un proveedor real lo confirme."}
              </p>
            ))}
            {refundable && (
              <div className="space-y-2">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del reembolso" />
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={busy || reason.trim().length < 5}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await requestPaymentRefund(o.id, o.totalCharged, reason.trim());
                      await load(o.id);
                      await refreshPayments();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Solicitar reembolso
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function MyEarnings() {
  const [rows, setRows] = useState<PaymentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadMyEarnings().then(setRows, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="pf-world" data-accent="red">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!rows && !error && <div className="pf-skel" aria-hidden />}
      {rows && rows.length === 0 && (
        <div className="pf-empty">Todavía no tienes ingresos registrados. Cuando completes un trabajo, aparecerán aquí.</div>
      )}
      {rows?.map((r) => {
        const m = (v: number) => formatPaymentMoney(v, r.currencyCode);
        const base = r.paidPayout + r.pendingPayout;
        const paidPct = base > 0 ? (r.paidPayout / base) * 100 : 0;
        return (
          <div key={r.currencyCode} className="mb-4 last:mb-0">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <Metric label="Pendientes" value={m(r.pendingPayout)} tone="pending" />
              <Metric label="Pagados" value={m(r.paidPayout)} tone="done" />
              <Metric label="Total histórico" value={m(r.totalPayout)} tone="progress" />
              <Metric label="Comisión" value={m(r.feesDeducted)} tone="cancel" />
            </div>
            {base > 0 && (
              <div className="mt-4">
                <div className="pf-bar" aria-label={`Pagado ${Math.round(paidPct)}%`}>
                  <i style={{ width: `${paidPct}%` }} />
                </div>
                <p className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Pagado {Math.round(paidPct)}%</span>
                  <span>Pendiente {Math.round(100 - paidPct)}%</span>
                </p>
              </div>
            )}
          </div>
        );
      })}
      <div className="pf-mini mt-4 flex items-center gap-3">
        <span className="pf-status" data-tone="pending">◷ Próximo pago</span>
        <p className="text-xs text-muted-foreground">Pago al proveedor pendiente de integración.</p>
      </div>
    </div>
  );
}

/** Rendered only when Foundation confirms the user is admin. */
export function AdminPaymentSummary() {
  const [rows, setRows] = useState<PaymentAdminSummary[] | null>(null);
  useEffect(() => {
    loadPaymentAdminSummary().then(setRows, () => setRows(null));
  }, []);
  if (!rows) return null;
  return (
    <div className="rounded-[24px] border border-border bg-card p-4 shadow-soft">
      <h3 className="font-display text-base font-extrabold">Órdenes de pago (Admin)</h3>
      {rows.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Sin órdenes de pago.</p>}
      {rows.map((r) => {
        const m = (v: number) => formatPaymentMoney(v, r.currencyCode);
        return (
          <div key={r.currencyCode} className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Stat label="Volumen pagado" value={m(r.totalVolume)} />
            <Stat label="Ingreso plataforma" value={m(r.platformRevenue)} />
            <Stat label="Pendientes" value={String(r.pendingCount)} />
            <Stat label="Pagados" value={String(r.paidCount)} />
            <Stat label="Fallidos" value={String(r.failedCount)} />
            <Stat label="Reembolsado" value={`${m(r.refundedAmount)} · ${r.pendingRefunds} pend.`} />
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="pf-metric" data-tone={tone}>
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="pf-count-in mt-1 truncate font-display text-lg font-extrabold text-foreground sm:text-xl">{value}</p>
    </div>
  );
}

const PAY_ICON: Record<string, string> = { pending: "◷", paid: "✓", failed: "!", refunded: "↩" };
const PAY_TONE: Record<string, string> = { pending: "pending", paid: "done", failed: "cancel", refunded: "dispute" };
export function payTone(status: Parameters<typeof matchesFilter>[0]) {
  for (const k of ["pending", "paid", "failed", "refunded"] as const) if (matchesFilter(status, k)) return k;
  return "pending";
}
export { PAY_ICON, PAY_TONE };
