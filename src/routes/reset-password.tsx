import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, LockKeyhole } from "lucide-react";

import { Shell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/foundation/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nueva contraseña — AnyOne¹⁶" },
      {
        name: "description",
        content: "Crea una contraseña nueva para tu cuenta de AnyOne¹⁶.",
      },
      { property: "og:title", content: "Nueva contraseña — AnyOne¹⁶" },
      {
        property: "og:description",
        content: "Recupera el acceso a tu cuenta de AnyOne¹⁶.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: caught } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (caught) {
      setError("No pudimos actualizar tu contraseña. Pide un enlace nuevo e inténtalo otra vez.");
      return;
    }
    setDone(true);
  };

  return (
    <Shell stepKey="reset">
      <p className="eyebrow">Tu cuenta</p>
      <h1 className="screen-title">Crear una contraseña nueva</h1>
      <p className="screen-copy">Elige una contraseña de 8 caracteres o más.</p>

      {done ? (
        <>
          <p role="status" className="mt-8 rounded-2xl bg-brand-soft p-4 text-sm text-brand-dark">
            Listo. Tu contraseña quedó actualizada.
          </p>
          <Button className="mt-4 w-full" size="touch" onClick={() => navigate({ to: "/" })}>
            Ir a AnyOne¹⁶
            <ChevronRight />
          </Button>
        </>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="new-password">Contraseña nueva</Label>
            <div className="relative">
              <LockKeyhole className="field-icon" />
              <Input
                id="new-password"
                type="password"
                className="pl-12"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button className="w-full" size="touch" type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Guardar contraseña"}
            <ChevronRight />
          </Button>
        </form>
      )}
    </Shell>
  );
}
