/**
 * AnyOne¹⁶ — Stage 7 client checkout 🔵.
 *
 * Shows the real favor being paid (never a demo favor), the agreed price from
 * the accepted offer, the configurable AnyOne¹⁶ fee and the amount prepared
 * for the worker. No real provider is called and no real money moves.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DemoBadge, MoneyRow, PaymentStatusBadge } from "@/components/payments/payment-badges";
import { formatMoney, type Favor } from "@/lib/favor-model";
import { localeFor } from "@/lib/i18n";
import { createPayTranslator } from "@/lib/payments-i18n";
import { PAYMENT_METHODS, type Payment, type PaymentMethodKey } from "@/lib/payments-model";
import {
  paymentForFavor,
  quoteFavorPayment,
  runTestPayment,
  startFavorPayment,
  useFinance,
} from "@/lib/payments-store";

export function PaymentCheckout({
  favor,
  offerId,
  workerName,
  workerProfileId,
  agreedAmount,
  currencyCode,
  customerProfileId,
  languageCode,
  open,
  onOpenChange,
}: {
  favor: Favor;
  offerId: string | null;
  workerName: string;
  workerProfileId: string | null;
  agreedAmount: number;
  currencyCode: string;
  customerProfileId: string | null;
  languageCode: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const t = useMemo(() => createPayTranslator(languageCode), [languageCode]);
  const locale = localeFor(languageCode);
  const finance = useFinance();
  const [method, setMethod] = useState<PaymentMethodKey>("card");
  const [phase, setPhase] = useState<"summary" | "processing" | "done" | "error">("summary");
  const [error, setError] = useState<string | null>(null);

  const isDemo = !customerProfileId;
  const existing = paymentForFavor(finance, favor.id);
  const breakdown = quoteFavorPayment(finance, {
    amount: agreedAmount,
    currencyCode,
    countryCode: favor.countryCode,
    categorySlug: favor.category,
    city: favor.geo.city,
  });

  const money = (value: number) => `${formatMoney(value, currencyCode, locale)} ${currencyCode}`;

  const confirm = async () => {
    setPhase("processing");
    setError(null);
    try {
      const payment: Payment =
        existing ??
        (await startFavorPayment({
          favorId: favor.id,
          offerId,
          customerProfileId,
          workerProfileId,
          breakdown,
          method,
          isDemo,
        }));
      await runTestPayment(payment, customerProfileId);
      setPhase("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "error");
      setPhase("error");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-[28px]">
        <SheetHeader>
          <SheetTitle className="font-display text-xl font-extrabold">{t("pay.title")}</SheetTitle>
        </SheetHeader>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {isDemo && <DemoBadge t={t} />}
          {existing && <PaymentStatusBadge status={existing.status} t={t} />}
        </div>

        {phase === "processing" && (
          <div className="mt-8 grid place-items-center gap-3 py-10 text-center">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="font-display text-lg font-bold">{t("pay.processingState")}</p>
          </div>
        )}

        {phase === "error" && (
          <div className="mt-8 grid place-items-center gap-3 py-8 text-center">
            <XCircle className="size-9 text-destructive" aria-hidden="true" />
            <p className="font-display text-lg font-bold">{t("pay.failed")}</p>
            <p className="text-sm text-muted-foreground">{error ?? t("pay.error")}</p>
            <Button className="mt-3 w-full" size="touch" onClick={() => void confirm()}>
              {t("pay.retry")}
            </Button>
          </div>
        )}

        {phase === "done" && (
          <div className="mt-8 grid place-items-center gap-3 py-8 text-center">
            <CheckCircle2 className="size-9 text-primary" aria-hidden="true" />
            <p className="font-display text-lg font-bold">{t("pay.success")}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{t("pay.successBody")}</p>
            <p className="text-xs font-semibold text-muted-foreground">{t("pay.noProvider")}</p>
            <Button className="mt-3 w-full" size="touch" onClick={() => onOpenChange(false)}>
              {t("pay.detail")}
            </Button>
          </div>
        )}

        {phase === "summary" && (
          <>
            <section className="mt-4 rounded-[22px] border border-border bg-card p-4">
              <p className="eyebrow">{t("pay.summary")}</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t("pay.favor")}
                  </dt>
                  <dd className="font-semibold text-foreground">{favor.description || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t("pay.pickup")}
                  </dt>
                  <dd className="font-semibold text-foreground">
                    {favor.pickupLocation?.label ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t("pay.destination")}
                  </dt>
                  <dd className="font-semibold text-foreground">
                    {favor.destinationLocation?.label ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t("pay.worker")}
                  </dt>
                  <dd className="font-semibold text-foreground">{workerName}</dd>
                </div>
              </dl>
            </section>

            <section className="mt-4 rounded-[22px] border border-primary/30 bg-brand-soft p-4">
              <MoneyRow label={t("pay.agreed")} value={money(breakdown.grossAmount)} />
              <MoneyRow label={t("pay.fee")} value={`− ${money(breakdown.platformFee)}`} />
              {breakdown.processingFee > 0 && (
                <MoneyRow label={t("pay.processing")} value={`− ${money(breakdown.processingFee)}`} />
              )}
              {breakdown.taxes > 0 && (
                <MoneyRow label={t("pay.taxes")} value={`− ${money(breakdown.taxes)}`} />
              )}
              <div className="my-1 border-t border-primary/20" />
              <MoneyRow label={t("pay.total")} value={money(breakdown.totalAmount)} strong />
              <MoneyRow label={t("pay.workerAmount")} value={money(breakdown.workerAmount)} />
              {breakdown.feeRuleLabel && (
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-dark">
                  {t("pay.feeRule")}: {breakdown.feeRuleLabel}
                </p>
              )}
            </section>

            <section className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("pay.method")}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((key) => (
                  <Button
                    key={key}
                    size="touch"
                    variant={method === key ? "default" : "secondary"}
                    aria-pressed={method === key}
                    onClick={() => setMethod(key)}
                  >
                    <CreditCard />
                    {t(`pay.method.${key}` as never)}
                  </Button>
                ))}
              </div>
            </section>

            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("pay.demoNote")} {t("pay.noProvider")}
            </p>

            <Button className="mt-4 w-full" size="touch" onClick={() => void confirm()}>
              {t("pay.start")}
            </Button>
            <Button
              className="mt-2 w-full"
              size="touch"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t("pay.cancel")}
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
