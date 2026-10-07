/**
 * AnyOne¹⁶ — Stage 5 authentication.
 *
 * One person, one account, two modes (client 🔵 / worker 🔴⚫).
 * The session comes from the real auth provider; the profile rows live in the
 * database and are created the first time the account signs in.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/foundation/client";
import { defaultMarketConfig } from "@/lib/market-config";
import { setIdentity } from "@/lib/marketplace-store";

export type AppMode = "client" | "worker";

export type AccountProfile = {
  id: string;
  userId: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  countryCode: string;
  languageCode: string;
  currencyCode: string;
  timezone: string;
};

export type WorkerAccount = {
  id: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  languages: string[];
  categories: string[];
  serviceZone: string | null;
  available: boolean;
};

export type WorkerActivationInput = {
  displayName: string;
  headline: string;
  bio: string;
  avatarUrl: string | null;
  languages: string[];
  categories: string[];
  serviceZone: string;
  available: boolean;
};

type AuthContextValue = {
  loading: boolean;
  user: User | null;
  session: Session | null;
  profile: AccountProfile | null;
  worker: WorkerAccount | null;
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  signUp: (input: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    countryCode: string;
    languageCode: string;
    currencyCode: string;
    consents: { acceptTerms: boolean; acceptDataAndAge: boolean; marketing: boolean };
  }) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePreferences: (input: {
    countryCode?: string;
    languageCode?: string;
    currencyCode?: string;
    fullName?: string;
    phone?: string;
  }) => Promise<void>;
  activateWorker: (input: WorkerActivationInput) => Promise<void>;
  updateWorker: (input: Partial<WorkerActivationInput>) => Promise<void>;
};

// Keep a single context instance across hot-module reloads. When Vite swaps
// this module (or a consumer) without remounting the tree, a fresh
// createContext() would leave the mounted AuthProvider serving the old
// context object and every consumer would read null → "useAuth must be used
// inside AuthProvider". Storing it on globalThis makes the context identity
// stable for the lifetime of the page.
const AUTH_CONTEXT_KEY = "__anyone16.authContext";
const globalScope = globalThis as unknown as Record<string, unknown>;
const AuthContext =
  (globalScope[AUTH_CONTEXT_KEY] as ReturnType<
    typeof createContext<AuthContextValue | null>
  > | undefined) ?? createContext<AuthContextValue | null>(null);
globalScope[AUTH_CONTEXT_KEY] = AuthContext;

const MODE_KEY = "anyone16.mode";
const REMEMBER_KEY = "anyone16.remember";

const readStoredMode = (): AppMode => {
  if (typeof window === "undefined") return "client";
  return window.localStorage.getItem(MODE_KEY) === "worker" ? "worker" : "client";
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [worker, setWorker] = useState<WorkerAccount | null>(null);
  const [mode, setModeState] = useState<AppMode>("client");
  const [loading, setLoading] = useState(true);
  const bootstrapping = useRef(false);

  const loadAccount = useCallback(async (user: User) => {
    if (bootstrapping.current) return;
    bootstrapping.current = true;
    try {
      const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
      let { data: row } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!row) {
        const inserted = await supabase
          .from("profiles")
          .insert({
            user_id: user.id,
            email: user.email ?? null,
            phone: meta['phone'] ?? user.phone ?? null,
            full_name: meta['full_name'] ?? null,
            country_code: meta['country_code'] ?? defaultMarketConfig.countryCode,
            language_code: meta['language_code'] ?? defaultMarketConfig.languageCode,
            currency_code: meta['currency_code'] ?? defaultMarketConfig.currencyCode,
            timezone: meta['timezone'] ?? defaultMarketConfig.timezone,
            is_demo: false,
          })
          .select("*")
          .single();
        row = inserted.data;
        if (row) {
          await supabase
            .from("customer_profiles")
            .insert({ profile_id: row.id, display_name: row.full_name, is_demo: false });
        }
      }

      if (!row) {
        setProfile(null);
        setWorker(null);
        setIdentity(null);
        return;
      }

      const account: AccountProfile = {
        id: row.id,
        userId: user.id,
        email: row.email,
        phone: row.phone,
        fullName: row.full_name,
        avatarUrl: row.avatar_url,
        countryCode: row.country_code,
        languageCode: row.language_code,
        currencyCode: row.currency_code,
        timezone: row.timezone,
      };
      setProfile(account);

      // Foundation grants SELECT on worker_profiles per column; "*" would hit
      // protected Trust & Safety columns (42501). Request only what WorkerAccount needs.
      const { data: workerRow, error: workerError } = await supabase
        .from("worker_profiles")
        .select(
          "id, display_name, headline, bio, avatar_url, languages, available_categories, service_zone, availability_status",
        )
        .eq("profile_id", row.id)
        .maybeSingle();
      if (workerError) {
        console.error("[auth] worker_profiles lookup failed", workerError);
      }

      const workerAccount: WorkerAccount | null = workerRow
        ? {
            id: workerRow.id,
            displayName: workerRow.display_name,
            headline: workerRow.headline,
            bio: workerRow.bio,
            avatarUrl: workerRow.avatar_url,
            languages: workerRow.languages ?? [],
            categories: workerRow.available_categories ?? [],
            serviceZone: workerRow.service_zone,
            available: workerRow.availability_status === "available",
          }
        : null;
      setWorker(workerAccount);
      setIdentity({
        userId: user.id,
        profileId: row.id,
        workerProfileId: workerAccount?.id ?? null,
      });
      const stored = readStoredMode();
      setModeState(stored === "worker" && workerAccount ? "worker" : "client");
    } finally {
      bootstrapping.current = false;
    }
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "SIGNED_OUT" || !nextSession?.user) {
        setProfile(null);
        setWorker(null);
        setModeState("client");
        setIdentity(null);
        setLoading(false);
        return;
      }
      void loadAccount(nextSession.user).finally(() => setLoading(false));
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadAccount(data.session.user);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadAccount]);

  const setMode = useCallback(
    (next: AppMode) => {
      if (next === "worker" && !worker) return;
      setModeState(next);
      if (typeof window !== "undefined") window.localStorage.setItem(MODE_KEY, next);
    },
    [worker],
  );

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadAccount(data.user);
  }, [loadAccount]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      worker,
      mode,
      setMode,

      async signUp(input) {
        const { data, error } = await supabase.auth.signUp({
          email: input.email.trim(),
          password: input.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: input.fullName.trim(),
              phone: input.phone.trim(),
              country_code: input.countryCode,
              language_code: input.languageCode,
              currency_code: input.currencyCode,
              // Only the ticked boxes; Foundation resolves version/date/jurisdiction itself.
              legal_accept_terms: input.consents.acceptTerms,
              legal_accept_data_age: input.consents.acceptDataAndAge,
              legal_marketing: input.consents.marketing,
            },
          },
        });
        if (error) throw error;
        return { needsConfirmation: !data.session };
      },

      async signIn(email, password, remember) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },

      async signOut() {
        await supabase.auth.signOut();
        if (typeof window !== "undefined") window.localStorage.removeItem(MODE_KEY);
        setProfile(null);
        setWorker(null);
        setModeState("client");
        setIdentity(null);
      },

      async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
      },

      async updatePreferences(input) {
        if (!profile) return;
        const patch: Record<string, string> = {};
        if (input.countryCode) patch['country_code'] = input.countryCode;
        if (input.languageCode) patch['language_code'] = input.languageCode;
        if (input.currencyCode) patch['currency_code'] = input.currencyCode;
        if (input.fullName !== undefined) patch['full_name'] = input.fullName;
        if (input.phone !== undefined) patch['phone'] = input.phone;
        if (Object.keys(patch).length === 0) return;
        const { error } = await supabase
          .from("profiles")
          .update(patch as never)
          .eq("id", profile.id);
        if (error) throw error;
        setProfile({
          ...profile,
          countryCode: input.countryCode ?? profile.countryCode,
          languageCode: input.languageCode ?? profile.languageCode,
          currencyCode: input.currencyCode ?? profile.currencyCode,
          fullName: input.fullName ?? profile.fullName,
          phone: input.phone ?? profile.phone,
        });
      },

      async activateWorker(input) {
        if (!profile) throw new Error("no_profile");
        const { error } = await supabase.from("worker_profiles").insert({
          profile_id: profile.id,
          display_name: input.displayName.trim() || profile.fullName || "AnyOne",
          headline: input.headline,
          bio: input.bio,
          avatar_url: input.avatarUrl,
          languages: input.languages,
          available_categories: input.categories,
          service_zone: input.serviceZone,
          availability_status: input.available ? "available" : "unavailable",
          is_demo: false,
        });
        if (error) throw error;
        await supabase
          .from("verifications")
          .insert({ profile_id: profile.id, verification_type: "identity", status: "pending" });
        await refresh();
        setModeState("worker");
        if (typeof window !== "undefined") window.localStorage.setItem(MODE_KEY, "worker");
      },

      async updateWorker(input) {
        if (!worker) return;
        const patch: Record<string, unknown> = {};
        if (input.displayName !== undefined) patch['display_name'] = input.displayName;
        if (input.headline !== undefined) patch['headline'] = input.headline;
        if (input.bio !== undefined) patch['bio'] = input.bio;
        if (input.languages !== undefined) patch['languages'] = input.languages;
        if (input.categories !== undefined) patch['available_categories'] = input.categories;
        if (input.serviceZone !== undefined) patch['service_zone'] = input.serviceZone;
        if (input.available !== undefined)
          patch['availability_status'] = input.available ? "available" : "unavailable";
        if (Object.keys(patch).length === 0) return;
        const { error } = await supabase
          .from("worker_profiles")
          .update(patch as never)
          .eq("id", worker.id);
        if (error) throw error;
        setWorker({ ...worker, ...input } as WorkerAccount);
      },
    }),
    [loading, session, profile, worker, mode, setMode, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
