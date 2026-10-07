/**
 * AnyOne¹⁶ — Oportunidades earnings & withdrawals (provider side).
 * Balances come ONLY from Foundation (get_my_service_balance, ledger-derived);
 * every write is a Foundation RPC that re-validates owner, amount and state.
 * No real payout provider is connected yet.
 */
import { useCallback, useEffect, useState } from "react";

import { foundation } from "@/integrations/foundation/client";

type Row = Record<string, unknown>;
type PgError = { message: string; code?: string };
type RpcClient = {
  rpc: (n: string, p?: Record<string, unknown>) => Promise<{ data: unknown; error: PgError | null }>;
  from: (t: string) => {
    select: (c: string) => {
      order: (c: string, o: { ascending: boolean }) => {
        limit: (n: number) => Promise<{ data: unknown; error: PgError | null }>;
      };
    };
  };
};
const db = () => foundation as unknown as RpcClient;
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v == null ? null : String(v));

export const EARNINGS_NOT_INSTALLED =
  "El módulo de ganancias todavía no está instalado en Foundation.";

const MESSAGES: Record<string, string> = {
  not_authenticated: "Inicia sesión para continuar.",
  amount_must_be_positive: "El monto debe ser mayor que cero.",
  amount_exceeds_available: "El monto supera tu saldo disponible.",
  negative_balance_blocks_withdrawal: "Tienes un saldo pendiente por compensar de un reembolso. Podrás retirar cuando tus próximas ganancias lo cubran.",
  amount_below_fee: "El monto no cubre la comisión del retiro.",
  payout_method_not_found: "Elige un método de retiro válido.",
  idempotency_key_required: "No se pudo identificar la solicitud. Inténtalo de nuevo.",
  withdrawal_not_cancellable: "Este retiro ya no se puede cancelar.",
  withdrawal_not_found: "No se encontró el retiro.",
  too_many_methods: "Puedes guardar hasta 5 métodos de retiro.",
  admin_only: "Solo un administrador puede hacer esto.",
  rejection_reason_required: "Escribe un motivo de al menos 5 caracteres.",
  invalid_transition: "Ese cambio de estado no está permitido.",
  amount_below_minimum: "El monto es menor que el mínimo de retiro.",
  amount_above_maximum: "El monto supera el máximo permitido por retiro.",
};
const isMissing = (e: PgError) => ["PGRST202", "PGRST205", "42P01", "42883"].includes(e.code ?? "");
function toError(e: PgError) {
  if (isMissing(e)) return new Error(EARNINGS_NOT_INSTALLED);
  const key = Object.keys(MESSAGES).find((k) => e.message.includes(k));
  return new Error(key ? MESSAGES[key]! : e.message);
}

export type ServiceBalance = {
  currencyCode: string;
  available: number;
  pending: number;
  totalEarned: number;
  totalWithdrawn: number;
  inWithdrawal: number;
  /** Reversal after funds were withdrawn; offset by future earnings. */
  debt: number;
};
export type EarningStatus = "pending" | "available" | "reversed";
export type ServiceEarning = {
  id: string;
  contractId: string;
  buyerProfileId: string;
  gross: number;
  platformFee: number;
  net: number;
  currencyCode: string;
  status: EarningStatus;
  availableAt: string;
  createdAt: string;
};
export type WithdrawalStatus = "pending" | "approved" | "processing" | "completed" | "rejected" | "cancelled";
export type ServiceWithdrawal = {
  id: string;
  profileId: string;
  methodId: string | null;
  amount: number;
  fee: number;
  net: number;
  currencyCode: string;
  status: WithdrawalStatus;
  reference: string | null;
  rejectionReason: string | null;
  processedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};
export type PayoutMethod = {
  id: string;
  profileId: string;
  methodType: "bank_account" | "mercadopago" | "paypal" | "other";
  label: string;
  last4: string | null;
  verification: "unverified" | "pending" | "verified" | "rejected";
  isDefault: boolean;
  archivedAt: string | null;
};

export const EARNING_LABEL: Record<EarningStatus | "withdrawn", string> = {
  pending: "Pendiente",
  available: "Disponible",
  withdrawn: "Retirado",
  reversed: "Revertido",
};
export const WITHDRAWAL_LABEL: Record<WithdrawalStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  processing: "Procesando",
  completed: "Completado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};
export const METHOD_LABEL: Record<PayoutMethod["methodType"], string> = {
  bank_account: "Cuenta bancaria",
  mercadopago: "Mercado Pago",
  paypal: "PayPal",
  other: "Otro",
};

