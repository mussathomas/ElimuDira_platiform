'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const studentSchema = z.object({
  admission_number: z.string().trim().min(1).max(40),
  first_name: z.string().trim().min(2).max(80),
  last_name: z.string().trim().min(2).max(80),
  sex: z.enum(['female', 'male', 'other']).optional().or(z.literal('')),
  date_of_birth: z.string().optional().or(z.literal('')),
  class_id: z.string().uuid().optional().or(z.literal('')),
  stream_id: z.string().uuid().optional().or(z.literal('')),
  guardian_name: z.string().trim().max(120).optional().or(z.literal('')),
  guardian_phone: z.string().trim().max(40).optional().or(z.literal('')),
  guardian_email: z.string().trim().email().optional().or(z.literal('')),
});

export async function createStudent(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('manage_students');
  const parsed = studentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the student details.' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('students').insert({
    school_id: session.school!.id,
    admission_number: parsed.data.admission_number,
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    sex: parsed.data.sex || null,
    date_of_birth: parsed.data.date_of_birth || null,
    class_id: parsed.data.class_id || null,
    stream_id: parsed.data.stream_id || null,
    guardian_name: parsed.data.guardian_name || null,
    guardian_phone: parsed.data.guardian_phone || null,
    guardian_email: parsed.data.guardian_email || null,
  }).select('id').single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'That admission number already exists.' };
    console.error('createStudent', error);
    return { ok: false, error: 'Unable to register the student.' };
  }

  await supabase.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'student.create', resource_type: 'student', resource_id: data.id });
  revalidatePath('/dashboard/students');
  revalidatePath('/dashboard/students/add');
  return { ok: true };
}

export async function updateStudent(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_student');
  const studentId = String(formData.get('student_id') ?? '');
  if (!z.string().uuid().safeParse(studentId).success) return { ok: false, error: 'Choose a valid student.' };
  const parsed = studentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the student details.' };

  const supabase = await createServerSupabaseClient();
  const { data: student } = await supabase.from('students').select('id').eq('id', studentId).eq('school_id', session.school!.id).maybeSingle();
  if (!student) return { ok: false, error: 'Student not found in this school.' };
  const { error } = await supabase.from('students').update({
    admission_number: parsed.data.admission_number,
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    sex: parsed.data.sex || null,
    date_of_birth: parsed.data.date_of_birth || null,
    class_id: parsed.data.class_id || null,
    stream_id: parsed.data.stream_id || null,
    guardian_name: parsed.data.guardian_name || null,
    guardian_phone: parsed.data.guardian_phone || null,
    guardian_email: parsed.data.guardian_email || null,
  }).eq('id', studentId).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: error.code === '23505' ? 'That admission number already exists.' : 'Unable to update the student.' };
  await supabase.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'student.update', resource_type: 'student', resource_id: studentId });
  revalidatePath('/dashboard/students');
  revalidatePath(`/dashboard/students/${studentId}/edit`);
  return { ok: true };
}

export async function deleteStudent(id: string): Promise<ActionResult> {
  const session = await requirePermission('delete_student');
  const supabase = await createServerSupabaseClient();
  const { data: student } = await supabase.from('students').select('id').eq('id', id).eq('school_id', session.school!.id).maybeSingle();
  if (!student) return { ok: false, error: 'Student not found in this school.' };
  const [{ count: marks }, { count: attendance }, { count: enrollments }, { count: transfers }] = await Promise.all([
    supabase.from('exam_marks').select('id', { count: 'exact', head: true }).eq('school_id', session.school!.id).eq('student_id', id),
    supabase.from('student_attendance').select('id', { count: 'exact', head: true }).eq('school_id', session.school!.id).eq('student_id', id),
    supabase.from('student_enrollments').select('id', { count: 'exact', head: true }).eq('school_id', session.school!.id).eq('student_id', id),
    supabase.from('student_transfer_requests').select('id', { count: 'exact', head: true }).or(`source_student_id.eq.${id},target_student_id.eq.${id}`),
  ]);
  if ((marks ?? 0) + (attendance ?? 0) + (enrollments ?? 0) + (transfers ?? 0) > 0) {
    return { ok: false, error: 'This student has academic or attendance history and cannot be deleted. Mark the student inactive instead.' };
  }
  const { error } = await supabase.from('students').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to delete the student.' };
  await supabase.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'student.delete', resource_type: 'student', resource_id: id });
  revalidatePath('/dashboard/students');
  return { ok: true };
}
