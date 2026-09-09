'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const settingsSchema = z.object({
  whatsapp_enabled: z.coerce.boolean().optional(),
  whatsapp_provider: z.string().trim().max(40).optional().or(z.literal('')),
  whatsapp_sender_id: z.string().trim().max(80).optional().or(z.literal('')),
  sms_enabled: z.coerce.boolean().optional(),
  sms_provider: z.string().trim().max(40).optional().or(z.literal('')),
  sms_sender_id: z.string().trim().max(80).optional().or(z.literal('')),
});

async function logFieldUpdate(schoolId: string, actorId: string, field: string) {
  const supabase = await createServerSupabaseClient();
  await supabase.from('audit_logs').insert({
    school_id: schoolId,
    actor_id: actorId,
    action: `communication.update.${field}`,
    resource_type: 'communication_setting',
    resource_id: schoolId,
    metadata: { field },
  });
}

export async function updateCommunicationSettings(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Please review the communication settings and try again.' };

  const supabase = await createServerSupabaseClient();
  const payload = {
    school_id: session.school!.id,
    whatsapp_enabled: Boolean(parsed.data.whatsapp_enabled),
    whatsapp_provider: parsed.data.whatsapp_provider || null,
    whatsapp_sender_id: parsed.data.whatsapp_sender_id || null,
    sms_enabled: Boolean(parsed.data.sms_enabled),
    sms_provider: parsed.data.sms_provider || null,
    sms_sender_id: parsed.data.sms_sender_id || null,
  };

  const { error } = await supabase.from('communication_settings').upsert(payload, { onConflict: 'school_id' });
  if (error) {
    console.error('updateCommunicationSettings', error);
    return { ok: false, error: 'Unable to save communication settings.' };
  }

  await Promise.all([
    logFieldUpdate(session.school!.id, session.userId, 'whatsapp_enabled'),
    logFieldUpdate(session.school!.id, session.userId, 'whatsapp_provider'),
    logFieldUpdate(session.school!.id, session.userId, 'sms_enabled'),
    logFieldUpdate(session.school!.id, session.userId, 'sms_provider'),
  ]);

  revalidatePath('/dashboard/settings/communication');
  return { ok: true };
}

const whatsappCredentialSchema = z.object({
  whatsapp_api_token: z.string().trim().min(8).max(200),
});

const smsCredentialSchema = z.object({
  sms_api_key: z.string().trim().min(8).max(200),
});

export async function setWhatsappCredentials(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = whatsappCredentialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Enter a valid WhatsApp API token.' };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('communication_credentials')
    .upsert({ school_id: session.school!.id, whatsapp_api_token: parsed.data.whatsapp_api_token }, { onConflict: 'school_id' });

  if (error) {
    console.error('setWhatsappCredentials', error);
    return { ok: false, error: 'Unable to save WhatsApp credentials.' };
  }

  await logFieldUpdate(session.school!.id, session.userId, 'whatsapp_api_token');
  revalidatePath('/dashboard/settings/communication');
  return { ok: true };
}

export async function setSmsCredentials(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('edit_settings');
  const parsed = smsCredentialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Enter a valid SMS API key.' };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('communication_credentials')
    .upsert({ school_id: session.school!.id, sms_api_key: parsed.data.sms_api_key }, { onConflict: 'school_id' });

  if (error) {
    console.error('setSmsCredentials', error);
    return { ok: false, error: 'Unable to save SMS credentials.' };
  }

  await logFieldUpdate(session.school!.id, session.userId, 'sms_api_key');
  revalidatePath('/dashboard/settings/communication');
  return { ok: true };
}
