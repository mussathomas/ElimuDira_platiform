'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const assignmentSchema = z.object({
  profile_id: z.string().uuid(),
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
});

export async function assignTeacher(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('manage_teaching_assignments');
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a teacher, class, and subject.' };

  const supabase = await createServerSupabaseClient();
  const [{ data: staff }, { data: schoolClass }, { data: subject }] = await Promise.all([
    supabase.from('staff_members').select('profile_id').eq('school_id', session.school!.id).eq('profile_id', parsed.data.profile_id).maybeSingle(),
    supabase.from('classes').select('id').eq('school_id', session.school!.id).eq('id', parsed.data.class_id).maybeSingle(),
    supabase.from('subjects').select('id').eq('school_id', session.school!.id).eq('id', parsed.data.subject_id).maybeSingle(),
  ]);
  if (!staff || !schoolClass || !subject) return { ok: false, error: 'The selected teacher, class, or subject is not in this school.' };

  const { error } = await supabase.from('teacher_assignments').insert({ school_id: session.school!.id, ...parsed.data });
  if (error) return { ok: false, error: error.code === '23505' ? 'That teacher is already assigned to this class and subject.' : 'Unable to save the assignment.' };
  revalidatePath('/dashboard/staff/roles');
  revalidatePath('/dashboard/exams/marks');
  return { ok: true };
}

export async function removeTeacherAssignment(id: string): Promise<ActionResult> {
  const session = await requirePermission('manage_teaching_assignments');
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('teacher_assignments').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to remove the assignment.' };
  revalidatePath('/dashboard/staff/roles');
  revalidatePath('/dashboard/exams/marks');
  return { ok: true };
}
