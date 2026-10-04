/**
 * Admin editor for Foundation's payment_fee_configs. Writes are allowed only
 * for payment admins by Foundation's RLS; each payment order keeps its own
 * snapshot, so changes here never alter historical payments.
 */
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/foundation/client";

type FeeRow = {
  id: string;
  fee_kind: "platform" | "buyer" | "provider";
  label: string;
  percentage: number;
  fixed_amount: number;
  currency_code: string | null;
  applies_to: "all" | "favor" | "service_contract";
  active: boolean;
};

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string) => any };
const KIND: Record<FeeRow["fee_kind"], string> = { platform: "Plataforma", buyer: "Comprador", provider: "Proveedor" };
const APPLIES: Record<FeeRow["applies_to"], string> = { all: "Todos", favor: "Favores", service_contract: "Oportunidades/contratos" };
const CURRENCIES = ["", "COP", "USD", "MXN", "EUR", "BRL", "ARS", "CLP", "PEN", "PYG"];

export function FeeConfigAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ fee_kind: "platform", label: "", percentage: "0", fixed_amount: "0", currency_code: "", applies_to: "all" });

  const load = async () => {
    const { data, error: e } = await db.from("payment_fee_configs").select("*").order("created_at", { ascending: false });
    if (e) setError(e.message);
    else setRows(data ?? []);
  };

  useEffect(() => {
    void db.rpc("is_payment_admin").then(({ data }: { data: boolean }) => {
      setIsAdmin(Boolean(data));
      if (data) void load();
    });
  }, []);

  if (!isAdmin) return null;

  const create = async () => {
    setBusy(true);
    setError(null);
    const pct = Number(draft.percentage);
    const fixed = Number(draft.fixed_amount);
    if (!(pct >= 0 && pct <= 100) || !(fixed >= 0)) {
      setError("Porcentaje entre 0 y 100 y valor fijo mayor o igual a 0.");
      setBusy(false);
      return;
    }
    const { error: e } = await db.from("payment_fee_configs").insert({
      fee_kind: draft.fee_kind,
      label: draft.label.trim(),
      percentage: pct,
      fixed_amount: fixed,
      currency_code: draft.currency_code || null,
      applies_to: draft.applies_to,
      active: true,
    });
    setBusy(false);
    if (e) setError(e.message);
    else {
      setDraft({ ...draft, label: "", percentage: "0", fixed_amount: "0" });
      void load();
    }
  };

  const toggle = async (row: FeeRow) => {
    const { error: e } = await db.from("payment_fee_configs").update({ active: !row.active }).eq("id", row.id);
    if (e) setError(e.message);
    else void load();
  };

  const select = "h-11 rounded-xl border border-input bg-background px-3 text-sm";

  return (
    <section className="rounded-[22px] border border-foreground/20 bg-foreground/5 p-5">
      <h2 className="font-display text-lg font-extrabold text-foreground">Comisiones</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Los cambios aplican solo a pagos nuevos. Cada pago guarda la comisión usada.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <select className={select} value={draft.fee_kind} onChange={(e) => setDraft({ ...draft, fee_kind: e.target.value })}>
          {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={select} value={draft.applies_to} onChange={(e) => setDraft({ ...draft, applies_to: e.target.value })}>
          {Object.entries(APPLIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Input placeholder="Nombre" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        <select className={select} value={draft.currency_code} onChange={(e) => setDraft({ ...draft, currency_code: e.target.value })}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c || "Cualquier moneda (solo %)"}</option>)}
        </select>
        <Input type="number" min={0} max={100} step="0.01" placeholder="Porcentaje %" value={draft.percentage} onChange={(e) => setDraft({ ...draft, percentage: e.target.value })} />
        <Input type="number" min={0} step="0.01" placeholder="Valor fijo" value={draft.fixed_amount} onChange={(e) => setDraft({ ...draft, fixed_amount: e.target.value })} />
      </div>
      <Button className="mt-3 h-11 rounded-xl" variant="dark" disabled={busy} onClick={() => void create()}>
        {busy ? "Guardando…" : "Agregar comisión"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 space-y-2 text-sm">
        {rows.length === 0 && <p className="text-muted-foreground">Sin comisiones configuradas: todas en 0.</p>}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3">
            <div>
              <p className="font-semibold">{row.label || KIND[row.fee_kind]}</p>
              <p className="text-xs text-muted-foreground">
                {KIND[row.fee_kind]} · {row.percentage}% + {row.fixed_amount} {row.currency_code ?? "*"} · {APPLIES[row.applies_to]}
              </p>
            </div>
            <Button size="sm" className="h-10 rounded-xl" variant={row.active ? "secondary" : "dark"} onClick={() => void toggle(row)}>
              {row.active ? "Desactivar" : "Activar"}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
