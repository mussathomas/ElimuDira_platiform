'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const schoolProfileSchema = z.object({
  name: z.string().trim().min(2, 'School name is too short').max(200),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  region: z.string().trim().max(100).optional().or(z.literal('')),
  district: z.string().trim().max(100).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  motto: z.string().trim().max(200).optional().or(z.literal('')),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateSchoolProfile(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');

  const parsed = schoolProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('schools')
    .update({
      name: parsed.data.name,
      address: parsed.data.address || null,
      region: parsed.data.region || null,
      district: parsed.data.district || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      motto: parsed.data.motto || null,
    })
    .eq('id', session.school!.id);

  if (error) {
    console.error('updateSchoolProfile', error);
    return { ok: false, error: 'Unable to save school information. Please try again.' };
  }

  await supabase.from('audit_logs').insert({
    school_id: session.school!.id,
    actor_id: session.userId,
    action: 'school.update_profile',
    resource_type: 'school',
    resource_id: session.school!.id,
    metadata: {},
  });

  revalidatePath('/dashboard/settings/school');
  revalidatePath('/dashboard/setup');
  return { ok: true };
}
