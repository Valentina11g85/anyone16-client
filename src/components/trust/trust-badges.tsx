/** AnyOne¹⁶ — Stage 8 public trust indicators (no sensitive data). */

import { BadgeCheck, Car, Home, ShieldAlert, ShieldCheck } from "lucide-react";

import { TRUST_LEVEL_KEYS, type TrustLevel, type WorkerTrust } from "@/lib/trust-model";
import type { TrustKey, TrustTranslator } from "@/lib/trust-i18n";

export function TrustBadge({ label, tone = "ok" }: { label: string; tone?: "ok" | "warn" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
        tone === "ok" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
      }`}
    >
      <BadgeCheck className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

export function TrustLevelPill({ level, t }: { level: TrustLevel; t: TrustTranslator }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[11px] font-bold text-background">
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      {t("trust.level.label")} {level} · {t(TRUST_LEVEL_KEYS[level] as TrustKey)}
    </span>
  );
}

/** Public trust summary: never shows address, documents or risk scores. */
export function WorkerTrustSummary({ trust, t }: { trust: WorkerTrust; t: TrustTranslator }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TrustLevelPill level={trust.trustLevel} t={t} />
      {trust.identityVerified && <TrustBadge label={t("trust.badge.identity")} />}
      {trust.residenceVerified && (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
          <Home className="size-3.5" aria-hidden="true" />
          {t("trust.badge.residence")}
        </span>
      )}
      {trust.vehicleVerified && (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
          <Car className="size-3.5" aria-hidden="true" />
          {t("trust.badge.vehicle")}
        </span>
      )}
      {trust.backgroundChecked && <TrustBadge label={t("trust.badge.background")} />}
      {trust.restriction !== "none" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-1 text-[11px] font-bold text-destructive">
          <ShieldAlert className="size-3.5" aria-hidden="true" />
          {t("trust.badge.restricted")}
        </span>
      )}
    </div>
  );
}
