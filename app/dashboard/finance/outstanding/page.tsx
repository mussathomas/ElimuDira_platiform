/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/field';

const currency = new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });
const money = (value: number) => currency.format(value);

export default async function OutstandingBalancesPage({ searchParams }: { searchParams: Promise<{ class_id?: string }> }) {
  const session = await requirePermission('view_finance');
  const params = await searchParams;
  const schoolId = session.school!.id;
  const supabase = await createServerSupabaseClient();
  const [{ data: classes }, { data: students }, { data: assessments }, { data: payments }] = await Promise.all([
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('order_index').order('name'),
    supabase.from('students').select('id, admission_number, first_name, last_name, class_id, classes(name)').eq('school_id', schoolId).eq('status', 'active').order('last_name'),
    supabase.from('fee_assessments').select('id, student_id, amount, description, due_date').eq('school_id', schoolId),
    supabase.from('fee_payments').select('assessment_id, student_id, amount').eq('school_id', schoolId),
  ]);
  const selectedClassId = params.class_id ?? '';
  const paidByAssessment = new Map<string, number>();
  for (const payment of payments ?? []) paidByAssessment.set(payment.assessment_id, (paidByAssessment.get(payment.assessment_id) ?? 0) + Number(payment.amount));
  const rows = (students ?? []).filter((student: any) => !selectedClassId || student.class_id === selectedClassId).map((student: any) => {
    const studentAssessments = (assessments ?? []).filter((assessment: any) => assessment.student_id === student.id);
    const assessed = studentAssessments.reduce((sum, assessment) => sum + Number(assessment.amount), 0);
    const paid = studentAssessments.reduce((sum, assessment) => sum + (paidByAssessment.get(assessment.id) ?? 0), 0);
    return { student, assessed, paid, balance: assessed - paid, fees: studentAssessments.filter((assessment) => Number(assessment.amount) - (paidByAssessment.get(assessment.id) ?? 0) > 0.005) };
  }).filter((row) => row.balance > 0.005);
  const totalOutstanding = rows.reduce((sum, row) => sum + row.balance, 0);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"><div><h2 className="text-xl font-semibold text-ink">Outstanding balances</h2><p className="help-text mt-1">Learners with unpaid assessed fees, grouped by the selected class.</p></div><div className="flex gap-2"><Link href="/dashboard/finance?workspace=payment" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">Record payment</Link><Link href="/dashboard/finance" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink">Finance overview</Link></div></div>
    <div className="grid gap-4 sm:grid-cols-3"><Card><p className="help-text">Learners owing</p><p className="mt-2 text-2xl font-semibold text-ink">{rows.length}</p></Card><Card><p className="help-text">Outstanding amount</p><p className="mt-2 text-2xl font-semibold text-danger">{money(totalOutstanding)}</p></Card><Card><p className="help-text">Selected class</p><p className="mt-2 text-2xl font-semibold text-ink">{selectedClassId ? (classes ?? []).find((item) => item.id === selectedClassId)?.name ?? 'Selected' : 'All classes'}</p></Card></div>
    <Card><CardHeader><CardTitle>Filter by class</CardTitle></CardHeader><form method="get" className="flex flex-wrap items-end gap-3"><div><label className="label-text" htmlFor="class_id">Class</label><Select id="class_id" name="class_id" defaultValue={selectedClassId}><option value="">All classes</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><button type="submit" className="h-10 rounded-md bg-brand px-4 text-sm font-medium text-white">Apply filter</button></form></Card>
    <Card><CardHeader><CardTitle>Unpaid learner balances</CardTitle></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Student</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Assessed</th><th className="px-3 py-2">Paid</th><th className="px-3 py-2">Outstanding</th><th className="px-3 py-2">Unpaid fees</th></tr></thead><tbody>{rows.map((row) => { const className = Array.isArray(row.student.classes) ? row.student.classes[0]?.name : row.student.classes?.name; return <tr key={row.student.id} className="border-b border-line align-top"><td className="px-3 py-3 font-medium">{row.student.admission_number} · {row.student.first_name} {row.student.last_name}</td><td className="px-3 py-3">{className ?? 'Unassigned'}</td><td className="px-3 py-3">{money(row.assessed)}</td><td className="px-3 py-3">{money(row.paid)}</td><td className="px-3 py-3 font-semibold text-danger">{money(row.balance)}</td><td className="px-3 py-3">{row.fees.map((fee) => <div key={fee.id}>{fee.description}: {money(Number(fee.amount) - (paidByAssessment.get(fee.id) ?? 0))}</div>)}</td></tr>; })}</tbody></table></div>{!rows.length && <p className="help-text p-4">No outstanding balances match this class.</p>}</Card>
  </div>;
}
