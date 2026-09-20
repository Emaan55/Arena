import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Session-aware, anon-key client for Route Handlers — reads the caller's
 * Supabase auth cookies and can refresh/persist them back onto the
 * response. This is what makes `supabase.auth.getUser()` a trustworthy,
 * server-verified identity check (it re-validates the token against
 * Supabase's Auth server rather than just decoding a client-supplied
 * cookie) instead of anything the client could forge. Only ever used to
 * *read who the caller is* — every actual database write still goes
 * through the service-role admin client (see lib/supabase/admin.ts),
 * exactly as before.
 */
export async function createRouteHandlerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
