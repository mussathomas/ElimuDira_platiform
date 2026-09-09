import { requireSchoolSession } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { ActionForm } from '@/components/ui/action-form';
import { saveMark } from '@/lib/actions/exams';

export default async function MarksPage({ searchParams }: { searchParams: Promise<{ class_id?: string; subject_id?: string; examination_id?: string }> }) {
  const session = await requireSchoolSession();
  if (!session.isSuperAdmin && !session.permissions.has('enter_marks')) {
    return <Card><h2 className="text-xl font-semibold text-ink">Marks entry</h2><p className="help-text mt-2">You do not have permission to enter marks. Ask a school administrator to grant the Enter Marks permission.</p></Card>;
  }
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const [{ data: exams }, { data: classes }, { data: subjects }] = await Promise.all([
    supabase.from('examinations').select('id,name,term,status').eq('school_id', session.school!.id).neq('status', 'published').order('created_at', { ascending: false }),
    supabase.from('classes').select('id,name').eq('school_id', session.school!.id).order('order_index'),
    supabase.from('subjects').select('id,name,code').eq('school_id', session.school!.id).order('name'),
  ]);
  const selected = Boolean(params.class_id && params.subject_id && params.examination_id);
  const [{ data: students }, { data: marks }] = selected ? await Promise.all([
    supabase.from('students').select('id,admission_number,first_name,last_name,streams(name)').eq('school_id', session.school!.id).eq('class_id', params.class_id!).eq('status', 'active').order('last_name'),
    supabase.from('exam_marks').select('student_id,score,grade,comment').eq('school_id', session.school!.id).eq('examination_id', params.examination_id!).eq('subject_id', params.subject_id!),
  ]) : [{ data: [] }, { data: [] }];
  const markByStudent = new Map((marks ?? []).map((mark) => [mark.student_id, mark]));

  return <div className="space-y-6"><Card><h2 className="text-xl font-semibold text-ink">Marks entry sheet</h2><p className="help-text mb-5 mt-1">Select a class, subject, and examination to load that class roster.</p><form className="grid grid-cols-3 gap-4"><div><Label htmlFor="class_id">Class</Label><Select id="class_id" name="class_id" defaultValue={params.class_id ?? ''} required><option value="" disabled>Choose a class</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><div><Label htmlFor="subject_id">Subject</Label><Select id="subject_id" name="subject_id" defaultValue={params.subject_id ?? ''} required><option value="" disabled>Choose a subject</option>{(subjects ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}{item.code ? ` (${item.code})` : ''}</option>)}</Select></div><div><Label htmlFor="examination_id">Examination</Label><Select id="examination_id" name="examination_id" defaultValue={params.examination_id ?? ''} required><option value="" disabled>Choose an examination</option>{(exams ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.term}</option>)}</Select></div><div className="col-span-3"><button type="submit" className="h-10 rounded-md bg-brand px-4 text-sm font-medium text-white">Load class sheet</button></div></form></Card>{selected && <Card><div className="mb-4 flex items-end justify-between"><div><h3 className="text-lg font-semibold text-ink">Class roster</h3><p className="help-text">Enter a score from 0 to 100 for each student.</p></div><span className="text-sm text-muted">{students?.length ?? 0} students</span></div><div className="space-y-2">{(students ?? []).map((student) => { const current = markByStudent.get(student.id); return <div key={student.id} className="grid grid-cols-[1fr_180px_110px] items-end gap-4 border-b border-line py-3"><div><p className="font-medium text-ink">{student.admission_number} · {student.first_name} {student.last_name}</p><p className="help-text">{(student.streams as { name?: string } | null)?.name ?? 'No stream'}</p></div><ActionForm action={saveMark} submitLabel={current ? 'Update mark' : 'Save mark'} className="contents"><input type="hidden" name="examination_id" value={params.examination_id} /><input type="hidden" name="student_id" value={student.id} /><input type="hidden" name="subject_id" value={params.subject_id} /><Input name="score" type="number" min="0" max="100" step="0.01" defaultValue={current?.score ?? ''} required /></ActionForm><span className="text-sm text-muted">{current?.grade ?? 'Not marked'}</span></div>; })}</div>{(students ?? []).length === 0 && <p className="help-text">No active students are assigned to this class.</p>}</Card>}</div>;
}
