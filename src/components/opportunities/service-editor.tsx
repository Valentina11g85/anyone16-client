/** Oportunidades — create → review → confirm → publish (never auto-publishes). */

import { useState } from "react";
import { ArrowLeft, Check, FileText, ImagePlus, Loader2, X } from "lucide-react";

import {
  acceptFor,
  isPdfRef,
  removeListingMedia,
  uploadListingMedia,
  useListingMedia,
  type MediaKind,
} from "@/lib/listing-media";
import { MediaThumb } from "./listing-media";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { countries, currencies, languages } from "@/lib/market-config";
import {
  AVAILABILITY_LABELS,
  CATEGORY_GROUPS,
  MODALITY_LABELS,
  PRICE_TYPE_LABELS,
  SERVICE_CATEGORIES,
  categoryByCode,
  type ServiceListing,
} from "@/lib/opportunities-model";
import { saveListing } from "@/lib/opportunities-store";
import { ListingCard } from "./listing-card";

const fieldClass = "h-12 rounded-2xl bg-surface";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Pick<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Record<T, string> | Array<{ code: string; name: string }>;
}) {
  const entries = Array.isArray(options)
    ? options.map((o) => [o.code, o.name] as const)
    : (Object.entries(options) as Array<[string, string]>);
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className={fieldClass}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72 rounded-2xl">
        {entries.map(([code, name]) => (
          <SelectItem key={code} value={code}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MediaPicker({
  kind,
  refs,
  profileId,
  listingId,
  onChange,
  onBusy,
}: {
  kind: MediaKind;
  refs: string[];
  profileId: string | null;
  listingId: string;
  onChange: (next: string[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const urls = useListingMedia(refs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (list: FileList | null) => {
    const files = Array.from(list ?? []).slice(0, 4 - refs.length);
    if (files.length === 0) return;
    setError(null);
    setBusy(true);
    onBusy(true);
    try {
      const added = await uploadListingMedia(files, { profileId, listingId, kind });
      onChange([...refs, ...added].slice(0, 4));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {refs.map((ref, i) => (
          <span key={ref} className="relative">
            {isPdfRef(ref) ? (
              <span className="grid size-20 place-items-center rounded-2xl bg-surface text-muted-foreground">
                <FileText className="size-6" />
              </span>
            ) : (
              <MediaThumb src={urls[i]} className="size-20 rounded-2xl object-cover" />
            )}
            <button
              type="button"
              aria-label="Quitar archivo"
              className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-foreground text-background"
              onClick={() => onChange(refs.filter((_, j) => j !== i))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {refs.length < 4 && (
          <label
            className={`grid size-20 cursor-pointer place-items-center rounded-2xl border border-dashed border-border bg-surface text-muted-foreground ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            <input
              type="file"
              accept={acceptFor(kind)}
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                void pick(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ServiceEditor({
  initial,
  onClose,
}: {
  initial: ServiceListing;
  onClose: (saved: ServiceListing | null) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState<"form" | "review">("form");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const isUploading = Object.values(uploading).some(Boolean);
  const patch = (p: Partial<ServiceListing>) => setDraft((d) => ({ ...d, ...p }));
  const offering = draft.intent === "OFFER";

  const missing = [
    !draft.title.trim() && "título",
    !draft.categoryCode && "categoría",
    !draft.description.trim() && "descripción",
    draft.priceType !== "negotiable" && !draft.price && (offering ? "precio" : "presupuesto"),
    draft.modality !== "remote" && !draft.city.trim() && "ciudad",
  ].filter(Boolean) as string[];

  const [saveError, setSaveError] = useState<string | null>(null);
  const persist = async (status: ServiceListing["status"]) => {
    if (isUploading) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Requests don't carry a service radius.
      const saved = await saveListing({ ...draft, status, radiusKm: offering ? draft.radiusKm : null });
      const kept = new Set([...saved.photos, ...saved.portfolio]);
      void removeListingMedia(
        [...initial.photos, ...initial.portfolio].filter((r) => !kept.has(r)),
      ).catch(() => {});
      onClose(saved);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const category = draft.categoryCode ? categoryByCode(draft.categoryCode) : null;

  return (
    <section className={`mx-auto w-full max-w-3xl px-5 pb-10 pt-6 sm:px-8 ${offering ? "opx-red" : "opx-blue"}`}>
      <button
        type="button"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        onClick={() => (step === "review" ? setStep("form") : onClose(null))}
      >
        <ArrowLeft className="size-4" /> {step === "review" ? "Seguir editando" : "Volver"}
      </button>
      {saveError && (
        <p className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {saveError}
        </p>
      )}
      <p className="eyebrow mt-6">{offering ? "Servicio que ofrezco" : "Oferta de trabajo"}</p>
      <h1 className="font-display text-3xl font-extrabold text-foreground">
        {step === "form"
          ? offering
            ? "Publica tu servicio"
            : "¿Qué servicio buscas?"
          : "Revisa tu publicación"}
      </h1>

      {step === "form" ? (
        <div className="mt-6 grid gap-5 rounded-[28px] bg-card p-5 shadow-panel sm:grid-cols-2 sm:p-6">
          <div className="sm:col-span-2">
            <Field label={offering ? "Nombre del servicio" : "Título de la solicitud"}>
              <Input
                className={fieldClass}
                value={draft.title}
                maxLength={90}
                placeholder={
                  offering ? "Ej: Diseño de identidad visual" : "Ej: Se busca diseñador gráfico para mi empresa"
                }
                onChange={(e) => patch({ title: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Categoría">
            <Select value={draft.categoryCode} onValueChange={(v) => patch({ categoryCode: v })}>
              <SelectTrigger className={fieldClass}>
                <SelectValue placeholder="Elige una categoría" />
              </SelectTrigger>
              <SelectContent className="max-h-80 rounded-2xl">
                {CATEGORY_GROUPS.map((group) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {SERVICE_CATEGORIES.filter((c) => c.group === group).map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Modalidad">
            <Pick
              value={draft.modality}
              onChange={(v) => patch({ modality: v })}
              options={MODALITY_LABELS}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descripción">
              <Textarea
                className="min-h-28 rounded-2xl bg-surface"
                value={draft.description}
                maxLength={1200}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </Field>
          </div>
          <Field label={offering ? "Tipo de precio" : "Tipo de presupuesto"}>
            <Pick
              value={draft.priceType}
              onChange={(v) => patch({ priceType: v })}
              options={PRICE_TYPE_LABELS}
            />
          </Field>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field
              label={
                offering
                  ? draft.priceType === "negotiable" ? "Precio de referencia (opcional)" : "Precio"
                  : draft.priceType === "negotiable" ? "Presupuesto de referencia (opcional)" : "¿Cuánto estás dispuesto a pagar?"
              }
            >
              <Input
                className={fieldClass}
                inputMode="numeric"
                value={draft.price ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, ""));
                  patch({ price: n > 0 ? n : null });
                }}
              />
            </Field>
            <Field label="Moneda">
              <Pick
                value={draft.currencyCode}
                onChange={(v) => patch({ currencyCode: v })}
                options={currencies.map((c) => ({ code: c.code, name: c.code }))}
              />
            </Field>
          </div>
          <Field label="Disponibilidad">
            <Pick
              value={draft.availabilityType}
              onChange={(v) => patch({ availabilityType: v })}
              options={AVAILABILITY_LABELS}
            />
          </Field>
          <Field label="Detalle de disponibilidad">
            <Input
              className={fieldClass}
              placeholder="Ej: lunes a viernes, 8:00 – 17:00"
              value={draft.availabilityNote}
              onChange={(e) => patch({ availabilityNote: e.target.value })}
            />
          </Field>
          <Field label="Duración">
            <Input
              className={fieldClass}
              placeholder="Ej: 2 horas, 1 semana"
              value={draft.duration}
              onChange={(e) => patch({ duration: e.target.value })}
            />
          </Field>
          <Field label="País">
            <Pick
              value={draft.countryCode}
              onChange={(v) => patch({ countryCode: v })}
              options={countries.map((c) => ({ code: c.code, name: `${c.flag} ${c.name}` }))}
            />
          </Field>
          <Field label="Ciudad">
            <Input
              className={fieldClass}
              value={draft.city}
              onChange={(e) => patch({ city: e.target.value })}
            />
          </Field>
          <Field label="Zona / barrio">
            <Input
              className={fieldClass}
              value={draft.zone}
              onChange={(e) => patch({ zone: e.target.value })}
            />
          </Field>
          {offering && draft.modality !== "remote" && (
            <Field label="Radio de servicio (km)">
              <Input
                className={fieldClass}
                inputMode="numeric"
                value={draft.radiusKm ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, ""));
                  patch({ radiusKm: n > 0 ? n : null });
                }}
              />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label="Idiomas">
              <div className="flex flex-wrap gap-2">
                {languages.map((lang) => {
                  const on = draft.languages.includes(lang.code);
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      aria-pressed={on}
                      className={`rounded-full px-3 py-2 text-sm font-semibold ${on ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}
                      onClick={() =>
                        patch({
                          languages: on
                            ? draft.languages.filter((l) => l !== lang.code)
                            : [...draft.languages, lang.code],
                        })
                      }
                    >
                      {lang.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
          {(["photos", "portfolio"] as const).map((key) => (
            <div key={key} className="sm:col-span-2">
              <Field label={key === "photos" ? "Fotografías" : "Portafolio / evidencias"}>
                <MediaPicker
                  kind={key}
                  refs={draft[key]}
                  profileId={draft.authorProfileId}
                  listingId={draft.id}
                  onChange={(next) => patch({ [key]: next } as Partial<ServiceListing>)}
                  onBusy={(b) => setUploading((u) => ({ ...u, [key]: b }))}
                />
              </Field>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-2xl bg-surface p-4 sm:col-span-2">
            <div>
              <p className="font-semibold text-foreground">Publicación activa</p>
              <p className="text-xs text-muted-foreground">Puedes pausarla cuando quieras.</p>
            </div>
            <Switch
              checked={draft.status !== "INACTIVE"}
              onCheckedChange={(on) => patch({ status: on ? "DRAFT" : "INACTIVE" })}
            />
          </div>
          <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row">
            <Button
              size="touch"
              className="flex-1"
              disabled={missing.length > 0}
              onClick={() => setStep("review")}
            >
              Revisar publicación
            </Button>
            <Button
              size="touch"
              variant="outline"
              disabled={saving || !draft.title.trim()}
              onClick={() => persist(draft.status === "INACTIVE" ? "INACTIVE" : "DRAFT")}
            >
              Guardar borrador
            </Button>
          </div>
          {missing.length > 0 && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Falta: {missing.join(", ")}.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <ListingCard listing={{ ...draft, status: "ACTIVE" }} />
          <dl className="grid gap-3 rounded-[28px] bg-card p-5 text-sm shadow-panel sm:grid-cols-2">
            {[
              ["Categoría", category?.name ?? "—"],
              [
                "Disponibilidad",
                `${AVAILABILITY_LABELS[draft.availabilityType]}${draft.availabilityNote ? ` · ${draft.availabilityNote}` : ""}`,
              ],
              ["Duración", draft.duration || "—"],
              [
                "Idiomas",
                draft.languages
                  .map((c) => languages.find((l) => l.code === c)?.name ?? c)
                  .join(", ") || "—",
              ],
              ["Radio", draft.radiusKm ? `${draft.radiusKm} km` : "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-semibold text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          {category?.requiresCredentials && (
            <p className="rounded-2xl bg-brand-soft p-4 text-sm text-primary">
              {category.name} es una profesión regulada. Más adelante podrás adjuntar tus
              credenciales para obtener la insignia “Verificado”.
            </p>
          )}
          <Button size="touch" className="w-full" onClick={() => setConfirming(true)}>
            <Check /> Confirmar y publicar
          </Button>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Publicar ahora?</AlertDialogTitle>
            <AlertDialogDescription>
              Tu publicación aparecerá en Oportunidades. Podrás pausarla o editarla después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={() => persist("ACTIVE")}>
              Publicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
