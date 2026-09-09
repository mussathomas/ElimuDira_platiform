import Link from 'next/link';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle, Progress } from '@/components/ui/card';

export default async function SyllabusPage() {
  const session = await requirePermission('view_syllabus');
  const supabase = await createServerSupabaseClient();
  const [{ data: year }, { data: topics }, { data: subjects }, { data: classes }] = await Promise.all([
    supabase.from('academic_years').select('id, name').eq('school_id', session.school!.id).eq('is_current', true).maybeSingle(),
    supabase.from('syllabus_topics').select('id, subject_id, class_id, target_lessons, syllabus_progress(lessons_completed)').eq('school_id', session.school!.id),
    supabase.from('subjects').select('id, name').eq('school_id', session.school!.id).order('name'),
    supabase.from('classes').select('id, name').eq('school_id', session.school!.id).order('order_index'),
  ]);
  const rows = (topics ?? []).map((topic: any) => {
    const progress = Array.isArray(topic.syllabus_progress) ? topic.syllabus_progress[0] : topic.syllabus_progress;
    return { ...topic, lessons_completed: progress?.lessons_completed ?? 0 };
  });
  const totalTarget = rows.reduce((sum: number, topic: any) => sum + topic.target_lessons, 0);
  const totalCompleted = rows.reduce((sum: number, topic: any) => sum + Math.min(topic.lessons_completed, topic.target_lessons), 0);
  const average = totalTarget ? Math.round((totalCompleted / totalTarget) * 100) : 0;
  const subjectName = new Map((subjects ?? []).map((item: any) => [item.id, item.name]));
  const className = new Map((classes ?? []).map((item: any) => [item.id, item.name]));
  const groups = new Map<string, { name: string; target: number; completed: number }>();
  for (const topic of rows) {
    const key = `${topic.subject_id}:${topic.class_id}`;
    const group = groups.get(key) ?? { name: `${subjectName.get(topic.subject_id) ?? 'Subject'} - ${className.get(topic.class_id) ?? 'Class'}`, target: 0, completed: 0 };
    group.target += topic.target_lessons;
    group.completed += Math.min(topic.lessons_completed, topic.target_lessons);
    groups.set(key, group);
  }

  return <div className="space-y-6"><div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-semibold text-ink">Syllabus progress</h2><p className="help-text mt-1">Track covered lessons for {year?.name ?? 'the current academic year'}.</p></div>{session.permissions.has('edit_syllabus') && <Link href="/dashboard/syllabus/topics" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Manage topics</Link>}</div><div className="grid gap-3 sm:grid-cols-3"><Card className="p-4"><p className="help-text">Subjects</p><p className="mt-1 text-2xl font-semibold text-ink">{subjects?.length ?? 0}</p><p className="mt-1 text-xs text-muted">With syllabus topics</p></Card><Card className="p-4"><p className="help-text">Topics</p><p className="mt-1 text-2xl font-semibold text-ink">{rows.length}</p><p className="mt-1 text-xs text-muted">Across {classes?.length ?? 0} classes</p></Card><Card className="p-4"><p className="help-text">Overall progress</p><p className="mt-1 text-2xl font-semibold text-ink">{average}%</p><Progress value={average} className="mt-3" /></Card></div><Card><CardHeader><CardTitle>Progress by subject and class</CardTitle><div className="flex gap-3 text-sm"><Link href="/dashboard/syllabus/class" className="font-medium text-brand hover:underline">By class</Link><Link href="/dashboard/syllabus/subject" className="font-medium text-brand hover:underline">By subject</Link></div></CardHeader>{groups.size ? <div className="space-y-4">{Array.from(groups.values()).map((group) => { const value = group.target ? Math.round((group.completed / group.target) * 100) : 0; return <div key={group.name}><div className="mb-1 flex justify-between gap-4 text-sm"><span className="font-medium text-ink">{group.name}</span><span className="text-muted">{group.completed}/{group.target} lessons ({value}%)</span></div><Progress value={value} /></div>; })}</div> : <p className="help-text">No syllabus topics have been created yet. Open Topics to add the first one.</p>}</Card></div>;
}