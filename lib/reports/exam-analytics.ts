/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export type ResultFilters = {
  academicYearId?: string;
  term?: string;
  examinationId?: string;
  classId?: string;
};

type AnyRow = Record<string, any>;

const relation = (value: any) => Array.isArray(value) ? value[0] ?? null : value;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percentage = (part: number, whole: number) => whole ? Math.round((part / whole) * 1000) / 10 : 0;

export async function loadExamAnalytics(schoolId: string, filters: ResultFilters) {
  const supabase = await createServerSupabaseClient();
  const [
    { data: allExaminations, error: examinationsError },
    { data: academicYears, error: yearsError },
    { data: classes, error: classesError },
    { data: gradeBands, error: gradesError },
    { data: divisionRules, error: divisionRulesError },
  ] = await Promise.all([
    supabase.from('examinations').select('id, name, term, academic_year_id').eq('school_id', schoolId).order('created_at', { ascending: false }),
    supabase.from('academic_years').select('id, name, is_current').eq('school_id', schoolId).order('is_current', { ascending: false }).order('start_date', { ascending: false }),
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('order_index').order('name'),
    supabase.from('grade_bands').select('grade_name, min_score, max_score, points, grading_scales!inner(school_id)').eq('grading_scales.school_id', schoolId).order('order_index'),
    supabase.from('division_rules').select('division_bands(division_name, min_points, max_points, order_index)').eq('school_id', schoolId).eq('status', 'active'),
  ]);

  if (examinationsError || yearsError || classesError || gradesError || divisionRulesError) {
    throw new Error('Unable to load exam report filters. Check the school academic and grading configuration.');
  }

  const validYearId = academicYears?.some((item) => item.id === filters.academicYearId) ? filters.academicYearId : undefined;
  const validClassId = classes?.some((item) => item.id === filters.classId) ? filters.classId : undefined;
  const examinationOptions = (allExaminations ?? []).filter((exam) =>
    (!validYearId || exam.academic_year_id === validYearId)
  );
  const termOptions = [...new Set(examinationOptions.map((exam) => exam.term))].sort((left, right) => left.localeCompare(right));
  const validTerm = termOptions.includes(filters.term ?? '') ? filters.term : undefined;
  const selectableExaminations = validTerm ? examinationOptions.filter((exam) => exam.term === validTerm) : examinationOptions;
  const validExaminationId = selectableExaminations.some((item) => item.id === filters.examinationId) ? filters.examinationId : undefined;
  const examRows = validExaminationId ? selectableExaminations.filter((item) => item.id === validExaminationId) : selectableExaminations;
  const effectiveFilters = {
    academicYearId: validYearId,
    term: validTerm,
    examinationId: validExaminationId,
    classId: validClassId,
  };
  const examIds = examRows.map((exam: AnyRow) => exam.id);
  let studentsQuery = supabase.from('students').select('id, admission_number, first_name, last_name, class_id, classes(id, name)').eq('school_id', schoolId).eq('status', 'active').order('last_name');
  if (validClassId) studentsQuery = studentsQuery.eq('class_id', validClassId);
  const { data: studentRows, error: studentsError } = await studentsQuery;
  if (studentsError) throw new Error('Unable to load students for the selected exam report filters.');
  const students = (studentRows ?? []).map((student: AnyRow) => ({ ...student, classes: relation(student.classes) }));
  const studentIds = students.map((student: AnyRow) => student.id);

  if (!examIds.length || !studentIds.length) {
    return emptyAnalytics({ academicYears: academicYears ?? [], classes: classes ?? [], examinations: examRows, examinationOptions: selectableExaminations, termOptions, gradeBands: gradeBands ?? [], divisionBands: flattenDivisionBands(divisionRules ?? []), filters: effectiveFilters });
  }

  const resultsQuery = supabase.from('student_exam_results').select('id, student_id, examination_id, subject_count, pass_count, fail_count, aggregate, division, total_marks, average_mark, overall_status, position, status, examinations(id, name, term, academic_year_id)').eq('school_id', schoolId).in('examination_id', examIds).in('student_id', studentIds);
  const [{ data: resultRows, error: resultsError }, { data: markRows, error: marksError }] = await Promise.all([
    resultsQuery,
    supabase.from('exam_marks').select('id, student_id, examination_id, subject_id, score, grade, points, passed, included_in_division, subjects(id, name)').eq('school_id', schoolId).in('examination_id', examIds).in('student_id', studentIds),
  ]);
  if (resultsError || marksError) throw new Error('Unable to load exam results for the selected filters.');

  const results: AnyRow[] = (resultRows ?? []).map((result: AnyRow) => ({ ...result, examinations: relation(result.examinations) }));
  const marks: AnyRow[] = (markRows ?? []).map((mark: AnyRow) => ({ ...mark, subjects: relation(mark.subjects) }));
  const scopedResults = results;
  const studentsById = new Map(students.map((student: AnyRow) => [student.id, student]));
  const resultKeys = new Set(scopedResults.map((result: AnyRow) => `${result.student_id}:${result.examination_id}`));
  const classified = scopedResults.filter((result: AnyRow) => result.overall_status === 'Pass' || result.overall_status === 'Fail');
  const markValues = marks.map((mark: AnyRow) => Number(mark.score)).filter(Number.isFinite);
  const divisionCounts = countBy(scopedResults.filter((result: AnyRow) => result.division), (result: AnyRow) => result.division)
    .sort((left, right) => divisionOrder(left[0], right[0], flattenDivisionBands(divisionRules ?? [])));
  const gradeCounts = countBy(marks.filter((mark: AnyRow) => mark.grade), (mark: AnyRow) => mark.grade)
    .sort((left, right) => gradeOrder(left[0], right[0], gradeBands ?? []));
  const resultAverages = scopedResults.map((result: AnyRow) => Number(result.average_mark)).filter(Number.isFinite);

  const classMap = new Map<string, AnyRow[]>();
  for (const result of scopedResults) {
    const student = studentsById.get(result.student_id);
    const classId = student?.class_id ?? 'unassigned';
    classMap.set(classId, [...(classMap.get(classId) ?? []), result]);
  }
  const subjectMap = new Map<string, AnyRow[]>();
  for (const mark of marks) subjectMap.set(mark.subject_id, [...(subjectMap.get(mark.subject_id) ?? []), mark]);
  const classPerformance = [...classMap.entries()].map(([classId, rows]) => {
    const classInfo = (classes ?? []).find((item: AnyRow) => item.id === classId);
    const classStudentIds = new Set(rows.map((row) => row.student_id));
    const classMarks = marks.filter((mark) => classStudentIds.has(mark.student_id));
    const passed = rows.filter((row) => row.overall_status === 'Pass').length;
    return { id: classId, name: classInfo?.name ?? 'Unassigned', students: classStudentIds.size, average: average(rows.map((row) => Number(row.average_mark)).filter(Number.isFinite)), passRate: percentage(passed, rows.length), failureRate: percentage(rows.filter((row) => row.overall_status === 'Fail').length, rows.length), divisions: countBy(rows.filter((row) => row.division), (row) => row.division), bestStudent: bestStudent(rows, studentsById), highestMark: classMarks.length ? Math.max(...classMarks.map((mark) => Number(mark.score))) : null, lowestMark: classMarks.length ? Math.min(...classMarks.map((mark) => Number(mark.score))) : null };
  }).sort((left, right) => (right.average ?? -1) - (left.average ?? -1));
  const subjectPerformance = [...subjectMap.entries()].map(([subjectId, rows]) => ({ id: subjectId, name: rows[0]?.subjects?.name ?? 'Subject', students: new Set(rows.map((row) => row.student_id)).size, average: average(rows.map((row) => Number(row.score)).filter(Number.isFinite)), passRate: percentage(rows.filter((row) => row.passed === true).length, rows.length), failureRate: percentage(rows.filter((row) => row.passed === false).length, rows.length), highest: rows.length ? Math.max(...rows.map((row) => Number(row.score))) : null, lowest: rows.length ? Math.min(...rows.map((row) => Number(row.score))) : null, belowPass: rows.filter((row) => row.passed === false).length, grades: countBy(rows.filter((row) => row.grade), (row) => row.grade) })).sort((left, right) => (right.average ?? -1) - (left.average ?? -1));
  const studentPerformance = results.map((result: AnyRow) => { const student = studentsById.get(result.student_id); return { ...result, position: result.position, student, className: student?.classes?.name ?? 'Unassigned' }; }).sort((left, right) => (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER));
  const atRisk = students.filter((student: AnyRow) => {
    const rows = scopedResults.filter((result) => result.student_id === student.id);
    const failed = rows.reduce((sum, row) => sum + Number(row.fail_count ?? 0), 0);
    const avg = average(rows.map((row) => Number(row.average_mark)).filter(Number.isFinite));
    return failed >= 2 || (avg !== null && avg < 50) || rows.some((row) => ['Incomplete', 'Not Classified'].includes(row.overall_status));
  }).map((student: AnyRow) => { const rows = scopedResults.filter((result) => result.student_id === student.id); return { student, average: average(rows.map((row) => Number(row.average_mark)).filter(Number.isFinite)), failedSubjects: rows.reduce((sum, row) => sum + Number(row.fail_count ?? 0), 0), risk: rows.some((row) => Number(row.fail_count ?? 0) >= 3) ? 'High' : 'Medium' }; });
  const validation = { studentsProcessed: new Set(scopedResults.map((row) => row.student_id)).size, subjectResultsProcessed: marks.length, missingMarks: students.filter((student: AnyRow) => scopedResults.some((row) => row.student_id === student.id && ['Incomplete', 'Not Classified'].includes(row.overall_status))).length, invalidMarks: marks.filter((mark) => Number(mark.score) < 0 || Number(mark.score) > 100).length, missingGrades: marks.filter((mark) => mark.score !== null && !mark.grade).length, missingPoints: marks.filter((mark) => mark.score !== null && mark.points === null).length, incomplete: scopedResults.filter((row) => ['Incomplete', 'Not Classified'].includes(row.overall_status)).length };
  const trends = examRows.map((exam: AnyRow) => { const rows = scopedResults.filter((result) => result.examination_id === exam.id); return { id: exam.id, name: exam.name, term: exam.term, average: average(rows.map((row) => Number(row.average_mark)).filter(Number.isFinite)), passRate: percentage(rows.filter((row) => row.overall_status === 'Pass').length, rows.length), students: new Set(rows.map((row) => row.student_id)).size }; }).filter((row) => row.students);

  return { academicYears: academicYears ?? [], classes: classes ?? [], examinations: examRows, examinationOptions: selectableExaminations, termOptions, gradeBands: gradeBands ?? [], divisionBands: flattenDivisionBands(divisionRules ?? []), filters: effectiveFilters, results: scopedResults, marks, students, studentsById, resultKeys, classPerformance, subjectPerformance, studentPerformance: scopedResults.map((result: AnyRow) => { const student = studentsById.get(result.student_id); return { ...result, position: result.position, student, className: student?.classes?.name ?? 'Unassigned' }; }).sort((left, right) => (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)), atRisk, validation, trends, metrics: { assessed: new Set(scopedResults.map((row) => row.student_id)).size, passed: classified.filter((row) => row.overall_status === 'Pass').length, failed: classified.filter((row) => row.overall_status === 'Fail').length, passRate: percentage(classified.filter((row) => row.overall_status === 'Pass').length, classified.length), average: average(resultAverages), divisions: divisionCounts, grades: gradeCounts, bestClass: classPerformance[0]?.name ?? 'Not available', bestSubject: subjectPerformance[0]?.name ?? 'Not available', lowestSubject: subjectPerformance.at(-1)?.name ?? 'Not available', attention: atRisk.length } };
}

