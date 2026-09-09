'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission, requireSchoolSession } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

export type TimetableResult = ActionResult & { id?: string; conflict?: string };

const uuid = z.string().uuid();
const entrySchema = z.object({
  id: uuid.optional(),
  class_id: uuid,
  subject_id: uuid,
  teacher_id: uuid.nullable().optional(),
  room_id: uuid.nullable().optional(),
  period_id: uuid,
  day_of_week: z.number().int().min(1).max(7),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  lesson_type: z.string().trim().min(1).max(40),
  notes: z.string().trim().max(500).nullable().optional(),
});
const entriesSchema = z.array(entrySchema).max(1000);

async function audit(schoolId: string, actorId: string, action: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  const supabase = await createServerSupabaseClient();
  await supabase.from('audit_logs').insert({ school_id: schoolId, actor_id: actorId, action, resource_type: 'timetable', resource_id: resourceId, metadata });
}

async function canEdit(timetableId: string, userId: string, schoolId: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from('timetables').select('id, created_by, status, is_dirty').eq('id', timetableId).eq('school_id', schoolId).maybeSingle();
  if (!data) return { timetable: null, allowed: false };
  const session = await requireSchoolSession();
  return { timetable: data, allowed: data.created_by === userId || session.permissions.has('manage_timetable') };
}

async function validateEntries(schoolId: string, timetableId: string, entries: z.infer<typeof entriesSchema>) {
  const supabase = await createServerSupabaseClient();
  const ids = {
    classes: [...new Set(entries.map((entry) => entry.class_id))],
    subjects: [...new Set(entries.map((entry) => entry.subject_id))],
    teachers: [...new Set(entries.flatMap((entry) => entry.teacher_id ? [entry.teacher_id] : []))],
    rooms: [...new Set(entries.flatMap((entry) => entry.room_id ? [entry.room_id] : []))],
    periods: [...new Set(entries.map((entry) => entry.period_id))],
  };
  const [{ data: classes }, { data: subjects }, { data: teachers }, { data: rooms }, { data: periods }, { data: assignments }] = await Promise.all([
    supabase.from('classes').select('id').eq('school_id', schoolId).in('id', ids.classes),
    supabase.from('subjects').select('id').eq('school_id', schoolId).in('id', ids.subjects),
    supabase.from('profiles').select('id').eq('school_id', schoolId).in('id', ids.teachers),
    supabase.from('timetable_rooms').select('id, available_days, available_period_ids').eq('school_id', schoolId).in('id', ids.rooms),
    supabase.from('timetable_periods').select('id, starts_at, ends_at, is_break').eq('school_id', schoolId).in('id', ids.periods),
    supabase.from('teacher_assignments').select('profile_id, class_id, subject_id').eq('school_id', schoolId),
  ]);
  if ((classes?.length ?? 0) !== ids.classes.length) return 'One or more classes do not belong to this school.';
  if ((subjects?.length ?? 0) !== ids.subjects.length) return 'One or more subjects do not belong to this school.';
  if ((teachers?.length ?? 0) !== ids.teachers.length) return 'One or more teachers do not belong to this school.';
  if ((rooms?.length ?? 0) !== ids.rooms.length) return 'One or more rooms do not belong to this school.';
  if ((periods?.length ?? 0) !== ids.periods.length) return 'One or more periods do not belong to this school.';
  const periodMap = new Map((periods ?? []).map((period) => [period.id, period]));
  const assignmentSet = new Set((assignments ?? []).map((assignment) => `${assignment.profile_id}:${assignment.class_id}:${assignment.subject_id}`));
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const period = periodMap.get(entry.period_id);
    if (period?.is_break) return 'Lessons cannot be scheduled during a break period.';
    if (entry.teacher_id && !assignmentSet.has(`${entry.teacher_id}:${entry.class_id}:${entry.subject_id}`)) return 'The selected teacher is not assigned to this class and subject.';
    const room = (rooms ?? []).find((item) => item.id === entry.room_id);
    if (room && (!room.available_days.includes(entry.day_of_week) || (room.available_period_ids.length > 0 && !room.available_period_ids.includes(entry.period_id)))) return 'The selected room is unavailable at this day or period.';
    const resources = [`class:${entry.class_id}`, ...(entry.teacher_id ? [`teacher:${entry.teacher_id}`] : []), ...(entry.room_id ? [`room:${entry.room_id}`] : [])];
    for (const resource of resources) {
      const key = `${resource}:${entry.day_of_week}:${entry.period_id}`;
      const previous = seen.get(key);
      if (previous && previous !== entry.id) return `${resource.split(':')[0]} conflict: another lesson already occupies this day and period.`;
      seen.set(key, entry.id ?? `new:${seen.size}`);
    }
  }
  return null;
}

