import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function loadTimetableWorkspace(schoolId: string, timetableId: string) {
  const supabase = await createServerSupabaseClient();
  const [{ data: timetable }, { data: entries }, { data: classes }, { data: subjects }, { data: staff }, { data: rooms }, { data: periods }] = await Promise.all([
    supabase.from('timetables').select('id, school_id, academic_year_id, term, name, level, status, is_dirty, created_by, created_at, updated_at, published_at').eq('school_id', schoolId).eq('id', timetableId).maybeSingle(),
    supabase.from('timetable_entries').select('id, class_id, subject_id, teacher_id, room_id, period_id, day_of_week, start_time, end_time, lesson_type, notes').eq('school_id', schoolId).eq('timetable_id', timetableId).order('day_of_week').order('period_id'),
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('order_index').order('name'),
    supabase.from('subjects').select('id, name').eq('school_id', schoolId).order('name'),
    supabase.from('staff_members').select('profile_id, profiles(id, full_name)').eq('school_id', schoolId).order('employee_number'),
    supabase.from('timetable_rooms').select('id, name').eq('school_id', schoolId).order('name'),
    supabase.from('timetable_periods').select('id, name, starts_at, ends_at, is_break').eq('school_id', schoolId).order('order_index').order('starts_at'),
  ]);
  const teachers = (staff ?? []).map((member: any) => ({ id: member.profile_id, name: member.profiles?.full_name ?? 'Teacher' }));
  return { timetable, entries: entries ?? [], classes: classes ?? [], subjects: subjects ?? [], teachers, rooms: rooms ?? [], periods: periods ?? [] };
}

export async function loadTimetableIndex(schoolId: string, status?: string) {
  const supabase = await createServerSupabaseClient();
  const [{ data: timetables }, { data: years }, { data: periods }, { data: rooms }, { data: classes }, { data: subjects }, { data: staff }] = await Promise.all([
    (() => { let query = supabase.from('timetables').select('id, academic_year_id, term, name, level, status, is_dirty, created_by, updated_at').eq('school_id', schoolId).order('updated_at', { ascending: false }); if (status) query = query.eq('status', status); return query; })(),
    supabase.from('academic_years').select('id, name').eq('school_id', schoolId).order('start_date', { ascending: false }),
    supabase.from('timetable_periods').select('id, name, starts_at, ends_at, is_break').eq('school_id', schoolId).order('order_index').order('starts_at'),
    supabase.from('timetable_rooms').select('id, name, room_type, capacity').eq('school_id', schoolId).order('name'),
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('order_index').order('name'),
    supabase.from('subjects').select('id, name').eq('school_id', schoolId).order('name'),
    supabase.from('staff_members').select('profile_id, profiles(id, full_name)').eq('school_id', schoolId).order('employee_number'),
  ]);
  const teachers = (staff ?? []).map((member: any) => ({ id: member.profile_id, name: member.profiles?.full_name ?? 'Teacher' }));
  const timetableIds = (timetables ?? []).map((timetable) => timetable.id);
  const { data: entries } = timetableIds.length ? await supabase.from('timetable_entries').select('id, timetable_id, class_id, subject_id, teacher_id, room_id, period_id, day_of_week, timetable_periods(name, starts_at, ends_at), classes(name), subjects(name), profiles(full_name), timetable_rooms(name)').eq('school_id', schoolId).in('timetable_id', timetableIds).order('day_of_week').order('period_id') : { data: [] };
  return { timetables: timetables ?? [], years: years ?? [], periods: periods ?? [], rooms: rooms ?? [], classes: classes ?? [], subjects: subjects ?? [], teachers, entries: entries ?? [] };
}
