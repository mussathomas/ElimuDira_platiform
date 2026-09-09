'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';
import { processExamination } from '@/lib/actions/exams';

const gradingSchemeSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  name: z.string().trim().min(2, 'Scheme name is required').max(80),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  education_level_id: z.string().uuid().optional().or(z.literal('')),
  academic_year_id: z.string().uuid().optional().or(z.literal('')),
  max_mark: z.coerce.number().int().min(1, 'Maximum mark must be greater than zero').max(1000),
  minimum_pass_mark: z.coerce.number().int().min(0).max(1000).optional().or(z.literal('0')),
  status: z.enum(['active', 'inactive']).default('active'),
});

const gradeRangeSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  grading_scale_id: z.string().uuid(),
  grade_name: z.string().trim().min(1, 'Grade is required').max(20),
  min_score: z.coerce.number().min(0, 'Minimum mark cannot be negative').max(10000),
  max_score: z.coerce.number().min(0, 'Maximum mark cannot be negative').max(10000),
  points: z.coerce.number().min(0, 'Point value cannot be negative').max(1000),
  remark: z.string().trim().max(100).optional().or(z.literal('')),
  passed: z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean()).optional(),
  order_index: z.coerce.number().int().min(0).optional().or(z.literal('0')),
});

const divisionSchemeSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  name: z.string().trim().min(2, 'Division rule name is required').max(80),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  education_level_id: z.string().uuid().optional().or(z.literal('')),
  academic_year_id: z.string().uuid().optional().or(z.literal('')),
  subjects_counted: z.coerce.number().int().min(1, 'Subjects counted must be at least 1').max(50),
  minimum_subjects_required: z.coerce.number().int().min(1, 'Minimum subjects required must be at least 1').max(50),
  maximum_subjects_allowed: z.coerce.number().int().min(1, 'Maximum subjects allowed must be at least 1').max(50),
  selection_method: z.enum(['best_n', 'all_subjects', 'compulsory_plus_best_optional', 'manual']).default('best_n'),
  status: z.enum(['active', 'inactive']).default('active'),
});

const divisionRangeSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  division_rule_id: z.string().uuid(),
  division_name: z.string().trim().min(1, 'Division name is required').max(40),
  min_points: z.coerce.number().min(0, 'Minimum points cannot be negative').max(10000),
  max_points: z.coerce.number().min(0, 'Maximum points cannot be negative').max(10000).optional().or(z.literal('')),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  order_index: z.coerce.number().int().min(0).optional().or(z.literal('0')),
  passed: z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean()).optional(),
});

const selectionRuleSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  education_level_id: z.string().uuid().optional().or(z.literal('')),
  academic_year_id: z.string().uuid().optional().or(z.literal('')),
  name: z.string().trim().min(2).max(80).default('Subject selection rule'),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  subjects_considered: z.coerce.number().int().min(1).max(50).default(1),
  selection_method: z.enum(['best_n', 'all_subjects', 'compulsory_plus_best_optional', 'manual']).default('best_n'),
  required_subjects: z.string().optional().or(z.literal('')),
  optional_subjects: z.string().optional().or(z.literal('')),
  excluded_subjects: z.string().optional().or(z.literal('')),
  compulsory_subjects: z.string().optional().or(z.literal('')),
});

async function auditLog(schoolId: string, actorId: string, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  const supabase = await createServerSupabaseClient();
  await supabase.from('audit_logs').insert({
    school_id: schoolId,
    actor_id: actorId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata,
  });
}

function parseIds(value: string | undefined): string[] {
  return Array.from(new Set((value ?? '').split(',').map((id) => id.trim()).filter(Boolean)));
}

function getFormValues(formData: FormData, name: string): string[] {
  return formData.getAll(name).map((value) => String(value ?? '').trim()).filter(Boolean);
}

async function refreshSchoolResults(schoolId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: exams } = await supabase
    .from('examinations')
    .select('id')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });

  for (const exam of exams ?? []) {
    const { data: existingMarks } = await supabase
      .from('exam_marks')
      .select('id')
      .eq('school_id', schoolId)
      .eq('examination_id', exam.id)
      .limit(1);

    if (!existingMarks?.length) continue;

    const form = new FormData();
    form.set('examination_id', exam.id);
    try {
      await processExamination(form);
    } catch {
      // Ignore background recalculation errors here; the save itself should still succeed.
    }
  }
}

