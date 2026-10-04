/**
 * AnyOne¹⁶ — Stage 7 worker earnings 🔴⚫.
 * Accounting record only: there is no connected bank account and no payout.
 */

import { useMemo } from "react";

import { MoneyRow } from "@/components/payments/payment-badges";
import { formatMoney } from "@/lib/favor-model";
import { localeFor } from "@/lib/i18n";
import { createPayTranslator } from "@/lib/payments-i18n";
import { settlementsForWorker, useFinance } from "@/lib/payments-store";

export function WorkerEarnings({
  workerProfileId,
  languageCode,
  fallbackCurrency,
}: {
  workerProfileId: string | null;
  languageCode: string;
  fallbackCurrency: string;
}) {
  const t = useMemo(() => createPayTranslator(languageCode), [languageCode]);
  const locale = localeFor(languageCode);
  const finance = useFinance();
  const settlements = settlementsForWorker(finance, workerProfileId);

  const currency = settlements[0]?.currencyCode ?? fallbackCurrency;
  const sum = (pick: (value: (typeof settlements)[number]) => number) =>
    settlements.reduce((total, item) => total + pick(item), 0);

  const gross = sum((item) => item.grossAmount);
  const fees = sum((item) => item.platformFee + item.processingFee + item.taxes);
  const net = sum((item) => item.workerAmount);
  const pending = settlements
    .filter((item) => item.status === "pending")
    .reduce((total, item) => total + item.workerAmount, 0);
  const released = settlements
    .filter((item) => item.status === "released")
    .reduce((total, item) => total + item.workerAmount, 0);

  const money = (value: number) => `${formatMoney(value, currency, locale)} ${currency}`;

  return (
    <section className="uv-module rounded-[22px] border border-border bg-card p-5 shadow-soft">
      <h2 className="font-display text-lg font-extrabold text-foreground">{t("pay.earnings")}</h2>
      {settlements.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("pay.earningsEmpty")}</p>
      ) : (
        <div className="mt-2">
          <MoneyRow label={t("pay.earnings.gross")} value={money(gross)} />
          <MoneyRow label={t("pay.earnings.fee")} value={`− ${money(fees)}`} />
          <MoneyRow label={t("pay.earnings.net")} value={money(net)} strong />
          <MoneyRow label={t("pay.earnings.pending")} value={money(pending)} />
          <MoneyRow label={t("pay.earnings.released")} value={money(released)} />
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("pay.earnings.note")}</p>
    </section>
  );
}
