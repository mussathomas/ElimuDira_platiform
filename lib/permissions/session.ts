import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface CurrentSession {
  userId: string;
  fullName: string;
  email: string;
  isSuperAdmin: boolean;
  school: {
    id: string;
    name: string;
    slug: string;
    logoPath: string | null;
    setupStep: number;
    setupCompleted: boolean;
    status: 'active' | 'suspended' | 'deactivated';
  } | null;
  roleName: string | null;
  permissions: Set<string>;
}

/**
 * Resolves everything a page/layout needs about "who is asking" in one place.
 * `cache()` de-dupes this across every Server Component that calls it during
 * a single request, so it only hits the database once per request.
 */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, { data: permissionRows }, { data: platformAdmin }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, email, school:schools(id, name, slug, logo_path, setup_step, setup_completed, status), role:roles(name)')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.rpc('get_my_permission_codes'),
    supabase.from('platform_admins').select('profile_id').eq('profile_id', user.id).maybeSingle(),
  ]);

  return {
    userId: user.id,
    fullName: profile?.full_name ?? user.email ?? 'User',
    email: profile?.email ?? user.email ?? '',
    isSuperAdmin: Boolean(platformAdmin),
    school: profile?.school
      ? {
          id: (profile.school as any).id,
          name: (profile.school as any).name,
          slug: (profile.school as any).slug,
          logoPath: (profile.school as any).logo_path,
          setupStep: (profile.school as any).setup_step,
          setupCompleted: (profile.school as any).setup_completed,
          status: (profile.school as any).status,
        }
      : null,
    roleName: (profile?.role as any)?.name ?? null,
    permissions: new Set(
      (permissionRows as unknown[] ?? [])
        .map((row: unknown) => (typeof row === 'string' ? row : (row as { code?: string }).code))
        .filter((code: string | undefined): code is string => Boolean(code))
    ),
  };
});

/** For Server Components/layouts that require *some* authenticated session. */
export async function requireSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  return session;
}

/** For school-workspace pages: must belong to a school (rules out platform-only admins). */
export async function requireSchoolSession(): Promise<CurrentSession & { school: NonNullable<CurrentSession['school']> }> {
  const session = await requireSession();
  if (!session.school) redirect('/platform');
  if (session.school.status !== 'active' && !session.isSuperAdmin) redirect('/school-suspended');
  return session as CurrentSession & { school: NonNullable<CurrentSession['school']> };
}

/** For platform (Super Admin) pages. */
export async function requireSuperAdmin(): Promise<CurrentSession> {
  const session = await requireSession();
  if (!session.isSuperAdmin) redirect('/dashboard');
  return session;
}

/**
 * Guard for Server Actions. Always re-check permission server-side even
 * though the sidebar/UI already hid the action — the client is never trusted.
 */
export async function requirePermission(code: string): Promise<CurrentSession> {
  const session = await requireSchoolSession();
  if (!session.permissions.has(code)) {
    throw new Error(`Forbidden: missing permission "${code}"`);
  }
  return session;
}

export async function requireGradingViewer(): Promise<CurrentSession> {
  const session = await requireSchoolSession();
  if (!session.permissions.has('view_grading_settings') && !session.permissions.has('manage_grading_settings') && !session.permissions.has('edit_settings')) {
    throw new Error('Forbidden: missing grading settings permission');
  }
  return session;
}

export async function requireGradingManager(): Promise<CurrentSession> {
  const session = await requireSchoolSession();
  if (!session.permissions.has('manage_grading_settings') && !session.permissions.has('edit_settings')) {
    throw new Error('Forbidden: missing grading management permission');
  }
  return session;
}
