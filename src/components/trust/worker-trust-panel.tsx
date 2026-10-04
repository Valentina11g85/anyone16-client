/**
 * Worker Trust & Safety panel 🔴⚫ — identity, residence, vehicle and
 * background verification. No provider is connected yet, so every request is
 * stored as "pending / provider not connected"; nothing is ever faked.
 */

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkerTrustSummary } from "@/components/trust/trust-badges";
import { createTrustTranslator } from "@/lib/trust-i18n";
import type { WorkerTrust } from "@/lib/trust-model";
import {
  addVehicle,
  loadWorkerVerifications,
  recomputeTrustLevel,
  requestBackgroundCheck,
  upsertAddressVerification,
  upsertIdentityVerification,
} from "@/lib/trust-repo";
import { refreshTrust, useTrust } from "@/lib/trust-store";

type Row = Record<string, unknown>;

const stateKey = (status: unknown) => {
  switch (status) {
    case "verified":
      return "trust.badge.identity";
    case "in_review":
    case "requires_review":
      return "trust.badge.review";
    case "rejected":
    case "failed":
      return "trust.badge.failed";
    case "flagged":
      return "trust.badge.flagged";
    case "expired":
      return "trust.badge.expired";
    case "provider_not_connected":
      return "trust.badge.notConnected";
    default:
      return "trust.badge.pending";
  }
};


