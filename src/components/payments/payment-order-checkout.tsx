/**
 * PaymentOrderCheckout — reusable for Favor and Service Contract.
 * Amounts always come from Foundation (create_payment_order). Never fakes a payment.
 */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ORDER_STATUS_LABEL,
  formatPaymentMoney,
  type PaymentOrder,
  type PaymentSubjectType,
} from "@/lib/payment-model";
import { activePaymentProvider, simulatorProvider, type SimulatedOutcome } from "@/lib/payment-provider";
import {
  activeOrderFor,
  cancelOrder,
  ensurePaymentOrder,
  getPaymentState,
  refreshPayments,
  usePayments,
} from "@/lib/payment-store";

export function PaymentOrderPanel({
  subjectType,
  subjectId,
  summary,
  canPay,
}: {
  subjectType: PaymentSubjectType;
  subjectId: string;
  summary: string;
  /** Only the buyer can create an order; providers just see its status. */
  canPay: boolean;
}) {
  usePayments();
  const [open, setOpen] = useState(false);
  const order = activeOrderFor(subjectType, subjectId);

  if (!canPay && !order) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Orden de pago</p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
          {order ? ORDER_STATUS_LABEL[order.status] : "Sin orden"}
        </span>
      </div>
      {order && (
        <p className="mt-1 text-sm font-semibold">
          Total: {formatPaymentMoney(order.totalCharged, order.currencyCode)}
        </p>
      )}
      <Button className="mt-2 w-full" variant="outline" onClick={() => setOpen(true)}>
        {order ? "Ver pago" : "Pagar"}
      </Button>
      <PaymentCheckout
        open={open}
        onOpenChange={setOpen}
        subjectType={subjectType}
        subjectId={subjectId}
        summary={summary}
        canPay={canPay}
      />
    </div>
  );
}

