/**
 * AnyOne¹⁶ — Stage 5 real account screens: sign up, sign in, password recovery.
 * One account per person; the worker mode is activated later from the profile.
 */

import { useState } from "react";
import { ChevronRight, LockKeyhole, Mail, Smartphone, UserRound } from "lucide-react";

import { Shell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";

export type AuthMode = "signup" | "login" | "forgot";

const friendlyError = (message: string) => {
  const text = message.toLowerCase();
  if (text.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (text.includes("already registered") || text.includes("already been registered"))
    return "Ya existe una cuenta con este correo. Inicia sesión.";
  if (text.includes("password")) return "La contraseña debe tener al menos 8 caracteres.";
  if (text.includes("email")) return "Revisa el correo que escribiste.";
  return "No pudimos completar la acción. Inténtalo de nuevo.";
};

export function AuthScreen({
  mode,
  preferences,
  onBack,
  onMode,
}: {
  mode: AuthMode;
  preferences: { countryCode: string; languageCode: string; currencyCode: string };
  onBack: () => void;
  onMode: (mode: AuthMode) => void;
}) {
  const { signUp, signIn, requestPasswordReset } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const result = await signUp({
          fullName,
          email,
          phone,
          password,
          countryCode: preferences.countryCode,
          languageCode: preferences.languageCode,
          currencyCode: preferences.currencyCode,
        });
        if (result.needsConfirmation) {
          setNotice(
            "Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve a iniciar sesión.",
          );
        }
      } else if (mode === "login") {
        await signIn(email, password, remember);
      } else {
        await requestPasswordReset(email);
        setNotice("Si el correo existe, te enviamos un enlace para crear una contraseña nueva.");
      }
    } catch (caught) {
      setError(friendlyError(caught instanceof Error ? caught.message : ""));
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "signup"
      ? "Crear una cuenta"
      : mode === "login"
        ? "Qué bueno verte de nuevo"
        : "Recuperar contraseña";
  const copy =
    mode === "signup"
      ? "Una sola cuenta para pedir favores y, cuando quieras, para ayudar a otras personas."
      : mode === "login"
        ? "Ingresa para continuar a tu espacio de AnyOne¹⁶."
        : "Te enviaremos un enlace para crear una contraseña nueva.";

  return (
    <Shell onBack={onBack} stepKey={mode}>
      <p className="eyebrow">Tu cuenta</p>
      <h1 className="screen-title">{title}</h1>
      <p className="screen-copy">{copy}</p>

      <form className="mt-8 space-y-4" onSubmit={submit}>
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="full-name">Nombre completo</Label>
            <div className="relative">
              <UserRound className="field-icon" />
              <Input
                id="full-name"
                className="pl-12"
                placeholder="Tu nombre"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <div className="relative">
            <Mail className="field-icon" />
            <Input
              id="email"
              type="email"
              className="pl-12"
              placeholder="nombre@correo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
        </div>
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="phone">Número de celular</Label>
            <div className="relative">
              <Smartphone className="field-icon" />
              <Input
                id="phone"
                type="tel"
                className="pl-12"
                placeholder="+57 300 000 0000"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </div>
          </div>
        )}
        {mode !== "forgot" && (
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <LockKeyhole className="field-icon" />
              <Input
                id="password"
                type="password"
                className="pl-12"
                placeholder="8 caracteres o más"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
          </div>
        )}
        {mode === "login" && (
          <label className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <input
              type="checkbox"
              className="size-5 rounded-md border-border accent-[var(--color-primary)]"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Recordar mi sesión en este dispositivo
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-2xl bg-brand-soft p-3 text-sm text-brand-dark">
            {notice}
          </p>
        )}

        <Button className="w-full" size="touch" type="submit" disabled={busy}>
          {busy
            ? "Un momento…"
            : mode === "signup"
              ? "Crear mi cuenta"
              : mode === "login"
                ? "Iniciar sesión"
                : "Enviar enlace"}
          <ChevronRight />
        </Button>
      </form>

      <div className="mt-3 space-y-2">
        {mode !== "login" && (
          <Button className="w-full" size="touch" variant="ghost" onClick={() => onMode("login")}>
            Ya tengo una cuenta
          </Button>
        )}
        {mode !== "signup" && (
          <Button
            className="w-full"
            size="touch"
            variant="ghost"
            onClick={() => onMode("signup")}
          >
            Crear una cuenta
          </Button>
        )}
        {mode === "login" && (
          <Button className="w-full" size="touch" variant="ghost" onClick={() => onMode("forgot")}>
            Olvidé mi contraseña
          </Button>
        )}
      </div>
    </Shell>
  );
}
