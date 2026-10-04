/**
 * AnyOne¹⁶ — Stage 5: activating the worker mode on an existing account.
 * No second account is created; a worker profile is attached to the same person.
 */

import { useState } from "react";
import { ChevronRight, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { languages } from "@/lib/market-config";

const CATEGORIES = [
  ["laundry", "Lavandería"],
  ["packages", "Paquetes"],
  ["shopping", "Compras"],
  ["documents", "Documentos"],
  ["waiting", "Esperar"],
  ["flowers", "Flores"],
  ["gifts", "Regalos"],
  ["pets", "Mascotas"],
  ["other", "Otro"],
] as const;

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      className="h-11 rounded-xl"
      variant={active ? "default" : "secondary"}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

export function WorkerOnboarding({ onCancel }: { onCancel: () => void }) {
  const { profile, activateWorker } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.fullName ?? "");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [zone, setZone] = useState("");
  const [available, setAvailable] = useState(true);
  const [languageCodes, setLanguageCodes] = useState<string[]>([profile?.languageCode ?? "es"]);
  const [categories, setCategories] = useState<string[]>(["laundry", "packages", "shopping"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await activateWorker({
        displayName,
        headline,
        bio,
        avatarUrl: avatarUrl.trim() || null,
        languages: languageCodes,
        categories,
        serviceZone: zone,
        available,
      });
    } catch {
      setError("No pudimos activar tu modo trabajador. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="worker-theme min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <p className="font-display text-lg font-extrabold">
          AnyOne<sup>16</sup>
        </p>
        <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight">
          Conviértete en trabajador
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Recibe favores cerca de ti, decide cuáles aceptar y gana dinero ayudando a otras personas.
        </p>

        <form className="mt-8 space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="worker-name">Nombre público</Label>
            <Input
              id="worker-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Cómo te verán los clientes"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="worker-photo">Foto (enlace, opcional)</Label>
            <Input
              id="worker-photo"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="worker-headline">Titular</Label>
            <Input
              id="worker-headline"
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
              placeholder="Ayudo con diligencias en el norte de Bogotá"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="worker-bio">Descripción</Label>
            <Textarea
              id="worker-bio"
              rows={4}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Cuenta brevemente cómo ayudas y por qué pueden confiar en ti."
            />
          </div>

          <div className="space-y-2">
            <Label>Idiomas</Label>
            <div className="flex flex-wrap gap-2">
              {languages.map((language) => (
                <Chip
                  key={language.code}
                  active={languageCodes.includes(language.code)}
                  label={language.name}
                  onClick={() => setLanguageCodes(toggle(languageCodes, language.code))}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categorías de favores</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(([value, label]) => (
                <Chip
                  key={value}
                  active={categories.includes(value)}
                  label={label}
                  onClick={() => setCategories(toggle(categories, value))}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="worker-zone">Zona donde trabajas</Label>
            <Input
              id="worker-zone"
              value={zone}
              onChange={(event) => setZone(event.target.value)}
              placeholder="Chapinero, Usaquén…"
              required
            />
            <p className="text-xs text-muted-foreground">
              El radio por distancia y la ubicación en vivo llegarán en una etapa futura.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
            <div>
              <p className="font-display text-base font-bold">Disponible para trabajar</p>
              <p className="text-xs text-muted-foreground">
                Puedes cambiarlo cuando quieras desde tu panel.
              </p>
            </div>
            <Button
              type="button"
              size="touch"
              variant={available ? "default" : "secondary"}
              aria-pressed={available}
              onClick={() => setAvailable(!available)}
            >
              <Zap />
              {available ? "Disponible" : "No disponible"}
            </Button>
          </div>

          <div className="rounded-2xl border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
            Más adelante te pediremos verificación de identidad, documentos, métodos de pago e
            información fiscal.
          </div>

          {error && (
            <p role="alert" className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button className="w-full" size="touch" type="submit" disabled={busy}>
            {busy ? "Activando…" : "Activar modo trabajador"}
            <ChevronRight />
          </Button>
          <Button
            type="button"
            className="w-full"
            size="touch"
            variant="ghost"
            onClick={onCancel}
          >
            Ahora no
          </Button>
        </form>
      </div>
    </main>
  );
}