export function PaymentCheckout({
  open,
  onOpenChange,
  subjectType,
  subjectId,
  summary,
  canPay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectType: PaymentSubjectType;
  subjectId: string;
  summary: string;
  canPay: boolean;
}) {
  usePayments();
  const order = activeOrderFor(subjectType, subjectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const continueToPay = () =>
    run(async () => {
      const current = order ?? (await ensurePaymentOrder(subjectType, subjectId));
      const result = await activePaymentProvider.createPayment(current);
      if (!result.ok) setNotice(result.message);
      else if (result.redirectUrl) window.location.assign(result.redirectUrl);
    });

  const [simOn, setSimOn] = useState(false);
  useEffect(() => setSimOn(simulatorProvider.isAvailable()), []);

  const simulate = (outcome: SimulatedOutcome) =>
    run(async () => {
      const current = order ?? (await ensurePaymentOrder(subjectType, subjectId));
      const r = await simulatorProvider.simulate(current.id, outcome);
      await refreshPayments();
      if (!r.ok) return setError(r.message);
      const text =
        r.status === "paid"
          ? "Pago aprobado"
          : r.status === "failed"
            ? "Pago rechazado. Puedes intentarlo de nuevo."
            : r.status === "pending"
              ? "Pago pendiente"
              : ORDER_STATUS_LABEL[r.status as PaymentOrder["status"]] ?? r.status;
      setNotice(`${text} · Orden ${r.orderId.slice(0, 8)}…${r.repeated ? " (ya registrado)" : ""}`);
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-[28px]">
        <SheetHeader>
          <SheetTitle className="font-display text-xl font-extrabold">Pago</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl bg-muted p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">Resumen del servicio</p>
            <p className="mt-1 text-sm font-semibold">{summary}</p>
          </div>

          {order ? (
            <OrderBreakdown order={order} />
          ) : (
            <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
              Foundation calculará el precio acordado, las comisiones y el total al crear la orden.
            </p>
          )}

          {!activePaymentProvider.configured && (
            <p className="rounded-2xl bg-muted p-3 text-sm font-semibold text-foreground">
              Pago pendiente de configuración. Todavía no hay un proveedor de pagos conectado: no se
              realizará ningún cobro.
            </p>
          )}
          {notice && <p className="rounded-2xl bg-brand-soft p-3 text-sm text-primary">{notice}</p>}
          {error && <p className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

          {canPay && (!order || order.status === "pending") && (
            <Button className="w-full" size="touch" disabled={busy} onClick={() => void continueToPay()}>
              {busy ? "Preparando pago…" : activePaymentProvider.label}
            </Button>
          )}
          {simOn && canPay && (!order || order.status === "pending") && (
            <div className="rounded-2xl border-2 border-dashed border-destructive/60 p-3">
              <p className="text-center text-xs font-extrabold uppercase tracking-widest text-destructive">
                Entorno de prueba
              </p>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                {simulatorProvider.label}: no se cobra dinero real. Solo disponible en desarrollo.
              </p>
              {order && (
                <div className="mt-2 space-y-0.5 text-xs">
                  <p>Servicio: {order.description || summary}</p>
                  <p>Precio: {formatPaymentMoney(order.subtotal, order.currencyCode)}</p>
                  <p>Comisión: {formatPaymentMoney(order.platformFee + order.buyerFee + order.providerFee, order.currencyCode)}</p>
                  <p>Total: {formatPaymentMoney(order.totalCharged, order.currencyCode)}</p>
                  <p>Moneda: {order.currencyCode}</p>
                  <p>Proveedor: {simulatorProvider.label}</p>
                </div>
              )}
              <div className="mt-2 grid gap-2">
                {(
                  [
                    ["approved", "Simular pago aprobado"],
                    ["rejected", "Simular pago rechazado"],
                    ["pending", "Simular pago pendiente"],
                  ] as const
                ).map(([outcome, label]) => (
                  <Button key={outcome} variant="outline" size="sm" disabled={busy} onClick={() => void simulate(outcome)}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {order?.status === "pending" && (
            <Button
              className="w-full"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!window.confirm("¿Cancelar esta orden de pago?")) return;
                  await cancelOrder(order.id);
                })
              }
            >
              Cancelar orden de pago
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Tras volver de Mercado Pago: muestra el estado REAL de Foundation, nunca asume "Pagado". */
export function PaymentReturnNotice() {
  usePayments();
  const [orderId, setOrderId] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("pago");
    if (!id) return;
    setOrderId(id);
    void refreshPayments();
    // payment_orders realtime lives in payment-store; this slow poll is only a safety net.
    const t = setInterval(() => void refreshPayments(), 15000);
    const stop = setTimeout(() => clearInterval(t), 120000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, []);
  if (!orderId) return null;
  const order = getPaymentState().orders.find((o) => o.id === orderId);
  const close = () => {
    const u = new URL(window.location.href);
    u.searchParams.delete("pago");
    u.searchParams.delete("resultado");
    window.history.replaceState(null, "", u.toString());
    setOrderId(null);
  };
  return (
    <div className="fixed inset-x-3 top-3 z-50 rounded-2xl border border-border bg-card p-4 shadow-lg">
      <p className="text-sm font-bold">Estado de tu pago (según Foundation)</p>
      <p className="mt-1 text-sm">
        {order
          ? `${ORDER_STATUS_LABEL[order.status]} · ${formatPaymentMoney(order.totalCharged, order.currencyCode)}`
          : "Consultando…"}
      </p>
      {order && order.status !== "paid" && (
        <p className="mt-1 text-xs text-muted-foreground">
          El pago solo se confirma cuando Mercado Pago lo notifica. Esto puede tardar unos segundos.
        </p>
      )}
      <Button className="mt-2" size="sm" variant="outline" onClick={close}>
        Cerrar
      </Button>
    </div>
  );
}

export function OrderBreakdown({ order }: { order: PaymentOrder }) {
  const m = (v: number) => formatPaymentMoney(v, order.currencyCode);
  return (
    <div className="divide-y divide-border rounded-2xl border border-border text-sm">
      <Line label="Precio acordado" value={m(order.subtotal)} />
      <Line label="Comisión de plataforma" value={m(order.platformFee)} hint="Se descuenta al proveedor" />
      {order.buyerFee > 0 && <Line label="Cargo de servicio" value={m(order.buyerFee)} />}
      {order.providerFee > 0 && <Line label="Cargo al proveedor" value={m(order.providerFee)} />}
      <Line label="Total" value={m(order.totalCharged)} strong />
      <Line label="Moneda" value={order.currencyCode} />
      <Line label="Estado del pago" value={ORDER_STATUS_LABEL[order.status]} strong />
    </div>
  );
}

function Line({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <div>
        <p className={strong ? "font-bold" : "text-muted-foreground"}>{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className={strong ? "font-bold" : "font-semibold"}>{value}</p>
    </div>
  );
}
