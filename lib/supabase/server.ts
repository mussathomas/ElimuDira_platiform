import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Runs with the caller's session — RLS applies exactly as it would for that
 * user. This is the client every school-facing query/mutation should use.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render — safe to ignore because
            // middleware refreshes the session on every request anyway.
          }
        },
      },
    }
  );
}

/**
 * Service-role client. This bypasses RLS entirely.
 *
 * NEVER import this into a Client Component or expose it to the browser.
 * Only use it for the small set of operations that genuinely require
 * elevated privilege (e.g. platform-level Super Admin actions on schools
 * they don't belong to, or auth.admin user management). Every ordinary
 * school-facing read/write must go through createServerSupabaseClient()
 * instead, so RLS stays the actual enforcement layer.
 */
export function createAdminSupabaseClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
