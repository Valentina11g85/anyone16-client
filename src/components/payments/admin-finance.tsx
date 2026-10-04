/**
 * AnyOne¹⁶ — Stage 7 admin finance panel 🔴⚫ (read-only overview).
 * Visible only to accounts with the admin role.
 */

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DemoBadge, PaymentStatusBadge } from "@/components/payments/payment-badges";
import { formatMoney } from "@/lib/favor-model";
import { localeFor } from "@/lib/i18n";
import { createPayTranslator } from "@/lib/payments-i18n";
import { useFinance } from "@/lib/payments-store";

type AdminTab = "payments" | "settlements" | "refunds" | "disputes" | "fees";

const TABS: AdminTab[] = ["payments", "settlements", "refunds", "disputes", "fees"];

export function AdminFinance({ languageCode }: { languageCode: string }) {
  const t = useMemo(() => createPayTranslator(languageCode), [languageCode]);
  const locale = localeFor(languageCode);
  const finance = useFinance();
  const [tab, setTab] = useState<AdminTab>("payments");

  if (!finance.isAdmin) return null;

  const money = (value: number, currency: string) =>
    `${formatMoney(value, currency, locale)} ${currency}`;

  return (
    <section className="rounded-[22px] border border-foreground/20 bg-foreground/5 p-5">
      <h2 className="font-display text-lg font-extrabold text-foreground">{t("pay.admin")}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {TABS.map((key) => (
          <Button
            key={key}
            size="sm"
            className="h-10 rounded-xl"
            variant={tab === key ? "dark" : "secondary"}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {t(`pay.admin.${key}` as never)}
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-2 text-sm">
        {tab === "payments" &&
          (finance.payments.length === 0 ? (
            <p className="text-muted-foreground">{t("pay.admin.empty")}</p>
          ) : (
            finance.payments.map((payment) => (
              <div key={payment.id} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{payment.id.slice(0, 8)}</span>
                  <PaymentStatusBadge status={payment.status} t={t} />
                </div>
                <p className="mt-1 font-semibold">
                  {money(payment.amount, payment.currencyCode)} ·{" "}
                  {money(payment.platformFee, payment.currencyCode)} ·{" "}
                  {money(payment.workerAmount, payment.currencyCode)}
                </p>
                <p className="text-xs text-muted-foreground">
                  favor {payment.favorId.slice(0, 8)} · {payment.isDemo ? t("pay.demo") : "real"}
                </p>
              </div>
            ))
          ))}

        {tab === "settlements" &&
          (finance.settlements.length === 0 ? (
            <p className="text-muted-foreground">{t("pay.admin.empty")}</p>
          ) : (
            finance.settlements.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-3">
                <p className="font-semibold">
                  {money(item.grossAmount, item.currencyCode)} →{" "}
                  {money(item.workerAmount, item.currencyCode)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.status} · favor {item.favorId.slice(0, 8)}
                </p>
              </div>
            ))
          ))}

        {tab === "refunds" &&
          (finance.refunds.length === 0 ? (
            <p className="text-muted-foreground">{t("pay.admin.empty")}</p>
          ) : (
            finance.refunds.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-3">
                <p className="font-semibold">{money(item.amount, item.currencyCode)}</p>
                <p className="text-xs text-muted-foreground">
                  {item.kind} · {item.status} · {item.reason}
                </p>
              </div>
            ))
          ))}

        {tab === "disputes" &&
          (finance.disputes.length === 0 ? (
            <p className="text-muted-foreground">{t("pay.admin.empty")}</p>
          ) : (
            finance.disputes.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-3">
                <p className="font-semibold">{item.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {item.status} · favor {item.favorId.slice(0, 8)}
                </p>
              </div>
            ))
          ))}

        {tab === "fees" &&
          finance.feeRules.map((rule) => (
            <div key={rule.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{rule.label}</p>
                {rule.isDemo && <DemoBadge t={t} />}
              </div>
              <p className="text-xs text-muted-foreground">
                {rule.feeType} · {rule.percentage}% · {rule.fixedAmount} ·{" "}
                {rule.countryCode ?? "*"}/{rule.currencyCode ?? "*"}/{rule.categorySlug ?? "*"}
              </p>
            </div>
          ))}
      </div>
    </section>
  );
}
