'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSchoolSession } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';
import { z } from 'zod';

const gradingSystemSchema = z.object({
  grading_system: z.enum(['percentage', 'letter', 'division']),
});

export async function updateGradingSystem(formData: FormData): Promise<ActionResult> {
  const session = await requireSchoolSession();
  const parsed = gradingSystemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a valid grading system.' };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('schools')
    .update({ grading_system: parsed.data.grading_system })
    .eq('id', session.school.id);

  if (error) return { ok: false, error: 'Unable to save the grading system.' };
  revalidatePath('/dashboard/setup');
  return { ok: true };
}

export async function advanceSetupStep(step: number, completed = false): Promise<ActionResult> {
  const session = await requireSchoolSession();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc('advance_setup_step', { p_step: step, p_completed: completed });
  if (error) {
    console.error('advanceSetupStep', error);
    return { ok: false, error: 'Unable to update setup progress.' };
  }

  revalidatePath('/dashboard/setup');
  revalidatePath('/dashboard');
  void session; // session fetched only to guarantee the caller belongs to a school
  return { ok: true };
}

/** Used by the wizard's own "Continue"/"Skip" buttons — advances then navigates. */
export async function goToNextSetupStep(currentStep: number): Promise<never> {
  await advanceSetupStep(currentStep);
  redirect(`/dashboard/setup?step=${Math.min(currentStep + 1, 8)}`);
}

export async function goToSetupStep(step: number): Promise<never> {
  redirect(`/dashboard/setup?step=${step}`);
}

export async function finishSetup(): Promise<never> {
  await advanceSetupStep(8, true);
  redirect('/dashboard');
}
