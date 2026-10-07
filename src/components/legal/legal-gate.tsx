/**
 * Blocks the app until Foundation says this account has every mandatory
 * acceptance: each PUBLISHED version that requires it + adult confirmation.
 * Signup consent is recorded server-side with the profile; this gate only
 * covers new versions or accounts whose signup record is incomplete.
 */
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LegalCenter } from "@/components/legal/legal-center";
import type { LegalDocType } from "@/content/legal/drafts";
import { acceptLegal, loadLegalStatus, loadPendingLegal, type LegalVersion } from "@/lib/legal";

export function LegalGate({ email }: { email: string | null }) {
  const [pending, setPending] = useState<LegalVersion[]>([]);
  const [needsAge, setNeedsAge] = useState(false);
  const [checked, setChecked] = useState(false);
  const [age, setAge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<LegalDocType | null>(null);

  const refresh = async () => {
    const [list, status] = await Promise.all([loadPendingLegal(), loadLegalStatus()]);
    setPending(list);
    setNeedsAge(!status.ageConfirmed);
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [list, status] = await Promise.all([loadPendingLegal(), loadLegalStatus()]);
        if (alive) { setPending(list); setNeedsAge(!status.ageConfirmed); }
      } catch { /* not installed in Foundation yet: nothing to ask */ }
    })();
    // A new version published while the app is open: re-check when the person comes back.
    const onFocus = () => { void refresh().catch(() => undefined); };
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.removeEventListener("focus", onFocus); };
  }, [email]);

  if (pending.length === 0 && !needsAge) return null;
  const canSubmit = (pending.length === 0 || checked) && (!needsAge || age);
  const accept = async () => {
    setBusy(true);
    setErr(null);
    try { await acceptLegal(pending.map((v) => v.id), "update_prompt", needsAge && age); await refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <Dialog open={!doc}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[28px] pb-[calc(1.5rem+env(safe-area-inset-bottom))] [&>button]:hidden" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle className="font-display text-2xl">{pending.length ? "Actualizamos nuestros documentos" : "Confirma tu edad"}</DialogTitle></DialogHeader>
          {pending.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">Para seguir usando AnyOne¹⁶ revisa y acepta:</p>
              <ul className="space-y-2">
                {pending.map((v) => (
                  <li key={v.id} className="pf-mini flex items-center justify-between gap-2 text-sm">
                    <span><b className="text-foreground">{v.title}</b> · v{v.version}{v.summary ? <span className="block text-xs text-muted-foreground">{v.summary}</span> : null}</span>
                    <button type="button" className="text-xs font-bold text-primary" onClick={() => setDoc(v.documentType)}>Leer</button>
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                He leído y acepto estos documentos, y autorizo el tratamiento de mis datos según la política.
              </label>
            </>
          )}
          {needsAge && (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-6 shrink-0 accent-[var(--color-primary)]" checked={age} onChange={(e) => setAge(e.target.checked)} />
              Confirmo que soy mayor de 18 años.
            </label>
          )}
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          {/* Wrapped: the "[&>button]:hidden" rule (which hides the close X) also hid this button. */}
          <div className="sticky bottom-0 -mx-1 pt-2">
            <Button className="min-h-12 w-full" size="touch" disabled={!canSubmit || busy} onClick={() => void accept()}>
              {busy ? "Un momento…" : pending.length ? "Aceptar y continuar" : "Confirmar y continuar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <LegalCenter open={Boolean(doc)} onOpenChange={(o) => !o && setDoc(null)} initialDoc={doc ?? undefined} />
    </>
  );
}
