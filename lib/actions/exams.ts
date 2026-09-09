'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';
import { calculateResult, type DivisionSchemeConfig, type GradingSchemeConfig, type SelectionMethod } from '@/lib/grading/engine';
import { sendGuardianMessage } from '@/lib/communication';

const examSchema = z.object({ name: z.string().trim().min(2).max(100), term: z.string().trim().min(1).max(30), examination_type_id: z.string().uuid().optional().or(z.literal('')), starts_on: z.string().optional().or(z.literal('')), ends_on: z.string().optional().or(z.literal('')) });
const markSchema = z.object({ examination_id: z.string().uuid(), student_id: z.string().uuid(), subject_id: z.string().uuid(), score: z.coerce.number().finite().min(0).max(1000), comment: z.string().trim().max(300).optional().or(z.literal('')) });
type GradeBand = { min_score: number; max_score: number; grade_name: string; points: number | null; remark: string | null; passed: boolean };
type DivisionBand = { min_points: number; max_points: number | null; division_name: string; description: string | null; passed: boolean };
type Snapshot = { scale: { id: string; name: string; coverage_required: boolean; max_mark: number; minimum_pass_mark: number; bands: GradeBand[] }; division: { id: string; subjects_counted: number; use_best_subjects: boolean; minimum_subjects_required: number; maximum_subjects_allowed: number; selection_method: SelectionMethod; include_compulsory: boolean; auto_select_optional: boolean; include_subsidiary_subjects: boolean; allow_failed_subjects: boolean; compulsory_must_pass: boolean; failed_compulsory_fails_overall: boolean; division_zero_on_failure: boolean; minimum_passed_subjects: number; maximum_failed_subjects: number; ranking_method?: 'aggregate' | 'total_marks' | 'average_mark'; compulsory: string[]; excluded: string[]; bands: DivisionBand[] } | null };

function gradingConfig(snapshot: Snapshot): GradingSchemeConfig { return { maximumMark: snapshot.scale.max_mark, minimumPassMark: snapshot.scale.minimum_pass_mark, coverageRequired: snapshot.scale.coverage_required, ranges: snapshot.scale.bands.map((band) => ({ grade: band.grade_name, minMark: Number(band.min_score), maxMark: Number(band.max_score), point: Number(band.points ?? 0), remark: band.remark ?? '', passed: band.passed, order: 0 })) }; }
function divisionConfig(snapshot: Snapshot): DivisionSchemeConfig { const division = snapshot.division; return { subjectsUsed: division?.subjects_counted ?? 1, minimumSubjectsRequired: division?.minimum_subjects_required ?? 1, maximumSubjectsAllowed: division?.maximum_subjects_allowed ?? division?.subjects_counted ?? 1, selectionMethod: division?.selection_method ?? 'all_subjects', compulsorySubjectIds: division?.compulsory ?? [], excludedSubjectIds: division?.excluded ?? [], includeSubsidiarySubjects: division?.include_subsidiary_subjects ?? true, allowFailedSubjects: division?.allow_failed_subjects ?? true, compulsoryMustPass: division?.compulsory_must_pass ?? false, failedCompulsoryFailsOverall: division?.failed_compulsory_fails_overall ?? false, divisionZeroOnFailure: division?.division_zero_on_failure ?? false, ranges: division?.bands.map((band) => ({ division: band.division_name, minAggregate: Number(band.min_points), maxAggregate: band.max_points === null ? null : Number(band.max_points), passed: band.passed, remark: band.description ?? '', order: 0 })) ?? [], minimumPassedSubjects: division?.minimum_passed_subjects ?? 0, maximumFailedSubjects: division?.maximum_failed_subjects ?? 999, absentStatus: 'Absent', missingMarksStatus: 'Incomplete', rankingMethod: division?.ranking_method ?? 'aggregate' }; }
async function audit(schoolId: string, actorId: string, action: string, resourceId: string, metadata: Record<string, unknown> = {}) { const supabase = await createServerSupabaseClient(); await supabase.from('audit_logs').insert({ school_id: schoolId, actor_id: actorId, action, resource_type: 'examination', resource_id: resourceId, metadata }); }

