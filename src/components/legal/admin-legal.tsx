/** Admin base for legal documents and privacy requests. Visible only to Foundation admins. */
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LEGAL_DRAFTS, LEGAL_TITLES, REQUIRES_ACCEPTANCE, type LegalDocType } from "@/content/legal/drafts";
import {
  REQUEST_LABEL,
  REQUEST_STATUS,
  adminPublish,
  adminSaveDraft,
  adminUpdatePrivacyRequest,
  isLegalAdmin,
  loadLegalVersions,
  loadPrivacyRequests,
  type LegalVersion,
  type PrivacyRequest,
} from "@/lib/legal";

export function AdminLegal() {
  const [admin, setAdmin] = useState(false);
  const [versions, setVersions] = useState<LegalVersion[]>([]);
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [type, setType] = useState<LegalDocType>("terms");
  const [version, setVersion] = useState("1.0");
  const [content, setContent] = useState(LEGAL_DRAFTS.terms);
  const [summary, setSummary] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Record<string, string>>({});

  const reload = async () => {
    try { setVersions(await loadLegalVersions()); setRequests(await loadPrivacyRequests()); setErr(null); }
    catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { void isLegalAdmin().then((ok) => { setAdmin(ok); if (ok) void reload(); }); }, []);
  if (!admin) return null;

  const run = (p: Promise<unknown>) => void p.then(reload, (e: Error) => setErr(e.message));
  const save = () => run(adminSaveDraft({ id: editing, documentType: type, title: LEGAL_TITLES[type], version, content, requiresAcceptance: REQUIRES_ACCEPTANCE[type], summary }).then(() => setEditing(null)));
  const open = requests.filter((r) => r.status === "received" || r.status === "in_review");
  const overdue = open.filter((r) => new Date(r.dueAt) < new Date());

  return (
    <section className="uv-module space-y-4 rounded-[22px] border border-border bg-card p-5 shadow-soft">
      <h2 className="font-display text-lg font-extrabold text-foreground">Legal y privacidad (admin)</h2>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="pf-mini"><b className="block text-xl">{versions.filter((v) => v.status === "published").length}</b>publicados</div>
        <div className="pf-mini"><b className="block text-xl">{open.length}</b>solicitudes abiertas</div>
        <div className="pf-mini"><b className={`block text-xl ${overdue.length ? "text-destructive" : ""}`}>{overdue.length}</b>vencidas</div>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="pf-mini space-y-2">
        <p className="font-bold text-foreground">{editing ? "Editar borrador" : "Nueva versión (borrador)"}</p>
        <Select value={type} onValueChange={(v) => { const t = v as LegalDocType; setType(t); if (!editing) setContent(LEGAL_DRAFTS[t]); }}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(LEGAL_TITLES) as LegalDocType[]).map((t) => <SelectItem key={t} value={t}>{LEGAL_TITLES[t]}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input className="h-11 w-28 rounded-xl" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" />
          <Input className="h-11 rounded-xl" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Resumen de cambios" />
        </div>
        <Textarea className="min-h-56 rounded-xl font-mono text-xs" value={content} onChange={(e) => setContent(e.target.value)} />
        <p className="text-xs text-muted-foreground">Quita el aviso de borrador solo después de la revisión del abogado. Publicar archiva la versión vigente anterior; lo publicado no se puede editar.</p>
        <Button onClick={save}>Guardar borrador</Button>
      </div>

      <ul className="space-y-2">
        {versions.map((v) => (
          <li key={v.id} className="pf-mini flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{LEGAL_TITLES[v.documentType]} · v{v.version} · {v.language}-{v.jurisdiction} · <b>{v.status}</b></span>
            {v.status === "draft" && (
              <span className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEditing(v.id); setType(v.documentType); setVersion(v.version); setContent(v.content); setSummary(v.summary ?? ""); }}>Editar</Button>
                <Button size="sm" onClick={() => run(adminPublish(v.id))}>Publicar</Button>
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="font-bold text-foreground">Solicitudes de privacidad</p>
      <ul className="space-y-2">
        {requests.map((r) => (
          <li key={r.id} className="pf-mini space-y-1 text-sm">
            <p><b>{REQUEST_LABEL[r.type]}</b> · {REQUEST_STATUS[r.status]} · perfil {r.profileId.slice(0, 8)} · vence {new Date(r.dueAt).toLocaleDateString("es-CO")}</p>
            {r.details && <p className="text-muted-foreground">{r.details}</p>}
            {(r.status === "received" || r.status === "in_review") && (
              <>
                <Textarea className="rounded-xl" placeholder="Respuesta (obligatoria para cerrar)" value={answer[r.id] ?? ""} onChange={(e) => setAnswer({ ...answer, [r.id]: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  {r.status === "received" && <Button size="sm" variant="outline" onClick={() => run(adminUpdatePrivacyRequest(r.id, "in_review"))}>En revisión</Button>}
                  <Button size="sm" onClick={() => run(adminUpdatePrivacyRequest(r.id, "resolved", answer[r.id]))}>Responder</Button>
                  <Button size="sm" variant="destructive" onClick={() => run(adminUpdatePrivacyRequest(r.id, "rejected", answer[r.id]))}>Rechazar</Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
