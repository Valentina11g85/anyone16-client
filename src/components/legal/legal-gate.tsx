/**
 * Asks for acceptance of every PUBLISHED version that requires it and that
 * Foundation says this account has not accepted yet. If the person ticked the
 * boxes at signup (same email), that consent is recorded with source "signup".
 */
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LegalCenter } from "@/components/legal/legal-center";
import type { LegalDocType } from "@/content/legal/drafts";
import {
  acceptLegal,
  clearSignupIntent,
  loadPendingLegal,
  readSignupIntent,
  setOptionalConsent,
  type LegalVersion,
} from "@/lib/legal";

export function LegalGate({ email }: { email: string | null }) {
  const [pending, setPending] = useState<LegalVersion[]>([]);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<LegalDocType | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      let list: LegalVersion[] = [];
      try { list = await loadPendingLegal(); } catch { return; } // not installed: nothing to ask
      const intent = readSignupIntent();
      if (intent && email && intent.email.toLowerCase() === email.toLowerCase()) {
        try {
          if (list.length) await acceptLegal(list.map((v) => v.id), "signup");
          if (intent.marketing) await setOptionalConsent("marketing", true, "signup");
          clearSignupIntent();
          list = await loadPendingLegal();
        } catch { /* fall back to asking */ }
      }
      if (alive) setPending(list);
    })();
    return () => { alive = false; };
  }, [email]);

  if (pending.length === 0) return null;
  const accept = async () => {
    setBusy(true);
    try { await acceptLegal(pending.map((v) => v.id), "update_prompt"); setPending(await loadPendingLegal()); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <Dialog open={!doc}>
        <DialogContent className="rounded-[28px] [&>button]:hidden" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle className="font-display text-2xl">Actualizamos nuestros documentos</DialogTitle></DialogHeader>
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
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button disabled={!checked || busy} onClick={() => void accept()}>Aceptar y continuar</Button>
        </DialogContent>
      </Dialog>
      <LegalCenter open={Boolean(doc)} onOpenChange={(o) => !o && setDoc(null)} initialDoc={doc ?? undefined} />
    </>
  );
}