function countBy(rows: AnyRow[], getKey: (row: AnyRow) => string) { const counts = new Map<string, number>(); for (const row of rows) { const key = getKey(row); counts.set(key, (counts.get(key) ?? 0) + 1); } return [...counts.entries()].sort((left, right) => right[1] - left[1]); }
function bestStudent(rows: AnyRow[], students: Map<string, AnyRow>) { const best = [...rows].sort((left, right) => Number(right.average_mark ?? -1) - Number(left.average_mark ?? -1))[0]; const student = best ? students.get(best.student_id) : null; return student ? `${student.first_name} ${student.last_name}` : 'Not available'; }
function flattenDivisionBands(rules: AnyRow[]) { return rules.flatMap((rule) => rule.division_bands ?? []); }
function gradeOrder(left: string, right: string, bands: AnyRow[]) {
  const leftIndex = bands.findIndex((band) => band.grade_name === left);
  const rightIndex = bands.findIndex((band) => band.grade_name === right);
  return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex) || left.localeCompare(right);
}
function divisionOrder(left: string, right: string, bands: AnyRow[]) {
  const leftIndex = bands.findIndex((band) => band.division_name === left);
  const rightIndex = bands.findIndex((band) => band.division_name === right);
  return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex) || left.localeCompare(right);
}
function emptyAnalytics(base: AnyRow) { return { ...base, academicYears: base.academicYears ?? [], classes: base.classes ?? [], examinations: base.examinations ?? [], examinationOptions: base.examinationOptions ?? [], termOptions: base.termOptions ?? [], gradeBands: base.gradeBands ?? [], divisionBands: base.divisionBands ?? [], filters: base.filters ?? {}, results: [], marks: [], students: base.students ?? [], studentsById: new Map(), resultKeys: new Set(), classPerformance: [], subjectPerformance: [], studentPerformance: [], atRisk: [], validation: { studentsProcessed: 0, subjectResultsProcessed: 0, missingMarks: 0, invalidMarks: 0, missingGrades: 0, missingPoints: 0, incomplete: 0 }, trends: [], metrics: { assessed: 0, passed: 0, failed: 0, passRate: 0, average: null, divisions: [], grades: [], bestClass: 'Not available', bestSubject: 'Not available', lowestSubject: 'Not available', attention: 0 } }; }
