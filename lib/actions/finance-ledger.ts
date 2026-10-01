'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const idSchema = z.string().uuid();

async function auditFinanceAction(
  schoolId: string,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown>
) {
  const supabase = await createServerSupabaseClient();
  await supabase.from('audit_logs').insert({
    school_id: schoolId,
    actor_id: actorId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata,
  });
}

function revalidateFinance() {
  revalidatePath('/dashboard/finance');
  revalidatePath('/dashboard/finance/fee-structures');
  revalidatePath('/dashboard/finance/charges');
  revalidatePath('/dashboard/finance/payments');
  revalidatePath('/dashboard/finance/outstanding');
  revalidatePath('/dashboard/finance/reports');
}

export async function createFinanceCategory(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('manage_fee_structures');
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Enter a fee category name.' };
  const supabase = await createServerSupabaseClient();
  const { data: category, error } = await supabase.from('finance_fee_categories')
    .insert({ school_id: session.school!.id, name: parsed.data.name, created_by: session.userId })
    .select('id').single();
  if (error) return { ok: false, error: error.code === '23505' ? 'That fee category already exists.' : 'Unable to create the fee category.' };
  revalidateFinance();
  return { ok: true };
}

const feeItemSchema = z.object({
  category_id: idSchema,
  name: z.string().trim().min(1).max(100),
  amount: z.coerce.number().positive().max(1000000000),
  due_date: z.string().optional().or(z.literal('')),
  installment_count: z.coerce.number().int().min(1).max(24),
});