export async function createTimetable(formData: FormData): Promise<TimetableResult> {
  const session = await requirePermission('create_timetable');
  const name = String(formData.get('name') ?? '').trim();
  const term = String(formData.get('term') ?? '').trim();
  const academicYearId = String(formData.get('academic_year_id') ?? '');
  const level = String(formData.get('level') ?? '').trim() || null;
  if (!name || name.length > 120 || !term || term.length > 40 || !uuid.safeParse(academicYearId).success) return { ok: false, error: 'Enter a timetable name, term, and academic year.' };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('timetables').insert({ school_id: session.school!.id, academic_year_id: academicYearId, term, name, level, created_by: session.userId }).select('id').single();
  if (error || !data) return { ok: false, error: error?.code === '23505' ? 'A timetable with that name already exists for this year and term.' : 'Unable to create the timetable.' };
  await audit(session.school!.id, session.userId, 'timetable.create', data.id, { name, term });
  revalidatePath('/dashboard/timetable');
  return { ok: true, id: data.id };
}

export async function saveTimetableEntries(formData: FormData): Promise<TimetableResult> {
  const session = await requireSchoolSession();
  const timetableId = String(formData.get('timetable_id') ?? '');
  if (!uuid.safeParse(timetableId).success) return { ok: false, error: 'Choose a valid timetable.' };
  const edit = await canEdit(timetableId, session.userId, session.school!.id);
  if (!edit.allowed || !edit.timetable) return { ok: false, error: 'You are not allowed to edit this timetable.' };
  let rawEntries: unknown;
  try { rawEntries = JSON.parse(String(formData.get('entries') ?? '[]')); } catch { return { ok: false, error: 'The lesson changes were not valid. Please try again.' }; }
  const parsed = entriesSchema.safeParse(rawEntries);
  if (!parsed.success) return { ok: false, error: 'Review the lesson details and try again.' };
  const conflict = await validateEntries(session.school!.id, timetableId, parsed.data);
  if (conflict) return { ok: false, error: `Unable to save timetable: ${conflict}`, conflict };
  const supabase = await createServerSupabaseClient();
  const incomingIds = parsed.data.flatMap((entry) => entry.id ? [entry.id] : []);
  const { data: current } = await supabase.from('timetable_entries').select('id').eq('timetable_id', timetableId).eq('school_id', session.school!.id);
  const deletedIds = (current ?? []).map((entry) => entry.id).filter((id) => !incomingIds.includes(id));
  if (deletedIds.length) { const { error } = await supabase.from('timetable_entries').delete().eq('timetable_id', timetableId).in('id', deletedIds); if (error) return { ok: false, error: 'Unable to remove deleted lessons.' }; }
  if (parsed.data.length) {
    const knownIds = new Set((current ?? []).map((entry) => entry.id));
    const { error } = await supabase.from('timetable_entries').upsert(parsed.data.map((entry) => ({ ...entry, id: entry.id ?? undefined, timetable_id: timetableId, school_id: session.school!.id, created_by: entry.id && knownIds.has(entry.id) ? undefined : session.userId, updated_by: session.userId })), { onConflict: 'id' });
    if (error) return { ok: false, error: 'Unable to save timetable lessons.' };
  }
  const wasPublished = edit.timetable.status === 'PUBLISHED';
  await supabase.from('timetables').update({ is_dirty: wasPublished, updated_by: session.userId }).eq('id', timetableId).eq('school_id', session.school!.id);
  await audit(session.school!.id, session.userId, 'timetable.save', timetableId, { deleted_count: deletedIds.length, lesson_count: parsed.data.length, pending_republish: wasPublished });
  revalidatePath(`/dashboard/timetable/${timetableId}`);
  revalidatePath('/dashboard/timetable');
  return { ok: true, id: timetableId };
}

