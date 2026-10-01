/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getFinanceYearSummary, getOutstandingFinanceRows, type OutstandingFinanceRow } from '@/lib/finance/service';

const currency = new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });
const money = (value: number) => currency.format(value);

type OutstandingSearchParams = { academic_year_id?: string; class_id?: string; q?: string; category_id?: string; min_balance?: string; max_balance?: string; payment_status?: string; page?: string };

export default async function OutstandingBalancesPage({ searchParams }: { searchParams: Promise<OutstandingSearchParams> }) {
  const session = await requirePermission('view_finance');
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const [{ data: years }, { data: classes }, { data: categories }] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_current').eq('school_id', session.school!.id).order('start_date', { ascending: false }),
    supabase.from('classes').select('id, name').eq('school_id', session.school!.id).order('order_index'),
    supabase.from('finance_fee_categories').select('id, name').eq('school_id', session.school!.id).eq('active', true).order('name'),
  ]);
  const academicYearId = params.academic_year_id ?? years?.find((year) => year.is_current)?.id ?? years?.[0]?.id ?? '';
  const page = Math.max(Number(params.page) || 1, 1);
  const minBalance = params.min_balance && Number.isFinite(Number(params.min_balance)) ? Number(params.min_balance) : null;
  const maxBalance = params.max_balance && Number.isFinite(Number(params.max_balance)) ? Number(params.max_balance) : null;
  const paymentStatus = params.payment_status === 'unpaid' || params.payment_status === 'partial' ? params.payment_status : 'all';
  const [summary, result] = academicYearId ? await Promise.all([
    getFinanceYearSummary(academicYearId, params.class_id ?? null),
    getOutstandingFinanceRows({ academicYearId, classId: params.class_id, search: params.q, page, categoryId: params.category_id, minBalance, maxBalance, paymentStatus }),
  ]) : [null, { rows: [], totalCount: 0 }];
  const totalPages = Math.max(1, Math.ceil(result.totalCount / 50));
  const canExport = session.permissions.has('export_finance');
  const pageHref = (nextPage: number) => {
    const search = new URLSearchParams({ academic_year_id: academicYearId, page: String(nextPage) });
    if (params.class_id) search.set('class_id', params.class_id);
    if (params.q) search.set('q', params.q);
    if (params.category_id) search.set('category_id', params.category_id);
    if (params.min_balance) search.set('min_balance', params.min_balance);
    if (params.max_balance) search.set('max_balance', params.max_balance);
    if (paymentStatus !== 'all') search.set('payment_status', paymentStatus);
    return `?${search.toString()}`;
  };
  const exportQuery = new URLSearchParams({ report: 'outstanding', academic_year_id: academicYearId });
  if (params.class_id) exportQuery.set('class_id', params.class_id);
  if (params.q) exportQuery.set('q', params.q);
  if (params.category_id) exportQuery.set('category_id', params.category_id);
  if (params.min_balance) exportQuery.set('min_balance', params.min_balance);
  if (params.max_balance) exportQuery.set('max_balance', params.max_balance);
  if (paymentStatus !== 'all') exportQuery.set('payment_status', paymentStatus);
  const exportHref = `/api/finance/export?${exportQuery.toString()}`;

  return <div className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"><div><p className="text-sm font-medium uppercase text-brand">Finance</p><h2 className="mt-1 text-xl font-semibold text-ink">Outstanding balances</h2><p className="help-text mt-1">Balances are calculated per academic-year enrollment and never combined across years.</p></div><div className="flex gap-2"><Link href={`/dashboard/finance/payments?academic_year_id=${academicYearId}`} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">Record payment</Link>{canExport && <Link href={exportHref} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink">Export CSV</Link>}</div></header>
    <div className="grid gap-4 sm:grid-cols-3"><Card><p className="help-text">Students owing</p><p className="mt-2 text-2xl font-semibold text-ink">{result.totalCount}</p></Card><Card><p className="help-text">Outstanding amount</p><p className="mt-2 text-2xl font-semibold text-danger">{money(summary?.totalOutstanding ?? 0)}</p></Card><Card><p className="help-text">Academic year</p><p className="mt-2 text-2xl font-semibold text-ink">{years?.find((year) => year.id === academicYearId)?.name ?? '—'}</p></Card></div>
    <Card><CardHeader><CardTitle>Filter balances</CardTitle></CardHeader><form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><label className="label-text" htmlFor="academic_year_id">Academic year</label><Select id="academic_year_id" name="academic_year_id" defaultValue={academicYearId} required><option value="">Choose year</option>{(years ?? []).map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select></div><div><label className="label-text" htmlFor="class_id">Class</label><Select id="class_id" name="class_id" defaultValue={params.class_id ?? ''}><option value="">All classes</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><div><label className="label-text" htmlFor="q">Student</label><Input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Name or admission number" /></div><div><label className="label-text" htmlFor="category_id">Fee category</label><Select id="category_id" name="category_id" defaultValue={params.category_id ?? ''}><option value="">All categories</option>{(categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></div><div><label className="label-text" htmlFor="min_balance">Minimum balance</label><Input id="min_balance" name="min_balance" type="number" min="0" step="0.01" defaultValue={params.min_balance ?? ''} /></div><div><label className="label-text" htmlFor="max_balance">Maximum balance</label><Input id="max_balance" name="max_balance" type="number" min="0" step="0.01" defaultValue={params.max_balance ?? ''} /></div><div><label className="label-text" htmlFor="payment_status">Payment status</label><Select id="payment_status" name="payment_status" defaultValue={paymentStatus}><option value="all">Any outstanding</option><option value="unpaid">Unpaid</option><option value="partial">Partially paid</option></Select></div><div className="flex items-end"><button type="submit" className="h-10 w-full rounded-md bg-brand px-4 text-sm font-medium text-white">Apply filters</button></div></form></Card>
    <Card><CardHeader><CardTitle>Students with balances</CardTitle></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Student</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Charges</th><th className="px-3 py-2">Adjustments</th><th className="px-3 py-2">Paid</th><th className="px-3 py-2">Balance</th><th className="px-3 py-2">Statement</th></tr></thead><tbody>{result.rows.map((row: OutstandingFinanceRow) => <tr key={row.studentId} className="border-b border-line"><td className="px-3 py-3">{row.admissionNumber} · {row.studentName}</td><td className="px-3 py-3">{row.className ?? '—'}</td><td className="px-3 py-3">{money(row.totalCharges)}</td><td className="px-3 py-3">{money(row.totalAdjustments)}</td><td className="px-3 py-3">{money(row.totalPaid)}</td><td className="px-3 py-3 font-semibold text-danger">{money(row.balance)}</td><td className="px-3 py-3"><Link className="text-brand-dark hover:underline" href={`/dashboard/students/${row.studentId}/finance?academic_year_id=${academicYearId}`}>Open statement</Link></td></tr>)}</tbody></table></div>{!result.rows.length && <p className="help-text p-4">No outstanding balances for these filters.</p>}<div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted">Page {page} of {totalPages}</span><div className="flex gap-2">{page > 1 && <Link className="rounded-md border border-border px-3 py-2" href={pageHref(page - 1)}>Previous</Link>}{page < totalPages && <Link className="rounded-md border border-border px-3 py-2" href={pageHref(page + 1)}>Next</Link>}</div></div></Card>
  </div>;
}

async function LegacyOutstandingBalancesPage({ searchParams }: { searchParams: Promise<{ class_id?: string }> }) {
  const session = await requirePermission('view_finance');
  const params = await searchParams;
  const schoolId = session.school!.id;
  const supabase = await createServerSupabaseClient();
  const [{ data: classes }, { data: students }, { data: structures }, { data: assessments }, { data: payments }] = await Promise.all([
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('order_index').order('name'),
    supabase.from('students').select('id, admission_number, first_name, last_name, class_id, classes(name)').eq('school_id', schoolId).eq('status', 'active').order('last_name'),
    supabase.from('fee_structures').select('id, class_id, name, amount, due_date').eq('school_id', schoolId).eq('active', true).order('name'),
    supabase.from('fee_assessments').select('id, student_id, fee_structure_id, amount, description, due_date').eq('school_id', schoolId),
    supabase.from('fee_payments').select('assessment_id, amount').eq('school_id', schoolId),
  ]);
  const selectedClassId = params.class_id ?? '';
  const paidByAssessment = new Map<string, number>();
  for (const payment of payments ?? []) paidByAssessment.set(payment.assessment_id, (paidByAssessment.get(payment.assessment_id) ?? 0) + Number(payment.amount));
  const rows = (students ?? []).filter((student: any) => !selectedClassId || student.class_id === selectedClassId).map((student: any) => {
    const applicableStructures = (structures ?? []).filter((structure: any) => !structure.class_id || structure.class_id === student.class_id);
    const studentAssessments = (assessments ?? []).filter((assessment: any) => assessment.student_id === student.id);
    const lines = applicableStructures.map((structure: any) => { const assessment = studentAssessments.find((item: any) => item.fee_structure_id === structure.id); const assessed = assessment ? Number(assessment.amount) : Number(structure.amount); const paid = assessment ? paidByAssessment.get(assessment.id) ?? 0 : 0; return { id: structure.id, name: structure.name, balance: Math.max(0, assessed - paid), paid, dueDate: assessment?.due_date ?? structure.due_date }; });
    const customLines = studentAssessments.filter((assessment: any) => !assessment.fee_structure_id).map((assessment: any) => ({ id: assessment.id, name: assessment.description, balance: Math.max(0, Number(assessment.amount) - (paidByAssessment.get(assessment.id) ?? 0)), paid: paidByAssessment.get(assessment.id) ?? 0, dueDate: assessment.due_date }));
    const fees = [...lines, ...customLines].filter((line) => line.balance > 0.005);
    return { student, fees, balance: fees.reduce((sum, fee) => sum + fee.balance, 0), paid: [...lines, ...customLines].reduce((sum, fee) => sum + fee.paid, 0), assessed: applicableStructures.reduce((sum, structure) => sum + Number(structure.amount), 0) + customLines.reduce((sum, fee) => sum + fee.balance + fee.paid, 0) };
  }).filter((row) => row.balance > 0.005);
  const totalOutstanding = rows.reduce((sum, row) => sum + row.balance, 0);

  return <div className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"><div><h2 className="text-xl font-semibold text-ink">Outstanding balances</h2><p className="help-text mt-1">Every unpaid fee from the selected class structures and custom assessments.</p></div><div className="flex gap-2"><Link href="/dashboard/finance?workspace=payment" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">Record payment</Link><Link href="/dashboard/finance" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink">Finance overview</Link></div></header><div className="grid gap-4 sm:grid-cols-3"><Card><p className="help-text">Learners owing</p><p className="mt-2 text-2xl font-semibold text-ink">{rows.length}</p></Card><Card><p className="help-text">Outstanding amount</p><p className="mt-2 text-2xl font-semibold text-danger">{money(totalOutstanding)}</p></Card><Card><p className="help-text">Selected class</p><p className="mt-2 text-2xl font-semibold text-ink">{selectedClassId ? (classes ?? []).find((item) => item.id === selectedClassId)?.name ?? 'Selected' : 'All classes'}</p></Card></div><Card><CardHeader><CardTitle>Filter by class</CardTitle></CardHeader><form method="get" className="flex flex-wrap items-end gap-3"><div><label className="label-text" htmlFor="class_id">Class</label><Select id="class_id" name="class_id" defaultValue={selectedClassId}><option value="">All classes</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><button type="submit" className="h-10 rounded-md bg-brand px-4 text-sm font-medium text-white">Apply filter</button></form></Card><Card><CardHeader><CardTitle>Unpaid learner balances</CardTitle></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-ink text-white"><tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Class</th><th className="px-3 py-3">Assessed</th><th className="px-3 py-3">Paid</th><th className="px-3 py-3">Outstanding</th><th className="px-3 py-3">Unpaid fees</th></tr></thead><tbody>{rows.map((row) => { const className = Array.isArray(row.student.classes) ? row.student.classes[0]?.name : row.student.classes?.name; return <tr key={row.student.id} className="border-b border-line align-top"><td className="px-3 py-3 font-medium">{row.student.admission_number} · {row.student.first_name} {row.student.last_name}</td><td className="px-3 py-3">{className ?? 'Unassigned'}</td><td className="px-3 py-3">{money(row.assessed)}</td><td className="px-3 py-3">{money(row.paid)}</td><td className="px-3 py-3 font-semibold text-danger">{money(row.balance)}</td><td className="px-3 py-3">{row.fees.map((fee) => <div key={fee.id}>{fee.name}: {money(fee.balance)}{fee.dueDate ? <small className="ml-2 text-muted">Due {fee.dueDate}</small> : null}</div>)}</td></tr>; })}</tbody></table></div>{!rows.length && <p className="help-text p-4">No outstanding balances match this class.</p>}</Card></div>;
}