export async function createFinanceFeeStructure(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('manage_fee_structures');
  let items: unknown;
  try { items = JSON.parse(String(formData.get('items') ?? '[]')); } catch { return { ok: false, error: 'Fee items could not be read. Please reload the form.' }; }
  const parsed = z.object({
    academic_year_id: idSchema,
    class_id: idSchema.optional().or(z.literal('')),
    education_level_id: idSchema.optional().or(z.literal('')),
    name: z.string().trim().min(2).max(120),
    items: z.array(feeItemSchema).min(1).max(40),
  }).safeParse({ ...Object.fromEntries(formData), items });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the fee structure.' };

  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const categoryIds = [...new Set(parsed.data.items.map((item) => item.category_id))];
  const [{ data: year }, { data: categories }, { data: schoolClass }, { data: level }] = await Promise.all([
    supabase.from('academic_years').select('id').eq('id', parsed.data.academic_year_id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('finance_fee_categories').select('id').eq('school_id', schoolId).eq('active', true).in('id', categoryIds),
    parsed.data.class_id ? supabase.from('classes').select('id').eq('id', parsed.data.class_id).eq('school_id', schoolId).maybeSingle() : Promise.resolve({ data: null }),
    parsed.data.education_level_id ? supabase.from('education_levels').select('id').eq('id', parsed.data.education_level_id).eq('school_id', schoolId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!year || categories?.length !== categoryIds.length || (parsed.data.class_id && !schoolClass) || (parsed.data.education_level_id && !level)) {
    return { ok: false, error: 'Choose an academic year, class/level, and categories from this school.' };
  }
  const total = parsed.data.items.reduce((sum, item) => sum + item.amount, 0);
  const { data: structureId, error } = await supabase.rpc('create_finance_fee_structure', {
    p_academic_year_id: parsed.data.academic_year_id,
    p_class_id: parsed.data.class_id || null,
    p_education_level_id: parsed.data.education_level_id || null,
    p_name: parsed.data.name,
    p_amount: total,
    p_items: parsed.data.items.map((item) => ({
      fee_category_id: item.category_id,
      name: item.name,
      amount: item.amount,
      due_date: item.due_date || null,
      installment_count: item.installment_count,
    })),
  });
  if (error || !structureId) return { ok: false, error: error?.message.includes('closed') ? error.message : 'Unable to create the fee structure.' };
  revalidateFinance();
  return { ok: true };
}

export async function setFinanceFeeStructureActive(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('manage_fee_structures');
  const parsed = z.object({ structure_id: idSchema, active: z.enum(['true', 'false']) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a fee structure and status.' };
  const supabase = await createServerSupabaseClient();
  const { data: previous } = await supabase.from('fee_structures').select('id, name, active, academic_year_id').eq('id', parsed.data.structure_id).eq('school_id', session.school!.id).maybeSingle();
  if (!previous) return { ok: false, error: 'Fee structure not found.' };
  const active = parsed.data.active === 'true';
  const { error } = await supabase.from('fee_structures').update({ active }).eq('id', previous.id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: error.message.includes('closed') ? error.message : 'Unable to change fee structure status.' };
  revalidateFinance();
  return { ok: true };
}

function installmentDueDate(dueDate: string | null, installmentNumber: number) {
  if (!dueDate || installmentNumber === 1) return dueDate;
  const date = new Date(`${dueDate}T12:00:00Z`);
  const targetMonth = date.getUTCMonth() + installmentNumber - 1;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(targetMonth);
  date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  return date.toISOString().slice(0, 10);
}

export async function applyFeeStructureToClass(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('create_student_charges');
  const parsed = z.object({ structure_id: idSchema, class_id: idSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a fee structure and class.' };
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const [{ data: structure }, { data: schoolClass }] = await Promise.all([
    supabase.from('fee_structures').select('id, name, academic_year_id, class_id, education_level_id, active').eq('id', parsed.data.structure_id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('classes').select('id, education_level_id').eq('id', parsed.data.class_id).eq('school_id', schoolId).maybeSingle(),
  ]);
  if (!structure || !schoolClass || !structure.active || (structure.class_id && structure.class_id !== schoolClass.id) || (structure.education_level_id && structure.education_level_id !== schoolClass.education_level_id)) {
    return { ok: false, error: 'The selected structure is not active for this class.' };
  }
  const [{ data: enrollments }, { data: items }] = await Promise.all([
    supabase.from('student_enrollments').select('id, student_id').eq('school_id', schoolId).eq('academic_year_id', structure.academic_year_id).eq('class_id', schoolClass.id).eq('status', 'active'),
    supabase.from('fee_structure_items').select('id, fee_category_id, name, amount, due_date, installment_count').eq('school_id', schoolId).eq('fee_structure_id', structure.id).order('created_at'),
  ]);
  if (!enrollments?.length) return { ok: false, error: 'No active student enrollments were found in this class and academic year.' };
  if (!items?.length) return { ok: false, error: 'This structure has no fee items.' };

  const charges = enrollments.flatMap((enrollment) => items.flatMap((item) => {
    const installmentCount = Number(item.installment_count);
    const totalCents = Math.round(Number(item.amount) * 100);
    const baseCents = Math.floor(totalCents / installmentCount);
    return Array.from({ length: installmentCount }, (_, index) => {
      const installmentNumber = index + 1;
      const installmentCents = installmentNumber === installmentCount ? totalCents - baseCents * (installmentCount - 1) : baseCents;
      return {
        school_id: schoolId,
        student_id: enrollment.student_id,
        student_enrollment_id: enrollment.id,
        academic_year_id: structure.academic_year_id,
        fee_structure_id: structure.id,
        fee_structure_item_id: item.id,
        fee_category_id: item.fee_category_id,
        installment_number: installmentNumber,
        description: installmentCount > 1 ? `${item.name} (${installmentNumber}/${installmentCount})` : item.name,
        amount: installmentCents / 100,
        due_date: installmentDueDate(item.due_date, installmentNumber),
        created_by: session.userId,
      };
    });
  }));

  for (let start = 0; start < charges.length; start += 500) {
    const { error } = await supabase.from('fee_assessments').upsert(charges.slice(start, start + 500), {
      onConflict: 'school_id,student_enrollment_id,fee_structure_item_id,installment_number',
      ignoreDuplicates: true,
    });
    if (error) return { ok: false, error: 'Unable to apply all structure items. Review the class ledger before retrying.' };
  }
  await auditFinanceAction(schoolId, session.userId, 'finance.charges.apply_structure', 'fee_structure', structure.id, {
    academic_year_id: structure.academic_year_id, class_id: schoolClass.id, enrollment_count: enrollments.length, charge_count: charges.length,
  });
  revalidateFinance();
  return { ok: true };
}

export async function createStudentCharge(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('create_student_charges');
  const parsed = z.object({
    enrollment_id: idSchema,
    fee_category_id: idSchema,
    description: z.string().trim().min(2).max(160),
    amount: z.coerce.number().positive().max(1000000000),
    due_date: z.string().optional().or(z.literal('')),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the charge details.' };
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const [{ data: enrollment }, { data: category }] = await Promise.all([
    supabase.from('student_enrollments').select('id, student_id, academic_year_id').eq('id', parsed.data.enrollment_id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('finance_fee_categories').select('id').eq('id', parsed.data.fee_category_id).eq('school_id', schoolId).eq('active', true).maybeSingle(),
  ]);
  if (!enrollment || !category) return { ok: false, error: 'Choose an enrollment and active fee category from this school.' };
  const { data: charge, error } = await supabase.from('fee_assessments').insert({
    school_id: schoolId,
    student_id: enrollment.student_id,
    student_enrollment_id: enrollment.id,
    academic_year_id: enrollment.academic_year_id,
    fee_category_id: category.id,
    description: parsed.data.description,
    amount: parsed.data.amount,
    due_date: parsed.data.due_date || null,
    created_by: session.userId,
  }).select('id').single();
  if (error || !charge) return { ok: false, error: 'Unable to create the charge.' };
  revalidateFinance();
  return { ok: true };
}

export async function carryForwardPreviousYearBalance(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('manage_finance_adjustments');
  const parsed = z.object({ enrollment_id: idSchema, source_academic_year_id: idSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a current enrollment and previous academic year.' };
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const [{ data: enrollment }, { data: sourceYear }, { data: category }] = await Promise.all([
    supabase.from('student_enrollments').select('id, student_id, academic_year_id').eq('id', parsed.data.enrollment_id).eq('school_id', schoolId).eq('status', 'active').maybeSingle(),
    supabase.from('academic_years').select('id, name, start_date').eq('id', parsed.data.source_academic_year_id).eq('school_id', schoolId).maybeSingle(),
    supabase.from('finance_fee_categories').select('id').eq('school_id', schoolId).eq('name', 'Previous-year balance').maybeSingle(),
  ]);
  if (!enrollment || !sourceYear || !category) return { ok: false, error: 'Choose valid school enrollments and a previous year.' };
  if (enrollment.academic_year_id === sourceYear.id) return { ok: false, error: 'Choose a different, earlier academic year.' };
  const [{ data: targetYear }, { data: balance }, { data: existing }] = await Promise.all([
    supabase.from('academic_years').select('id, name, start_date').eq('id', enrollment.academic_year_id).eq('school_id', schoolId).maybeSingle(),
    supabase.rpc('finance_student_year_balance', { p_student_id: enrollment.student_id, p_academic_year_id: sourceYear.id }),
    supabase.from('fee_assessments').select('id').eq('school_id', schoolId).eq('student_enrollment_id', enrollment.id).eq('source_academic_year_id', sourceYear.id).maybeSingle(),
  ]);
  if (!targetYear || sourceYear.start_date >= targetYear.start_date) return { ok: false, error: 'The source year must be earlier than the student enrollment year.' };
  if (existing) return { ok: false, error: 'This previous-year balance has already been carried forward.' };
  if (balance === null || balance === undefined || Number(balance) <= 0.005) return { ok: false, error: 'There is no outstanding balance to carry forward for that year.' };

  const { data: charge, error } = await supabase.from('fee_assessments').insert({
    school_id: schoolId,
    student_id: enrollment.student_id,
    student_enrollment_id: enrollment.id,
    academic_year_id: enrollment.academic_year_id,
    source_academic_year_id: sourceYear.id,
    fee_category_id: category.id,
    description: `Previous-year balance (${sourceYear.name})`,
    amount: Number(balance),
    created_by: session.userId,
  }).select('id').single();
  if (error || !charge) return { ok: false, error: error?.code === '23505' ? 'This previous-year balance has already been carried forward.' : 'Unable to carry forward this balance.' };
  revalidateFinance();
  return { ok: true };
}

export async function recordFinancePayment(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('record_payments');
  const parsed = z.object({
    student_id: idSchema,
    academic_year_id: idSchema,
    amount: z.coerce.number().positive().max(1000000000),
    payment_date: z.string().min(1),
    method: z.enum(['cash', 'bank', 'mobile_money', 'other']),
    reference: z.string().trim().max(80).optional().or(z.literal('')),
    notes: z.string().trim().max(240).optional().or(z.literal('')),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Check the payment details.' };
  const allocations = [...formData.entries()].flatMap(([key, value]) => {
    if (!key.startsWith('allocation:') || !String(value).trim()) return [];
    const assessmentId = key.slice('allocation:'.length);
    const amount = Number(value);
    return idSchema.safeParse(assessmentId).success && Number.isFinite(amount) && amount > 0 ? [{ assessment_id: assessmentId, amount }] : [];
  });
  if (!allocations.length) return { ok: false, error: 'Allocate the payment to at least one outstanding charge.' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('record_finance_payment', {
    p_student_id: parsed.data.student_id,
    p_academic_year_id: parsed.data.academic_year_id,
    p_amount: parsed.data.amount,
    p_payment_date: parsed.data.payment_date,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference || null,
    p_notes: parsed.data.notes || null,
    p_allocations: allocations,
  });
  if (error) return { ok: false, error: error.message.includes('closed') ? error.message : 'Unable to record the payment. Check allocation amounts and try again.' };
  const payment = Array.isArray(data) ? data[0] : data;
  if (!payment?.payment_id) return { ok: false, error: 'The payment could not be confirmed.' };
  revalidateFinance();
  return { ok: true };
}

export async function requestFinanceAdjustment(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('manage_finance_adjustments');
  const parsed = z.object({
    assessment_id: idSchema,
    adjustment_type: z.enum(['additional_charge', 'discount', 'waiver', 'correction']),
    direction: z.enum(['debit', 'credit']).optional(),
    amount: z.coerce.number().positive().max(1000000000),
    reason: z.string().trim().min(5).max(300),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Provide a charge, adjustment type, amount, and reason.' };
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const { data: charge } = await supabase.from('fee_assessments').select('id, student_id, student_enrollment_id, academic_year_id, fee_category_id').eq('id', parsed.data.assessment_id).eq('school_id', schoolId).maybeSingle();
  if (!charge || !charge.student_enrollment_id || !charge.academic_year_id) return { ok: false, error: 'Charge not found in this school or has no assigned academic year.' };
  const sign = parsed.data.adjustment_type === 'discount' || parsed.data.adjustment_type === 'waiver' || (parsed.data.adjustment_type === 'correction' && parsed.data.direction === 'credit') ? -1 : 1;
  const { data: adjustment, error } = await supabase.from('finance_adjustments').insert({
    school_id: schoolId,
    academic_year_id: charge.academic_year_id,
    student_id: charge.student_id,
    student_enrollment_id: charge.student_enrollment_id,
    assessment_id: charge.id,
    fee_category_id: charge.fee_category_id,
    adjustment_type: parsed.data.adjustment_type,
    amount: parsed.data.amount * sign,
    reason: parsed.data.reason,
    created_by: session.userId,
  }).select('id').single();
  if (error || !adjustment) return { ok: false, error: error?.message.includes('closed') ? error.message : 'Unable to request the adjustment.' };
  revalidateFinance();
  return { ok: true };
}

export async function requestPaymentReversal(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('manage_finance_adjustments');
  const parsed = z.object({
    payment_id: idSchema,
    amount: z.coerce.number().positive().max(1000000000),
    reason: z.string().trim().min(5).max(300),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a payment and provide an amount and reason.' };
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const [{ data: payment }, { data: allocations }, { data: existingReversals }] = await Promise.all([
    supabase.from('fee_payments').select('id, student_id, academic_year_id, student_enrollment_id, amount, status').eq('id', parsed.data.payment_id).eq('school_id', schoolId).eq('legacy_year_unassigned', false).maybeSingle(),
    supabase.from('fee_payment_allocations').select('assessment_id, amount, fee_assessments(fee_category_id)').eq('payment_id', parsed.data.payment_id).eq('school_id', schoolId).order('allocated_at'),
    supabase.from('finance_adjustments').select('assessment_id, amount').eq('payment_id', parsed.data.payment_id).eq('school_id', schoolId).eq('adjustment_type', 'payment_reversal').in('status', ['pending', 'approved']),
  ]);
  if (!payment || !allocations?.length || payment.status === 'reversed') return { ok: false, error: 'Completed payment not found or already fully reversed.' };
  const alreadyRequested = (existingReversals ?? []).reduce((sum, reversal) => sum + Math.abs(Number(reversal.amount)), 0);
  if (alreadyRequested + parsed.data.amount > Number(payment.amount) + 0.005) return { ok: false, error: 'Total pending and approved reversals cannot exceed the original receipt.' };

  const reversedByCharge = new Map<string, number>();
  for (const reversal of existingReversals ?? []) {
    if (reversal.assessment_id) reversedByCharge.set(reversal.assessment_id, (reversedByCharge.get(reversal.assessment_id) ?? 0) + Math.abs(Number(reversal.amount)));
  }
  let remaining = Math.round(parsed.data.amount * 100);
  const reversalRows = allocations.flatMap((allocation) => {
    if (!remaining) return [];
    const allocationAmount = Math.round(Number(allocation.amount) * 100);
    const alreadyReversed = Math.round((reversedByCharge.get(allocation.assessment_id) ?? 0) * 100);
    const amountCents = Math.min(remaining, Math.max(allocationAmount - alreadyReversed, 0));
    remaining -= amountCents;
    if (!amountCents) return [];
    const charge = Array.isArray(allocation.fee_assessments) ? allocation.fee_assessments[0] : allocation.fee_assessments;
    return [{
      school_id: schoolId,
      academic_year_id: payment.academic_year_id,
      student_id: payment.student_id,
      student_enrollment_id: payment.student_enrollment_id,
      assessment_id: allocation.assessment_id,
      payment_id: payment.id,
      fee_category_id: charge?.fee_category_id ?? null,
      adjustment_type: 'payment_reversal' as const,
      amount: amountCents / 100,
      reason: parsed.data.reason,
      created_by: session.userId,
    }];
  });
  if (remaining) return { ok: false, error: 'The requested amount cannot be matched to this receipt’s original allocations.' };
  const { data: reversals, error } = await supabase.from('finance_adjustments').insert(reversalRows).select('id');
  if (error) return { ok: false, error: error.message.includes('closed') ? error.message : 'Unable to request the payment reversal.' };
  revalidateFinance();
  return { ok: true };
}

export async function reviewFinanceAdjustment(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('approve_finance_corrections');
  const parsed = z.object({ adjustment_id: idSchema, decision: z.enum(['approved', 'rejected']) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose an adjustment and a decision.' };
  const supabase = await createServerSupabaseClient();
  const { data: adjustment } = await supabase.from('finance_adjustments').select('id, adjustment_type, amount, reason, status, assessment_id').eq('id', parsed.data.adjustment_id).eq('school_id', session.school!.id).eq('status', 'pending').maybeSingle();
  if (!adjustment) return { ok: false, error: 'This adjustment is no longer pending.' };
  const { error } = await supabase.from('finance_adjustments').update({ status: parsed.data.decision, approved_by: session.userId, approved_at: new Date().toISOString() }).eq('id', adjustment.id).eq('school_id', session.school!.id).eq('status', 'pending');
  if (error) return { ok: false, error: 'Unable to review this adjustment.' };
  revalidateFinance();
  return { ok: true };
}

export async function reviewFinanceAdjustmentForm(formData: FormData): Promise<void> {
  const result = await reviewFinanceAdjustment(formData);
  if (!result.ok) throw new Error(result.error);
}

export async function closeFinanceYear(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('close_financial_year');
  const parsed = z.object({ academic_year_id: idSchema, reason: z.string().trim().min(5).max(300) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Select an academic year and provide a closure reason.' };
  const supabase = await createServerSupabaseClient();
  const { data: year } = await supabase.from('academic_years').select('id, name').eq('id', parsed.data.academic_year_id).eq('school_id', session.school!.id).maybeSingle();
  if (!year) return { ok: false, error: 'Academic year not found.' };
  const { data: existingClosure } = await supabase.from('finance_year_closures').select('id').eq('school_id', session.school!.id).eq('academic_year_id', year.id).is('reopened_at', null).maybeSingle();
  if (existingClosure) return { ok: false, error: 'This finance year is already closed.' };
  const { error } = await supabase.from('finance_year_closures').insert({
    school_id: session.school!.id,
    academic_year_id: year.id,
    closed_by: session.userId,
    closed_at: new Date().toISOString(),
    reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: 'Unable to close this finance year.' };
  revalidateFinance();
  return { ok: true };
}

export async function reopenFinanceYear(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('close_financial_year');
  const parsed = z.object({ academic_year_id: idSchema, reason: z.string().trim().min(5).max(300) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Select an academic year and provide a reopening reason.' };
  const supabase = await createServerSupabaseClient();
  const { data: closure } = await supabase.from('finance_year_closures').select('id, academic_year_id, closed_at, reason, reopened_at').eq('school_id', session.school!.id).eq('academic_year_id', parsed.data.academic_year_id).is('reopened_at', null).maybeSingle();
  if (!closure) return { ok: false, error: 'This finance year is not closed.' };
  const reopenedAt = new Date().toISOString();
  const { error } = await supabase.from('finance_year_closures').update({ reopened_by: session.userId, reopened_at: reopenedAt, reopen_reason: parsed.data.reason }).eq('id', closure.id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to reopen this finance year.' };
  revalidateFinance();
  return { ok: true };
}