async function createConfigurationSnapshot(schoolId: string, examId: string, studentId: string, examinationTypeId: string | null) {
  const supabase = await createServerSupabaseClient();
  const { data: student } = await supabase.from('students').select('id, class_id, classes(id, education_level_id)').eq('id', studentId).eq('school_id', schoolId).maybeSingle();
  const educationLevelId = (Array.isArray((student as any)?.classes) ? (student as any).classes[0]?.education_level_id : (student as any)?.classes?.education_level_id) ?? null;
  const { data: exam } = await supabase.from('examinations').select('academic_year_id, examination_type_id').eq('id', examId).eq('school_id', schoolId).maybeSingle();
  if (!student || !exam) return null;
  const { data: currentYear } = exam.academic_year_id ? { data: null } : await supabase.from('academic_years').select('id').eq('school_id', schoolId).eq('is_current', true).maybeSingle();
  const academicYearId = exam.academic_year_id ?? currentYear?.id ?? null;
  const resolvedExaminationTypeId = examinationTypeId ?? exam?.examination_type_id ?? null;
  const { data: configured } = resolvedExaminationTypeId ? await supabase.from('exam_grading_configs').select('grading_scale_id, division_rule_id, use_standard_scale').eq('school_id', schoolId).eq('examination_type_id', resolvedExaminationTypeId).maybeSingle() : { data: null };
  const { data: assignment } = await supabase.from('exam_scheme_assignments').select('grading_scale_id, division_rule_id').eq('school_id', schoolId).eq('examination_id', examId).maybeSingle();
  let scaleQuery = supabase.from('grading_scales').select('id, name, education_level_id, academic_year_id, class_id, examination_type_id, coverage_required, max_mark, minimum_pass_mark, version, grade_bands(min_score, max_score, grade_name, points, remark, passed)').eq('school_id', schoolId).eq('status', 'active');
  if (academicYearId) scaleQuery = scaleQuery.or(`academic_year_id.eq.${academicYearId},academic_year_id.is.null`);
  const selectedScaleId = assignment?.grading_scale_id ?? (configured?.use_standard_scale === false ? configured.grading_scale_id : null);
  const { data: scales, error: scalesError } = selectedScaleId ? await scaleQuery.eq('id', selectedScaleId) : await scaleQuery;
  if (scalesError) return null;
  const scale = [...(scales ?? [])].sort((left: any, right: any) => {
    const score = (item: any) => Number(item.education_level_id === educationLevelId) * 8 + Number(item.class_id === (student as any)?.class_id) * 4 + Number(item.examination_type_id === resolvedExaminationTypeId) * 2 + Number(item.academic_year_id === academicYearId);
    return score(right) - score(left);
  })[0];
  if (!scale || !(scale.grade_bands ?? []).length) return null;
  let rulesQuery = supabase.from('division_rules').select('id, education_level_id, academic_year_id, class_id, examination_type_id, subjects_counted, use_best_subjects, minimum_subjects_required, maximum_subjects_allowed, selection_method, ranking_method, include_compulsory, auto_select_optional, include_subsidiary_subjects, allow_failed_subjects, compulsory_must_pass, failed_compulsory_fails_overall, division_zero_on_failure, minimum_passed_subjects, maximum_failed_subjects, division_bands(min_points, max_points, division_name, description, passed), compulsory_subjects(subject_id), excluded_division_subjects(subject_id)').eq('school_id', schoolId).eq('status', 'active');
  if (academicYearId) rulesQuery = rulesQuery.or(`academic_year_id.eq.${academicYearId},academic_year_id.is.null`);
  const { data: rules, error: rulesError } = await rulesQuery;
  if (rulesError) return null;
  const rule = assignment?.division_rule_id ? (rules ?? []).find((item: any) => item.id === assignment.division_rule_id) : configured?.division_rule_id ? (rules ?? []).find((item: any) => item.id === configured.division_rule_id) : [...(rules ?? [])].sort((left: any, right: any) => {
    const score = (item: any) => Number(item.education_level_id === educationLevelId) * 8 + Number(item.class_id === (student as any)?.class_id) * 4 + Number(item.examination_type_id === resolvedExaminationTypeId) * 2 + Number(item.academic_year_id === academicYearId);
    return score(right) - score(left);
  })[0];
  if (!rule || !(rule.division_bands ?? []).length) return null;
  const snapshot: Snapshot = { scale: { id: scale.id, name: scale.name, coverage_required: scale.coverage_required, max_mark: Number(scale.max_mark), minimum_pass_mark: Number(scale.minimum_pass_mark ?? 0), bands: (scale.grade_bands ?? []) as GradeBand[] }, division: { id: rule.id, subjects_counted: rule.subjects_counted, use_best_subjects: rule.use_best_subjects, minimum_subjects_required: rule.minimum_subjects_required, maximum_subjects_allowed: rule.maximum_subjects_allowed, selection_method: rule.selection_method, include_compulsory: rule.include_compulsory, auto_select_optional: rule.auto_select_optional, include_subsidiary_subjects: rule.include_subsidiary_subjects, allow_failed_subjects: rule.allow_failed_subjects, compulsory_must_pass: rule.compulsory_must_pass, failed_compulsory_fails_overall: rule.failed_compulsory_fails_overall, division_zero_on_failure: rule.division_zero_on_failure, minimum_passed_subjects: rule.minimum_passed_subjects, maximum_failed_subjects: rule.maximum_failed_subjects, ranking_method: rule.ranking_method ?? 'aggregate', compulsory: (rule.compulsory_subjects ?? []).map((row: any) => row.subject_id), excluded: (rule.excluded_division_subjects ?? []).map((row: any) => row.subject_id), bands: (rule.division_bands ?? []) as DivisionBand[] } };
  let versionQuery = supabase.from('grading_configuration_versions').select('id, snapshot').eq('school_id', schoolId).eq('grading_scale_id', scale.id);
  versionQuery = rule?.id ? versionQuery.eq('division_rule_id', rule.id) : versionQuery.is('division_rule_id', null);
  const { data: existingVersion } = await versionQuery.order('version_number', { ascending: false }).limit(1).maybeSingle();
  if (existingVersion && (existingVersion.snapshot as Snapshot)?.division?.bands?.length) return { id: existingVersion.id, snapshot: existingVersion.snapshot as Snapshot };
  const { data: version, error } = await supabase.from('grading_configuration_versions').insert({ school_id: schoolId, grading_scale_id: scale.id, division_rule_id: rule?.id ?? null, version_number: Number(scale.version ?? 1), snapshot }).select('id').single();
  if (error || !version) return null;
  await supabase.from('examinations').update({ grading_configuration_version_id: version.id }).eq('id', examId).eq('school_id', schoolId);
  return { id: version.id, snapshot };
}

