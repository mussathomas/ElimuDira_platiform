'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission, requireSchoolSession } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

export async function sendSchoolNotification(formData: FormData): Promise<ActionResult> {
  await requirePermission('manage_notifications');
  const parsed = z.object({
    kind: z.enum(['notification', 'announcement']),
    title: z.string().trim().min(2).max(160),
    body: z.string().trim().min(1).max(5000),
    recipient_profile_id: z.string().uuid().optional().or(z.literal('')),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Enter a title and message, then choose who should receive it.' };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc('send_school_notification', {
    p_kind: parsed.data.kind,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_recipient_profile_id: parsed.data.recipient_profile_id || null,
  });
  if (error) {
    console.error('sendSchoolNotification', error);
    if (error.code === 'PGRST202' || error.code === '42883') {
      return { ok: false, error: 'Notification setup is incomplete. Apply the latest Supabase notification migrations and retry.' };
    }
    return { ok: false, error: error.message.includes('Not authorized') ? 'Your role cannot send notifications.' : 'Unable to send this message. Check the recipient and try again.' };
  }

  revalidatePath('/dashboard/notifications');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function markSchoolNotificationRead(formData: FormData): Promise<ActionResult> {
  const session = await requireSchoolSession();
  const parsed = z.object({ notification_id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a valid notification.' };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc('mark_school_notification_read', {
    p_notification_id: parsed.data.notification_id,
  });
  if (error) {
    console.error('markSchoolNotificationRead', error);
    if (error.code === 'PGRST202' || error.code === '42883') {
      return { ok: false, error: 'Notification setup is incomplete. Apply the latest Supabase notification migrations and retry.' };
    }
    return { ok: false, error: 'Unable to mark this notification as read.' };
  }

  revalidatePath('/dashboard/notifications');
  revalidatePath('/dashboard');
  return { ok: true };
}