/* eslint-disable @typescript-eslint/no-explicit-any */
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { FinanceEntryForms } from '@/components/finance/finance-entry-forms';

const currency = new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });
const money = (value: number) => currency.format(value);

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const session = await requirePermission('view_finance');
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const [{ data: students }, { data: years }, { data: classes }, { data: structures }, { data: assessments }, { data: payments }, { data: recentPayments }] = await Promise.all([
    supabase.from('students').select('id, admission_number, first_name, last_name, class_id, classes(name)').eq('school_id', schoolId).eq('status', 'active').order('last_name'),
    supabase.from('academic_years').select('id, name, is_current').eq('school_id', schoolId).order('is_current', { ascending: false }).order('start_date', { ascending: false }),
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('order_index').order('name'),
    supabase.from('fee_structures').select('id, class_id, name, amount, due_date').eq('school_id', schoolId).eq('active', true).order('name'),
    supabase.from('fee_assessments').select('id, student_id, fee_structure_id, description, amount, due_date, students(admission_number, first_name, last_name, class_id)').eq('school_id', schoolId).order('created_at', { ascending: false }),
    supabase.from('fee_payments').select('id, assessment_id, student_id, amount').eq('school_id', schoolId),
    supabase.from('fee_payments').select('id, assessment_id, student_id, amount, payment_date, method, reference, students(admission_number, first_name, last_name), fee_assessments(description)').eq('school_id', schoolId).order('payment_date', { ascending: false }).limit(50),
  ]);
  const paymentRows = payments ?? [];
  const paidByAssessment = new Map<string, number>();
  for (const payment of paymentRows) paidByAssessment.set(payment.assessment_id, (paidByAssessment.get(payment.assessment_id) ?? 0) + Number(payment.amount));
  const totalBilled = (assessments ?? []).reduce((sum, item) => sum + Number(item.amount), 0);
  const totalPaid = paymentRows.reduce((sum, item) => sum + Number(item.amount), 0);
  const canRecord = session.permissions.has('create_payment');
  const studentOptions = (students ?? []).map((student: any) => ({ id: student.id, class_id: student.class_id, admission_number: student.admission_number, first_name: student.first_name, last_name: student.last_name }));
  const assessmentOptions = (assessments ?? []).map((assessment: any) => ({ id: assessment.id, student_id: assessment.student_id, class_id: assessment.students?.class_id ?? null, description: assessment.description, amount: Number(assessment.amount), paid: paidByAssessment.get(assessment.id) ?? 0, studentName: `${assessment.students?.first_name ?? ''} ${assessment.students?.last_name ?? ''}`.trim() }));

  return <div className="space-y-6">
    <div><h2 className="text-xl font-semibold text-ink">Finance</h2><p className="help-text">Create fee structures, assess individual learners, record payments, and follow balances.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Card><p className="help-text">Active learners</p><p className="mt-2 text-2xl font-semibold text-ink">{students?.length ?? 0}</p></Card><Card><p className="help-text">Fee structures</p><p className="mt-2 text-2xl font-semibold text-ink">{structures?.length ?? 0}</p></Card><Card><p className="help-text">Total assessed</p><p className="mt-2 text-2xl font-semibold text-ink">{money(totalBilled)}</p></Card><Card><p className="help-text">Outstanding</p><p className="mt-2 text-2xl font-semibold text-danger">{money(totalBilled - totalPaid)}</p></Card></div>
    {canRecord && <Card id="assessments"><CardHeader><CardTitle>Fee structures, assessments, and payments</CardTitle></CardHeader><FinanceEntryForms initialWorkspace={params.workspace === 'structure' || params.workspace === 'assessment' || params.workspace === 'payment' ? params.workspace : null} classes={classes ?? []} students={studentOptions} years={years ?? []} structures={(structures ?? []).map((item: any) => ({ ...item, amount: Number(item.amount) }))} assessments={assessmentOptions} /></Card>}
    <Card id="balances"><CardHeader><CardTitle>Student balances</CardTitle></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Student</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Assessed</th><th className="px-3 py-2">Paid</th><th className="px-3 py-2">Balance</th></tr></thead><tbody>{(students ?? []).map((student: any) => { const billed = (assessments ?? []).filter((item) => item.student_id === student.id).reduce((sum, item) => sum + Number(item.amount), 0); const paid = paymentRows.filter((item) => item.student_id === student.id).reduce((sum, item) => sum + Number(item.amount), 0); if (!billed && !paid) return null; const className = Array.isArray(student.classes) ? student.classes[0]?.name : student.classes?.name; return <tr key={student.id} className="border-b border-line"><td className="px-3 py-2 font-medium">{student.admission_number} · {student.first_name} {student.last_name}</td><td className="px-3 py-2">{className ?? 'Unassigned'}</td><td className="px-3 py-2">{money(billed)}</td><td className="px-3 py-2">{money(paid)}</td><td className={`px-3 py-2 font-semibold ${billed - paid > 0 ? 'text-danger' : 'text-brand-dark'}`}>{money(billed - paid)}</td></tr>; })}</tbody></table></div>{!(assessments ?? []).length && <p className="help-text p-4">No fee assessments have been recorded yet.</p>}</Card>
    <Card id="payments"><CardHeader><CardTitle>Recent payments</CardTitle></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Fee</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Reference</th></tr></thead><tbody>{(recentPayments ?? []).map((payment: any) => <tr key={payment.id} className="border-b border-line"><td className="px-3 py-2">{payment.payment_date}</td><td className="px-3 py-2">{payment.students?.admission_number} · {payment.students?.first_name} {payment.students?.last_name}</td><td className="px-3 py-2">{payment.fee_assessments?.description ?? 'Fee'}</td><td className="px-3 py-2 capitalize">{String(payment.method).replace('_', ' ')}</td><td className="px-3 py-2 font-semibold">{money(Number(payment.amount))}</td><td className="px-3 py-2">{payment.reference ?? '—'}</td></tr>)}</tbody></table></div>{!(recentPayments ?? []).length && <p className="help-text p-4">No payments have been recorded yet.</p>}</Card>
  </div>;
}
