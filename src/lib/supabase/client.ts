import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Session-aware anon-key client for Client Components — powers sign-in/
 * sign-out and lets the UI know the current auth state. Stores the
 * session in cookies (not localStorage), so it's readable by
 * lib/supabase/server.ts on the server side too. Still governed entirely
 * by RLS: it can never write to votes/payments regardless of auth state
 * (see migration 0001's RLS comment — those tables have zero policies for
 * the anon/authenticated roles, so only the service-role admin client can
 * touch them, exactly as before).
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
