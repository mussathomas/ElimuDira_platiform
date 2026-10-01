import 'server-only';
import { requireAnyPermission, requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export type FinanceSummary = {
  totalCharges: number;
  totalAdjustments: number;
  totalAllocatedPayments: number;
  totalOutstanding: number;
  studentsWithBalance: number;
  paymentsToday: number;
};

export type StatementTransaction = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  receiptNumber: string | null;
};

export type StudentFinancialStatement = {
  student: { id: string; admissionNumber: string; name: string };
  academicYear: { id: string; name: string };
  enrollment: { className: string | null; streamName: string | null };
  totalCharges: number;
  totalAdjustments: number;
  totalPaid: number;
  outstanding: number;
  charges: { id: string; description: string; amount: number; adjustments: number; paid: number; balance: number; dueDate: string | null }[];
  transactions: (StatementTransaction & { balance: number })[];
};

export type OutstandingFinanceRow = {
  studentId: string;
  admissionNumber: string;
  studentName: string;
  classId: string | null;
  className: string | null;
  totalCharges: number;
  totalAdjustments: number;
  totalPaid: number;
  balance: number;
  totalCount: number;
};

const adjustmentEffect = (type: string, amount: number) => {
  if (type === 'additional_charge' || type === 'payment_reversal') return Math.abs(amount);
  if (type === 'discount' || type === 'waiver') return -Math.abs(amount);
  return amount;
};

export async function getFinanceYearSummary(academicYearId: string, classId: string | null = null): Promise<FinanceSummary> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('finance_year_summary', {
    p_academic_year_id: academicYearId,
    p_class_id: classId,
  });
  if (error) throw new Error('Unable to load the finance summary. Apply the finance ledger migration and try again.');
  const row = Array.isArray(data) ? data[0] : data;
  return {
    totalCharges: Number(row?.total_charges ?? 0),
    totalAdjustments: Number(row?.total_adjustments ?? 0),
    totalAllocatedPayments: Number(row?.total_allocated_payments ?? 0),
    totalOutstanding: Number(row?.total_outstanding ?? 0),
    studentsWithBalance: Number(row?.students_with_balance ?? 0),
    paymentsToday: Number(row?.payments_today ?? 0),
  };
}

export async function getOutstandingFinanceRows({
  academicYearId,
  classId,
  search,
  page,
  categoryId,
  minBalance,
  maxBalance,
  paymentStatus,
  pageSize = 50,
}: {
  academicYearId: string;
  classId?: string | null;
  search?: string;
  page: number;
  categoryId?: string | null;
  minBalance?: number | null;
  maxBalance?: number | null;
  paymentStatus?: 'all' | 'unpaid' | 'partial' | null;
  pageSize?: number;
}) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('finance_outstanding_report', {
    p_academic_year_id: academicYearId,
    p_class_id: classId || null,
    p_search: search?.trim() || null,
    p_page: page,
    p_page_size: pageSize,
    p_fee_category_id: categoryId || null,
    p_min_balance: minBalance ?? null,
    p_max_balance: maxBalance ?? null,
    p_payment_status: paymentStatus ?? null,
  });
  if (error) throw new Error('Unable to load outstanding balances. Apply the finance ledger migration and try again.');
  const rows = data ?? [];
  return {
    rows: rows.map((row: any): OutstandingFinanceRow => ({
      studentId: row.student_id as string,
      admissionNumber: row.admission_number as string,
      studentName: row.student_name as string,
      classId: row.class_id as string | null,
      className: row.class_name as string | null,
      totalCharges: Number(row.total_charges ?? 0),
      totalAdjustments: Number(row.total_adjustments ?? 0),
      totalPaid: Number(row.total_paid ?? 0),
      balance: Number(row.balance ?? 0),
      totalCount: Number(row.total_count ?? 0),
    })),
    totalCount: Number(rows[0]?.total_count ?? 0),
  };
}

