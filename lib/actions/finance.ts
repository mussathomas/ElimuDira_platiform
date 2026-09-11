'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const assessmentSchema = z.object({
  class_id: z.string().uuid('Choose a valid class.'),
  student_id: z.string().uuid('Choose a valid student.'),
  fee_structure_id: z.string().uuid().optional().or(z.literal('')),
  academic_year_id: z.string().uuid().optional().or(z.literal('')),
  description: z.string().trim().max(160).optional().or(z.literal('')),
  amount: z.coerce.number().positive('Amount must be greater than zero.').optional(),
  due_date: z.string().optional().or(z.literal('')),
});

const paymentSchema = z.object({
  class_id: z.string().uuid('Choose a valid class.'),
  student_id: z.string().uuid('Choose a valid student.'),
  assessment_id: z.string().uuid('Choose a valid fee assessment.'),
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  payment_date: z.string().min(1, 'Choose a payment date.'),
  method: z.enum(['cash', 'bank', 'mobile_money', 'card', 'other']),
  reference: z.string().trim().max(80).optional().or(z.literal('')),
  notes: z.string().trim().max(240).optional().or(z.literal('')),
});

const structureSchema = z.object({
  class_id: z.string().uuid().optional().or(z.literal('')),
  academic_year_id: z.string().uuid().optional().or(z.literal('')),
  name: z.string().trim().min(2, 'Enter a fee name.').max(160),
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  due_date: z.string().optional().or(z.literal('')),
});

export async function createFeeStructure(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('create_payment');
  const parsed = structureSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the fee structure.' };
  const supabase = await createServerSupabaseClient();
  if (parsed.data.class_id) {
    const { data } = await supabase.from('classes').select('id').eq('id', parsed.data.class_id).eq('school_id', session.school!.id).maybeSingle();
    if (!data) return { ok: false, error: 'Class not found in this school.' };
  }
  const { data: structure, error } = await supabase.from('fee_structures').insert({ school_id: session.school!.id, class_id: parsed.data.class_id || null, academic_year_id: parsed.data.academic_year_id || null, name: parsed.data.name, amount: parsed.data.amount, due_date: parsed.data.due_date || null, created_by: session.userId }).select('id').single();
  if (error) return { ok: false, error: 'Unable to create the fee structure.' };
  await supabase.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'finance.structure.create', resource_type: 'fee_structure', resource_id: structure.id });
  revalidatePath('/dashboard/finance');
  return { ok: true };
}

export async function createFeeAssessment(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('create_payment');
  const parsed = assessmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the fee details.' };

  const supabase = await createServerSupabaseClient();
  const { data: student } = await supabase.from('students').select('id, class_id').eq('id', parsed.data.student_id).eq('class_id', parsed.data.class_id).eq('school_id', session.school!.id).maybeSingle();
  if (!student) return { ok: false, error: 'Student not found in this school.' };
  let structure: { id: string; name: string; amount: number; due_date: string | null } | null = null;
  if (parsed.data.fee_structure_id) {
    const { data } = await supabase.from('fee_structures').select('id, name, amount, due_date, class_id').eq('id', parsed.data.fee_structure_id).eq('school_id', session.school!.id).eq('active', true).maybeSingle();
    if (!data || (data.class_id && data.class_id !== parsed.data.class_id)) return { ok: false, error: 'Fee structure is not available for this class.' };
    structure = data as typeof structure;
  }
  if (!structure && (!parsed.data.description || !parsed.data.amount)) return { ok: false, error: 'Enter a custom fee description and amount, or choose a fee structure.' };
  if (parsed.data.academic_year_id) {
    const { data: year } = await supabase.from('academic_years').select('id').eq('id', parsed.data.academic_year_id).eq('school_id', session.school!.id).maybeSingle();
    if (!year) return { ok: false, error: 'Academic year not found in this school.' };
  }

  const { data: assessment, error } = await supabase.from('fee_assessments').insert({
    school_id: session.school!.id,
    student_id: parsed.data.student_id,
    academic_year_id: parsed.data.academic_year_id || null,
    fee_structure_id: structure?.id ?? null,
    description: structure?.name ?? parsed.data.description,
    amount: structure?.amount ?? parsed.data.amount,
    due_date: parsed.data.due_date || structure?.due_date || null,
    created_by: session.userId,
  }).select('id').single();
  if (error) {
    console.error('createFeeAssessment', error);
    return { ok: false, error: 'Unable to create the fee assessment.' };
  }
  await supabase.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'finance.assessment.create', resource_type: 'fee_assessment', resource_id: assessment.id });
  revalidatePath('/dashboard/finance');
  return { ok: true };
}

export async function recordPayment(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('create_payment');
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the payment details.' };

  const supabase = await createServerSupabaseClient();
  const { data: assessment } = await supabase.from('fee_assessments').select('id, student_id, amount').eq('id', parsed.data.assessment_id).eq('student_id', parsed.data.student_id).eq('school_id', session.school!.id).maybeSingle();
  if (!assessment) return { ok: false, error: 'Fee assessment not found in this school.' };
  const { data: student } = await supabase.from('students').select('id').eq('id', parsed.data.student_id).eq('class_id', parsed.data.class_id).eq('school_id', session.school!.id).maybeSingle();
  if (!student) return { ok: false, error: 'Student is not in the selected class.' };
  const { data: paidRows } = await supabase.from('fee_payments').select('amount').eq('assessment_id', assessment.id).eq('school_id', session.school!.id);
  const paid = (paidRows ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  if (parsed.data.amount > Number(assessment.amount) - paid + 0.005) return { ok: false, error: 'Payment is greater than the remaining balance.' };

  const { data: payment, error } = await supabase.from('fee_payments').insert({
    school_id: session.school!.id,
    assessment_id: assessment.id,
    student_id: assessment.student_id,
    amount: parsed.data.amount,
    payment_date: parsed.data.payment_date,
    method: parsed.data.method,
    reference: parsed.data.reference || null,
    notes: parsed.data.notes || null,
    received_by: session.userId,
  }).select('id').single();
  if (error) {
    console.error('recordPayment', error);
    return { ok: false, error: 'Unable to record the payment.' };
  }
  await supabase.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'finance.payment.create', resource_type: 'fee_payment', resource_id: payment.id });
  revalidatePath('/dashboard/finance');
  return { ok: true };
}
