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