export async function getStudentOpenChargeBalances(studentId: string, academicYearId: string) {
  const session = await requireAnyPermission(['view_finance', 'record_payments']);
  const supabase = await createServerSupabaseClient();
  const { data: enrollment } = await supabase.from('student_enrollments').select('id')
    .eq('school_id', session.school!.id).eq('student_id', studentId).eq('academic_year_id', academicYearId).maybeSingle();
  if (!enrollment) return [];
  const { data: charges, error } = await supabase.from('fee_assessments').select('id, description, amount, due_date')
    .eq('school_id', session.school!.id).eq('student_id', studentId).eq('student_enrollment_id', enrollment.id)
    .eq('academic_year_id', academicYearId).eq('legacy_year_unassigned', false);
  if (error || !charges?.length) return [];
  const chargeIds = charges.map((charge) => charge.id);
  const [{ data: allocations }, { data: adjustments }] = await Promise.all([
    supabase.from('fee_payment_allocations').select('assessment_id, amount').eq('school_id', session.school!.id).in('assessment_id', chargeIds),
    supabase.from('finance_adjustments').select('assessment_id, adjustment_type, amount').eq('school_id', session.school!.id).eq('status', 'approved').in('assessment_id', chargeIds),
  ]);
  const paidByCharge = new Map<string, number>();
  for (const allocation of allocations ?? []) paidByCharge.set(allocation.assessment_id, (paidByCharge.get(allocation.assessment_id) ?? 0) + Number(allocation.amount));
  const adjustmentsByCharge = new Map<string, number>();
  for (const adjustment of adjustments ?? []) {
    if (!adjustment.assessment_id) continue;
    adjustmentsByCharge.set(adjustment.assessment_id, (adjustmentsByCharge.get(adjustment.assessment_id) ?? 0) + adjustmentEffect(adjustment.adjustment_type, Number(adjustment.amount)));
  }
  return charges.map((charge) => ({
    id: charge.id,
    description: charge.description,
    dueDate: charge.due_date,
    balance: Math.max(0, Number(charge.amount) + (adjustmentsByCharge.get(charge.id) ?? 0) - (paidByCharge.get(charge.id) ?? 0)),
  })).filter((charge) => charge.balance > 0.005);
}