export async function createExam(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('create_exam'); const parsed = examSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Enter an exam name and term.' };
  if (parsed.data.starts_on && parsed.data.ends_on && parsed.data.ends_on < parsed.data.starts_on) return { ok: false, error: 'The examination end date must be after its start date.' };
  const supabase = await createServerSupabaseClient();
  const { data: currentYear } = await supabase.from('academic_years').select('id').eq('school_id', session.school!.id).eq('is_current', true).maybeSingle();
  const { error } = await supabase.from('examinations').insert({ school_id: session.school!.id, academic_year_id: currentYear?.id ?? null, name: parsed.data.name, term: parsed.data.term, examination_type_id: parsed.data.examination_type_id || null, starts_on: parsed.data.starts_on || null, ends_on: parsed.data.ends_on || null });
  if (error) return { ok: false, error: error.code === '23505' ? 'That examination already exists for this term.' : 'Unable to create the examination.' };
  await audit(session.school!.id, session.userId, 'examination.create', parsed.data.name, { name: parsed.data.name, term: parsed.data.term, examination_type_id: parsed.data.examination_type_id || null });
  revalidatePath('/dashboard/exams'); return { ok: true };
}

export async function saveMark(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('enter_marks'); const parsed = markSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose an exam, student, subject, and valid score.' };
  const supabase = await createServerSupabaseClient();
  const { data: student } = await supabase.from('students').select('id, class_id').eq('id', parsed.data.student_id).eq('school_id', session.school!.id).maybeSingle();
  if (!student) return { ok: false, error: 'That student is not in this school.' };
  if (session.roleName?.toLowerCase() === 'teacher') { const { data: assignment } = await supabase.from('teacher_assignments').select('id').eq('school_id', session.school!.id).eq('profile_id', session.userId).eq('class_id', student.class_id ?? '').eq('subject_id', parsed.data.subject_id).maybeSingle(); if (!assignment) return { ok: false, error: 'You are not assigned to this class and subject.' }; }
  const { data: exam } = await supabase.from('examinations').select('id, examination_type_id, status').eq('id', parsed.data.examination_id).eq('school_id', session.school!.id).maybeSingle();
  const { data: subject } = await supabase.from('subjects').select('id').eq('id', parsed.data.subject_id).eq('school_id', session.school!.id).maybeSingle();
  if (!exam || !subject) return { ok: false, error: 'The selected exam or subject is not in this school.' };
  const submittedClassId = String(formData.get('class_id') ?? '');
  if (submittedClassId && submittedClassId !== student.class_id) return { ok: false, error: 'That student is not in the selected class.' };
  if (exam.status === 'published') return { ok: false, error: 'Published examinations are locked.' };
  const resolved = await createConfigurationSnapshot(session.school!.id, exam.id, student.id, exam.examination_type_id);
  if (!resolved) return { ok: false, error: 'No grading scale is configured for this school or academic level.' };
  const division = divisionConfig(resolved.snapshot);
  const calculated = calculateResult(gradingConfig(resolved.snapshot), { ...division, subjectsUsed: 1, minimumSubjectsRequired: 1, maximumSubjectsAllowed: 1, selectionMethod: 'all_subjects', compulsorySubjectIds: [], excludedSubjectIds: [], ranges: division.ranges.length ? division.ranges : [{ division: 'Unclassified', minAggregate: 0, maxAggregate: null, passed: true, remark: '', order: 0 }] }, [{ subjectId: parsed.data.subject_id, mark: parsed.data.score }]);
  const calculatedSubject = calculated.subjects[0];
  if (!calculatedSubject?.grade) return { ok: false, error: 'The mark is outside the configured grading ranges.' };
  const { error } = await supabase.from('exam_marks').upsert({ school_id: session.school!.id, examination_id: parsed.data.examination_id, student_id: parsed.data.student_id, subject_id: parsed.data.subject_id, score: parsed.data.score, grade: calculatedSubject.grade, points: calculatedSubject.point, remark: calculatedSubject.remark, passed: calculatedSubject.passed, included_in_division: true, configuration_version_id: resolved.id, comment: parsed.data.comment || null, entered_by: session.userId }, { onConflict: 'examination_id,student_id,subject_id' });
  if (error) { console.error('saveMark', error); return { ok: false, error: 'Unable to save this mark.' }; }
  revalidatePath('/dashboard/exams/marks'); revalidatePath('/dashboard/exams/results'); revalidatePath('/dashboard/exams/class-results'); revalidatePath('/dashboard/exams/reports'); return { ok: true };
}

