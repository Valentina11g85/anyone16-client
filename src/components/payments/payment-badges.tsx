/** AnyOne¹⁶ — small shared payment UI atoms. */

import type { PayTranslator } from "@/lib/payments-i18n";
import type { PaymentStatus } from "@/lib/payments-model";

const TONE: Record<PaymentStatus, string> = {
  unpaid: "bg-muted text-muted-foreground",
  payment_pending: "bg-amber-100 text-amber-900",
  authorized: "bg-amber-100 text-amber-900",
  paid: "bg-emerald-100 text-emerald-900",
  held: "bg-sky-100 text-sky-900",
  released: "bg-emerald-100 text-emerald-900",
  refunded: "bg-muted text-muted-foreground",
  partially_refunded: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  disputed: "bg-destructive/10 text-destructive",
};

export function PaymentStatusBadge({ status, t }: { status: PaymentStatus; t: PayTranslator }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${TONE[status]}`}
    >
      {t(`pay.status.${status}` as never)}
    </span>
  );
}

export function DemoBadge({ t }: { t: PayTranslator }) {
  return (
    <span className="inline-flex items-center rounded-full bg-foreground px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-background">
      {t("pay.demo")}
    </span>
  );
}

export function MoneyRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          strong
            ? "font-display text-lg font-extrabold text-foreground"
            : "text-sm font-semibold text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
