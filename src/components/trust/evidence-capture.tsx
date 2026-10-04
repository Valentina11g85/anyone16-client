/**
 * Evidence trail for a favor: pickup, purchase receipt and delivery.
 * Evidence never replaces the mandatory confirmation code.
 */

import { useEffect, useMemo, useState } from "react";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Favor } from "@/lib/favor-model";
import type { Coords } from "@/lib/geo";
import { createTrustTranslator } from "@/lib/trust-i18n";
import { addEvidence, loadEvidence } from "@/lib/trust-repo";

type Row = Record<string, unknown>;
type Kind = "pickup" | "receipt" | "delivery";

export function EvidenceCapture({
  favor,
  languageCode,
  workerProfileId,
  customerProfileId,
  position,
  canAdd,
}: {
  favor: Favor;
  languageCode: string;
  workerProfileId?: string | null;
  customerProfileId?: string | null;
  position?: Coords | null;
  canAdd: boolean;
}) {
  const t = useMemo(() => createTrustTranslator(languageCode), [languageCode]);
  const [rows, setRows] = useState<Row[]>([]);
  const [kind, setKind] = useState<Kind>("pickup");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState("");
  const [amount, setAmount] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadEvidence(favor.id).then((data) => {
      if (alive) setRows(data);
    });
    return () => {
      alive = false;
    };
  }, [favor.id, reload]);

  const save = async () => {
    await addEvidence({
      favorId: favor.id,
      kind,
      workerProfileId: workerProfileId ?? null,
      customerProfileId: customerProfileId ?? null,
      description,
      photoUrl: photo || null,
      amount: amount ? Number(amount) : null,
      currencyCode: amount ? favor.budget.currencyCode : null,
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
      isDemo: !workerProfileId && !customerProfileId,
    });
    setDescription("");
    setPhoto("");
    setAmount("");
    setReload((value) => value + 1);
  };

  return (
    <section className="mt-4 rounded-[22px] border border-border bg-card p-5">
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <Camera className="size-4" aria-hidden="true" />
        {t("trust.evidence.title")}
      </p>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("trust.evidence.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((row) => (
            <li key={String(row['id'])} className="rounded-2xl border border-border bg-surface p-3">
              <p className="font-semibold">
                {t(`trust.evidence.${String(row['kind'])}` as never)} ·{" "}
                {String(row['description'] ?? "")}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(String(row['captured_at'])).toLocaleString()}
                {row['latitude'] !== null && row['latitude'] !== undefined ? " · GPS" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <div className="mt-4 grid gap-2">
          <div className="flex flex-wrap gap-2">
            {(["pickup", "receipt", "delivery"] as Kind[]).map((item) => (
              <Button
                key={item}
                size="sm"
                className="h-10 rounded-xl"
                variant={kind === item ? "default" : "secondary"}
                aria-pressed={kind === item}
                onClick={() => setKind(item)}
              >
                {t(`trust.evidence.${item}` as never)}
              </Button>
            ))}
          </div>
          <Input
            placeholder={t("trust.evidence.description")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Input
            placeholder={t("trust.evidence.photo")}
            value={photo}
            onChange={(event) => setPhoto(event.target.value)}
          />
          {kind === "receipt" && (
            <Input
              placeholder={`${t("trust.evidence.amount")} (${favor.budget.currencyCode})`}
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
          <Button disabled={!description} onClick={() => void save()}>
            {t("trust.evidence.add")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("trust.evidence.note")}</p>
        </div>
      )}
    </section>
  );
}
