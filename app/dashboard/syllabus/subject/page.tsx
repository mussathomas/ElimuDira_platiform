import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle, Progress } from '@/components/ui/card';

export default async function SyllabusSubjectPage() {
  const session = await requirePermission('view_syllabus');
  const supabase = await createServerSupabaseClient();
  const [{ data: subjects }, { data: topics }] = await Promise.all([
    supabase.from('subjects').select('id, name').eq('school_id', session.school!.id).order('name'),
    supabase.from('syllabus_topics').select('subject_id, target_lessons, syllabus_progress(lessons_completed)').eq('school_id', session.school!.id),
  ]);
  const totals = new Map<string, { target: number; completed: number; topics: number }>();
  for (const topic of topics ?? []) { const progress = Array.isArray((topic as any).syllabus_progress) ? (topic as any).syllabus_progress[0] : (topic as any).syllabus_progress; const total = totals.get(topic.subject_id) ?? { target: 0, completed: 0, topics: 0 }; total.target += topic.target_lessons; total.completed += Math.min(progress?.lessons_completed ?? 0, topic.target_lessons); total.topics += 1; totals.set(topic.subject_id, total); }
  return <div className="space-y-6"><div><h2 className="text-2xl font-semibold text-ink">Progress by subject</h2><p className="help-text mt-1">See how far each subject has been taught.</p></div><div className="grid gap-4 md:grid-cols-2">{(subjects ?? []).map((item: any) => { const total = totals.get(item.id) ?? { target: 0, completed: 0, topics: 0 }; const value = total.target ? Math.round((total.completed / total.target) * 100) : 0; return <Card key={item.id}><CardHeader><CardTitle>{item.name}</CardTitle><span className="text-sm text-muted">{total.topics} topics</span></CardHeader><div className="mb-2 flex justify-between text-sm"><span>{total.completed} of {total.target} lessons</span><span className="font-semibold text-brand-dark">{value}%</span></div><Progress value={value} /></Card>; })}</div>{!subjects?.length && <Card><p className="help-text">Create subjects in Academic Settings before adding syllabus topics.</p></Card>}</div>;
}