export async function processExamination(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('publish_results');
  const examinationId = String(formData.get('examination_id') ?? '');
  if (!z.string().uuid().safeParse(examinationId).success) return { ok: false, error: 'Choose a valid examination.' };
  const supabase = await createServerSupabaseClient();
  const { data: exam } = await supabase.from('examinations').select('id, grading_configuration_version_id').eq('id', examinationId).eq('school_id', session.school!.id).maybeSingle();
  const { data: firstMark } = await supabase.from('exam_marks').select('student_id, configuration_version_id').eq('school_id', session.school!.id).eq('examination_id', examinationId).limit(1).maybeSingle();
  if (!firstMark?.student_id) return { ok: false, error: 'Enter at least one mark before processing this examination.' };
  let configurationVersionId = exam?.grading_configuration_version_id ?? firstMark.configuration_version_id;
  let version = configurationVersionId ? (await supabase.from('grading_configuration_versions').select('snapshot').eq('id', configurationVersionId).eq('school_id', session.school!.id).maybeSingle()).data : null;
  if (!version || !(version.snapshot as Snapshot)?.division?.bands?.length) {
    const refreshed = await createConfigurationSnapshot(session.school!.id, examinationId, firstMark.student_id, null);
    if (!refreshed) return { ok: false, error: 'No active grading scale and division ranges are configured for this examination schema.' };
    configurationVersionId = refreshed.id;
    version = { snapshot: refreshed.snapshot };
    await supabase.from('examinations').update({ grading_configuration_version_id: refreshed.id }).eq('id', examinationId).eq('school_id', session.school!.id);
  }
  const { data: marks } = await supabase.from('exam_marks').select('student_id, subject_id, score, points, passed, included_in_division, configuration_version_id').eq('school_id', session.school!.id).eq('examination_id', examinationId);
  if (!version || !marks?.length) return { ok: false, error: 'There are no marks to process.' };
  const snapshot = version.snapshot as Snapshot; const byStudent = new Map<string, any[]>(); for (const mark of marks) byStudent.set(mark.student_id, [...(byStudent.get(mark.student_id) ?? []), mark]);
  if (!snapshot.division?.bands?.length) return { ok: false, error: 'No division ranges are configured for this examination schema. Add division ranges before processing results.' };
  const saveErrors = (await Promise.all([...byStudent].map(async ([studentId, studentMarks]) => {
    const studentConfigurationId = studentMarks.find((mark) => mark.configuration_version_id)?.configuration_version_id ?? null;
    const studentVersion = studentConfigurationId && studentConfigurationId === configurationVersionId
      ? { id: configurationVersionId, snapshot }
      : studentConfigurationId
        ? (await supabase.from('grading_configuration_versions').select('id, snapshot').eq('id', studentConfigurationId).eq('school_id', session.school!.id).maybeSingle()).data
        : await createConfigurationSnapshot(session.school!.id, examinationId, studentId, null);
    if (!studentVersion || !(studentVersion.snapshot as Snapshot)?.division?.bands?.length) return 'No active grading and division configuration exists for this student.';
    const studentSnapshot = studentVersion.snapshot as Snapshot;
    const calculated = calculateResult(gradingConfig(studentSnapshot), divisionConfig(studentSnapshot), studentMarks.map((mark) => ({ subjectId: mark.subject_id, mark: Number(mark.score), manuallySelected: mark.included_in_division })));
    // Persist incomplete or unclassified results instead of aborting the whole
    // examination. This keeps the student's marks visible and lets the school
    // correct division bands in Grading Settings before recalculating.
    const payload = { school_id: session.school!.id, examination_id: examinationId, student_id: studentId, subject_count: calculated.selectedSubjectIds.length, pass_count: calculated.passedSubjects, fail_count: calculated.failedSubjects, aggregate: calculated.aggregate, division: calculated.division?.division ?? null, overall_remark: calculated.overallRemark, included_subject_ids: calculated.selectedSubjectIds, processed_at: new Date().toISOString(), configuration_version_id: studentVersion.id, status: 'CALCULATED' };
    const modern = await supabase.from('student_exam_results').upsert({ ...payload, total_marks: calculated.totalMarks, average_mark: calculated.averageMark, overall_status: calculated.overallStatus }, { onConflict: 'examination_id,student_id' });
    if (!modern.error) return null;
    if (modern.error.code === '42703' || modern.error.code === 'PGRST204') {
      const legacyPayload = { school_id: payload.school_id, examination_id: payload.examination_id, student_id: payload.student_id, subject_count: payload.subject_count, pass_count: payload.pass_count, fail_count: payload.fail_count, aggregate: payload.aggregate, division: payload.division, overall_remark: payload.overall_remark, included_subject_ids: payload.included_subject_ids, processed_at: payload.processed_at };
      const legacy = await supabase.from('student_exam_results').upsert(legacyPayload, { onConflict: 'examination_id,student_id' });
      return legacy.error ? legacy.error.message : null;
    }
    return modern.error.message;
  })));
  if (saveErrors.some(Boolean)) return { ok: false, error: `Unable to save student results: ${saveErrors.find(Boolean)}` };
  const rankingMethod = (snapshot.division?.ranking_method ?? 'aggregate') as 'aggregate' | 'total_marks' | 'average_mark';
  const sortColumn = rankingMethod === 'total_marks' ? 'total_marks' : rankingMethod === 'average_mark' ? 'average_mark' : 'aggregate';
  const { data: rankedResults, error: rankedResultsError } = await supabase.from('student_exam_results').select('id, student_id, aggregate, total_marks, average_mark, overall_status').eq('school_id', session.school!.id).eq('examination_id', examinationId).not(sortColumn, 'is', null).order(sortColumn, { ascending: false, nullsFirst: false });
  if (rankedResultsError) return { ok: false, error: `Results were calculated but positions could not be saved: ${rankedResultsError.message}` };
  const rankedStudentIds = (rankedResults ?? []).map((result) => result.student_id);
  const { data: rankedStudents, error: rankedStudentsError } = await supabase.from('students').select('id, class_id').eq('school_id', session.school!.id).in('id', rankedStudentIds);
  if (rankedStudentsError) return { ok: false, error: `Results were calculated but class positions could not be saved: ${rankedStudentsError.message}` };
  const classByStudent = new Map((rankedStudents ?? []).map((student) => [student.id, student.class_id ?? 'unassigned']));
  const resultsByClass = new Map<string, any[]>();
  for (const result of rankedResults ?? []) {
    const classId = classByStudent.get(result.student_id) ?? 'unassigned';
    resultsByClass.set(classId, [...(resultsByClass.get(classId) ?? []), result]);
  }
  for (const classResults of resultsByClass.values()) {
    let previousValue: number | null = null;
    let previousPosition = 0;
    for (const [index, result] of classResults.entries()) {
      const currentValue = result[sortColumn] === null ? null : Number(result[sortColumn]);
      const position = currentValue === null ? null : currentValue === previousValue ? previousPosition : index + 1;
      if (position !== null) previousPosition = position;
      previousValue = currentValue;
      const { error } = await supabase.from('student_exam_results').update({ position, status: 'PUBLISHED' }).eq('id', result.id).eq('school_id', session.school!.id);
      if (error?.code === '42703' || error?.code === 'PGRST204') {
        const legacyPosition = await supabase.from('student_exam_results').update({ position }).eq('id', result.id).eq('school_id', session.school!.id);
        if (legacyPosition.error) return { ok: false, error: `Unable to save position for result: ${legacyPosition.error.message}` };
        continue;
      }
      if (error) return { ok: false, error: `Unable to save position for result: ${error.message}` };
    }
  }
  await supabase.from('examinations').update({ status: 'published', processed_at: new Date().toISOString(), processed_by: session.userId }).eq('id', examinationId).eq('school_id', session.school!.id); await audit(session.school!.id, session.userId, 'examination.process', examinationId, { configuration_version_id: configurationVersionId }); revalidatePath('/dashboard/exams/results'); revalidatePath('/dashboard/exams/class-results'); revalidatePath('/dashboard/exams/reports'); return { ok: true };
}

