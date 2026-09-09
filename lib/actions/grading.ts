'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireGradingManager } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const checkbox = z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean()).optional();
const requirePermission = (_code: string) => requireGradingManager();

const gradingScaleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  education_level_id: z.string().uuid().optional().or(z.literal('')),
  class_id: z.string().uuid().optional().or(z.literal('')),
  examination_type_id: z.string().uuid().optional().or(z.literal('')),
  academic_year_id: z.string().uuid().optional().or(z.literal('')),
  max_mark: z.coerce.number().positive().max(1000).default(100),
  minimum_pass_mark: z.coerce.number().min(0).max(1000).default(0),
  status: z.enum(['active', 'inactive']).default('active'),
  effective_from: z.string().optional().or(z.literal('')),
  effective_to: z.string().optional().or(z.literal('')),
  coverage_required: checkbox,
  is_default: checkbox,
});

const gradeBandSchema = z.object({
  grading_scale_id: z.string().uuid(),
  grade_name: z.string().trim().min(1).max(20),
  min_score: z.coerce.number().min(0).max(1000),
  max_score: z.coerce.number().min(0).max(1000),
  points: z.coerce.number().finite().min(0).max(1000),
  remark: z.string().trim().max(50).optional().or(z.literal('')),
  passed: checkbox,
  order_index: z.coerce.number().int().min(0).optional().or(z.literal('0')),
});

const divisionRuleSchema = z.object({
  education_level_id: z.string().uuid().optional().or(z.literal('')),
  name: z.string().trim().min(2).max(100).optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  academic_year_id: z.string().uuid().optional().or(z.literal('')),
  class_id: z.string().uuid().optional().or(z.literal('')),
  examination_type_id: z.string().uuid().optional().or(z.literal('')),
  subjects_counted: z.coerce.number().int().min(1).max(20),
  use_best_subjects: checkbox,
  minimum_subjects_required: z.coerce.number().int().min(1).max(30),
  include_compulsory: checkbox,
  auto_select_optional: checkbox,
  principal_subjects_count: z.coerce.number().int().min(1).max(20).optional().or(z.literal('')),
  subsidiary_subjects_count: z.coerce.number().int().min(0).max(20).optional().or(z.literal('')),
  maximum_subjects_allowed: z.coerce.number().int().min(1).max(50).default(20),
  selection_method: z.enum(['best_n', 'all_subjects', 'compulsory_plus_best_optional', 'manual']).default('best_n'),
  include_subsidiary_subjects: checkbox,
  allow_failed_subjects: checkbox,
  compulsory_must_pass: checkbox,
  failed_compulsory_fails_overall: checkbox,
  division_zero_on_failure: checkbox,
  minimum_passed_subjects: z.coerce.number().int().min(0).default(0),
  maximum_failed_subjects: z.coerce.number().int().min(0).default(999),
  ranking_method: z.enum(['aggregate', 'total_marks', 'average_mark']).default('aggregate'),
  status: z.enum(['active', 'inactive']).default('active'),
  effective_from: z.string().optional().or(z.literal('')),
  effective_to: z.string().optional().or(z.literal('')),
});

const divisionBandSchema = z.object({
  division_rule_id: z.string().uuid(),
  division_name: z.string().trim().min(1).max(40),
  min_points: z.coerce.number().min(0),
  max_points: z.coerce.number().min(0).optional().or(z.literal('')),
  description: z.string().trim().max(120).optional().or(z.literal('')),
  passed: z.coerce.boolean().optional(),
  order_index: z.coerce.number().int().min(0).optional().or(z.literal('0')),
});

async function rangesOverlap(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, table: 'grade_bands' | 'division_bands', parentColumn: string, parentId: string, min: number, max: number, id?: string) {
  let query = supabase.from(table).select('id, min_score, max_score, min_points, max_points').eq(parentColumn, parentId);
  if (id) query = query.neq('id', id);
  const { data } = await query;
  return (data ?? []).find((row: any) => min <= Number(row.max_score ?? row.max_points ?? Number.MAX_SAFE_INTEGER) && max >= Number(row.min_score ?? row.min_points));
}

