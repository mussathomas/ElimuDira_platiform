import { requireSchoolSession } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/field';
import { MarksRoster } from '@/components/exams/marks-roster';
import { MarksClassSelect } from '@/components/exams/marks-class-select';
import { MAX_MARK_ENTRY_SCORE } from '@/lib/grading/engine';

type Params = { academic_year_id?: string; term?: string; examination_id?: string; education_level_id?: string; class_id?: string; stream_id?: string; subject_id?: string };

export default async function MarksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireSchoolSession();
  if (!session.isSuperAdmin && !session.permissions.has('enter_marks')) return <Card><h2 className="text-xl font-semibold text-ink">Marks entry</h2><p className="help-text mt-2">You do not have permission to enter marks. Ask a school administrator to grant the Enter Marks permission.</p></Card>;
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school.id;
  const [{ data: years }, { data: exams }, { data: levels }, { data: classes }, { data: streams }, { data: subjects }] = await Promise.all([
    supabase.from('academic_years').select('id,name,is_current').eq('school_id', schoolId).order('start_date', { ascending: false }),
    supabase.from('examinations').select('id,name,term,status,academic_year_id,examination_type_id,grading_configuration_version_id').eq('school_id', schoolId).neq('status', 'published').order('created_at', { ascending: false }),
    supabase.from('education_levels').select('id,name').eq('school_id', schoolId).order('order_index'),
    supabase.from('classes').select('id,name,education_level_id').eq('school_id', schoolId).order('order_index'),
    supabase.from('streams').select('id,name,class_id').eq('school_id', schoolId).order('name'),
    supabase.from('subjects').select('id,name,code').eq('school_id', schoolId).order('name'),
  ]);
  const teacherAssignments = session.roleIsSystem
    ? []
    : (await supabase.from('teacher_assignments').select('class_id,subject_id').eq('school_id', schoolId).eq('profile_id', session.userId)).data ?? [];
  const availableClasses = (classes ?? []).filter((schoolClass) =>
    session.roleIsSystem || teacherAssignments.some((assignment) => assignment.class_id === schoolClass.id)
  );
  const availableSubjects = (subjects ?? []).filter((subject) =>
    session.roleIsSystem || teacherAssignments.some((assignment) =>
      assignment.subject_id === subject.id && (!params.class_id || assignment.class_id === params.class_id)
    )
  );
  const selected = Boolean(params.academic_year_id && params.examination_id && params.education_level_id && params.class_id && params.subject_id);
  const exam = (exams ?? []).find((item) => item.id === params.examination_id);
  const schoolClass = (classes ?? []).find((item) => item.id === params.class_id);
  const subject = (subjects ?? []).find((item) => item.id === params.subject_id);
  const year = (years ?? []).find((item) => item.id === params.academic_year_id);
  const selectedPairAllowed = session.roleIsSystem || teacherAssignments.some((assignment) =>
    assignment.class_id === params.class_id && assignment.subject_id === params.subject_id
  );
  let roster: any[] = [];
  let marks: any[] = [];
  let maximumMark = 100;
  if (selected && exam && schoolClass && subject && selectedPairAllowed) {
    const [{ data: students }, { data: loadedMarks }] = await Promise.all([
      supabase.from('students').select('id,admission_number,first_name,last_name,sex,stream_id').eq('school_id', schoolId).eq('class_id', schoolClass.id).eq('status', 'active').order('last_name').order('first_name'),
      supabase.from('exam_marks').select('student_id,score').eq('school_id', schoolId).eq('examination_id', exam.id).eq('subject_id', subject.id),
    ]);
    roster = (students ?? []).filter((student) => !params.stream_id || student.stream_id === params.stream_id);
    marks = loadedMarks ?? [];
    const snapshot = exam.grading_configuration_version_id ? await supabase.from('grading_configuration_versions').select('snapshot').eq('id', exam.grading_configuration_version_id).eq('school_id', schoolId).maybeSingle() : { data: null };
    maximumMark = Math.min(Number((snapshot.data as any)?.snapshot?.scale?.max_mark ?? 0) || MAX_MARK_ENTRY_SCORE, MAX_MARK_ENTRY_SCORE);
    if (!maximumMark) {
      const { data: scales } = await supabase.from('grading_scales').select('education_level_id,academic_year_id,class_id,examination_type_id,max_mark').eq('school_id', schoolId).eq('status', 'active');
      const matchingScales = (scales ?? []).filter((scale: any) => (!scale.education_level_id || scale.education_level_id === params.education_level_id) && (!scale.academic_year_id || scale.academic_year_id === params.academic_year_id) && (!scale.class_id || scale.class_id === params.class_id) && (!scale.examination_type_id || scale.examination_type_id === exam.examination_type_id));
      const scale = matchingScales.sort((left: any, right: any) => { const specificity = (item: any) => Number(Boolean(item.education_level_id)) + Number(Boolean(item.academic_year_id)) + Number(Boolean(item.class_id)) + Number(Boolean(item.examination_type_id)); return specificity(right) - specificity(left); })[0];
      maximumMark = Math.min(Number(scale?.max_mark ?? 0) || MAX_MARK_ENTRY_SCORE, MAX_MARK_ENTRY_SCORE);
    }
  }
  const markByStudent = new Map(marks.map((mark) => [mark.student_id, mark.score]));
  const selectedStream = (streams ?? []).find((item) => item.id === params.stream_id);
  const hasExisting = roster.filter((student) => markByStudent.has(student.id)).length;
  const selectedYear = params.academic_year_id ?? (years ?? []).find((item) => item.is_current)?.id ?? '';

  return <div className="space-y-6">
    <div><p className="text-sm font-medium uppercase tracking-[0.16em] text-brand">Exams &amp; Reports / Marks</p><h2 className="mt-2 text-2xl font-semibold text-ink">Bulk examination mark entry</h2><p className="help-text mt-1">Load one class and subject, review the full mark sheet, then save all changes together.</p></div>
    <Card><form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div><Label htmlFor="academic_year_id">Academic Year</Label><Select id="academic_year_id" name="academic_year_id" defaultValue={selectedYear} required><option value="">Choose academic year</option>{(years ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
      <div><Label htmlFor="term">Term</Label><Select id="term" name="term" defaultValue={params.term ?? ''} required><option value="">Choose term</option>{[...new Set((exams ?? []).map((item) => item.term))].map((term) => <option key={term} value={term}>{term}</option>)}</Select></div>
      <div><Label htmlFor="examination_id">Examination</Label><Select id="examination_id" name="examination_id" defaultValue={params.examination_id ?? ''} required><option value="">Choose examination</option>{(exams ?? []).filter((item) => !params.academic_year_id || item.academic_year_id === params.academic_year_id).filter((item) => !params.term || item.term === params.term).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
      <div><Label htmlFor="education_level_id">Education Level</Label><Select id="education_level_id" name="education_level_id" defaultValue={params.education_level_id ?? ''} required><option value="">Choose level</option>{(levels ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
      <MarksClassSelect
        classes={availableClasses.filter((item) => !params.education_level_id || item.education_level_id === params.education_level_id)}
        defaultValue={params.class_id ?? ''}
        autoSubmit={!session.roleIsSystem}
      />
      <div><Label htmlFor="stream_id">Stream</Label><Select id="stream_id" name="stream_id" defaultValue={params.stream_id ?? ''}><option value="">All streams</option>{(streams ?? []).filter((item) => !params.class_id || item.class_id === params.class_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
      <div><Label htmlFor="subject_id">Subject</Label><Select id="subject_id" name="subject_id" defaultValue={params.subject_id ?? ''} required><option value="">Choose subject</option>{availableSubjects.map((item) => <option key={item.id} value={item.id}>{item.name}{item.code ? ` (${item.code})` : ''}</option>)}</Select></div>
      <div className="flex items-end"><button type="submit" className="h-10 w-full rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark">Load Roster</button></div>
    </form></Card>
    {!session.roleIsSystem && teacherAssignments.length === 0 && <Card><p className="help-text">No class and subject assignments are linked to your account. Ask an administrator to assign your teaching subjects.</p></Card>}
    {selected && exam && schoolClass && subject && selectedPairAllowed && <Card><div className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-lg font-semibold text-ink">{exam.name} mark sheet</h3><div className="mt-2 grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2"><span><strong className="text-ink">Examination:</strong> {exam.name}</span><span><strong className="text-ink">Academic Year:</strong> {year?.name ?? '—'}</span><span><strong className="text-ink">Term:</strong> {exam.term}</span><span><strong className="text-ink">Class:</strong> {schoolClass.name}{selectedStream ? ` · ${selectedStream.name}` : ''}</span><span><strong className="text-ink">Subject:</strong> {subject.name}</span><span><strong className="text-ink">Maximum Mark:</strong> {maximumMark}</span></div></div><div className="rounded-md bg-paper px-4 py-3 text-right"><p className="text-2xl font-semibold text-ink">{roster.length}</p><p className="text-xs uppercase tracking-wide text-muted">Students</p></div></div><MarksRoster rows={roster.map((student) => ({ ...student, score: markByStudent.get(student.id) ?? null }))} examinationId={exam.id} classId={schoolClass.id} subjectId={subject.id} streamId={params.stream_id} maximumMark={maximumMark} existingCount={hasExisting} /></Card>}
  </div>;
}
