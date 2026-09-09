'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function loginUser(_prev: LoginResult | null, formData: FormData): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Enter your email and password.' };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return { ok: false, error: 'Incorrect email or password.' };
  }

  const [{ data: platformAdmin }, { data: profile }] = await Promise.all([
    supabase.from('platform_admins').select('profile_id').eq('profile_id', data.user.id).maybeSingle(),
    supabase.from('profiles').select('status, school:schools(status)').eq('id', data.user.id).maybeSingle(),
  ]);

  if (!profile && !platformAdmin) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: 'Your account exists, but its school workspace is not set up. Run the Supabase migrations and register again.',
    };
  }

  if (profile?.status === 'suspended') {
    await supabase.auth.signOut();
    return { ok: false, error: 'Your account has been suspended. Contact your school administrator.' };
  }

  const schoolStatus = (profile?.school as { status?: string } | null)?.status;
  if (!platformAdmin && schoolStatus && schoolStatus !== 'active') {
    await supabase.auth.signOut();
    return {
      ok: false,
      error:
        schoolStatus === 'suspended'
          ? "Your school's ElimuDira workspace is currently suspended. Contact ElimuDira support."
          : "Your school's ElimuDira workspace is no longer active.",
    };
  }

  redirect(platformAdmin ? '/platform' : '/dashboard');
}