async function bumpSchoolConfigurationVersion(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, schoolId: string) {
  await supabase.rpc('bump_grading_configuration_versions', { p_school_id: schoolId });
}

export async function validateGradingScale(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const id = String(formData.get('scale_id') ?? '');
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Choose a valid grading scale.' };
  const supabase = await createServerSupabaseClient();
  const { data: scale } = await supabase.from('grading_scales').select('id, name, max_mark, coverage_required, grade_bands(min_score, max_score)').eq('id', id).eq('school_id', session.school!.id).maybeSingle();
  if (!scale) return { ok: false, error: 'That grading scale is not available.' };
  const ranges = [...(scale.grade_bands ?? [])].sort((a: any, b: any) => Number(a.min_score) - Number(b.min_score));
  const firstRange = ranges[0];
  const lastRange = ranges[ranges.length - 1];
  if (scale.coverage_required && (!firstRange || !lastRange || Number(firstRange.min_score) !== 0 || Number(lastRange.max_score) !== Number(scale.max_mark) || ranges.some((range: any, index: number) => index > 0 && Number(range.min_score) !== Number(ranges[index - 1]!.max_score) + 1))) return { ok: false, error: `The ${scale.name} ranges must cover every mark from 0 to ${scale.max_mark}.` };
  await logAudit(session.school!.id, session.userId, 'grading_scale.validate', 'grading_scale', id, { ranges: ranges.length });
  return { ok: true };
}

function logAudit(schoolId: string, actorId: string, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  return createServerSupabaseClient().then((supabase) =>
    supabase.from('audit_logs').insert({
      school_id: schoolId,
      actor_id: actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
    })
  );
}

