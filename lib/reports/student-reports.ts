import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function loadStudentReports(schoolId: string, classId?: string, examinationId?: string) {
  const supabase = await createServerSupabaseClient();
  const [{ data: school }, { data: classes }, { data: examinations }] = await Promise.all([
    supabase.from('schools').select('name, address, region, district, phone, email, motto').eq('id', schoolId).maybeSingle(),
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('order_index').order('name'),
    supabase.from('examinations').select('id, name, term, status').eq('school_id', schoolId).order('created_at', { ascending: false }),
  ]);

  let studentsQuery = supabase
    .from('students')
    .select('id, admission_number, first_name, last_name, guardian_name, guardian_phone, class_id, classes(name)')
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .order('last_name');
  if (classId) studentsQuery = studentsQuery.eq('class_id', classId);
  const { data: students } = await studentsQuery;
  const normalizedStudents = (students ?? []).map((student: any) => ({
    ...student,
    classes: Array.isArray(student.classes) ? student.classes[0] ?? null : student.classes,
  }));
  const studentIds = normalizedStudents.map((student: any) => student.id);

  if (!studentIds.length) return { school, classes: classes ?? [], examinations: examinations ?? [], selectedClass: (classes ?? []).find((item: any) => item.id === classId) ?? null, students: [], marks: [], results: [] };

  const [{ data: marks }, { data: results }] = await Promise.all([
    (() => { let query = supabase.from('exam_marks').select('student_id, examination_id, score, grade, points, remark, passed, included_in_division, subjects(name), examinations(name, term, academic_year_id)').eq('school_id', schoolId).in('student_id', studentIds); if (examinationId) query = query.eq('examination_id', examinationId); return query; })(),
    // Existing installations may contain CALCULATED or legacy rows from before
    // result publication statuses were introduced. Raw marks without a result
    // row are still excluded because this query only reads result rows.
    (() => { let query = supabase.from('student_exam_results').select('student_id, examination_id, subject_count, pass_count, fail_count, aggregate, division, overall_remark, included_subject_ids, total_marks, average_mark, overall_status, position, status, examinations(name, term, academic_year_id)').eq('school_id', schoolId).in('student_id', studentIds); if (examinationId) query = query.eq('examination_id', examinationId); return query; })(),
  ]);

  const processedKeys = new Set((results ?? []).map((result: any) => `${result.student_id}:${result.examination_id}`));
  const incompleteResults = new Map<string, any>();
  for (const mark of marks ?? []) {
    const key = `${mark.student_id}:${mark.examination_id}`;
    if (processedKeys.has(key)) continue;
    const current = incompleteResults.get(key) ?? {
      student_id: mark.student_id,
      examination_id: mark.examination_id,
      subject_count: 0,
      pass_count: 0,
      fail_count: 0,
      aggregate: null,
      division: null,
      overall_remark: 'Incomplete: awaiting processing or additional marks.',
      total_marks: 0,
      average_mark: null,
      overall_status: 'Incomplete',
      position: null,
      status: 'DRAFT',
      examinations: mark.examinations,
    };
    current.subject_count += 1;
    current.total_marks += Number(mark.score ?? 0);
    if (mark.passed === true) current.pass_count += 1;
    if (mark.passed === false) current.fail_count += 1;
    current.average_mark = current.subject_count ? current.total_marks / current.subject_count : null;
    incompleteResults.set(key, current);
  }
  const allResults = [...(results ?? []), ...incompleteResults.values()];
  return { school, classes: classes ?? [], examinations: examinations ?? [], selectedClass: (classes ?? []).find((item: any) => item.id === classId) ?? null, students: normalizedStudents, marks: marks ?? [], results: allResults };
}