export async function publishTimetable(formData: FormData): Promise<TimetableResult> {
  const session = await requirePermission('publish_timetable');
  const timetableId = String(formData.get('timetable_id') ?? '');
  const edit = await canEdit(timetableId, session.userId, session.school!.id);
  if (!edit.timetable) return { ok: false, error: 'Timetable not found.' };
  if (!['APPROVED', 'PUBLISHED'].includes(edit.timetable.status)) return { ok: false, error: 'Only an approved timetable can be published.' };
  const { data: entries } = await (await createServerSupabaseClient()).from('timetable_entries').select('id, class_id, subject_id, teacher_id, room_id, period_id, day_of_week, start_time, end_time, lesson_type, notes').eq('timetable_id', timetableId).eq('school_id', session.school!.id);
  const conflict = await validateEntries(session.school!.id, timetableId, (entries ?? []) as z.infer<typeof entriesSchema>);
  if (conflict) return { ok: false, error: `Cannot publish timetable: ${conflict}`, conflict };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('timetables').update({ status: 'PUBLISHED', is_dirty: false, published_at: new Date().toISOString(), published_by: session.userId, updated_by: session.userId }).eq('id', timetableId).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to publish timetable.' };
  await audit(session.school!.id, session.userId, 'timetable.publish', timetableId);
  revalidatePath(`/dashboard/timetable/${timetableId}`); revalidatePath('/dashboard/timetable');
  return { ok: true, id: timetableId };
}

async function changeTimetableStatus(formData: FormData, status: 'REVIEW' | 'APPROVED'): Promise<TimetableResult> {
  const session = await requirePermission('manage_timetable');
  const timetableId = String(formData.get('timetable_id') ?? '');
  const supabase = await createServerSupabaseClient();
  const { data: timetable } = await supabase.from('timetables').select('id, status').eq('id', timetableId).eq('school_id', session.school!.id).maybeSingle();
  if (!timetable) return { ok: false, error: 'Timetable not found.' };
  const allowed = status === 'REVIEW' ? ['DRAFT', 'PUBLISHED'] : ['REVIEW'];
  if (!allowed.includes(timetable.status)) return { ok: false, error: `A ${timetable.status.toLowerCase()} timetable cannot move to ${status.toLowerCase()}.` };
  const { error } = await supabase.from('timetables').update({ status, updated_by: session.userId }).eq('id', timetableId).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: `Unable to move timetable to ${status.toLowerCase()}.` };
  await audit(session.school!.id, session.userId, `timetable.${status.toLowerCase()}`, timetableId);
  revalidatePath(`/dashboard/timetable/${timetableId}`); revalidatePath('/dashboard/timetable');
  return { ok: true, id: timetableId };
}

export async function submitTimetableForReview(formData: FormData): Promise<TimetableResult> { return changeTimetableStatus(formData, 'REVIEW'); }
export async function approveTimetable(formData: FormData): Promise<TimetableResult> { return changeTimetableStatus(formData, 'APPROVED'); }

export async function generateTimetable(formData: FormData): Promise<TimetableResult> {
  const session = await requireSchoolSession();
  if (!session.permissions.has('create_timetable') && !session.permissions.has('manage_timetable')) return { ok: false, error: 'You are not allowed to generate timetable drafts.' };
  const timetableId = String(formData.get('timetable_id') ?? '');
  const edit = await canEdit(timetableId, session.userId, session.school!.id);
  if (!edit.allowed || !edit.timetable) return { ok: false, error: 'You are not allowed to generate this timetable.' };
  const supabase = await createServerSupabaseClient();
  const [{ data: assignments }, { data: periods }, { data: current }] = await Promise.all([
    supabase.from('teacher_assignments').select('profile_id, class_id, subject_id').eq('school_id', session.school!.id),
    supabase.from('timetable_periods').select('id, starts_at, ends_at, is_break').eq('school_id', session.school!.id).eq('is_break', false).order('order_index'),
    supabase.from('timetable_entries').select('class_id, teacher_id, room_id, period_id, day_of_week').eq('school_id', session.school!.id).eq('timetable_id', timetableId),
  ]);
  if (!assignments?.length || !periods?.length) return { ok: false, error: 'Add teacher assignments and periods before generating a timetable.' };
  const used = new Set((current ?? []).flatMap((entry) => [`class:${entry.class_id}:${entry.day_of_week}:${entry.period_id}`, `teacher:${entry.teacher_id}:${entry.day_of_week}:${entry.period_id}`]));
  const generated: any[] = [];
  for (const assignment of assignments) {
    let placed = false;
    for (let day = 1; day <= 5 && !placed; day += 1) for (const period of periods) {
      const classKey = `class:${assignment.class_id}:${day}:${period.id}`;
      const teacherKey = `teacher:${assignment.profile_id}:${day}:${period.id}`;
      if (used.has(classKey) || used.has(teacherKey)) continue;
      used.add(classKey); used.add(teacherKey);
      generated.push({ timetable_id: timetableId, school_id: session.school!.id, class_id: assignment.class_id, subject_id: assignment.subject_id, teacher_id: assignment.profile_id, period_id: period.id, day_of_week: day, start_time: period.starts_at, end_time: period.ends_at, lesson_type: 'lesson', created_by: session.userId, updated_by: session.userId });
      placed = true;
    }
  }
  if (!generated.length) return { ok: false, error: 'No conflict-free slots were available for the assignments.' };
  const { error } = await supabase.from('timetable_entries').insert(generated);
  if (error) return { ok: false, error: 'Unable to generate timetable lessons.' };
  await supabase.from('timetables').update({ updated_by: session.userId }).eq('id', timetableId).eq('school_id', session.school!.id);
  await audit(session.school!.id, session.userId, 'timetable.generate', timetableId, { generated_count: generated.length });
  revalidatePath(`/dashboard/timetable/${timetableId}`); return { ok: true, id: timetableId };
}