export async function createGradingScheme(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = gradingSchemeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the scheme details and try again.' };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('grading_scales')
    .insert({
      school_id: session.school!.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      education_level_id: parsed.data.education_level_id || null,
      academic_year_id: parsed.data.academic_year_id || null,
      max_mark: parsed.data.max_mark,
      minimum_pass_mark: Number(parsed.data.minimum_pass_mark ?? 0),
      status: parsed.data.status,
      coverage_required: true,
      created_by: session.userId,
      updated_by: session.userId,
    })
    .select('id, name')
    .single();

  if (error) {
    console.error('createGradingScheme', error);
    return { ok: false, error: error.message || 'Failed to create the grading scheme.' };
  }

  await auditLog(session.school!.id, session.userId, 'grading_scheme.create', 'grading_scheme', data.id, { name: data.name });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function updateGradingScheme(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = gradingSchemeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the scheme details and try again.' };
  }

  const schemeId = String(formData.get('id') ?? '');
  if (!z.string().uuid().safeParse(schemeId).success) {
    return { ok: false, error: 'Choose a valid grading scheme.' };
  }

  const supabase = await createServerSupabaseClient();
  const { data: previous } = await supabase
    .from('grading_scales')
    .select('id, name, max_mark, minimum_pass_mark, education_level_id, academic_year_id, status')
    .eq('id', schemeId)
    .eq('school_id', session.school!.id)
    .single();

  if (!previous) return { ok: false, error: 'The selected grading scheme no longer exists.' };

  const { error } = await supabase.from('grading_scales').update({
    name: parsed.data.name,
    description: parsed.data.description || null,
    education_level_id: parsed.data.education_level_id || null,
    academic_year_id: parsed.data.academic_year_id || null,
    max_mark: parsed.data.max_mark,
    minimum_pass_mark: Number(parsed.data.minimum_pass_mark ?? 0),
    status: parsed.data.status,
    updated_by: session.userId,
  }).eq('id', schemeId).eq('school_id', session.school!.id);

  if (error) {
    console.error('updateGradingScheme', error);
    return { ok: false, error: error.message || 'Failed to update the grading scheme.' };
  }

  await auditLog(session.school!.id, session.userId, 'grading_scheme.update', 'grading_scheme', schemeId, { previous, next: parsed.data });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function deleteGradingScheme(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: 'Choose a valid grading scheme.' };
  }

  const supabase = await createServerSupabaseClient();
  const { data: deleted } = await supabase.from('grading_scales').select('id, name').eq('id', id).eq('school_id', session.school!.id).single();
  if (!deleted) return { ok: false, error: 'The grading scheme was not found.' };

  const { error } = await supabase.from('grading_scales').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) {
    console.error('deleteGradingScheme', error);
    return { ok: false, error: 'Unable to delete the grading scheme.' };
  }

  await auditLog(session.school!.id, session.userId, 'grading_scheme.delete', 'grading_scheme', id, { name: deleted.name });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function addGradeRange(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = gradeRangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the grade range values and try again.' };
  }

  const supabase = await createServerSupabaseClient();
  const schemeId = parsed.data.grading_scale_id;

  const { data: scheme } = await supabase.from('grading_scales').select('id, max_mark').eq('id', schemeId).eq('school_id', session.school!.id).single();
  if (!scheme) return { ok: false, error: 'The grading scheme does not exist.' };
  if (parsed.data.min_score > parsed.data.max_score) return { ok: false, error: 'Minimum mark cannot exceed maximum mark.' };
  if (parsed.data.max_score > Number(scheme.max_mark)) return { ok: false, error: 'The grade range exceeds the scheme maximum mark.' };

  const { data: existing } = await supabase.from('grade_bands').select('id, grade_name, min_score, max_score').eq('grading_scale_id', schemeId);
  const duplicate = (existing ?? []).find((row: any) => row.grade_name.trim().toLowerCase() === parsed.data.grade_name.trim().toLowerCase());
  if (duplicate) return { ok: false, error: 'A grade with this name already exists in the scheme.' };
  const overlaps = (existing ?? []).find((row: any) => parsed.data.min_score <= Number(row.max_score) && parsed.data.max_score >= Number(row.min_score));
  if (overlaps) return { ok: false, error: `Grade range overlaps with ${overlaps.grade_name}.` };

  const { data, error } = await supabase.from('grade_bands').insert({
    grading_scale_id: schemeId,
    grade_name: parsed.data.grade_name,
    min_score: parsed.data.min_score,
    max_score: parsed.data.max_score,
    points: parsed.data.points,
    remark: parsed.data.remark || null,
    passed: parsed.data.passed ?? true,
    order_index: Number(parsed.data.order_index ?? 0),
    created_by: session.userId,
    updated_by: session.userId,
  }).select('id, grade_name').single();

  if (error) {
    console.error('addGradeRange', error);
    return { ok: false, error: error.message || 'Unable to save the grade range.' };
  }

  await auditLog(session.school!.id, session.userId, 'grade_range.create', 'grade_range', data.id, { grade_name: data.grade_name, grading_scale_id: schemeId });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function updateGradeRange(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = gradeRangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the selected grade range and try again.' };
  }

  const id = String(formData.get('id') ?? '');
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Choose a valid grade range.' };

  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase.from('grade_bands').select('id, grading_scale_id, grade_name, min_score, max_score').eq('id', id).single();
  if (!existing) return { ok: false, error: 'That grade range no longer exists.' };
  if (parsed.data.min_score > parsed.data.max_score) return { ok: false, error: 'Minimum mark cannot exceed maximum mark.' };

  const { data: scheme } = await supabase.from('grading_scales').select('id, max_mark').eq('id', existing.grading_scale_id).eq('school_id', session.school!.id).single();
  if (!scheme) return { ok: false, error: 'The grading scheme does not exist.' };
  if (parsed.data.max_score > Number(scheme.max_mark)) return { ok: false, error: 'The updated grade range exceeds the scheme maximum mark.' };

  const { data: ranges } = await supabase.from('grade_bands').select('id, grade_name, min_score, max_score').eq('grading_scale_id', existing.grading_scale_id);
  const duplicate = (ranges ?? []).find((row: any) => row.id !== id && row.grade_name.trim().toLowerCase() === parsed.data.grade_name.trim().toLowerCase());
  if (duplicate) return { ok: false, error: 'A grade with this name already exists in the scheme.' };
  const overlaps = (ranges ?? []).find((row: any) => row.id !== id && parsed.data.min_score <= Number(row.max_score) && parsed.data.max_score >= Number(row.min_score));
  if (overlaps) return { ok: false, error: `Grade range overlaps with ${overlaps.grade_name}.` };

  const { error } = await supabase.from('grade_bands').update({
    grade_name: parsed.data.grade_name,
    min_score: parsed.data.min_score,
    max_score: parsed.data.max_score,
    points: parsed.data.points,
    remark: parsed.data.remark || null,
    passed: parsed.data.passed ?? true,
    order_index: Number(parsed.data.order_index ?? 0),
    updated_by: session.userId,
  }).eq('id', id).eq('grading_scale_id', existing.grading_scale_id);

  if (error) {
    console.error('updateGradeRange', error);
    return { ok: false, error: 'Unable to update the grade range.' };
  }

  await auditLog(session.school!.id, session.userId, 'grade_range.update', 'grade_range', id, { previous: existing, next: parsed.data });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function deleteGradeRange(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Choose a valid grade range.' };

  const supabase = await createServerSupabaseClient();
  const { data: row } = await supabase.from('grade_bands').select('id, grade_name, grading_scale_id').eq('id', id).single();
  if (!row) return { ok: false, error: 'That grade range no longer exists.' };

  const { error } = await supabase.from('grade_bands').delete().eq('id', id).eq('grading_scale_id', row.grading_scale_id);
  if (error) {
    console.error('deleteGradeRange', error);
    return { ok: false, error: 'Unable to delete the grade range.' };
  }

  await auditLog(session.school!.id, session.userId, 'grade_range.delete', 'grade_range', id, { grade_name: row.grade_name });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function createDivisionRule(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = divisionSchemeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the division rule details and try again.' };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('division_rules').insert({
    school_id: session.school!.id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    education_level_id: parsed.data.education_level_id || null,
    academic_year_id: parsed.data.academic_year_id || null,
    subjects_counted: parsed.data.subjects_counted,
    minimum_subjects_required: parsed.data.minimum_subjects_required,
    maximum_subjects_allowed: parsed.data.maximum_subjects_allowed,
    selection_method: parsed.data.selection_method,
    status: parsed.data.status,
    created_by: session.userId,
    updated_by: session.userId,
  }).select('id, name').single();

  if (error) {
    console.error('createDivisionRule', error);
    return { ok: false, error: error.message || 'Unable to create the division rule.' };
  }

  await auditLog(session.school!.id, session.userId, 'division_rule.create', 'division_rule', data.id, { name: data.name });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function updateDivisionRule(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = divisionSchemeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the selected division rule and try again.' };
  }

  const ruleId = String(formData.get('id') ?? '');
  if (!z.string().uuid().safeParse(ruleId).success) return { ok: false, error: 'Choose a valid division rule.' };

  const supabase = await createServerSupabaseClient();
  const { data: previous } = await supabase.from('division_rules').select('id, name, subjects_counted, minimum_subjects_required, maximum_subjects_allowed, selection_method, status, education_level_id, academic_year_id').eq('id', ruleId).eq('school_id', session.school!.id).single();
  if (!previous) return { ok: false, error: 'That division rule no longer exists.' };

  if (parsed.data.minimum_subjects_required > parsed.data.maximum_subjects_allowed) {
    return { ok: false, error: 'Minimum subjects required cannot exceed the maximum allowed.' };
  }

  const { error } = await supabase.from('division_rules').update({
    name: parsed.data.name,
    description: parsed.data.description || null,
    education_level_id: parsed.data.education_level_id || null,
    academic_year_id: parsed.data.academic_year_id || null,
    subjects_counted: parsed.data.subjects_counted,
    minimum_subjects_required: parsed.data.minimum_subjects_required,
    maximum_subjects_allowed: parsed.data.maximum_subjects_allowed,
    selection_method: parsed.data.selection_method,
    status: parsed.data.status,
    updated_by: session.userId,
  }).eq('id', ruleId).eq('school_id', session.school!.id);

  if (error) {
    console.error('updateDivisionRule', error);
    return { ok: false, error: error.message || 'Unable to update the division rule.' };
  }

  await auditLog(session.school!.id, session.userId, 'division_rule.update', 'division_rule', ruleId, { previous, next: parsed.data });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function deleteDivisionRule(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Choose a valid division rule.' };

  const supabase = await createServerSupabaseClient();
  const { data: rule } = await supabase.from('division_rules').select('id, name').eq('id', id).eq('school_id', session.school!.id).single();
  if (!rule) return { ok: false, error: 'That division rule was not found.' };

  const { error } = await supabase.from('division_rules').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) {
    console.error('deleteDivisionRule', error);
    return { ok: false, error: 'Unable to delete the division rule.' };
  }

  await auditLog(session.school!.id, session.userId, 'division_rule.delete', 'division_rule', id, { name: rule.name });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function addDivisionRange(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = divisionRangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the division range values and try again.' };
  }

  const supabase = await createServerSupabaseClient();
  const ruleId = parsed.data.division_rule_id;
  const { data: rule } = await supabase.from('division_rules').select('id, school_id').eq('id', ruleId).eq('school_id', session.school!.id).single();
  if (!rule) return { ok: false, error: 'The division rule does not exist.' };
  if (parsed.data.min_points > Number(parsed.data.max_points || parsed.data.min_points)) return { ok: false, error: 'Minimum points cannot exceed maximum points.' };

  const { data: existing } = await supabase.from('division_bands').select('id, division_name, min_points, max_points').eq('division_rule_id', ruleId);
  const duplicate = (existing ?? []).find((row: any) => row.division_name.trim().toLowerCase() === parsed.data.division_name.trim().toLowerCase());
  if (duplicate) {
    const existingMax = Number(parsed.data.max_points ?? Number.MAX_SAFE_INTEGER);
    const { error: updateError } = await supabase.from('division_bands').update({
      division_name: parsed.data.division_name,
      min_points: parsed.data.min_points,
      max_points: parsed.data.max_points || null,
      description: parsed.data.description || null,
      passed: parsed.data.passed ?? true,
      order_index: Number(parsed.data.order_index ?? 0),
      updated_by: session.userId,
    }).eq('id', duplicate.id).eq('division_rule_id', ruleId);

    if (updateError) {
      console.error('addDivisionRange update duplicate', updateError);
      return { ok: false, error: updateError.message || 'Unable to update the existing division band.' };
    }

    await auditLog(session.school!.id, session.userId, 'division_range.update', 'division_range', duplicate.id, { division_name: parsed.data.division_name, updated_from_existing: true, min_points: parsed.data.min_points, max_points: parsed.data.max_points || null });
    revalidatePath('/dashboard/settings/grading');
    return { ok: true };
  }

  const maxValue = Number(parsed.data.max_points ?? Number.MAX_SAFE_INTEGER);
  const overlaps = (existing ?? []).find((row: any) => parsed.data.min_points <= Number(row.max_points ?? Number.MAX_SAFE_INTEGER) && maxValue >= Number(row.min_points));
  if (overlaps) return { ok: false, error: `Division range overlaps with ${overlaps.division_name}.` };

  const { data, error } = await supabase.from('division_bands').insert({
    division_rule_id: ruleId,
    division_name: parsed.data.division_name,
    min_points: parsed.data.min_points,
    max_points: parsed.data.max_points || null,
    description: parsed.data.description || null,
    passed: parsed.data.passed ?? true,
    order_index: Number(parsed.data.order_index ?? 0),
    created_by: session.userId,
    updated_by: session.userId,
  }).select('id, division_name').single();

  if (error) {
    console.error('addDivisionRange', error);
    return { ok: false, error: error.message || 'Unable to save the division range.' };
  }

  await auditLog(session.school!.id, session.userId, 'division_range.create', 'division_range', data.id, { division_name: data.division_name });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function updateDivisionRange(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = divisionRangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the division range values and try again.' };
  }

  const id = String(formData.get('id') ?? '');
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Choose a valid division range.' };

  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase.from('division_bands').select('id, division_rule_id, division_name, min_points, max_points').eq('id', id).single();
  if (!existing) return { ok: false, error: 'That division range no longer exists.' };
  const maxValue = Number(parsed.data.max_points ?? Number.MAX_SAFE_INTEGER);
  if (parsed.data.min_points > maxValue) return { ok: false, error: 'Minimum points cannot exceed maximum points.' };

  const { data: ranges } = await supabase.from('division_bands').select('id, division_name, min_points, max_points').eq('division_rule_id', existing.division_rule_id);
  const duplicate = (ranges ?? []).find((row: any) => row.id !== id && row.division_name.trim().toLowerCase() === parsed.data.division_name.trim().toLowerCase());
  if (duplicate) return { ok: false, error: 'A division with that name already exists.' };
  const overlaps = (ranges ?? []).find((row: any) => row.id !== id && parsed.data.min_points <= Number(row.max_points ?? Number.MAX_SAFE_INTEGER) && maxValue >= Number(row.min_points));
  if (overlaps) return { ok: false, error: `Division range overlaps with ${overlaps.division_name}.` };

  const { error } = await supabase.from('division_bands').update({
    division_name: parsed.data.division_name,
    min_points: parsed.data.min_points,
    max_points: parsed.data.max_points || null,
    description: parsed.data.description || null,
    passed: parsed.data.passed ?? true,
    order_index: Number(parsed.data.order_index ?? 0),
    updated_by: session.userId,
  }).eq('id', id).eq('division_rule_id', existing.division_rule_id);

  if (error) {
    console.error('updateDivisionRange', error);
    return { ok: false, error: 'Unable to update the division range.' };
  }

  await auditLog(session.school!.id, session.userId, 'division_range.update', 'division_range', id, { previous: existing, next: parsed.data });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function deleteDivisionRange(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Choose a valid division range.' };

  const supabase = await createServerSupabaseClient();
  const { data: row } = await supabase.from('division_bands').select('id, division_name, division_rule_id').eq('id', id).single();
  if (!row) return { ok: false, error: 'That division range no longer exists.' };

  const { error } = await supabase.from('division_bands').delete().eq('id', id).eq('division_rule_id', row.division_rule_id);
  if (error) {
    console.error('deleteDivisionRange', error);
    return { ok: false, error: 'Unable to delete the division range.' };
  }

  await auditLog(session.school!.id, session.userId, 'division_range.delete', 'division_range', id, { division_name: row.division_name });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function saveSubjectSelectionRule(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();

  const missingTableMessage = 'Subject selection rules are not enabled in this database. Apply the migration 0031_grading_module_core.sql before saving these rules.';
  const { error: rulesTableError } = await supabase.from('subject_selection_rules').select('id').limit(1);
  if (rulesTableError && (rulesTableError.code === '42P01' || rulesTableError.message?.includes('Could not find the table') || rulesTableError.message?.includes('subject_selection_rules'))) {
    return { ok: false, error: missingTableMessage };
  }

  const { error: itemsTableError } = await supabase.from('subject_selection_rule_items').select('id').limit(1);
  if (itemsTableError && (itemsTableError.code === '42P01' || itemsTableError.message?.includes('Could not find the table') || itemsTableError.message?.includes('subject_selection_rule_items'))) {
    return { ok: false, error: missingTableMessage };
  }

  const values = {
    education_level_id: formData.get('education_level_id')?.toString() ?? '',
    academic_year_id: formData.get('academic_year_id')?.toString() ?? '',
    name: formData.get('name')?.toString() ?? 'Subject selection rule',
    description: formData.get('description')?.toString() ?? '',
    subjects_considered: formData.get('subjects_considered')?.toString() ?? '1',
    selection_method: formData.get('selection_method')?.toString() ?? 'best_n',
    required_subjects: getFormValues(formData, 'required_subjects').join(','),
    optional_subjects: getFormValues(formData, 'optional_subjects').join(','),
    compulsory_subjects: getFormValues(formData, 'compulsory_subjects').join(','),
    excluded_subjects: getFormValues(formData, 'excluded_subjects').join(','),
  };

  const parsed = selectionRuleSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the subject selection rule and try again.' };
  }

  const ids = {
    required: parseIds(parsed.data.required_subjects),
    optional: parseIds(parsed.data.optional_subjects),
    compulsory: parseIds(parsed.data.compulsory_subjects),
    excluded: parseIds(parsed.data.excluded_subjects),
  };

  const { data: existingRule } = await supabase
    .from('subject_selection_rules')
    .select('id')
    .eq('school_id', session.school!.id)
    .eq('education_level_id', parsed.data.education_level_id || null)
    .eq('academic_year_id', parsed.data.academic_year_id || null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const ruleId = existingRule?.id ?? null;
  const rule = ruleId
    ? await supabase.from('subject_selection_rules').update({
        name: parsed.data.name,
        description: parsed.data.description || null,
        subjects_considered: parsed.data.subjects_considered,
        selection_method: parsed.data.selection_method,
        updated_by: session.userId,
        updated_at: new Date().toISOString(),
      }).eq('id', ruleId).select('id').single()
    : await supabase.from('subject_selection_rules').insert({
        school_id: session.school!.id,
        education_level_id: parsed.data.education_level_id || null,
        academic_year_id: parsed.data.academic_year_id || null,
        name: parsed.data.name,
        description: parsed.data.description || null,
        subjects_considered: parsed.data.subjects_considered,
        selection_method: parsed.data.selection_method,
        created_by: session.userId,
        updated_by: session.userId,
      }).select('id').single();

  if (rule.error) {
    console.error('saveSubjectSelectionRule', rule.error);
    return { ok: false, error: rule.error.message || 'Failed to save the subject selection rule.' };
  }

  const activeId = rule.data.id;
  await supabase.from('subject_selection_rule_items').delete().eq('rule_id', activeId).eq('school_id', session.school!.id);

  const items = [
    ...ids.required.map((subjectId) => ({ school_id: session.school!.id, rule_id: activeId, subject_id: subjectId, item_type: 'required' })),
    ...ids.optional.map((subjectId) => ({ school_id: session.school!.id, rule_id: activeId, subject_id: subjectId, item_type: 'optional' })),
    ...ids.compulsory.map((subjectId) => ({ school_id: session.school!.id, rule_id: activeId, subject_id: subjectId, item_type: 'compulsory' })),
    ...ids.excluded.map((subjectId) => ({ school_id: session.school!.id, rule_id: activeId, subject_id: subjectId, item_type: 'excluded' })),
  ];

  if (items.length > 0) {
    const { error: itemError } = await supabase.from('subject_selection_rule_items').insert(items);
    if (itemError) {
      console.error('saveSubjectSelectionRule items', itemError);
      return { ok: false, error: itemError.message || 'Failed to save the subject selection rule items.' };
    }
  }

  await auditLog(session.school!.id, session.userId, 'subject_selection_rule.save', 'subject_selection_rule', activeId, { name: parsed.data.name });
  try { await refreshSchoolResults(session.school!.id); } catch {}
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}
