'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission, requireSchoolSession } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.');
const statusSchema = z.enum(['present', 'absent', 'late', 'excused']);
const rosterSchema = z.object({
  date: dateSchema,
  class_id: z.string().uuid(),
  stream_id: z.string().uuid().optional().or(z.literal('')),
});

function validDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

async function audit(schoolId: string, actorId: string, action: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  const supabase = await createServerSupabaseClient();
  await supabase.from('audit_logs').insert({
    school_id: schoolId,
    actor_id: actorId,
    action,
    resource_type: 'attendance',
    resource_id: resourceId,
    metadata,
  });
}

async function getOrCreateDay(schoolId: string, date: string) {
  const supabase = await createServerSupabaseClient();
  const { data: existing, error: lookupError } = await supabase
    .from('attendance_days')
    .select('id, approved')
    .eq('school_id', schoolId)
    .eq('attendance_date', date)
    .maybeSingle();
  if (lookupError) return { day: null, error: lookupError };
  if (existing) return { day: existing, error: null };

  const { data, error } = await supabase
    .from('attendance_days')
    .insert({ school_id: schoolId, attendance_date: date })
    .select('id, approved')
    .single();
  return { day: data, error };
}

export async function markClassAttendance(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('mark_attendance');
  const parsed = rosterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !validDate(parsed.data.date)) return { ok: false, error: 'Provide a valid class, date, and roster.' };
  const records = [...formData.entries()]
    .filter(([key]) => key.startsWith('status_'))
    .map(([key, value]) => ({ student_id: key.slice('status_'.length), status: value }))
    .filter((record): record is { student_id: string; status: z.infer<typeof statusSchema> } =>
      typeof record.status === 'string' && statusSchema.safeParse(record.status).success
    );
  if (!records.length || records.some((record) => !z.string().uuid().safeParse(record.student_id).success)) {
    return { ok: false, error: 'Provide a valid class roster.' };
  }

  const supabase = await createServerSupabaseClient();
  const { data: classRow } = await supabase.from('classes').select('id').eq('id', parsed.data.class_id).eq('school_id', session.school!.id).maybeSingle();
  if (!classRow) return { ok: false, error: 'That class is not available.' };
  if (parsed.data.stream_id) {
    const { data: stream } = await supabase.from('streams').select('id').eq('id', parsed.data.stream_id).eq('class_id', parsed.data.class_id).eq('school_id', session.school!.id).maybeSingle();
    if (!stream) return { ok: false, error: 'That stream does not belong to the selected class.' };
  }
  let studentsQuery = supabase.from('students').select('id').eq('school_id', session.school!.id).eq('class_id', parsed.data.class_id).in('id', records.map((record) => record.student_id));
  if (parsed.data.stream_id) studentsQuery = studentsQuery.eq('stream_id', parsed.data.stream_id);
  const { data: students } = await studentsQuery;
  if ((students?.length ?? 0) !== records.length) return { ok: false, error: 'The roster contains an invalid student.' };

  const { day, error: dayError } = await getOrCreateDay(session.school!.id, parsed.data.date);
  if (dayError || !day) return { ok: false, error: 'Unable to open that attendance date.' };
  if (day.approved) return { ok: false, error: 'Attendance for this date is already approved.' };

  const rows = records.map((record) => ({
    school_id: session.school!.id,
    attendance_day_id: day.id,
    student_id: record.student_id,
    class_id: parsed.data.class_id,
    stream_id: parsed.data.stream_id || null,
    status: record.status,
    marked_by: session.userId,
  }));
  const { error } = await supabase.from('student_attendance').upsert(rows, { onConflict: 'attendance_day_id,student_id' });
  if (error) return { ok: false, error: 'Unable to save the class register.' };

  await audit(session.school!.id, session.userId, 'attendance.class_marked', day.id, { date: parsed.data.date, class_id: parsed.data.class_id, count: rows.length });
  revalidatePath('/dashboard/attendance/class');
  revalidatePath('/dashboard/attendance/history');
  return { ok: true };
}

export async function signIn(): Promise<ActionResult> {
  const session = await requireSchoolSession();
  const date = new Date().toISOString().slice(0, 10);
  const { day, error: dayError } = await getOrCreateDay(session.school.id, date);
  if (dayError || !day) return { ok: false, error: 'Unable to open today\'s attendance.' };
  if (day.approved) return { ok: false, error: 'Today\'s attendance has already been approved; sign-in is locked.' };

  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase.from('staff_attendance').select('id, signed_in_at').eq('attendance_day_id', day.id).eq('profile_id', session.userId).maybeSingle();
  if (existing?.signed_in_at) return { ok: false, error: 'You are already signed in today.' };
  const { error } = await supabase.from('staff_attendance').upsert({ school_id: session.school.id, attendance_day_id: day.id, profile_id: session.userId, signed_in_at: new Date().toISOString(), signed_out_at: null }, { onConflict: 'attendance_day_id,profile_id' });
  if (error) return { ok: false, error: 'Unable to sign you in.' };

  await audit(session.school.id, session.userId, 'attendance.staff_signed_in', day.id, { date });
  revalidatePath('/dashboard/attendance/personal');
  revalidatePath('/dashboard/attendance/approval');
  return { ok: true };
}

export async function signOut(): Promise<ActionResult> {
  const session = await requireSchoolSession();
  const date = new Date().toISOString().slice(0, 10);
  const supabase = await createServerSupabaseClient();
  const { data: day } = await supabase.from('attendance_days').select('id, approved').eq('school_id', session.school.id).eq('attendance_date', date).maybeSingle();
  if (!day) return { ok: false, error: 'You have not signed in today.' };
  if (day.approved) return { ok: false, error: 'Today\'s attendance has already been approved.' };
  const { error } = await supabase.from('staff_attendance').update({ signed_out_at: new Date().toISOString() }).eq('attendance_day_id', day.id).eq('profile_id', session.userId).is('signed_out_at', null);
  if (error) return { ok: false, error: 'Unable to sign you out.' };

  await audit(session.school.id, session.userId, 'attendance.staff_signed_out', day.id, { date });
  revalidatePath('/dashboard/attendance/personal');
  revalidatePath('/dashboard/attendance/approval');
  return { ok: true };
}

export async function approveAttendance(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('approve_attendance');
  const parsed = z.object({ date: dateSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || !validDate(parsed.data.date)) return { ok: false, error: 'Provide a valid date.' };

  const supabase = await createServerSupabaseClient();
  const { data: day, error: lookupError } = await supabase.from('attendance_days').select('id, approved').eq('school_id', session.school!.id).eq('attendance_date', parsed.data.date).maybeSingle();
  if (lookupError) return { ok: false, error: 'Unable to load that attendance date.' };
  if (!day) return { ok: false, error: 'There are no attendance records for that date.' };
  if (day.approved) return { ok: false, error: 'That date is already approved.' };
  const { error } = await supabase.from('attendance_days').update({ approved: true, approved_by: session.userId, approved_at: new Date().toISOString() }).eq('id', day.id).eq('school_id', session.school!.id).eq('approved', false);
  if (error) return { ok: false, error: 'Unable to approve attendance.' };

  await audit(session.school!.id, session.userId, 'attendance.approved', day.id, { date: parsed.data.date });
  revalidatePath('/dashboard/attendance/approval');
  revalidatePath('/dashboard/attendance/history');
  return { ok: true };
}
