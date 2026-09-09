import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function csv(value: unknown) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }

export async function GET(request: Request) {
  const session = await requirePermission('view_timetable');
  const timetableId = new URL(request.url).searchParams.get('timetable_id');
  const supabase = await createServerSupabaseClient();
  let query = supabase.from('timetable_entries').select('day_of_week, start_time, end_time, lesson_type, notes, classes(name), subjects(name), profiles(full_name), timetable_rooms(name), timetable_periods(name), timetables!inner(name, term, school_id)').eq('school_id', session.school!.id);
  if (timetableId) query = query.eq('timetable_id', timetableId);
  const { data, error } = await query.order('day_of_week').order('start_time');
  if (error) return new Response('Unable to export timetable.', { status: 500 });
  const lines = [['Timetable', 'Term', 'Day', 'Period', 'Start', 'End', 'Class', 'Subject', 'Teacher', 'Room', 'Lesson type', 'Notes'], ...(data ?? []).map((entry: any) => {
    const timetable = Array.isArray(entry.timetables) ? entry.timetables[0] : entry.timetables;
    const classItem = Array.isArray(entry.classes) ? entry.classes[0] : entry.classes;
    const subject = Array.isArray(entry.subjects) ? entry.subjects[0] : entry.subjects;
    const teacher = Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles;
    const room = Array.isArray(entry.timetable_rooms) ? entry.timetable_rooms[0] : entry.timetable_rooms;
    const period = Array.isArray(entry.timetable_periods) ? entry.timetable_periods[0] : entry.timetable_periods;
    return [timetable?.name, timetable?.term, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][entry.day_of_week - 1], period?.name, entry.start_time, entry.end_time, classItem?.name, subject?.name, teacher?.full_name, room?.name, entry.lesson_type, entry.notes].map(csv);
  })].map((row) => row.join(',')).join('\r\n');
  return new Response(lines, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="timetable.csv"', 'Cache-Control': 'private, no-store' } });
}
