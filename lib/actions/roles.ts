'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const roleSchema = z.object({
  name: z.string().trim().min(2, 'Role name is too short').max(60),
  description: z.string().trim().max(200).optional().or(z.literal('')),
});

export async function createRole(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('manage_roles');
  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('roles')
    .insert({ school_id: session.school!.id, name: parsed.data.name, description: parsed.data.description || null })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'A role with that name already exists.' };
    console.error(error);
    return { ok: false, error: 'Unable to create the role.' };
  }

  await supabase.from('audit_logs').insert({
    school_id: session.school!.id,
    actor_id: session.userId,
    action: 'role.create',
    resource_type: 'role',
    resource_id: data.id,
  });

  revalidatePath('/dashboard/staff/roles');
  return { ok: true };
}

export async function deleteRole(roleId: string): Promise<ActionResult> {
  const session = await requirePermission('manage_roles');
  const supabase = await createServerSupabaseClient();

  const { data: role } = await supabase.from('roles').select('is_system').eq('id', roleId).single();
  if (role?.is_system) return { ok: false, error: 'The Administrator role cannot be deleted.' };

  const { error } = await supabase.from('roles').delete().eq('id', roleId).eq('school_id', session.school!.id);
  if (error) {
    return { ok: false, error: 'Unable to delete this role — it may still be assigned to staff members.' };
  }

  await supabase.from('audit_logs').insert({
    school_id: session.school!.id,
    actor_id: session.userId,
    action: 'role.delete',
    resource_type: 'role',
    resource_id: roleId,
  });

  revalidatePath('/dashboard/staff/roles');
  return { ok: true };
}

export async function setRolePermission(
  roleId: string,
  permissionId: string,
  granted: boolean
): Promise<ActionResult> {
  const session = await requirePermission('manage_roles');
  const supabase = await createServerSupabaseClient();

  const { data: role } = await supabase.from('roles').select('is_system, name').eq('id', roleId).single();
  if (role?.is_system) {
    return { ok: false, error: 'The Administrator role always has full access and cannot be changed.' };
  }

  if (granted) {
    const { error } = await supabase.from('role_permissions').insert({ role_id: roleId, permission_id: permissionId });
    if (error && error.code !== '23505') return { ok: false, error: 'Unable to grant this permission.' };
  } else {
    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId)
      .eq('permission_id', permissionId);
    if (error) return { ok: false, error: 'Unable to revoke this permission.' };
  }

  await supabase.from('audit_logs').insert({
    school_id: session.school!.id,
    actor_id: session.userId,
    action: granted ? 'role.grant_permission' : 'role.revoke_permission',
    resource_type: 'role',
    resource_id: roleId,
    metadata: { permission_id: permissionId, role_name: role?.name },
  });

  revalidatePath('/dashboard/staff/roles');
  return { ok: true };
}

export async function setUserPermissionOverrides(
  profileId: string,
  permissionIds: string[],
  granted: boolean
): Promise<ActionResult> {
  const session = await requirePermission('manage_users');
  const parsed = z.object({
    profileId: z.string().uuid(),
    permissionIds: z.array(z.string().uuid()).min(1).max(100),
    granted: z.boolean(),
  }).safeParse({ profileId, permissionIds: [...new Set(permissionIds)], granted });
  if (!parsed.success) return { ok: false, error: 'Choose a valid staff member and permission.' };
  if (parsed.data.profileId === session.userId) return { ok: false, error: 'You cannot change your own individual access.' };

  const supabase = await createServerSupabaseClient();
  const [{ data: profile }, { data: permissions }] = await Promise.all([
    supabase.from('profiles').select('id').eq('id', parsed.data.profileId).eq('school_id', session.school!.id).maybeSingle(),
    supabase.from('permissions').select('id').in('id', parsed.data.permissionIds),
  ]);
  if (!profile || permissions?.length !== parsed.data.permissionIds.length) {
    return { ok: false, error: 'The selected user or permissions are not available.' };
  }

  const { error } = await supabase.from('user_permission_overrides').upsert(
    parsed.data.permissionIds.map((permissionId) => ({
      profile_id: profile.id,
      permission_id: permissionId,
      granted: parsed.data.granted,
    })),
    { onConflict: 'profile_id,permission_id' }
  );
  if (error) return { ok: false, error: "Unable to update this user's access." };

  await supabase.from('audit_logs').insert({
    school_id: session.school!.id,
    actor_id: session.userId,
    action: parsed.data.granted ? 'user.grant_permissions' : 'user.revoke_permissions',
    resource_type: 'profile',
    resource_id: profile.id,
    metadata: { permission_ids: parsed.data.permissionIds },
  });

  revalidatePath('/dashboard/staff/access');
  revalidatePath('/dashboard');
  return { ok: true };
}
