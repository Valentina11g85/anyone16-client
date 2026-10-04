import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/foundation.types";
import { FOUNDATION_ANON_KEY, FOUNDATION_STORAGE_KEY, FOUNDATION_URL } from "./config";

function createFoundationClient() {
  return createClient<Database>(FOUNDATION_URL, FOUNDATION_ANON_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      storageKey: FOUNDATION_STORAGE_KEY,
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
    },
  });
}

let _client: SupabaseClient<Database> | undefined;

// Dedicated Foundation client — always targets owruupeffgvlfokgpswm, independent of env vars.
export const foundation = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) {
    if (!_client) _client = createFoundationClient();
    const value = Reflect.get(_client, prop, _client);
    return typeof value === "function" ? value.bind(_client) : value;
  },
});

export const supabase = foundation;
