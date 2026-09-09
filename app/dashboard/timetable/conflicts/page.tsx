import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default async function TimetableConflictsPage() {
  const session = await requirePermission('view_timetable');
  const supabase = await createServerSupabaseClient();
  const { data: entries } = await supabase.from('timetable_entries').select('id, timetable_id, class_id, teacher_id, room_id, period_id, day_of_week, classes(name), profiles(full_name), timetable_rooms(name), timetable_periods(name)').eq('school_id', session.school!.id);
  const groups = new Map<string, any[]>();
  for (const entry of entries ?? []) for (const key of [`class:${entry.class_id}`, ...(entry.teacher_id ? [`teacher:${entry.teacher_id}`] : []), ...(entry.room_id ? [`room:${entry.room_id}`] : [])]) { const groupKey = `${key}:${entry.day_of_week}:${entry.period_id}`; groups.set(groupKey, [...(groups.get(groupKey) ?? []), entry]); }
  const conflicts = [...groups.entries()].filter(([, values]) => values.length > 1);
  return <div className="space-y-6"><div><h2 className="text-2xl font-semibold text-ink">Timetable conflicts</h2><p className="help-text mt-1">Saved class, teacher, and room collisions across your school timetables.</p></div><Card><CardHeader><CardTitle>{conflicts.length ? `${conflicts.length} conflicts found` : 'No conflicts found'}</CardTitle></CardHeader>{conflicts.length ? <div className="divide-y divide-line">{conflicts.map(([key, values]) => <div key={key} className="py-3 text-sm"><p className="font-medium text-danger">{key.split(':')[0]} conflict</p><p className="help-text">{values.map((entry: any) => `${entry.classes?.name ?? 'Class'} · ${entry.timetable_periods?.name ?? 'Period'}`).join(' and ')}</p></div>)}</div> : <p className="help-text">All saved timetable entries have unique class, teacher, and room slots.</p>}</Card></div>;
}
