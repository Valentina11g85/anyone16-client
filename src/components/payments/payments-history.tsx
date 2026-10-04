/**
 * AnyOne¹⁶ — Stage 7 client payments history 🔵.
 * Favor, date, worker, amount + currency, status, method, receipt,
 * plus test refund and dispute records (nothing real is executed).
 */

import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DemoBadge, MoneyRow, PaymentStatusBadge } from "@/components/payments/payment-badges";
import { formatMoney } from "@/lib/favor-model";
import { localeFor } from "@/lib/i18n";
import { createPayTranslator } from "@/lib/payments-i18n";
import type { Payment } from "@/lib/payments-model";
import {
  openFavorDispute,
  paymentsForCustomer,
  refundPayment,
  refundsForPayment,
  settlementForPayment,
  useFinance,
} from "@/lib/payments-store";

export function PaymentsHistory({
  profileId,
  languageCode,
  favorTitles,
  workerNames,
}: {
  profileId: string | null;
  languageCode: string;
  favorTitles: Record<string, string>;
  workerNames: Record<string, string>;
}) {
  const t = useMemo(() => createPayTranslator(languageCode), [languageCode]);
  const locale = localeFor(languageCode);
  const finance = useFinance();
  const [openPayment, setOpenPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);

  const payments = paymentsForCustomer(finance, profileId);
  const money = (value: number, currency: string) =>
    `${formatMoney(value, currency, locale)} ${currency}`;

  if (payments.length === 0) {
    return (
      <div className="rounded-[22px] border border-dashed border-border bg-card p-8 text-center">
        <p className="font-display text-base font-bold">{t("pay.history")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("pay.historyEmpty")}</p>
      </div>
    );
  }

  const settlement = openPayment ? settlementForPayment(finance, openPayment.id) : null;
  const refunds = openPayment ? refundsForPayment(finance, openPayment.id) : [];

  return (
    <div className="space-y-3">
      {payments.map((payment) => (
        <button
          key={payment.id}
          type="button"
          onClick={() => setOpenPayment(payment)}
          className="w-full rounded-[22px] border border-border bg-card p-4 text-left shadow-soft"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate font-display text-base font-bold text-foreground">
              {favorTitles[payment.favorId] ?? t("pay.favor")}
            </p>
            {payment.isDemo && <DemoBadge t={t} />}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-brand-dark">
              {money(payment.amount, payment.currencyCode)}
            </span>
            <PaymentStatusBadge status={payment.status} t={t} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(payment.createdAt),
            )}
            {payment.workerProfileId ? ` · ${workerNames[payment.workerProfileId] ?? ""}` : ""}
          </p>
        </button>
      ))}

      <Sheet open={openPayment !== null} onOpenChange={(value) => !value && setOpenPayment(null)}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-[28px]">
          <SheetHeader>
            <SheetTitle className="font-display text-xl font-extrabold">
              {t("pay.detail")}
            </SheetTitle>
          </SheetHeader>
          {openPayment && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <PaymentStatusBadge status={openPayment.status} t={t} />
                {openPayment.isDemo && <DemoBadge t={t} />}
              </div>
              <section className="mt-4 rounded-[22px] border border-border bg-card p-4">
                <MoneyRow
                  label={t("pay.agreed")}
                  value={money(openPayment.amount, openPayment.currencyCode)}
                  strong
                />
                <MoneyRow
                  label={t("pay.fee")}
                  value={money(openPayment.platformFee, openPayment.currencyCode)}
                />
                <MoneyRow
                  label={t("pay.workerAmount")}
                  value={money(openPayment.workerAmount, openPayment.currencyCode)}
                />
                <MoneyRow label={t("pay.method")} value={openPayment.method ?? "—"} />
                <MoneyRow
                  label={t("pay.receipt")}
                  value={`${t("pay.demo")} · ${openPayment.id.slice(0, 8)}`}
                />
                {settlement && (
                  <MoneyRow
                    label={t("pay.settlement")}
                    value={
                      settlement.status === "released"
                        ? t("pay.settlementReleased")
                        : t("pay.settlementPending")
                    }
                  />
                )}
              </section>

              {refunds.length > 0 && (
                <section className="mt-4 rounded-[22px] border border-border bg-card p-4">
                  <p className="eyebrow">{t("pay.refund")}</p>
                  {refunds.map((refund) => (
                    <MoneyRow
                      key={refund.id}
                      label={refund.reason}
                      value={money(refund.amount, refund.currencyCode)}
                    />
                  ))}
                </section>
              )}

              <p className="mt-4 flex items-start gap-2 rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
                <Receipt className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t("pay.demoNote")}
              </p>

              <Button
                className="mt-4 w-full"
                size="touch"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void refundPayment({
                    payment: openPayment,
                    amount: openPayment.amount,
                    reason: t("pay.refundFull"),
                    kind: "full",
                    actorProfileId: profileId,
                  })
                    .catch(() => undefined)
                    .finally(() => {
                      setBusy(false);
                      setOpenPayment(null);
                    });
                }}
              >
                {t("pay.refundRequest")}
              </Button>
              <Button
                className="mt-2 w-full"
                size="touch"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void openFavorDispute({
                    favorId: openPayment.favorId,
                    paymentId: openPayment.id,
                    openedByProfileId: profileId,
                    openedByRole: "customer",
                    reason: t("pay.disputeReason"),
                    isDemo: openPayment.isDemo,
                  })
                    .catch(() => undefined)
                    .finally(() => {
                      setBusy(false);
                      setOpenPayment(null);
                    });
                }}
              >
                {t("pay.disputeOpen")}
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
