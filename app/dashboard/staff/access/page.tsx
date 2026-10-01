import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAccessManager } from '@/components/roles/user-access-manager';

export default async function StaffAccessPage() {
  const session = await requirePermission('manage_users');
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const [{ data: staff }, { data: permissions }, { data: rolePermissions }, { data: overrides }] = await Promise.all([
    supabase.from('staff_members').select('profile_id, profiles(full_name, email, role_id, role:roles(name))').eq('school_id', schoolId).order('employee_number'),
    supabase.from('permissions').select('id, code, module, description').order('module').order('code'),
    supabase.from('role_permissions').select('role_id, permission_id, roles!inner(school_id)').eq('roles.school_id', schoolId),
    supabase.from('user_permission_overrides').select('profile_id, permission_id, granted, profiles!inner(school_id)').eq('profiles.school_id', schoolId),
  ]);

  const permissionsByModule: Record<string, { id: string; code: string; description: string | null }[]> = {};
  for (const permission of permissions ?? []) {
    (permissionsByModule[permission.module] ??= []).push(permission);
  }

  const grantsByRole = new Map<string, Set<string>>();
  for (const grant of rolePermissions ?? []) {
    const roleGrants = grantsByRole.get(grant.role_id) ?? new Set<string>();
    roleGrants.add(grant.permission_id);
    grantsByRole.set(grant.role_id, roleGrants);
  }

  const overridesByUser = new Map<string, { permissionId: string; granted: boolean }[]>();
  for (const override of overrides ?? []) {
    const userOverrides = overridesByUser.get(override.profile_id) ?? [];
    userOverrides.push({ permissionId: override.permission_id, granted: override.granted });
    overridesByUser.set(override.profile_id, userOverrides);
  }

  const staffOptions = (staff ?? []).flatMap((member) => {
    const profile = member.profiles as { full_name?: string; email?: string; role_id?: string; role?: { name?: string } | null } | null;
    if (!profile || member.profile_id === session.userId) return [];
    return [{
      profileId: member.profile_id,
      fullName: profile.full_name ?? 'Staff member',
      email: profile.email ?? '',
      roleName: profile.role?.name ?? 'No role',
    }];
  });

  const initialAccessByUser = Object.fromEntries((staff ?? []).map((member) => {
    const profile = member.profiles as { role_id?: string } | null;
    const access = new Set(profile?.role_id ? grantsByRole.get(profile.role_id) ?? [] : []);
    for (const override of overridesByUser.get(member.profile_id) ?? []) {
      override.granted ? access.add(override.permissionId) : access.delete(override.permissionId);
    }
    return [member.profile_id, [...access]];
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">User access</h2>
        <p className="help-text">Grant or revoke individual module permissions without changing the person&apos;s assigned role.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Individual module access</CardTitle></CardHeader>
        <UserAccessManager staff={staffOptions} permissionsByModule={permissionsByModule} initialAccessByUser={initialAccessByUser} />
      </Card>
    </div>
  );
}