export async function archiveTimetable(formData: FormData): Promise<TimetableResult> {
  const session = await requirePermission('archive_timetable');
  const timetableId = String(formData.get('timetable_id') ?? '');
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('timetables').update({ status: 'ARCHIVED', updated_by: session.userId }).eq('id', timetableId).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to archive timetable.' };
  await audit(session.school!.id, session.userId, 'timetable.archive', timetableId);
  revalidatePath('/dashboard/timetable'); revalidatePath(`/dashboard/timetable/${timetableId}`);
  return { ok: true, id: timetableId };
}

export async function createTimetableRoom(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_timetable_settings');
  const name = String(formData.get('name') ?? '').trim();
  const roomType = String(formData.get('room_type') ?? 'classroom').trim();
  if (!name || name.length > 100) return { ok: false, error: 'Enter a room name.' };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('timetable_rooms').insert({ school_id: session.school!.id, name, room_type: roomType, capacity: Number(formData.get('capacity')) || null, created_by: session.userId });
  if (error) return { ok: false, error: error.code === '23505' ? 'That room already exists.' : 'Unable to create room.' };
  revalidatePath('/dashboard/timetable/rooms'); revalidatePath('/dashboard/timetable'); return { ok: true };
}

export async function createTimetablePeriod(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_timetable_settings');
  const name = String(formData.get('name') ?? '').trim();
  const startsAt = String(formData.get('starts_at') ?? '');
  const endsAt = String(formData.get('ends_at') ?? '');
  if (!name || !/^\d{2}:\d{2}$/.test(startsAt) || !/^\d{2}:\d{2}$/.test(endsAt) || endsAt <= startsAt) return { ok: false, error: 'Enter a period name and valid start/end times.' };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('timetable_periods').insert({ school_id: session.school!.id, name, starts_at: startsAt, ends_at: endsAt, order_index: Number(formData.get('order_index')) || 0, is_break: formData.get('is_break') === 'on', created_by: session.userId });
  if (error) return { ok: false, error: error.code === '23505' ? 'That period already exists.' : 'Unable to create period.' };
  revalidatePath('/dashboard/timetable/periods'); revalidatePath('/dashboard/timetable'); return { ok: true };
}

export async function deleteTimetableRoom(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_timetable_settings');
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('timetable_rooms').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to remove this room. It may still be used by a timetable.' };
  revalidatePath('/dashboard/timetable/rooms'); return { ok: true };
}

export async function deleteTimetablePeriod(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_timetable_settings');
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('timetable_periods').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to remove this period. It may still be used by a timetable.' };
  revalidatePath('/dashboard/timetable/periods'); return { ok: true };
}

export async function createTimetableRule(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_timetable_settings');
  const name = String(formData.get('name') ?? '').trim();
  const maxLessons = Number(formData.get('max_lessons_per_teacher') ?? 0);
  if (!name || name.length > 120 || !Number.isInteger(maxLessons) || maxLessons < 0 || maxLessons > 20) return { ok: false, error: 'Enter a rule name and a valid teacher lesson limit.' };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('timetable_rules').insert({ school_id: session.school!.id, name, rules: { max_lessons_per_teacher: maxLessons }, created_by: session.userId });
  if (error) return { ok: false, error: error.code === '23505' ? 'That scheduling rule already exists.' : 'Unable to create scheduling rule.' };
  revalidatePath('/dashboard/timetable/rules'); return { ok: true };
}