export function WorkerTrustPanel({
  workerProfileId,
  countryCode,
  languageCode,
  isDemo,
}: {
  workerProfileId: string | null;
  countryCode: string;
  languageCode: string;
  isDemo: boolean;
}) {
  const t = useMemo(() => createTrustTranslator(languageCode), [languageCode]);
  const trust = useTrust();
  const record: WorkerTrust | null = workerProfileId
    ? (trust.workers[workerProfileId] ?? null)
    : null;

  const [verifications, setVerifications] = useState<{
    identity: Row | null;
    address: Row | null;
    vehicles: Row[];
    background: Row[];
  }>({ identity: null, address: null, vehicles: [], background: [] });
  const [saved, setSaved] = useState(false);

  const [identity, setIdentity] = useState({ name: "", birth: "", docType: "cc", docRef: "" });
  const [address, setAddress] = useState({ address: "", city: "", region: "", proof: "utility" });
  const [vehicle, setVehicle] = useState({ type: "motorcycle", make: "", model: "", year: "", plate: "" });
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (!workerProfileId) return;
    let alive = true;
    void loadWorkerVerifications(workerProfileId).then((data) => {
      if (alive) setVerifications(data);
    });
    return () => {
      alive = false;
    };
  }, [workerProfileId, saved]);

  if (!workerProfileId) return null;

  const after = async () => {
    await recomputeTrustLevel(workerProfileId);
    await refreshTrust();
    setSaved((value) => !value);
  };

  return (
    <section className="rounded-[22px] border border-foreground/20 bg-foreground/5 p-5">
      <h2 className="inline-flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
        <ShieldCheck className="size-5" aria-hidden="true" />
        {t("trust.title")}
      </h2>

      {record && (
        <div className="mt-3">
          <WorkerTrustSummary trust={record} t={t} />
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("trust.providerMissing")}</p>

      {/* Identity ------------------------------------------------------- */}
      <div className="mt-5 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">{t("trust.identity.title")}</p>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
            {t(stateKey(verifications.identity?.['status']) as never)}
          </span>
        </div>
        <div className="mt-3 grid gap-2">
          <Input
            placeholder={t("trust.identity.legalName")}
            value={identity.name}
            onChange={(event) => setIdentity({ ...identity, name: event.target.value })}
          />
          <Input
            type="date"
            aria-label={t("trust.identity.birth")}
            value={identity.birth}
            onChange={(event) => setIdentity({ ...identity, birth: event.target.value })}
          />
          <Input
            placeholder={t("trust.identity.docType")}
            value={identity.docType}
            onChange={(event) => setIdentity({ ...identity, docType: event.target.value })}
          />
          <Input
            placeholder={t("trust.identity.docRef")}
            value={identity.docRef}
            onChange={(event) => setIdentity({ ...identity, docRef: event.target.value })}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("trust.identity.privacy")}</p>
        <Button
          className="mt-3 w-full"
          variant="dark"
          disabled={!identity.name || !identity.docRef}
          onClick={() =>
            void upsertIdentityVerification({
              workerProfileId,
              legalName: identity.name,
              dateOfBirth: identity.birth || null,
              documentType: identity.docType,
              documentCountry: countryCode,
              documentReference: identity.docRef,
              isDemo,
            }).then(after)
          }
        >
          {t("trust.identity.submit")}
        </Button>
      </div>

      {/* Residence ------------------------------------------------------ */}
      <div className="mt-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">{t("trust.address.title")}</p>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
            {t(stateKey(verifications.address?.['status']) as never)}
          </span>
        </div>
        <div className="mt-3 grid gap-2">
          <Input
            placeholder={t("trust.address.address")}
            value={address.address}
            onChange={(event) => setAddress({ ...address, address: event.target.value })}
          />
          <Input
            placeholder={t("trust.address.city")}
            value={address.city}
            onChange={(event) => setAddress({ ...address, city: event.target.value })}
          />
          <Input
            placeholder={t("trust.address.region")}
            value={address.region}
            onChange={(event) => setAddress({ ...address, region: event.target.value })}
          />
          <Input
            placeholder={t("trust.address.proof")}
            value={address.proof}
            onChange={(event) => setAddress({ ...address, proof: event.target.value })}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("trust.address.privacy")}</p>
        <Button
          className="mt-3 w-full"
          variant="dark"
          disabled={!address.address || !address.city}
          onClick={() =>
            void upsertAddressVerification({
              workerProfileId,
              address: address.address,
              city: address.city,
              region: address.region,
              countryCode,
              proofType: address.proof,
              isDemo,
            }).then(after)
          }
        >
          {t("trust.identity.submit")}
        </Button>
      </div>

      {/* Vehicle -------------------------------------------------------- */}
      <div className="mt-3 rounded-2xl border border-border bg-card p-4">
        <p className="font-bold">{t("trust.vehicle.title")}</p>
        <div className="mt-3 grid gap-2">
          <Input
            placeholder={t("trust.vehicle.type")}
            value={vehicle.type}
            onChange={(event) => setVehicle({ ...vehicle, type: event.target.value })}
          />
          <Input
            placeholder={t("trust.vehicle.make")}
            value={vehicle.make}
            onChange={(event) => setVehicle({ ...vehicle, make: event.target.value })}
          />
          <Input
            placeholder={t("trust.vehicle.model")}
            value={vehicle.model}
            onChange={(event) => setVehicle({ ...vehicle, model: event.target.value })}
          />
          <Input
            placeholder={t("trust.vehicle.year")}
            inputMode="numeric"
            value={vehicle.year}
            onChange={(event) => setVehicle({ ...vehicle, year: event.target.value })}
          />
          <Input
            placeholder={t("trust.vehicle.plate")}
            value={vehicle.plate}
            onChange={(event) => setVehicle({ ...vehicle, plate: event.target.value })}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("trust.vehicle.privacy")}</p>
        <Button
          className="mt-3 w-full"
          variant="dark"
          disabled={!vehicle.plate}
          onClick={() =>
            void addVehicle({
              workerProfileId,
              vehicleType: vehicle.type,
              make: vehicle.make,
              model: vehicle.model,
              year: vehicle.year ? Number(vehicle.year) : null,
              plate: vehicle.plate,
              ownership: "owner",
              countryCode,
              isDemo,
            }).then(after)
          }
        >
          {t("trust.vehicle.add")}
        </Button>
        {verifications.vehicles.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {verifications.vehicles.map((row) => (
              <li key={String(row['id'])}>
                {String(row['vehicle_type'])} · {String(row['status'])}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Background ----------------------------------------------------- */}
      <div className="mt-3 rounded-2xl border border-border bg-card p-4">
        <p className="font-bold">{t("trust.background.title")}</p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          {t("trust.background.consent")}
        </label>
        <Button
          className="mt-3 w-full"
          variant="dark"
          disabled={!consent}
          onClick={() =>
            void requestBackgroundCheck({ workerProfileId, countryCode, isDemo }).then(after)
          }
        >
          {t("trust.background.request")}
        </Button>
        {verifications.background.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {String(verifications.background[0]?.['status'])}
          </p>
        )}
      </div>
    </section>
  );
}