export async function recalculateExamination(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('publish_results');
  const examinationId = String(formData.get('examination_id') ?? '');
  const confirmed = String(formData.get('confirm') ?? '') === 'true';
  if (!z.string().uuid().safeParse(examinationId).success) return { ok: false, error: 'Choose a valid examination.' };
  if (!confirmed) return { ok: false, error: 'Recalculation requires explicit confirmation because existing results will change.' };
  const supabase = await createServerSupabaseClient();
  const { data: exam } = await supabase.from('examinations').select('id, grading_configuration_version_id').eq('id', examinationId).eq('school_id', session.school!.id).maybeSingle();
  const { data: mark } = await supabase.from('exam_marks').select('student_id').eq('school_id', session.school!.id).eq('examination_id', examinationId).limit(1).maybeSingle();
  if (!exam || !mark) return { ok: false, error: 'There are no existing marks to recalculate.' };
  const previousVersionId = exam.grading_configuration_version_id;
  const resolved = await createConfigurationSnapshot(session.school!.id, examinationId, mark.student_id, null);
  if (!resolved) return { ok: false, error: 'No active grading or division scheme is configured for this examination.' };
  await supabase.from('examinations').update({ grading_configuration_version_id: resolved.id }).eq('id', examinationId).eq('school_id', session.school!.id);
  await audit(session.school!.id, session.userId, 'examination.recalculate', examinationId, { previous_configuration_version_id: previousVersionId, new_configuration_version_id: resolved.id, confirmed: true });
  const processingForm = new FormData();
  processingForm.set('examination_id', examinationId);
  return processExamination(processingForm);
}

