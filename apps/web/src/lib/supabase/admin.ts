import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client. SERVER ONLY — bypasses RLS, so never import this
 * into client code. Used for narrow, already-authorized operations such as
 * generating short-lived signed URLs for private storage objects that the caller
 * has already been authorized to see via data-layer RLS.
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set (required for signed URLs / media).",
    );
  }
  return createClient<Database>(supabaseEnv.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
