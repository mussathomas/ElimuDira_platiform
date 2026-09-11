'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const staffSchema = z.object({
  employee_number: z.string().trim().min(1).max(40),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  position: z.string().trim().max(80).optional().or(z.literal('')),
  role_id: z.string().uuid(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const staffUpdateSchema = staffSchema.omit({ password: true }).extend({
  staff_id: z.string().uuid(),
  password: z.string().min(8).optional().or(z.literal('')),
});

export async function createStaffAccount(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('manage_staff');
  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the staff details.' };

  const supabase = await createServerSupabaseClient();
  const { data: role } = await supabase.from('roles').select('id').eq('id', parsed.data.role_id).eq('school_id', session.school!.id).maybeSingle();
  if (!role) return { ok: false, error: 'Choose a role belonging to this school.' };

  const admin = createAdminSupabaseClient();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });
  if (authError || !authData.user) {
    if (authError?.message.toLowerCase().includes('already')) return { ok: false, error: 'An account with this email already exists.' };
    console.error('createStaffAccount auth', authError);
    return { ok: false, error: 'Unable to create the staff account.' };
  }

  const userId = authData.user.id;
  const { error: profileError } = await admin.from('profiles').insert({
    id: userId,
    school_id: session.school!.id,
    role_id: role.id,
    full_name: parsed.data.full_name,
    email: parsed.data.email,
    phone: parsed.data.phone || null,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    console.error('createStaffAccount profile', profileError);
    return { ok: false, error: 'Unable to create the staff profile.' };
  }

  const { data: staff, error: staffError } = await admin.from('staff_members').insert({
    school_id: session.school!.id,
    profile_id: userId,
    employee_number: parsed.data.employee_number,
    position: parsed.data.position || null,
  }).select('id').single();
  if (staffError) {
    await admin.from('profiles').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
    if (staffError.code === '23505') return { ok: false, error: 'That employee number already exists.' };
    console.error('createStaffAccount staff', staffError);
    return { ok: false, error: 'Unable to save the staff record.' };
  }

  await admin.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'staff.create', resource_type: 'staff_member', resource_id: staff.id });
  revalidatePath('/dashboard/staff');
  revalidatePath('/dashboard/staff/users');
  return { ok: true };
}

export async function updateStaffAccount(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_staff');
  const parsed = staffUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the staff details.' };
  const supabase = await createServerSupabaseClient();
  const { data: staff } = await supabase.from('staff_members').select('id, profile_id').eq('id', parsed.data.staff_id).eq('school_id', session.school!.id).maybeSingle();
  if (!staff) return { ok: false, error: 'Staff member not found in this school.' };
  const { data: role } = await supabase.from('roles').select('id').eq('id', parsed.data.role_id).eq('school_id', session.school!.id).maybeSingle();
  if (!role) return { ok: false, error: 'Choose a role belonging to this school.' };
  const admin = createAdminSupabaseClient();
  const { error: profileError } = await admin.from('profiles').update({ full_name: parsed.data.full_name, email: parsed.data.email, phone: parsed.data.phone || null, role_id: role.id }).eq('id', staff.profile_id).eq('school_id', session.school!.id);
  if (profileError) return { ok: false, error: 'Unable to update the staff profile.' };
  const { error: staffError } = await admin.from('staff_members').update({ employee_number: parsed.data.employee_number, position: parsed.data.position || null }).eq('id', staff.id).eq('school_id', session.school!.id);
  if (staffError) return { ok: false, error: staffError.code === '23505' ? 'That employee number already exists.' : 'Unable to update the staff record.' };
  if (parsed.data.password) await admin.auth.admin.updateUserById(staff.profile_id, { password: parsed.data.password });
  await admin.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'staff.update', resource_type: 'staff_member', resource_id: staff.id });
  revalidatePath('/dashboard/staff'); revalidatePath(`/dashboard/staff/${staff.id}/edit`);
  return { ok: true };
}

export async function deleteStaffAccount(staffId: string): Promise<ActionResult> {
  const session = await requirePermission('delete_staff');
  const supabase = await createServerSupabaseClient();
  const { data: staff } = await supabase.from('staff_members').select('id, profile_id').eq('id', staffId).eq('school_id', session.school!.id).maybeSingle();
  if (!staff) return { ok: false, error: 'Staff member not found in this school.' };
  if (staff.profile_id === session.userId) return { ok: false, error: 'You cannot delete your own staff account.' };
  const admin = createAdminSupabaseClient();
  await admin.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'staff.delete', resource_type: 'staff_member', resource_id: staff.id });
  const { error } = await admin.auth.admin.deleteUser(staff.profile_id);
  if (error) return { ok: false, error: 'Unable to delete the staff account.' };
  revalidatePath('/dashboard/staff');
  return { ok: true };
}
