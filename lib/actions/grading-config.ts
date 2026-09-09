'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireGradingManager } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const checkbox = z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean()).optional();
const requirePermission = (_code: string) => requireGradingManager();

const typeSchema = z.object({ name: z.string().trim().min(2).max(80), contributes_to_final_result: checkbox, contributes_to_division: checkbox });
const examConfigSchema = z.object({ examination_type_id: z.string().uuid(), grading_scale_id: z.string().uuid().optional().or(z.literal('')), division_rule_id: z.string().uuid().optional().or(z.literal('')), use_standard_scale: checkbox, contributes_to_final_result: checkbox, contributes_to_division: checkbox });
const assignmentSchema = z.object({ examination_id: z.string().uuid(), grading_scale_id: z.string().uuid().optional().or(z.literal('')), division_rule_id: z.string().uuid().optional().or(z.literal('')) });
const subjectSchema = z.object({ division_rule_id: z.string().uuid(), subject_id: z.string().uuid(), kind: z.enum(['compulsory', 'excluded']) });

async function logConfig(schoolId: string, actorId: string, action: string, resourceId: string, previous: unknown, next: unknown) {
  const supabase = await createServerSupabaseClient();
  await supabase.from('audit_logs').insert({ school_id: schoolId, actor_id: actorId, action, resource_type: 'grading_configuration', resource_id: resourceId, metadata: { previous, next } });
}

export async function createExaminationType(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings'); const parsed = typeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Enter a valid examination type name.' };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('examination_types').insert({ school_id: session.school!.id, name: parsed.data.name, contributes_to_final_result: parsed.data.contributes_to_final_result !== false, contributes_to_division: parsed.data.contributes_to_division !== false }).select('id').single();
  if (error || !data) return { ok: false, error: error?.code === '23505' ? 'That examination type already exists.' : 'Unable to create examination type.' };
  await logConfig(session.school!.id, session.userId, 'examination_type.create', data.id, null, parsed.data); revalidatePath('/dashboard/settings/grading'); revalidatePath('/dashboard/exams'); return { ok: true };
}

export async function saveExamGradingConfig(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings'); const parsed = examConfigSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Review the examination grading configuration.' };
  const supabase = await createServerSupabaseClient();
  const { data: previous } = await supabase.from('exam_grading_configs').select('*').eq('school_id', session.school!.id).eq('examination_type_id', parsed.data.examination_type_id).maybeSingle();
  const payload = { school_id: session.school!.id, examination_type_id: parsed.data.examination_type_id, grading_scale_id: parsed.data.grading_scale_id || null, division_rule_id: parsed.data.division_rule_id || null, use_standard_scale: parsed.data.use_standard_scale !== false, contributes_to_final_result: parsed.data.contributes_to_final_result !== false, contributes_to_division: parsed.data.contributes_to_division !== false };
  const { error } = await supabase.from('exam_grading_configs').upsert(payload, { onConflict: 'school_id,examination_type_id' });
  if (error) return { ok: false, error: 'Unable to save examination grading configuration.' };
  await logConfig(session.school!.id, session.userId, 'exam_grading_config.update', parsed.data.examination_type_id, previous, payload); revalidatePath('/dashboard/settings/grading'); return { ok: true };
}

export async function assignExamScheme(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings'); const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a valid exam and scheme assignment.' };
  const supabase = await createServerSupabaseClient();
  const { data: exam } = await supabase.from('examinations').select('id').eq('id', parsed.data.examination_id).eq('school_id', session.school!.id).maybeSingle();
  if (!exam) return { ok: false, error: 'That examination is not in this school.' };
  const payload = { school_id: session.school!.id, examination_id: parsed.data.examination_id, grading_scale_id: parsed.data.grading_scale_id || null, division_rule_id: parsed.data.division_rule_id || null };
  const { error } = await supabase.from('exam_scheme_assignments').upsert(payload, { onConflict: 'school_id,examination_id' });
  if (error) return { ok: false, error: 'Unable to save exam-specific grading assignment.' };
  await logConfig(session.school!.id, session.userId, 'exam_scheme_assignment.update', parsed.data.examination_id, null, payload); revalidatePath('/dashboard/settings/grading'); return { ok: true };
}

export async function saveDivisionSubject(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings'); const parsed = subjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a valid subject rule.' };
  const supabase = await createServerSupabaseClient();
  const { data: rule } = await supabase.from('division_rules').select('id').eq('id', parsed.data.division_rule_id).eq('school_id', session.school!.id).maybeSingle();
  const { data: subject } = await supabase.from('subjects').select('id').eq('id', parsed.data.subject_id).eq('school_id', session.school!.id).maybeSingle();
  if (!rule || !subject) return { ok: false, error: 'That rule or subject is not in this school.' };
  const table = parsed.data.kind === 'compulsory' ? 'compulsory_subjects' : 'excluded_division_subjects';
  const { error } = await supabase.from(table).upsert({ division_rule_id: parsed.data.division_rule_id, subject_id: parsed.data.subject_id }, { onConflict: 'division_rule_id,subject_id' });
  if (error) return { ok: false, error: 'Unable to save subject selection.' };
  await logConfig(session.school!.id, session.userId, `division_subject.${parsed.data.kind}`, parsed.data.division_rule_id, null, { subject_id: parsed.data.subject_id }); revalidatePath('/dashboard/settings/grading'); return { ok: true };
}

export async function removeDivisionSubject(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings'); const parsed = subjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a valid subject rule.' };
  const supabase = await createServerSupabaseClient();
  const { data: rule } = await supabase.from('division_rules').select('id').eq('id', parsed.data.division_rule_id).eq('school_id', session.school!.id).maybeSingle();
  if (!rule) return { ok: false, error: 'That division rule is not available.' };
  const table = parsed.data.kind === 'compulsory' ? 'compulsory_subjects' : 'excluded_division_subjects';
  const { error } = await supabase.from(table).delete().eq('division_rule_id', parsed.data.division_rule_id).eq('subject_id', parsed.data.subject_id);
  if (error) return { ok: false, error: 'Unable to remove subject selection.' };
  await logConfig(session.school!.id, session.userId, `division_subject.remove_${parsed.data.kind}`, parsed.data.division_rule_id, { subject_id: parsed.data.subject_id }, null);
  revalidatePath('/dashboard/settings/grading');
  return { ok: true };
}
