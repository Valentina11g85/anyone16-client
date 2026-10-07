/**
 * AnyOne¹⁶ — "Legal y privacidad". Shows the version Foundation published;
 * when nothing is published yet it shows the internal DRAFT, clearly labelled.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, FileText, History, Mail, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LegalMarkdown } from "@/components/legal/legal-doc";
import { LEGAL_DRAFTS, LEGAL_TITLES, OPERATOR, type LegalDocType } from "@/content/legal/drafts";
import {
  REQUEST_LABEL,
  REQUEST_STATUS,
  cancelPrivacyRequest,
  loadMyAcceptances,
  loadPrivacyRequests,
  setOptionalConsent,
  submitPrivacyRequest,
  useLegalVersions,
  type LegalAcceptance,
  type LegalVersion,
  type PrivacyRequest,
  type PrivacyRequestType,
} from "@/lib/legal";

const DOC_ORDER: LegalDocType[] = [
  "terms", "privacy_policy", "data_treatment", "cancellations_refunds",
  "platform_rules", "intellectual_property", "cookies",
];
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-CO", { dateStyle: "medium" }) : "—");

type View = { kind: "home" } | { kind: "doc"; type: LegalDocType; versionId?: string } | { kind: "privacy" } | { kind: "versions" } | { kind: "delete" };

export function LegalCenter({ open, onOpenChange, initialDoc }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialDoc?: LegalDocType | undefined;
}) {
  const [view, setView] = useState<View>({ kind: "home" });
  const { versions, error } = useLegalVersions();
  useEffect(() => { if (open) setView(initialDoc ? { kind: "doc", type: initialDoc } : { kind: "home" }); }, [open, initialDoc]);
  const published = (t: LegalDocType) =>
    versions?.find((v) => v.documentType === t && v.status === "published" && v.language === "es" && v.jurisdiction === "CO") ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-border bg-background p-5 sm:max-w-2xl sm:p-8">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-display text-2xl">
            {view.kind !== "home" && (
              <button type="button" aria-label="Volver" className="rounded-full p-1 hover:bg-muted" onClick={() => setView({ kind: "home" })}>
                <ChevronLeft className="size-5" />
              </button>
            )}
            Legal y privacidad
          </SheetTitle>
        </SheetHeader>

        {view.kind === "home" && (
          <div className="mt-5 space-y-5">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {DOC_ORDER.map((t) => {
                const p = published(t);
                return (
                  <li key={t}>
                    <button type="button" className="pf-mini w-full text-left" onClick={() => setView({ kind: "doc", type: t })}>
                      <span className="flex items-center gap-2 font-bold text-foreground"><FileText className="size-4 text-primary" />{LEGAL_TITLES[t]}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{p ? `Versión ${p.version} · vigente desde ${date(p.effectiveAt)}` : "Borrador · aún no publicado"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <button type="button" className="pf-mini text-left" onClick={() => setView({ kind: "privacy" })}>
                <ShieldCheck className="size-5 text-primary" />
                <span className="mt-2 block font-bold text-foreground">Solicitudes de privacidad</span>
                <span className="text-xs text-muted-foreground">Conocer, corregir o suprimir tus datos</span>
              </button>
              <button type="button" className="pf-mini text-left" onClick={() => setView({ kind: "versions" })}>
                <History className="size-5 text-primary" />
                <span className="mt-2 block font-bold text-foreground">Mis aceptaciones y versiones</span>
                <span className="text-xs text-muted-foreground">Qué aceptaste y cuándo</span>
              </button>
              <button type="button" className="pf-mini text-left" onClick={() => setView({ kind: "delete" })}>
                <Trash2 className="size-5 text-destructive" />
                <span className="mt-2 block font-bold text-foreground">Eliminar mi cuenta</span>
                <span className="text-xs text-muted-foreground">Solicitar el cierre</span>
              </button>
            </div>
            <div className="pf-mini text-sm">
              <p className="flex items-center gap-2 font-bold text-foreground"><Mail className="size-4 text-primary" /> Contacto</p>
              <p className="mt-1 text-muted-foreground">Responsable: {OPERATOR.name} · {OPERATOR.idLabel} · {OPERATOR.city}</p>
              <a className="text-primary underline" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
            </div>
            {error && <p className="text-xs text-muted-foreground">{error}</p>}
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} {OPERATOR.name}. AnyOne¹⁶ — todos los derechos reservados. Marca en proceso de registro.</p>
          </div>
        )}

        {view.kind === "doc" && <DocView type={view.type} versions={versions ?? []} versionId={view.versionId} />}
        {view.kind === "privacy" && <PrivacyRequests />}
        {view.kind === "versions" && <MyAcceptances versions={versions ?? []} onOpen={(v) => setView({ kind: "doc", type: v.documentType, versionId: v.id })} />}
        {view.kind === "delete" && <DeleteAccount />}
      </SheetContent>
    </Sheet>
  );
}

function DocView({ type, versions, versionId }: { type: LegalDocType; versions: LegalVersion[]; versionId?: string | undefined }) {
  const history = versions.filter((v) => v.documentType === type && v.status !== "draft");
  const current = versionId
    ? history.find((v) => v.id === versionId)
    : history.find((v) => v.status === "published" && v.language === "es");
  return (
    <div className="mt-5 space-y-4">
      {current ? (
        <p className="pf-chip" data-state={current.status === "published" ? "ok" : "muted"}>
          Versión {current.version} · {current.status === "published" ? `vigente desde ${date(current.effectiveAt)}` : `archivada el ${date(current.retiredAt)}`}
          {current.isTranslation ? " · traducción" : ""}
        </p>
      ) : (
        <p className="pf-chip" data-state="muted">Borrador interno — no vigente</p>
      )}
      <LegalMarkdown content={current?.content ?? LEGAL_DRAFTS[type]} />
      {history.length > 1 && (
        <div className="pf-mini">
          <p className="font-bold text-foreground">Versiones anteriores</p>
          <ul className="mt-1 text-xs text-muted-foreground">
            {history.map((v) => <li key={v.id}>v{v.version} · {v.status === "published" ? "vigente" : `archivada ${date(v.retiredAt)}`}{v.summary ? ` · ${v.summary}` : ""}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function MyAcceptances({ versions, onOpen }: { versions: LegalVersion[]; onOpen: (v: LegalVersion) => void }) {
  const [list, setList] = useState<LegalAcceptance[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = () => loadMyAcceptances().then(setList, (e: Error) => { setErr(e.message); setList([]); });
  useEffect(() => void reload(), []);
  const latest = (t: string) => list?.find((a) => a.consentType === t);
  const toggle = async (t: "marketing" | "location", granted: boolean) => {
    try { await setOptionalConsent(t, granted, "legal_center"); void reload(); } catch (e) { setErr((e as Error).message); }
  };
  const label: Record<string, string> = {
    terms: "Términos y condiciones", privacy_policy: "Política de privacidad", data_treatment: "Tratamiento de datos",
    marketing: "Comunicaciones comerciales", location: "Ubicación", age_confirmation: "Mayoría de edad (18+)",
  };
  return (
    <div className="mt-5 space-y-4">
      {err && <p className="text-sm text-muted-foreground">{err}</p>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {(["marketing", "location"] as const).map((t) => {
          const on = latest(t)?.granted ?? false;
          return (
            <div key={t} className="pf-mini flex items-center justify-between gap-3">
              <span>
                <span className="block font-bold text-foreground">{label[t]}</span>
                <span className="text-xs text-muted-foreground">{on ? "Autorizado" : "No autorizado"}</span>
              </span>
              <Button size="sm" variant={on ? "outline" : "default"} onClick={() => void toggle(t, !on)}>{on ? "Revocar" : "Autorizar"}</Button>
            </div>
          );
        })}
      </div>
      <p className="font-bold text-foreground">Historial</p>
      {!list ? <p className="text-sm text-muted-foreground">Cargando…</p> : list.length === 0 ? (
        <p className="pf-empty">Aún no hay aceptaciones registradas en tu cuenta.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => {
            const v = versions.find((x) => x.id === a.versionId);
            return (
              <li key={a.id} className="pf-mini text-sm">
                <p className="font-bold text-foreground">{label[a.consentType] ?? a.consentType}{a.version ? ` · v${a.version}` : ""}</p>
                <p className="text-xs text-muted-foreground">{a.granted ? "Aceptado" : "Revocado"} el {new Date(a.createdAt).toLocaleString("es-CO")} · {a.source === "signup" ? "al registrarte" : a.source === "update_prompt" ? "al actualizarse" : "desde Legal y privacidad"}</p>
                {v && <button type="button" className="text-xs font-bold text-primary" onClick={() => onOpen(v)}>Ver esa versión</button>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RequestsList({ list, onChange }: { list: PrivacyRequest[]; onChange: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  if (list.length === 0) return <p className="pf-empty">No has enviado solicitudes.</p>;
  return (
    <ul className="space-y-2">
      {err && <p className="text-sm text-destructive">{err}</p>}
      {list.map((r) => (
        <li key={r.id} className="pf-mini text-sm">
          <div className="flex justify-between gap-2">
            <b className="text-foreground">{REQUEST_LABEL[r.type]}</b>
            <span className="pf-status" data-tone={r.status === "resolved" ? "ok" : r.status === "rejected" ? "bad" : "pending"}>{REQUEST_STATUS[r.status]}</span>
          </div>
          <p className="text-xs text-muted-foreground">Enviada {date(r.createdAt)} · respuesta estimada antes del {date(r.dueAt)}</p>
          {r.resolution && <p className="mt-1 text-muted-foreground">Respuesta: {r.resolution}</p>}
          {r.status === "received" && (
            <Button className="mt-2" size="sm" variant="outline" onClick={() => void cancelPrivacyRequest(r.id).then(onChange, (e: Error) => setErr(e.message))}>Cancelar</Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function PrivacyRequests() {
  const [type, setType] = useState<PrivacyRequestType>("access");
  const [details, setDetails] = useState("");
  const [list, setList] = useState<PrivacyRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const reload = () => loadPrivacyRequests().then(setList, (e: Error) => setMsg(e.message));
  useEffect(() => void reload(), []);
  const send = async () => {
    setBusy(true);
    try { await submitPrivacyRequest(type, details.trim()); setDetails(""); setMsg("Solicitud enviada. Te avisaremos cuando la respondamos."); void reload(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-muted-foreground">Como titular de tus datos (Ley 1581 de 2012) puedes conocer, actualizar, rectificar o suprimir tus datos y revocar tu autorización. También puedes escribir a {OPERATOR.email}.</p>
      <div className="pf-mini space-y-2">
        <Select value={type} onValueChange={(v) => setType(v as PrivacyRequestType)}>
          <SelectTrigger className="h-12 rounded-2xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(REQUEST_LABEL) as PrivacyRequestType[]).filter((k) => k !== "account_deletion").map((k) => <SelectItem key={k} value={k}>{REQUEST_LABEL[k]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Textarea className="rounded-2xl" maxLength={2000} placeholder="Cuéntanos qué necesitas (opcional)" value={details} onChange={(e) => setDetails(e.target.value)} />
        <Button disabled={busy} onClick={() => void send()}>Enviar solicitud</Button>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </div>
      <RequestsList list={list} onChange={reload} />
    </div>
  );
}

function DeleteAccount() {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [list, setList] = useState<PrivacyRequest[]>([]);
  const reload = () => loadPrivacyRequests().then((l) => setList(l.filter((r) => r.type === "account_deletion")), () => undefined);
  useEffect(() => void reload(), []);
  const send = async () => {
    setBusy(true);
    try { await submitPrivacyRequest("account_deletion", reason.trim()); setMsg("Recibimos tu solicitud. La revisaremos y te avisaremos."); void reload(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-5 space-y-4">
      <div className="pf-mini text-sm text-muted-foreground">
        <p className="font-bold text-foreground">Antes de continuar</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Tu cuenta se desactivará y tus datos personales se suprimirán cuando no exista una obligación legal de conservarlos.</li>
          <li>Algunos registros se conservan por ley (pagos, contrataciones, facturación, auditoría de seguridad y disputas).</li>
          <li>Si tienes contrataciones activas, pagos o retiros pendientes, deberán cerrarse primero.</li>
          <li>La solicitud la revisa una persona; no se borra nada automáticamente.</li>
        </ul>
      </div>
      <Textarea className="rounded-2xl" maxLength={2000} placeholder="¿Por qué te vas? (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" className="size-5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        Entiendo lo anterior y quiero solicitar la eliminación de mi cuenta.
      </label>
      <Button variant="destructive" disabled={!confirm || busy} onClick={() => void send()}>Solicitar eliminación</Button>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      {list.length > 0 && <RequestsList list={list} onChange={reload} />}
    </div>
  );
}
