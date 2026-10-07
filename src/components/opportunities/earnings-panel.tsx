/**
 * AnyOne¹⁶ — "Ganancias" for Oportunidades providers. Displays only what
 * Foundation computed; never derives balances in the browser.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, History, Landmark, Plus, Trash2, Wallet } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPaymentMoney } from "@/lib/payment-model";
import { useOpportunities } from "@/lib/opportunities-store";
import {
  EARNING_LABEL,
  METHOD_LABEL,
  WITHDRAWAL_LABEL,
  addPayoutMethod,
  adminTransitionWithdrawal,
  archivePayoutMethod,
  cancelWithdrawal,
  isFinanceAdmin,
  loadAllWithdrawals,
  requestWithdrawal,
  useEarnings,
  type PayoutMethod,
  type ServiceBalance,
  type ServiceWithdrawal,
} from "@/lib/service-earnings";

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CO", { dateStyle: "medium" }) : "—";
const TONE: Record<string, string> = {
  pending: "pending",
  approved: "pending",
  processing: "pending",
  available: "ok",
  completed: "ok",
  rejected: "bad",
  reversed: "bad",
  cancelled: "muted",
};

export function EarningsPanel({ profileId }: { profileId: string }) {
  const { snap, error, loading, reload } = useEarnings(profileId);
  const opps = useOpportunities();
  const [currency, setCurrency] = useState<string | null>(null);
  const [tab, setTab] = useState<"history" | "withdrawals" | "methods">("history");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const balances = snap?.balances ?? [];
  const bal: ServiceBalance | undefined =
    balances.find((b) => b.currencyCode === currency) ?? balances[0];
  const cur = bal?.currencyCode ?? "COP";
  const money = (n: number) => formatPaymentMoney(n, cur);

  const earnings = (snap?.earnings ?? []).filter((e) => e.currencyCode === cur);
  const withdrawals = (snap?.withdrawals ?? []).filter((w) => w.currencyCode === cur);
  const title = (contractId: string) => {
    const c = opps.contracts.find((x) => x.id === contractId);
    return c ? (opps.listings.find((l) => l.id === c.listingId)?.title ?? "Servicio") : "Servicio";
  };
  const counterpart = (contractId: string) => {
    const c = opps.contracts.find((x) => x.id === contractId);
    if (!c) return "Cliente";
    const o = opps.offers.find((x) => x.id === c.acceptedOfferId);
    return o?.fromProfileId === c.buyerProfileId ? o.fromName : "Cliente";
  };

  // Cumulative net earned, by month (display only; values come from Foundation rows).
  const chart = useMemo(() => {
    const byMonth = new Map<string, number>();
    [...earnings]
      .filter((e) => e.status !== "reversed")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((e) => {
        const k = e.createdAt.slice(0, 7);
        byMonth.set(k, (byMonth.get(k) ?? 0) + e.net);
      });
    let acc = 0;
    return [...byMonth.entries()].map(([k, v]) => ((acc += v), { month: k, total: acc }));
  }, [earnings]);

  if (loading && !snap) return <p className="pf-empty mt-4">Cargando ganancias…</p>;
  if (error && !snap) return <div className="pf-empty mt-4"><p>{error}</p></div>;

  return (
    <div className="mt-4 space-y-4">
      {balances.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {balances.map((b) => (
            <button key={b.currencyCode} type="button" className="pf-chip" data-state={b.currencyCode === cur ? "ok" : "muted"} onClick={() => setCurrency(b.currencyCode)}>
              {b.currencyCode}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="pf-world" data-accent="red">
          <p className="eyebrow text-[0.65rem] font-bold uppercase">Saldo disponible</p>
          <p className="mt-1 font-display text-4xl font-extrabold text-foreground sm:text-5xl">{money(bal?.available ?? 0)}</p>
          {(bal?.debt ?? 0) > 0 && (
            <p className="mt-1 text-xs text-destructive">Saldo pendiente por compensar: {money(bal!.debt)} (reembolso posterior a un retiro). Se descontará de tus próximas ganancias.</p>
          )}
          {(bal?.inWithdrawal ?? 0) > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{money(bal!.inWithdrawal)} en retiros en curso</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="touch" disabled={(bal?.available ?? 0) <= 0} onClick={() => setWithdrawOpen(true)}>
              <ArrowDownToLine /> Retirar ganancias
            </Button>
            <Button size="touch" variant="outline" onClick={() => { setTab("history"); document.getElementById("earn-tabs")?.scrollIntoView({ behavior: "smooth" }); }}>
              <History /> Ver historial
            </Button>
          </div>
          {chart.length > 1 && (
            <div className="mt-5 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="earnFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => money(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                  <Area type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} fill="url(#earnFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          {([
            ["Saldo pendiente", bal?.pending ?? 0, "En período de seguridad"],
            ["Total ganado", bal?.totalEarned ?? 0, "Neto, sin reembolsos"],
            ["Total retirado", bal?.totalWithdrawn ?? 0, "Retiros completados"],
          ] as const).map(([label, v, hint]) => (
            <div key={label} className="pf-mini">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="mt-1 font-display text-2xl font-extrabold text-foreground">{money(v)}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div id="earn-tabs" className="flex flex-wrap gap-2 scroll-mt-4">
        {([["history", "Historial de ganancias"], ["withdrawals", "Retiros"], ["methods", "Métodos de retiro"]] as const).map(([k, l]) => (
          <button key={k} type="button" className="pf-chip" data-state={tab === k ? "ok" : "muted"} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "history" && (
        earnings.length === 0 ? (
          <div className="pf-empty"><p>Aún no tienes ganancias. Aparecen cuando una contratación pagada se completa.</p></div>
        ) : (
          <ul className="space-y-2.5">
            {earnings.map((e) => (
              <li key={e.id} className="pf-mini">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-foreground">{title(e.contractId)}</p>
                    <p className="text-xs text-muted-foreground">{date(e.createdAt)} · {counterpart(e.contractId)}</p>
                  </div>
                  <span className="pf-status" data-tone={TONE[e.status]}>{EARNING_LABEL[e.status]}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <span><span className="block text-muted-foreground">Bruto</span>{money(e.gross)}</span>
                  <span><span className="block text-muted-foreground">Comisión</span>{e.platformFee > 0 ? `− ${money(e.platformFee)}` : "—"}</span>
                  <span><span className="block text-muted-foreground">Neto</span><b className="text-foreground">{money(e.net)}</b></span>
                </div>
                {e.status === "pending" && (
                  <p className="mt-1 text-xs text-muted-foreground">Disponible desde {date(e.availableAt)}</p>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      {tab === "withdrawals" && (
        <WithdrawalList list={withdrawals} methods={snap?.methods ?? []} money={money} onChange={reload} />
      )}

      {tab === "methods" && <PayoutMethods methods={snap?.methods ?? []} onChange={reload} />}

      {withdrawOpen && bal && (
        <WithdrawDialog
          balance={bal}
          methods={snap?.methods ?? []}
          onAddMethod={() => { setWithdrawOpen(false); setTab("methods"); }}
          onClose={() => setWithdrawOpen(false)}
          onDone={() => { setWithdrawOpen(false); setTab("withdrawals"); void reload(); }}
        />
      )}
    </div>
  );
}

function WithdrawalList({ list, methods, money, onChange }: {
  list: ServiceWithdrawal[];
  methods: PayoutMethod[];
  money: (n: number) => string;
  onChange: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  if (list.length === 0) return <div className="pf-empty"><p>Todavía no has solicitado retiros.</p></div>;
  return (
    <ul className="space-y-2.5">
      {err && <p className="text-sm text-destructive">{err}</p>}
      {list.map((w) => {
        const m = methods.find((x) => x.id === w.methodId);
        return (
          <li key={w.id} className="pf-mini">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-lg font-extrabold text-foreground">{money(w.amount)}</p>
                <p className="text-xs text-muted-foreground">{date(w.createdAt)} · {m ? `${m.label}${m.last4 ? ` ••${m.last4}` : ""}` : "Método"}</p>
              </div>
              <span className="pf-status" data-tone={TONE[w.status]}>{WITHDRAWAL_LABEL[w.status]}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <span><span className="block text-muted-foreground">Comisión</span>{w.fee > 0 ? money(w.fee) : "—"}</span>
              <span><span className="block text-muted-foreground">Neto</span>{money(w.net)}</span>
              <span><span className="block text-muted-foreground">Referencia</span>{w.reference ?? "—"}</span>
              <span><span className="block text-muted-foreground">Procesado</span>{date(w.completedAt ?? w.processedAt)}</span>
            </div>
            {w.rejectionReason && <p className="mt-1 text-xs text-destructive">Motivo: {w.rejectionReason}</p>}
            {w.status === "pending" && (
              <Button className="mt-2" size="sm" variant="outline" onClick={() => void cancelWithdrawal(w.id).then(onChange, (e: Error) => setErr(e.message))}>
                Cancelar solicitud
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PayoutMethods({ methods, onChange }: { methods: PayoutMethod[]; onChange: () => void }) {
  const [type, setType] = useState<PayoutMethod["methodType"]>("bank_account");
  const [label, setLabel] = useState("");
  const [last4, setLast4] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const add = async () => {
    setBusy(true);
    try {
      await addPayoutMethod(type, label.trim(), last4.trim());
      setLabel(""); setLast4(""); setErr(null);
      onChange();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      {methods.length === 0 ? (
        <div className="pf-empty"><p>Aún no tienes métodos de retiro.</p></div>
      ) : (
        <ul className="space-y-2.5">
          {methods.map((m) => (
            <li key={m.id} className="pf-mini flex items-center gap-3">
              <span className="pf-tile-icon"><Landmark strokeWidth={1.7} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-foreground">{m.label}{m.last4 ? ` ••${m.last4}` : ""}</span>
                <span className="text-xs text-muted-foreground">{METHOD_LABEL[m.methodType]} · {m.verification === "verified" ? "Verificado" : "Sin verificar"}{m.isDefault ? " · Predeterminado" : ""}</span>
              </span>
              <Button size="icon" variant="ghost" aria-label="Quitar método" onClick={() => void archivePayoutMethod(m.id).then(onChange, (e: Error) => setErr(e.message))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="pf-mini space-y-2">
        <p className="font-bold text-foreground">Agregar método</p>
        <Select value={type} onValueChange={(v) => setType(v as PayoutMethod["methodType"])}>
          <SelectTrigger className="h-12 rounded-2xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(METHOD_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="h-12 rounded-2xl" maxLength={60} placeholder="Nombre para reconocerlo (ej.: Bancolombia ahorros)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input className="h-12 rounded-2xl" maxLength={4} placeholder="Últimos 4 dígitos (opcional)" value={last4} onChange={(e) => setLast4(e.target.value.replace(/[^0-9A-Za-z]/g, ""))} />
        <p className="text-xs text-muted-foreground">No guardamos el número completo. La verificación se hará cuando se conecte el proveedor de pagos.</p>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button disabled={busy || label.trim().length < 2} onClick={() => void add()}><Plus /> Guardar método</Button>
      </div>
    </div>
  );
}

function WithdrawDialog({ balance, methods, onClose, onDone, onAddMethod }: {
  balance: ServiceBalance;
  methods: PayoutMethod[];
  onClose: () => void;
  onDone: () => void;
  onAddMethod: () => void;
}) {
  const money = (n: number) => formatPaymentMoney(n, balance.currencyCode);
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState(methods.find((m) => m.isDefault)?.id ?? methods[0]?.id ?? "");
  const [step, setStep] = useState<"form" | "review">("form");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // One key per dialog: retries/double clicks map to the same server request.
  const [key] = useState(() => crypto.randomUUID());
  useEffect(() => setErr(null), [amount, methodId]);
  const value = Number(amount.replace(/[^0-9.]/g, ""));
  const valid = value > 0 && value <= balance.available && Boolean(methodId);
  const submit = async () => {
    setBusy(true);
    try {
      await requestWithdrawal({ amount: value, currencyCode: balance.currencyCode, methodId, idempotencyKey: key });
      onDone();
    } catch (e) { setErr((e as Error).message); setStep("form"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="rounded-[28px]">
        <DialogHeader><DialogTitle className="font-display text-2xl">Retirar ganancias</DialogTitle></DialogHeader>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="size-4" /> Saldo disponible: <b className="text-foreground">{money(balance.available)}</b></p>
        {methods.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm">Primero agrega un método de retiro.</p>
            <Button onClick={onAddMethod}>Agregar método</Button>
          </div>
        ) : step === "form" ? (
          <div className="space-y-3">
            <label className="block text-xs font-bold text-muted-foreground">¿Cuánto quieres retirar?</label>
            <Input className="h-12 rounded-2xl" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Hasta ${money(balance.available)}`} />
            <button type="button" className="text-xs font-bold text-primary" onClick={() => setAmount(String(balance.available))}>Retirar todo</button>
            <Select value={methodId} onValueChange={setMethodId}>
              <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="Método de retiro" /></SelectTrigger>
              <SelectContent>
                {methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}{m.last4 ? ` ••${m.last4}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            {value > balance.available && <p className="text-sm text-destructive">El monto supera tu saldo disponible.</p>}
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button className="w-full" size="touch" disabled={!valid} onClick={() => setStep("review")}>Continuar</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl bg-surface p-4 text-sm">
              <p className="flex justify-between"><span>Monto a retirar</span><b>{money(value)}</b></p>
              <p className="flex justify-between text-muted-foreground"><span>Comisión</span><span>Se calcula al confirmar</span></p>
              <p className="mt-2 flex justify-between border-t border-border pt-2"><span>Monto que recibirás</span><b>Monto − comisión</b></p>
            </div>
            <p className="text-xs text-muted-foreground">Tu solicitud quedará pendiente. Aún no se realizan transferencias automáticas: te avisaremos cuando cambie de estado.</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setStep("form")}>Volver</Button>
              <Button className="flex-1" disabled={busy} onClick={() => void submit()}>{busy ? "Enviando…" : "Solicitar retiro"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Admin base: visible only when Foundation says the caller is a payments admin. */
