'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const topicSchema = z.object({
  subject_id: z.string().uuid(),
  class_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  target_lessons: z.coerce.number().int().min(1).max(100),
});

export async function createSyllabusTopic(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_syllabus');
  const parsed = topicSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a subject, class, year, and valid topic details.' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('syllabus_topics').insert({
    school_id: session.school!.id,
    ...parsed.data,
    description: parsed.data.description || null,
  }).select('id').single();
  if (error) return { ok: false, error: error.code === '23505' ? 'That topic already exists for this class and subject.' : 'Unable to create the topic.' };
  await supabase.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'syllabus_topic.create', resource_type: 'syllabus_topic', resource_id: data.id });
  revalidatePath('/dashboard/syllabus');
  revalidatePath('/dashboard/syllabus/topics');
  return { ok: true };
}

export async function deleteSyllabusTopic(id: string): Promise<ActionResult> {
  const session = await requirePermission('edit_syllabus');
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('syllabus_topics').delete().eq('id', id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to remove this topic.' };
  revalidatePath('/dashboard/syllabus');
  revalidatePath('/dashboard/syllabus/topics');
  return { ok: true };
}

export async function updateSyllabusProgress(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_syllabus');
  const parsed = z.object({ topic_id: z.string().uuid(), lessons_completed: z.coerce.number().int().min(0).max(1000), notes: z.string().trim().max(500).optional().or(z.literal('')) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Enter a valid lesson count.' };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('syllabus_progress').upsert({
    school_id: session.school!.id,
    topic_id: parsed.data.topic_id,
    lessons_completed: parsed.data.lessons_completed,
    notes: parsed.data.notes || null,
    updated_by: session.userId,
  }, { onConflict: 'topic_id' });
  if (error) return { ok: false, error: 'Unable to save syllabus progress.' };
  revalidatePath('/dashboard/syllabus');
  revalidatePath('/dashboard/syllabus/class');
  revalidatePath('/dashboard/syllabus/subject');
  return { ok: true };
}