export async function getStudentFinancialStatement(studentId: string, academicYearId: string): Promise<StudentFinancialStatement | null> {
  const session = await requirePermission('view_financial_statements');
  const supabase = await createServerSupabaseClient();
  const sessionQuery = await supabase
    .from('student_enrollments')
    .select('id, academic_year_id, class_id, stream_id, students!inner(id, admission_number, first_name, last_name), academic_years!inner(id, name), classes(name), streams(name)')
    .eq('student_id', studentId)
    .eq('academic_year_id', academicYearId)
    .eq('school_id', session.school!.id)
    .maybeSingle();
  if (sessionQuery.error || !sessionQuery.data) return null;

  const enrollment = sessionQuery.data as any;
  const schoolId = session.school!.id;
  const { data: charges, error: chargeError } = await supabase
    .from('fee_assessments')
    .select('id, description, amount, due_date, created_at')
    .eq('school_id', schoolId)
    .eq('student_id', studentId)
    .eq('student_enrollment_id', enrollment.id)
    .eq('academic_year_id', academicYearId)
    .eq('legacy_year_unassigned', false)
    .order('created_at');
  if (chargeError) throw new Error('Unable to load student charges.');
  const chargeIds = (charges ?? []).map((charge) => charge.id);
  if (!chargeIds.length) return {
    student: { id: studentId, admissionNumber: enrollment.students.admission_number, name: `${enrollment.students.first_name} ${enrollment.students.last_name}` },
    academicYear: { id: enrollment.academic_years.id, name: enrollment.academic_years.name },
    enrollment: { className: enrollment.classes?.name ?? null, streamName: enrollment.streams?.name ?? null },
    totalCharges: 0, totalAdjustments: 0, totalPaid: 0, outstanding: 0, charges: [], transactions: [],
  };

  const [{ data: allocations }, { data: adjustments }] = await Promise.all([
    supabase.from('fee_payment_allocations').select('assessment_id, amount, fee_payments!inner(payment_date, receipt_number, method, reference)').eq('school_id', schoolId).in('assessment_id', chargeIds),
    supabase.from('finance_adjustments').select('assessment_id, adjustment_type, amount, reason, created_at').eq('school_id', schoolId).eq('academic_year_id', academicYearId).eq('student_id', studentId).eq('status', 'approved').in('assessment_id', chargeIds),
  ]);

  const events: StatementTransaction[] = [];
  let totalCharges = 0;
  let totalAdjustments = 0;
  let totalPaid = 0;
  let totalReversed = 0;
  const adjustmentsByCharge = new Map<string, number>();
  const paidByCharge = new Map<string, number>();
  for (const charge of charges ?? []) {
    const amount = Number(charge.amount);
    totalCharges += amount;
    events.push({ date: charge.created_at, description: charge.description, debit: amount, credit: 0, receiptNumber: null });
  }
  for (const adjustment of adjustments ?? []) {
    if (!adjustment.assessment_id) continue;
    const amount = adjustmentEffect(adjustment.adjustment_type, Number(adjustment.amount));
    if (adjustment.adjustment_type === 'payment_reversal') totalReversed += Math.abs(Number(adjustment.amount));
    else totalAdjustments += amount;
    adjustmentsByCharge.set(adjustment.assessment_id, (adjustmentsByCharge.get(adjustment.assessment_id) ?? 0) + amount);
    events.push({
      date: adjustment.created_at,
      description: `${adjustment.adjustment_type.replaceAll('_', ' ')}: ${adjustment.reason}`,
      debit: Math.max(amount, 0),
      credit: Math.max(-amount, 0),
      receiptNumber: null,
    });
  }
  for (const allocation of allocations ?? []) {
    const payment = Array.isArray(allocation.fee_payments) ? allocation.fee_payments[0] : allocation.fee_payments;
    const amount = Number(allocation.amount);
    totalPaid += amount;
    paidByCharge.set(allocation.assessment_id, (paidByCharge.get(allocation.assessment_id) ?? 0) + amount);
    events.push({
      date: payment?.payment_date ?? '',
      description: `Payment · ${String(payment?.method ?? '').replaceAll('_', ' ')}`,
      debit: 0,
      credit: amount,
      receiptNumber: payment?.receipt_number ?? null,
    });
  }
  totalPaid = Math.max(0, totalPaid - totalReversed);
  const balance = totalCharges + totalAdjustments - totalPaid;
  const chargeBalances = (charges ?? []).map((charge) => {
    const amount = Number(charge.amount);
    const adjustments = adjustmentsByCharge.get(charge.id) ?? 0;
    const paid = paidByCharge.get(charge.id) ?? 0;
    return { id: charge.id, description: charge.description, amount, adjustments, paid, balance: Math.max(0, amount + adjustments - paid), dueDate: charge.due_date };
  });
  let runningBalance = 0;
  const transactions = events.sort((left, right) => left.date.localeCompare(right.date)).map((event) => {
    runningBalance += event.debit - event.credit;
    return { ...event, balance: runningBalance };
  });

  return {
    student: { id: studentId, admissionNumber: enrollment.students.admission_number, name: `${enrollment.students.first_name} ${enrollment.students.last_name}` },
    academicYear: { id: enrollment.academic_years.id, name: enrollment.academic_years.name },
    enrollment: { className: enrollment.classes?.name ?? null, streamName: enrollment.streams?.name ?? null },
    totalCharges,
    totalAdjustments,
    totalPaid,
    outstanding: Math.max(0, balance),
    charges: chargeBalances,
    transactions,
  };
}