export function AdminWithdrawals() {
  const [admin, setAdmin] = useState(false);
  const [list, setList] = useState<ServiceWithdrawal[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [ref, setRef] = useState<Record<string, string>>({});
  const reload = () => loadAllWithdrawals().then(setList, (e: Error) => setErr(e.message));
  useEffect(() => {
    void isFinanceAdmin().then((ok) => { setAdmin(ok); if (ok) void reload(); });
  }, []);
  if (!admin) return null;
  const act = (id: string, s: "approved" | "processing" | "rejected") =>
    void adminTransitionWithdrawal(id, s, reason[id], ref[id]).then(() => { setErr(null); void reload(); }, (e: Error) => setErr(e.message));
  return (
    <section className="uv-module rounded-[22px] border border-border bg-card p-5 shadow-soft">
      <h2 className="font-display text-lg font-extrabold text-foreground">Retiros de Oportunidades (admin)</h2>
      <p className="text-xs text-muted-foreground">No hay proveedor de transferencias conectado: aprobar o marcar "procesando" solo registra el estado. Ningún retiro puede figurar como completado sin una transferencia real confirmada.</p>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      {list.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Sin solicitudes.</p> : (
        <ul className="mt-3 space-y-2.5">
          {list.map((w) => (
            <li key={w.id} className="pf-mini space-y-2">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span><b>{formatPaymentMoney(w.amount, w.currencyCode)}</b> · {date(w.createdAt)} · proveedor {w.profileId.slice(0, 8)}</span>
                <span className="pf-status" data-tone={TONE[w.status]}>{WITHDRAWAL_LABEL[w.status]}</span>
              </div>
              <p className="text-xs text-muted-foreground">Referencia: {w.reference ?? "—"} · Método: {w.methodId?.slice(0, 8) ?? "—"}</p>
              {["pending", "approved", "processing"].includes(w.status) && (
                <>
                  <Input className="h-10 rounded-xl" placeholder="Referencia de pago (opcional)" value={ref[w.id] ?? ""} onChange={(e) => setRef({ ...ref, [w.id]: e.target.value })} />
                  <Textarea className="rounded-xl" placeholder="Motivo (obligatorio para rechazar)" value={reason[w.id] ?? ""} onChange={(e) => setReason({ ...reason, [w.id]: e.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    {w.status === "pending" && <Button size="sm" onClick={() => act(w.id, "approved")}>Aprobar</Button>}
                    {w.status === "approved" && <Button size="sm" onClick={() => act(w.id, "processing")}>Marcar procesando</Button>}
                    {w.status === "processing" && <span className="text-xs text-muted-foreground">Se completará cuando el proveedor de transferencias confirme el pago con su referencia (aún no conectado).</span>}
                    <Button size="sm" variant="destructive" onClick={() => act(w.id, "rejected")}>Rechazar</Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
