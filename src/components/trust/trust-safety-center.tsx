/**
 * Confianza y Seguridad — real verification state from Foundation plus the
 * reporting paths that already exist (favor disputes, service disputes).
 * Reporting a user needs a Foundation table/RPC that doesn't exist yet, so it
 * is shown as not available instead of faking a submission.
 */
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { trustForWorker, useTrust } from "@/lib/trust-store";

function Check({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm">
      <span>{label}</span>
      <strong className={ok ? "text-primary" : "text-muted-foreground"}>{ok ? "Verificado" : "No verificado"}</strong>
    </li>
  );
}

export function TrustSafetyCenter({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onNavigate: (t: "favors" | "opportunities") => void;
}) {
  const { worker } = useAuth();
  const trust = useTrust();
  const w = worker ? trustForWorker(trust, worker.id) : null;
  const go = (t: "favors" | "opportunities") => {
    onOpenChange(false);
    onNavigate(t);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="uv-shield max-h-[90vh] overflow-y-auto rounded-t-[28px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck /> Confianza y Seguridad
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-6 text-sm leading-relaxed">
          <section>
            <h3 className="font-display font-bold">Tu verificación</h3>
            {!worker && (
              <p className="mt-2 text-muted-foreground">
                Las verificaciones se activan al convertirte en Worker. Como Cliente no necesitas verificarte para pedir favores.
              </p>
            )}
            {worker && !w && <p className="mt-2 text-muted-foreground">Foundation aún no tiene un registro de verificación para tu cuenta.</p>}
            {w && (
              <ul className="mt-2 space-y-2">
                <Check label="Identidad" ok={w.identityVerified} />
                <Check label="Teléfono" ok={w.phoneVerified} />
                <Check label="Residencia" ok={w.residenceVerified} />
                <Check label="Vehículo" ok={w.vehicleVerified} />
                <Check label="Antecedentes" ok={w.backgroundChecked} />
              </ul>
            )}
          </section>

          <section>
            <h3 className="font-display font-bold">Reportar un problema</h3>
            <div className="mt-2 grid gap-2">
              <Button variant="secondary" onClick={() => go("favors")}>Problema con un Favor (abrir disputa)</Button>
              <Button variant="secondary" onClick={() => go("opportunities")}>Problema con un Servicio (abrir disputa)</Button>
              <Button variant="secondary" disabled>Reportar usuario — no disponible todavía</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Las disputas se abren desde el Favor o la contratación correspondiente. El reporte de usuarios aún no existe en Foundation.
            </p>
          </section>

          <section>
            <h3 className="font-display font-bold">Calificaciones</h3>
            <p className="mt-1 text-muted-foreground">
              Solo quien participó en un Favor o servicio completado puede calificar, una sola vez y sin calificarse a sí mismo. El promedio lo calcula Foundation.
            </p>
          </section>
          <section>
            <h3 className="font-display font-bold">Códigos de finalización</h3>
            <p className="mt-1 text-muted-foreground">
              Un Favor solo se completa cuando el Cliente entrega su código al Worker. No compartas el código antes de recibir el favor. Los códigos vencen y Foundation decide su validez.
            </p>
          </section>
          <section>
            <h3 className="font-display font-bold">Recomendaciones</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Clientes: habla y paga siempre dentro de AnyOne¹⁶; revisa la calificación y verificaciones del Worker.</li>
              <li>Workers: confirma la dirección en el mapa y no aceptes pagos por fuera de la app.</li>
              <li>Nunca compartas contraseñas ni códigos por mensaje con desconocidos.</li>
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
