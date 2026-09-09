'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

function friendlyError(error: { code?: string; message: string }, fallback: string) {
  if (error.code === '23505') return 'That name already exists for your school.';
  console.error(error);
  return fallback;
}

async function logAndRevalidate(
  schoolId: string,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string
) {
  const supabase = await createServerSupabaseClient();
  await supabase
    .from('audit_logs')
    .insert({ school_id: schoolId, actor_id: actorId, action, resource_type: resourceType, resource_id: resourceId });
  revalidatePath('/dashboard/settings/academics');
  revalidatePath('/dashboard/setup');
}

// --- Academic years ----------------------------------------------------

const academicYearSchema = z.object({
  name: z.string().trim().min(2).max(20),
  start_date: z.string().date(),
  end_date: z.string().date(),
});

export async function createAcademicYear(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = academicYearSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  if (parsed.data.end_date <= parsed.data.start_date) {
    return { ok: false, error: 'End date must be after the start date.' };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('academic_years')
    .insert({ school_id: session.school!.id, ...parsed.data })
    .select('id')
    .single();

  if (error) return { ok: false, error: friendlyError(error, 'Unable to create the academic year.') };
  await logAndRevalidate(session.school!.id, session.userId, 'academic_year.create', 'academic_year', data.id);
  return { ok: true };
}

export async function setCurrentAcademicYear(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const academicYearId = String(formData.get('academic_year_id') ?? '');
  if (!z.string().uuid().safeParse(academicYearId).success) {
    return { ok: false, error: 'Choose a valid academic year.' };
  }
  const supabase = await createServerSupabaseClient();

  // Clear the previous current year first, then set the new one — avoids
  // ever momentarily violating the "one current year" unique index.
  await supabase.from('academic_years').update({ is_current: false }).eq('school_id', session.school!.id);
  const { error } = await supabase
    .from('academic_years')
    .update({ is_current: true })
    .eq('id', academicYearId)
    .eq('school_id', session.school!.id);

  if (error) return { ok: false, error: 'Unable to update the current academic year.' };
  await logAndRevalidate(session.school!.id, session.userId, 'academic_year.set_current', 'academic_year', academicYearId);
  return { ok: true };
}

// --- Education levels ----------------------------------------------------

const nameSchema = z.object({ name: z.string().trim().min(2).max(100) });

export async function createEducationLevel(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = nameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Enter a valid name.' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('education_levels')
    .insert({ school_id: session.school!.id, name: parsed.data.name })
    .select('id')
    .single();

  if (error) return { ok: false, error: friendlyError(error, 'Unable to add the education level.') };
  await logAndRevalidate(session.school!.id, session.userId, 'education_level.create', 'education_level', data.id);
  return { ok: true };
}

export async function deleteEducationLevel(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('education_levels').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to remove — classes may still reference this level.' };
  await logAndRevalidate(session.school!.id, session.userId, 'education_level.delete', 'education_level', id);
  return { ok: true };
}

// --- Classes ----------------------------------------------------

const classSchema = z.object({ name: z.string().trim().min(1).max(50), education_level_id: z.string().uuid() });

export async function createClass(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = classSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose an education level and enter a class name.' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('classes')
    .insert({ school_id: session.school!.id, ...parsed.data })
    .select('id')
    .single();

  if (error) return { ok: false, error: friendlyError(error, 'Unable to create the class.') };
  await logAndRevalidate(session.school!.id, session.userId, 'class.create', 'class', data.id);
  return { ok: true };
}

export async function deleteClass(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('classes').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to remove — streams may still reference this class.' };
  await logAndRevalidate(session.school!.id, session.userId, 'class.delete', 'class', id);
  return { ok: true };
}

// --- Streams ----------------------------------------------------

const streamSchema = z.object({ name: z.string().trim().min(1).max(50), class_id: z.string().uuid() });

export async function createStream(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = streamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a class and enter a stream name.' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('streams')
    .insert({ school_id: session.school!.id, ...parsed.data })
    .select('id')
    .single();

  if (error) return { ok: false, error: friendlyError(error, 'Unable to create the stream.') };
  await logAndRevalidate(session.school!.id, session.userId, 'stream.create', 'stream', data.id);
  return { ok: true };
}

export async function deleteStream(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('streams').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to remove this stream.' };
  await logAndRevalidate(session.school!.id, session.userId, 'stream.delete', 'stream', id);
  return { ok: true };
}

// --- Subjects ----------------------------------------------------

const subjectSchema = z.object({ name: z.string().trim().min(1).max(100), code: z.string().trim().max(20).optional().or(z.literal('')) });

export async function createSubject(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = subjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Enter a valid subject name.' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('subjects')
    .insert({ school_id: session.school!.id, name: parsed.data.name, code: parsed.data.code || null })
    .select('id')
    .single();

  if (error) return { ok: false, error: friendlyError(error, 'Unable to add the subject.') };
  await logAndRevalidate(session.school!.id, session.userId, 'subject.create', 'subject', data.id);
  return { ok: true };
}

export async function deleteSubject(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('subjects').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to remove this subject.' };
  await logAndRevalidate(session.school!.id, session.userId, 'subject.delete', 'subject', id);
  return { ok: true };
}
