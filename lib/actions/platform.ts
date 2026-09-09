'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';
import type { SchoolStatus } from '@/types/database';

const VALID_TRANSITIONS: SchoolStatus[] = ['active', 'suspended', 'deactivated'];

export async function setSchoolStatus(schoolId: string, status: SchoolStatus): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (!VALID_TRANSITIONS.includes(status)) return { ok: false, error: 'Invalid status.' };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('schools').update({ status }).eq('id', schoolId);

  if (error) {
    console.error('setSchoolStatus', error);
    return { ok: false, error: 'Unable to update this school\u2019s status.' };
  }

  await supabase.from('audit_logs').insert({
    school_id: schoolId,
    actor_id: session.userId,
    action: `school.${status}`,
    resource_type: 'school',
    resource_id: schoolId,
  });

  revalidatePath('/platform/schools');
  revalidatePath('/platform');
  return { ok: true };
}