const toEarning = (r: Row): ServiceEarning => ({
  id: String(r["id"]),
  contractId: String(r["service_contract_id"]),
  buyerProfileId: String(r["buyer_profile_id"]),
  gross: num(r["gross_amount"]),
  platformFee: num(r["platform_fee"]),
  net: num(r["net_amount"]),
  currencyCode: String(r["currency_code"]),
  status: String(r["status"]) as EarningStatus,
  availableAt: String(r["available_at"]),
  createdAt: String(r["created_at"]),
});
export const toWithdrawal = (r: Row): ServiceWithdrawal => ({
  id: String(r["id"]),
  profileId: String(r["profile_id"]),
  methodId: str(r["payout_method_id"]),
  amount: num(r["amount"]),
  fee: num(r["fee"]),
  net: num(r["net_amount"]),
  currencyCode: String(r["currency_code"]),
  status: String(r["status"]) as WithdrawalStatus,
  reference: str(r["external_reference"]),
  rejectionReason: str(r["rejection_reason"]),
  processedAt: str(r["processed_at"]),
  completedAt: str(r["completed_at"]),
  createdAt: String(r["created_at"]),
});
const toMethod = (r: Row): PayoutMethod => ({
  id: String(r["id"]),
  profileId: String(r["profile_id"]),
  methodType: String(r["method_type"]) as PayoutMethod["methodType"],
  label: String(r["display_label"]),
  last4: str(r["last4"]),
  verification: String(r["verification_status"]) as PayoutMethod["verification"],
  isDefault: Boolean(r["is_default"]),
  archivedAt: str(r["archived_at"]),
});

const METHOD_COLUMNS =
  "id, profile_id, method_type, display_label, last4, provider, verification_status, is_default, archived_at, created_at";

async function read<T>(table: string, cols: string, map: (r: Row) => T) {
  const { data, error } = await db().from(table).select(cols).order("created_at", { ascending: false }).limit(500);
  if (error) throw toError(error);
  return ((data ?? []) as Row[]).map(map);
}

export type EarningsSnapshot = {
  balances: ServiceBalance[];
  earnings: ServiceEarning[];
  withdrawals: ServiceWithdrawal[];
  methods: PayoutMethod[];
};

/** RLS returns only the caller's rows (admins see all, so we filter by owner for the personal view). */
export async function loadEarnings(myProfileId: string): Promise<EarningsSnapshot> {
  const bal = await db().rpc("get_my_service_balance");
  if (bal.error) throw toError(bal.error);
  const [earnings, withdrawals, methods] = await Promise.all([
    read("service_earnings", "*", (r) => ({ ...toEarning(r), provider: String(r["provider_profile_id"]) })),
    read("service_withdrawals", "*", toWithdrawal),
    read("service_payout_methods", METHOD_COLUMNS, toMethod),
  ]);
  return {
    balances: ((bal.data ?? []) as Row[]).map((r) => ({
      currencyCode: String(r["currency_code"]),
      available: num(r["available"]),
      pending: num(r["pending"]),
      totalEarned: num(r["total_earned"]),
      totalWithdrawn: num(r["total_withdrawn"]),
      inWithdrawal: num(r["in_withdrawal"]),
      debt: num(r["debt"]),
    })),
    earnings: earnings.filter((e) => e.provider === myProfileId),
    withdrawals: withdrawals.filter((w) => w.profileId === myProfileId),
    methods: methods.filter((m) => m.profileId === myProfileId && !m.archivedAt),
  };
}

export function useEarnings(myProfileId: string | null) {
  const [snap, setSnap] = useState<EarningsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!myProfileId) return;
    setLoading(true);
    try {
      setSnap(await loadEarnings(myProfileId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [myProfileId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { snap, error, loading, reload };
}

/** The key is generated once per withdraw dialog so double clicks/retries never duplicate. */
export async function requestWithdrawal(input: {
  amount: number;
  currencyCode: string;
  methodId: string;
  idempotencyKey: string;
}) {
  const { data, error } = await db().rpc("request_service_withdrawal", {
    _amount: input.amount,
    _currency: input.currencyCode,
    _payout_method_id: input.methodId,
    _idempotency_key: input.idempotencyKey,
  });
  if (error) throw toError(error);
  return toWithdrawal(data as Row);
}

export async function cancelWithdrawal(id: string) {
  const { error } = await db().rpc("cancel_my_service_withdrawal", { _withdrawal_id: id });
  if (error) throw toError(error);
}

export async function addPayoutMethod(type: PayoutMethod["methodType"], label: string, last4: string) {
  const { error } = await db().rpc("add_service_payout_method", {
    _method_type: type,
    _display_label: label,
    _last4: last4 || null,
  });
  if (error) throw toError(error);
}

export async function archivePayoutMethod(id: string) {
  const { error } = await db().rpc("archive_service_payout_method", { _method_id: id });
  if (error) throw toError(error);
}

/* ------------------------------------------------------------- admin --- */

export async function isFinanceAdmin() {
  const { data, error } = await db().rpc("is_payment_admin");
  return !error && data === true;
}

export async function loadAllWithdrawals() {
  return read("service_withdrawals", "*", toWithdrawal);
}

export async function adminTransitionWithdrawal(
  id: string,
  status: "approved" | "processing" | "rejected",
  reason?: string,
  reference?: string,
) {
  const { error } = await db().rpc("admin_transition_service_withdrawal", {
    _withdrawal_id: id,
    _status: status,
    _reason: reason ?? null,
    _reference: reference ?? null,
  });
  if (error) throw toError(error);
}