export async function sendClassReportsToGuardians(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('send_reports');
  const classId = String(formData.get('class_id') ?? '');
  const supabase = await createServerSupabaseClient();
  const { data: publishedResults } = await supabase.from('student_exam_results').select('student_id').eq('school_id', session.school!.id).eq('status', 'PUBLISHED');
  const publishedStudentIds = [...new Set((publishedResults ?? []).map((result) => result.student_id))];
  if (!publishedStudentIds.length) return { ok: false, error: 'No published student reports are available to send.' };
  let query = supabase.from('students').select('id, first_name, last_name, guardian_phone, class_id').eq('school_id', session.school!.id).eq('status', 'active').not('guardian_phone', 'is', null).in('id', publishedStudentIds);
  if (classId) query = query.eq('class_id', classId);
  const { data: students } = await query;
  if (!students?.length) return { ok: false, error: 'No active students with guardian phone numbers were found.' };
  const { data: school } = await supabase.from('schools').select('name').eq('id', session.school!.id).maybeSingle();
  const failures: string[] = [];
  for (const student of students) {
    try {
      await sendGuardianMessage(session.school!.id, student.guardian_phone!, `${school?.name ?? 'School'} result report for ${student.first_name} ${student.last_name} is ready. Please contact the school for the report card.`);
    } catch {
      failures.push(`${student.first_name} ${student.last_name}`);
    }
  }
  if (failures.length) return { ok: false, error: `WhatsApp delivery is not configured or failed for ${failures.length} guardian(s).` };
  return { ok: true };
}
