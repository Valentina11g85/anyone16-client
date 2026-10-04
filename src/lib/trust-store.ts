/**
 * AnyOne¹⁶ — Stage 8 Trust & Safety store.
 *
 * Observable snapshot of the trust configuration, worker trust records,
 * disputes and risk signals. Everything is read from the backend, so trust
 * state survives navigation, reload and sign-out/sign-in.
 */

import { useEffect, useSyncExternalStore } from "react";

import { isAdminUser } from "./payments-repo";
import type { EligibilityRule, TrustSettings, WorkerTrust } from "./trust-model";
import {
  loadDisputes,
  loadEligibilityRules,
  loadRiskSignals,
  loadTrustSettings,
  loadWorkerTrustIndex,
} from "./trust-repo";

type Row = Record<string, unknown>;

export type TrustState = {
  settings: TrustSettings;
  rules: EligibilityRule[];
  workers: Record<string, WorkerTrust>;
  disputes: Row[];
  riskSignals: Row[];
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
};

const initialState: TrustState = {
  settings: {},
  rules: [],
  workers: {},
  disputes: [],
  riskSignals: [],
  isAdmin: false,
  loading: true,
  error: null,
};

let state: TrustState = initialState;
const listeners = new Set<() => void>();

function set(update: (current: TrustState) => TrustState) {
  state = update(state);
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getState = () => state;
const getServerState = () => initialState;

let hydrating: Promise<void> | null = null;

export function hydrateTrust(force = false) {
  if (hydrating && !force) return hydrating;
  hydrating = (async () => {
    try {
      const [settings, rules, workers, disputes, admin] = await Promise.all([
        loadTrustSettings(),
        loadEligibilityRules(),
        loadWorkerTrustIndex(),
        loadDisputes(),
        isAdminUser(),
      ]);
      const riskSignals = admin ? await loadRiskSignals() : [];
      set((current) => ({
        ...current,
        settings,
        rules,
        workers,
        disputes,
        riskSignals,
        isAdmin: admin,
        loading: false,
        error: null,
      }));
    } catch (error) {
      set((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "trust_load_failed",
      }));
    }
  })();
  return hydrating;
}

export function useTrust() {
  const snapshot = useSyncExternalStore(subscribe, getState, getServerState);
  useEffect(() => {
    void hydrateTrust();
  }, []);
  return snapshot;
}

export const refreshTrust = () => hydrateTrust(true);

export const trustForWorker = (trust: TrustState, workerProfileId: string | null) =>
  (workerProfileId && trust.workers[workerProfileId]) || null;
