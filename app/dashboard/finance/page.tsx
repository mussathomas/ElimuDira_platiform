/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { FinanceEntryForms } from '@/components/finance/finance-entry-forms';

const currency = new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });
const money = (value: number) => currency.format(value);

type FeeLine = { id: string; name: string; assessed: number; paid: number; balance: number; dueDate: string | null; status: 'Paid' | 'Partial' | 'Unpaid' };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ workspace?: string; class_id?: string }> }) {
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
  const selectedClassId = params.class_id ?? '';
  const selectedClass = (classes ?? []).find((item) => item.id === selectedClassId);
  const classStructures = (structures ?? []).filter((structure: any) => !selectedClassId || !structure.class_id || structure.class_id === selectedClassId);
  const classStudents = (students ?? []).filter((student: any) => !selectedClassId || student.class_id === selectedClassId);
  const roster = classStudents.map((student: any) => {
    const studentAssessments = (assessments ?? []).filter((assessment: any) => assessment.student_id === student.id);
    const lines: FeeLine[] = classStructures.map((structure: any) => {
      const assessment = studentAssessments.find((item: any) => item.fee_structure_id === structure.id);
      const assessed = assessment ? Number(assessment.amount) : Number(structure.amount);
      const paid = assessment ? paidByAssessment.get(assessment.id) ?? 0 : 0;
      const balance = Math.max(0, assessed - paid);
      return { id: structure.id, name: structure.name, assessed, paid, balance, dueDate: assessment?.due_date ?? structure.due_date ?? null, status: balance <= 0.005 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid' };
    });
    const customLines: FeeLine[] = studentAssessments.filter((assessment: any) => !assessment.fee_structure_id).map((assessment: any) => { const assessed = Number(assessment.amount); const paid = paidByAssessment.get(assessment.id) ?? 0; const balance = Math.max(0, assessed - paid); return { id: assessment.id, name: assessment.description, assessed, paid, balance, dueDate: assessment.due_date, status: balance <= 0.005 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid' }; });
    const allLines = [...lines, ...customLines];
    return { student, lines: allLines, assessed: allLines.reduce((sum, line) => sum + line.assessed, 0), paid: allLines.reduce((sum, line) => sum + line.paid, 0), balance: allLines.reduce((sum, line) => sum + line.balance, 0) };
  });
  const rosterOutstanding = roster.reduce((sum, row) => sum + row.balance, 0);
  const canRecord = session.permissions.has('create_payment');
  const studentOptions = (students ?? []).map((student: any) => ({ id: student.id, class_id: student.class_id, admission_number: student.admission_number, first_name: student.first_name, last_name: student.last_name }));
  const assessmentOptions = (assessments ?? []).map((assessment: any) => ({ id: assessment.id, student_id: assessment.student_id, class_id: assessment.students?.class_id ?? null, description: assessment.description, amount: Number(assessment.amount), paid: paidByAssessment.get(assessment.id) ?? 0, studentName: `${assessment.students?.first_name ?? ''} ${assessment.students?.last_name ?? ''}`.trim() }));
  const workspace = params.workspace === 'structure' || params.workspace === 'assessment' || params.workspace === 'payment' ? params.workspace : null;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"><div><h2 className="text-xl font-semibold text-ink">Finance</h2><p className="help-text mt-1">Class fee rosters, paid and unpaid details, assessments, and payment follow-up.</p></div><Link href="/dashboard/finance/outstanding" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink">Outstanding balances</Link></header>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Card><p className="help-text">Active learners</p><p className="mt-2 text-2xl font-semibold text-ink">{students?.length ?? 0}</p></Card><Card><p className="help-text">Fee structures</p><p className="mt-2 text-2xl font-semibold text-ink">{structures?.length ?? 0}</p></Card><Card><p className="help-text">Total assessed</p><p className="mt-2 text-2xl font-semibold text-ink">{money(totalBilled)}</p></Card><Card><p className="help-text">Total paid</p><p className="mt-2 text-2xl font-semibold text-brand-dark">{money(totalPaid)}</p></Card><Card><p className="help-text">Selected class outstanding</p><p className="mt-2 text-2xl font-semibold text-danger">{money(selectedClassId ? rosterOutstanding : totalBilled - totalPaid)}</p></Card></div>
    <Card><CardHeader><CardTitle>Class fee roster</CardTitle></CardHeader><form method="get" className="flex flex-wrap items-end gap-3"><input type="hidden" name="workspace" value={workspace ?? ''} /><div><label className="label-text" htmlFor="class_id">Class</label><Select id="class_id" name="class_id" defaultValue={selectedClassId}><option value="">All classes</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><button type="submit" className="h-10 rounded-md bg-brand px-4 text-sm font-medium text-white">View roster</button></form><p className="help-text mt-3">{selectedClass ? `${selectedClass.name} · ${classStudents.length} learners · ${classStructures.length} fee structures` : 'Select a class to follow each learner fee by fee.'}</p><div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-ink text-white"><tr><th className="px-3 py-3">No.</th><th className="px-3 py-3">Admission No.</th><th className="px-3 py-3">Student</th><th className="px-3 py-3">Fee structure details</th><th className="px-3 py-3">Assessed</th><th className="px-3 py-3">Paid</th><th className="px-3 py-3">Unpaid</th><th className="px-3 py-3">Status</th></tr></thead><tbody>{roster.map((row, index) => <tr key={row.student.id} className="border-b border-line align-top"><td className="px-3 py-3">{index + 1}</td><td className="px-3 py-3 font-medium">{row.student.admission_number}</td><td className="px-3 py-3 font-medium">{row.student.first_name} {row.student.last_name}</td><td className="min-w-72 px-3 py-3">{row.lines.length ? row.lines.map((line) => <div key={line.id} className="flex items-center justify-between gap-4 border-b border-line py-1 last:border-0"><span>{line.name}{line.dueDate ? <small className="ml-2 text-muted">Due {line.dueDate}</small> : null}</span><span className={line.status === 'Paid' ? 'text-brand-dark' : line.status === 'Partial' ? 'text-amber-700' : 'text-danger'}>{line.status}</span></div>) : <span className="text-muted">No fee structure assigned</span>}</td><td className="px-3 py-3">{money(row.assessed)}</td><td className="px-3 py-3 text-brand-dark">{money(row.paid)}</td><td className="px-3 py-3 font-semibold text-danger">{money(row.balance)}</td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.balance <= 0.005 ? 'bg-brand-light text-brand-dark' : row.paid > 0 ? 'bg-amber-100 text-amber-800' : 'bg-danger-light text-danger'}`}>{row.balance <= 0.005 ? 'Paid' : row.paid > 0 ? 'Partial' : 'Unpaid'}</span></td></tr>)}</tbody></table></div>{!roster.length && <p className="help-text mt-4">No active learners match this class.</p>}</Card>
    {canRecord && <Card id="assessments"><CardHeader><CardTitle>Finance actions</CardTitle></CardHeader><FinanceEntryForms initialWorkspace={workspace} classes={classes ?? []} students={studentOptions} years={years ?? []} structures={(structures ?? []).map((item: any) => ({ ...item, amount: Number(item.amount) }))} assessments={assessmentOptions} /></Card>}
    <Card id="payments"><CardHeader><CardTitle>Recent payments</CardTitle></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-ink text-white"><tr><th className="px-3 py-3">Date</th><th className="px-3 py-3">Student</th><th className="px-3 py-3">Fee</th><th className="px-3 py-3">Method</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Reference</th></tr></thead><tbody>{(recentPayments ?? []).map((payment: any) => <tr key={payment.id} className="border-b border-line"><td className="px-3 py-2">{payment.payment_date}</td><td className="px-3 py-2">{payment.students?.admission_number} · {payment.students?.first_name} {payment.students?.last_name}</td><td className="px-3 py-2">{payment.fee_assessments?.description ?? 'Fee'}</td><td className="px-3 py-2 capitalize">{String(payment.method).replace('_', ' ')}</td><td className="px-3 py-2 font-semibold">{money(Number(payment.amount))}</td><td className="px-3 py-2">{payment.reference ?? '—'}</td></tr>)}</tbody></table></div>{!(recentPayments ?? []).length && <p className="help-text p-4">No payments have been recorded yet.</p>}</Card>
  </div>;
}