export async function createGradingScale(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = gradingScaleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Provide a valid grading scale name.' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('grading_scales')
    .insert({
      school_id: session.school!.id,
      description: parsed.data.description || null,
      education_level_id: parsed.data.education_level_id || null,
      class_id: parsed.data.class_id || null,
      examination_type_id: parsed.data.examination_type_id || null,
      academic_year_id: parsed.data.academic_year_id || null,
      name: parsed.data.name,
      max_mark: parsed.data.max_mark,
      minimum_pass_mark: parsed.data.minimum_pass_mark,
      status: parsed.data.status,
      effective_from: parsed.data.effective_from || null,
      effective_to: parsed.data.effective_to || null,
      coverage_required: parsed.data.coverage_required !== false,
      is_default: Boolean(parsed.data.is_default),
    })
    .select('id')
    .single();

  if (error) {
    console.error('createGradingScale', { code: error.code, message: error.message, details: error.details, hint: error.hint });
    if (error.code === '23505') return { ok: false, error: 'An active grading scheme already exists for this academic level. Deactivate it or choose a different level.' };
    if (error.code === '42501') return { ok: false, error: 'You do not have permission to create grading schemes.' };
    if (error.code === '42703' || error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes("Could not find the table 'public.grading_scales'")) return { ok: false, error: 'The grading tables are not installed in Supabase. Apply migrations 0013, 0015, and 0016 in order, then reload this page.' };
    if (error.message?.includes('Minimum pass mark')) return { ok: false, error: 'Minimum pass mark cannot be greater than the maximum mark.' };
    return { ok: false, error: `Unable to create the grading scale: ${error.message}` };
  }

  await logAudit(session.school!.id, session.userId, 'grading_scale.create', 'grading_scale', data.id, { name: parsed.data.name });
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function updateGradingScale(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const id = String(formData.get('id') ?? '');
  const parsed = gradingScaleSchema.safeParse(Object.fromEntries(formData));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return { ok: false, error: 'Check the grading scale settings.' };
  const supabase = await createServerSupabaseClient();
  const { data: scale } = await supabase.from('grading_scales').select('id, name, max_mark, coverage_required').eq('id', id).eq('school_id', session.school!.id).maybeSingle();
  if (!scale) return { ok: false, error: 'That grading scale is not available.' };
  const { error } = await supabase.from('grading_scales').update({ name: parsed.data.name, description: parsed.data.description || null, education_level_id: parsed.data.education_level_id || null, class_id: parsed.data.class_id || null, examination_type_id: parsed.data.examination_type_id || null, academic_year_id: parsed.data.academic_year_id || null, max_mark: parsed.data.max_mark, minimum_pass_mark: parsed.data.minimum_pass_mark, status: parsed.data.status, effective_from: parsed.data.effective_from || null, effective_to: parsed.data.effective_to || null, coverage_required: parsed.data.coverage_required !== false }).eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to update the grading scale.' };
  await logAudit(session.school!.id, session.userId, 'grading_scale.update', 'grading_scale', id, { previous: scale, next: parsed.data });
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function setGradingScaleStatus(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '') as 'active' | 'inactive';
  if (!z.string().uuid().safeParse(id).success || !['active', 'inactive'].includes(status)) return { ok: false, error: 'Choose a valid grading scale status.' };
  const supabase = await createServerSupabaseClient();
  const { data: previous } = await supabase.from('grading_scales').select('id, status').eq('id', id).eq('school_id', session.school!.id).maybeSingle();
  if (!previous) return { ok: false, error: 'That grading scale is not available.' };
  const { error } = await supabase.from('grading_scales').update({ status }).eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: error.code === '23505' ? 'Another active grading scale already uses this scope.' : 'Unable to change grading scale status.' };
  await logAudit(session.school!.id, session.userId, 'grading_scale.status', 'grading_scale', id, { previous, next: { status } });
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function duplicateGradingScale(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const id = String(formData.get('id') ?? '');
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Choose a valid grading scale.' };
  const supabase = await createServerSupabaseClient();
  const { data: source } = await supabase.from('grading_scales').select('*, grade_bands(*)').eq('id', id).eq('school_id', session.school!.id).maybeSingle();
  if (!source) return { ok: false, error: 'That grading scale is not available.' };
  const { data: copy, error } = await supabase.from('grading_scales').insert({ school_id: session.school!.id, name: `${source.name} Copy`, description: source.description, education_level_id: source.education_level_id, class_id: source.class_id, examination_type_id: source.examination_type_id, academic_year_id: source.academic_year_id, max_mark: source.max_mark, minimum_pass_mark: source.minimum_pass_mark, coverage_required: source.coverage_required, status: 'inactive', is_default: false }).select('id').single();
  if (error || !copy) return { ok: false, error: 'Unable to duplicate grading scale.' };
  const bands = (source.grade_bands ?? []).map((band: any) => ({ grading_scale_id: copy.id, grade_name: band.grade_name, min_score: band.min_score, max_score: band.max_score, points: band.points, remark: band.remark, passed: band.passed, order_index: band.order_index }));
  if (bands.length) await supabase.from('grade_bands').insert(bands);
  await logAudit(session.school!.id, session.userId, 'grading_scale.duplicate', 'grading_scale', copy.id, { source_id: id });
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function deleteGradingScale(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('grading_scales').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to delete the grading scale.' };

  await logAudit(session.school!.id, session.userId, 'grading_scale.delete', 'grading_scale', id);
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function setDefaultGradingScale(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();

  await supabase.from('grading_scales').update({ is_default: false }).eq('school_id', session.school!.id);
  const { error } = await supabase
    .from('grading_scales')
    .update({ is_default: true })
    .eq('id', id)
    .eq('school_id', session.school!.id);

  if (error) return { ok: false, error: 'Unable to set the default grading scale.' };

  await logAudit(session.school!.id, session.userId, 'grading_scale.set_default', 'grading_scale', id);
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function addGradeBand(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = gradeBandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Check the grade band values.' };

  const supabase = await createServerSupabaseClient();
  const { data: scale } = await supabase
    .from('grading_scales')
    .select('id')
    .eq('id', parsed.data.grading_scale_id)
    .eq('school_id', session.school!.id)
    .maybeSingle();
  if (!scale) return { ok: false, error: 'That grading scale is not available.' };
  if (parsed.data.min_score > parsed.data.max_score) return { ok: false, error: 'Minimum score cannot exceed maximum score.' };
  const conflict = await rangesOverlap(supabase, 'grade_bands', 'grading_scale_id', parsed.data.grading_scale_id, parsed.data.min_score, parsed.data.max_score);
  if (conflict) return { ok: false, error: `Grade ranges cannot overlap. Range ${parsed.data.min_score}-${parsed.data.max_score} conflicts with ${conflict.min_score}-${conflict.max_score}.` };

  const { data, error } = await supabase
    .from('grade_bands')
    .insert({
      grading_scale_id: parsed.data.grading_scale_id,
      grade_name: parsed.data.grade_name,
      min_score: parsed.data.min_score,
      max_score: parsed.data.max_score,
      points: parsed.data.points,
      remark: parsed.data.remark || null,
      passed: parsed.data.passed !== false,
      order_index: Number(parsed.data.order_index || 0),
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: 'Unable to save the grade band.' };

  await logAudit(session.school!.id, session.userId, 'grade_band.create', 'grade_band', data.id, { grade_name: parsed.data.grade_name });
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function deleteGradeBand(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { data: band } = await supabase
    .from('grade_bands')
    .select('id, grading_scales!inner(school_id)')
    .eq('id', id)
    .eq('grading_scales.school_id', session.school!.id)
    .maybeSingle();
  if (!band) return { ok: false, error: 'That grade band is not available.' };
  const { error } = await supabase.from('grade_bands').delete().eq('id', id);

  if (error) return { ok: false, error: 'Unable to remove the grade band.' };

  await logAudit(session.school!.id, session.userId, 'grade_band.delete', 'grade_band', id);
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function updateGradeBand(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const id = String(formData.get('id') ?? '');
  const parsed = gradeBandSchema.safeParse(Object.fromEntries(formData));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return { ok: false, error: 'Check the grade band values.' };
  const supabase = await createServerSupabaseClient();
  const { data: band } = await supabase.from('grade_bands').select('id, grading_scales!inner(school_id)').eq('id', id).eq('grading_scales.school_id', session.school!.id).maybeSingle();
  if (!band) return { ok: false, error: 'That grade band is not available.' };
  if (parsed.data.min_score > parsed.data.max_score) return { ok: false, error: 'Minimum score cannot exceed maximum score.' };
  const { data: bandParent } = await supabase.from('grade_bands').select('grading_scale_id').eq('id', id).maybeSingle();
  const conflict = bandParent ? await rangesOverlap(supabase, 'grade_bands', 'grading_scale_id', bandParent.grading_scale_id, parsed.data.min_score, parsed.data.max_score, id) : null;
  if (!bandParent || conflict) return { ok: false, error: conflict ? `Grade ranges cannot overlap. Range ${parsed.data.min_score}-${parsed.data.max_score} conflicts with ${conflict.min_score}-${conflict.max_score}.` : 'That grade band is not available.' };
  const { error } = await supabase.from('grade_bands').update({
    grade_name: parsed.data.grade_name,
    min_score: parsed.data.min_score,
    max_score: parsed.data.max_score,
    points: parsed.data.points,
    remark: parsed.data.remark || null,
    passed: parsed.data.passed !== false,
    order_index: Number(parsed.data.order_index || 0),
  }).eq('id', id);
  if (error) return { ok: false, error: 'Unable to update the grade band.' };
  await logAudit(session.school!.id, session.userId, 'grade_band.update', 'grade_band', id, { grade_name: parsed.data.grade_name });
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function createDivisionRule(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = divisionRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Provide a valid division rule.' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('division_rules')
    .insert({
      school_id: session.school!.id,
      education_level_id: parsed.data.education_level_id || null,
      name: parsed.data.name || 'Division Rule',
      description: parsed.data.description || null,
      academic_year_id: parsed.data.academic_year_id || null,
      class_id: parsed.data.class_id || null,
      examination_type_id: parsed.data.examination_type_id || null,
      subjects_counted: parsed.data.subjects_counted,
      maximum_subjects_allowed: parsed.data.maximum_subjects_allowed,
      selection_method: parsed.data.selection_method,
      use_best_subjects: parsed.data.use_best_subjects !== false,
      minimum_subjects_required: parsed.data.minimum_subjects_required,
      include_compulsory: parsed.data.include_compulsory !== false,
      auto_select_optional: parsed.data.auto_select_optional !== false,
      include_subsidiary_subjects: parsed.data.include_subsidiary_subjects !== false,
      allow_failed_subjects: parsed.data.allow_failed_subjects !== false,
      compulsory_must_pass: parsed.data.compulsory_must_pass === true,
      failed_compulsory_fails_overall: parsed.data.failed_compulsory_fails_overall === true,
      division_zero_on_failure: parsed.data.division_zero_on_failure === true,
      minimum_passed_subjects: parsed.data.minimum_passed_subjects,
      maximum_failed_subjects: parsed.data.maximum_failed_subjects,
      ranking_method: parsed.data.ranking_method,
      principal_subjects_count: parsed.data.principal_subjects_count || null,
      subsidiary_subjects_count: parsed.data.subsidiary_subjects_count || null,
      status: parsed.data.status,
      effective_from: parsed.data.effective_from || null,
      effective_to: parsed.data.effective_to || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('createDivisionRule', { code: error.code, message: error.message, details: error.details, hint: error.hint });
    if (error.code === '23505') return { ok: false, error: 'An active division scheme already exists for this education schema, academic year, class, and examination type. Edit the existing scheme or deactivate it first.' };
    if (error.code === '42501') return { ok: false, error: 'You do not have permission to create division schemes.' };
    if (error.code === '42703' || error.code === '42P01' || error.code === 'PGRST205') return { ok: false, error: 'The division configuration migration is not installed. Apply migrations 0016, 0019, and 0021 in order.' };
    return { ok: false, error: `Unable to create the division rule: ${error.message}` };
  }

  await logAudit(session.school!.id, session.userId, 'division_rule.create', 'division_rule', data.id, { subjects_counted: parsed.data.subjects_counted });
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function deleteDivisionRule(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('division_rules').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to remove the division rule.' };

  await logAudit(session.school!.id, session.userId, 'division_rule.delete', 'division_rule', id);
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function updateDivisionRule(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const id = String(formData.get('id') ?? '');
  const parsed = divisionRuleSchema.safeParse(Object.fromEntries(formData));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return { ok: false, error: 'Check the division rule settings.' };
  const supabase = await createServerSupabaseClient();
  const { data: previous } = await supabase.from('division_rules').select('*').eq('id', id).eq('school_id', session.school!.id).maybeSingle();
  if (!previous) return { ok: false, error: 'That division rule is not available.' };
  const { error } = await supabase.from('division_rules').update({ name: parsed.data.name || previous.name, description: parsed.data.description || null, education_level_id: parsed.data.education_level_id || null, academic_year_id: parsed.data.academic_year_id || null, class_id: parsed.data.class_id || null, examination_type_id: parsed.data.examination_type_id || null, subjects_counted: parsed.data.subjects_counted, maximum_subjects_allowed: parsed.data.maximum_subjects_allowed, selection_method: parsed.data.selection_method, use_best_subjects: parsed.data.use_best_subjects !== false, minimum_subjects_required: parsed.data.minimum_subjects_required, include_compulsory: parsed.data.include_compulsory !== false, auto_select_optional: parsed.data.auto_select_optional !== false, include_subsidiary_subjects: parsed.data.include_subsidiary_subjects !== false, allow_failed_subjects: parsed.data.allow_failed_subjects !== false, compulsory_must_pass: parsed.data.compulsory_must_pass === true, failed_compulsory_fails_overall: parsed.data.failed_compulsory_fails_overall === true, division_zero_on_failure: parsed.data.division_zero_on_failure === true, minimum_passed_subjects: parsed.data.minimum_passed_subjects, maximum_failed_subjects: parsed.data.maximum_failed_subjects, ranking_method: parsed.data.ranking_method, principal_subjects_count: parsed.data.principal_subjects_count || null, subsidiary_subjects_count: parsed.data.subsidiary_subjects_count || null, status: parsed.data.status, effective_from: parsed.data.effective_from || null, effective_to: parsed.data.effective_to || null }).eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to update the division rule.' };
  await logAudit(session.school!.id, session.userId, 'division_rule.update', 'division_rule', id, { previous, next: parsed.data });
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function addDivisionBand(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = divisionBandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Check the division band values.' };

  const supabase = await createServerSupabaseClient();
  const { data: rule } = await supabase
    .from('division_rules')
    .select('id')
    .eq('id', parsed.data.division_rule_id)
    .eq('school_id', session.school!.id)
    .maybeSingle();
  if (!rule) return { ok: false, error: 'That division rule is not available.' };
  const maxPoints = parsed.data.max_points === '' || parsed.data.max_points === undefined ? Number.MAX_SAFE_INTEGER : parsed.data.max_points;
  if (parsed.data.min_points > maxPoints) return { ok: false, error: 'Minimum aggregate cannot exceed maximum aggregate.' };
  if (await rangesOverlap(supabase, 'division_bands', 'division_rule_id', parsed.data.division_rule_id, parsed.data.min_points, maxPoints)) return { ok: false, error: 'This division range overlaps another range.' };

  const { data, error } = await supabase
    .from('division_bands')
    .insert({
      division_rule_id: parsed.data.division_rule_id,
      division_name: parsed.data.division_name,
      min_points: parsed.data.min_points,
      max_points: parsed.data.max_points === '' || parsed.data.max_points === undefined ? null : parsed.data.max_points,
      description: parsed.data.description || null,
      passed: parsed.data.passed !== false,
      order_index: Number(parsed.data.order_index || 0),
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: 'Unable to save the division band.' };

  await logAudit(session.school!.id, session.userId, 'division_band.create', 'division_band', data.id, { division_name: parsed.data.division_name });
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function deleteDivisionBand(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { data: band } = await supabase
    .from('division_bands')
    .select('id, division_rules!inner(school_id)')
    .eq('id', id)
    .eq('division_rules.school_id', session.school!.id)
    .maybeSingle();
  if (!band) return { ok: false, error: 'That division band is not available.' };
  const { error } = await supabase.from('division_bands').delete().eq('id', id);
  if (error) return { ok: false, error: 'Unable to remove the division band.' };

  await logAudit(session.school!.id, session.userId, 'division_band.delete', 'division_band', id);
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}

export async function updateDivisionBand(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const id = String(formData.get('id') ?? '');
  const parsed = divisionBandSchema.safeParse(Object.fromEntries(formData));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return { ok: false, error: 'Check the division band values.' };
  const supabase = await createServerSupabaseClient();
  const { data: band } = await supabase.from('division_bands').select('id, division_rules!inner(school_id)').eq('id', id).eq('division_rules.school_id', session.school!.id).maybeSingle();
  if (!band) return { ok: false, error: 'That division band is not available.' };
  const maxPoints = parsed.data.max_points === '' || parsed.data.max_points === undefined ? Number.MAX_SAFE_INTEGER : parsed.data.max_points;
  if (parsed.data.min_points > maxPoints) return { ok: false, error: 'Minimum aggregate cannot exceed maximum aggregate.' };
  const { data: bandParent } = await supabase.from('division_bands').select('division_rule_id').eq('id', id).maybeSingle();
  if (!bandParent || await rangesOverlap(supabase, 'division_bands', 'division_rule_id', bandParent.division_rule_id, parsed.data.min_points, maxPoints, id)) return { ok: false, error: 'This division range overlaps another range.' };
  const { error } = await supabase.from('division_bands').update({
    division_name: parsed.data.division_name,
    min_points: parsed.data.min_points,
    max_points: parsed.data.max_points === '' || parsed.data.max_points === undefined ? null : parsed.data.max_points,
    description: parsed.data.description || null,
    passed: parsed.data.passed !== false,
    order_index: Number(parsed.data.order_index || 0),
  }).eq('id', id);
  if (error) return { ok: false, error: 'Unable to update the division band.' };
  await logAudit(session.school!.id, session.userId, 'division_band.update', 'division_band', id, { division_name: parsed.data.division_name });
  await bumpSchoolConfigurationVersion(supabase, session.school!.id);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}
