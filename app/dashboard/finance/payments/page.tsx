import Link from 'next/link';
import { requireAnyPermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getStudentOpenChargeBalances } from '@/lib/finance/service';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { FinancePaymentForm } from '@/components/finance/finance-payment-form';

const money = (amount: number) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 2 }).format(amount);
type SearchParams = { academic_year_id?: string; class_id?: string; student_id?: string; student_page?: string; from?: string; to?: string; q?: string; page?: string };

export default async function FinancePaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireAnyPermission(['view_finance', 'record_payments']);
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const [{ data: years }, { data: classes }] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_current').eq('school_id', schoolId).order('start_date', { ascending: false }),
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('order_index'),
  ]);
  const academicYearId = params.academic_year_id ?? years?.find((year) => year.is_current)?.id ?? years?.[0]?.id ?? '';
  const page = Math.max(Number(params.page) || 1, 1);
  const studentPage = Math.max(Number(params.student_page) || 1, 1);
  let enrollmentQuery = supabase.from('student_enrollments')
    .select('id, student_id, class_id, students!inner(admission_number, first_name, last_name), classes(name)', { count: 'exact' })
    .eq('school_id', schoolId).eq('academic_year_id', academicYearId).eq('status', 'active');
  if (params.class_id) enrollmentQuery = enrollmentQuery.eq('class_id', params.class_id);
  if (params.student_id) enrollmentQuery = enrollmentQuery.eq('student_id', params.student_id);
  if (params.q?.trim()) {
    const term = params.q.trim().replace(/[%(),]/g, '');
    enrollmentQuery = enrollmentQuery.or(`admission_number.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`, { referencedTable: 'students' });
  }
  const { data: enrollments, count: enrollmentCount } = await enrollmentQuery.order('placed_at').range(params.student_id ? 0 : (studentPage - 1) * 50, params.student_id ? 0 : studentPage * 50 - 1);
  const selectedEnrollment = params.student_id ? enrollments?.[0] : null;
  const studentOptions = enrollments ?? [];
  const openCharges = selectedEnrollment && session.permissions.has('record_payments')
    ? await getStudentOpenChargeBalances(selectedEnrollment.student_id, academicYearId)
    : [];

  let paymentsQuery = supabase.from('fee_payments')
    .select('id, student_id, amount, payment_date, method, reference, receipt_number, status, receiver:profiles!fee_payments_received_by_fkey(full_name), students!inner(admission_number, first_name, last_name), student_enrollments!inner(class_id, classes(name))', { count: 'exact' })
    .eq('school_id', schoolId).eq('academic_year_id', academicYearId).eq('legacy_year_unassigned', false);
  if (params.class_id) paymentsQuery = paymentsQuery.eq('student_enrollments.class_id', params.class_id);
  if (params.student_id) paymentsQuery = paymentsQuery.eq('student_id', params.student_id);
  if (params.q?.trim()) {
    const term = params.q.trim().replace(/[%(),]/g, '');
    paymentsQuery = paymentsQuery.or(`admission_number.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`, { referencedTable: 'students' });
  }
  if (params.from) paymentsQuery = paymentsQuery.gte('payment_date', params.from);
  if (params.to) paymentsQuery = paymentsQuery.lte('payment_date', params.to);
  const { data: payments, count } = await paymentsQuery.order('payment_date', { ascending: false }).range((page - 1) * 25, page * 25 - 1);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / 25));
  const studentPickerPages = Math.max(1, Math.ceil((enrollmentCount ?? 0) / 50));
  const studentPickerHref = (nextPage: number) => {
    const search = new URLSearchParams({ academic_year_id: academicYearId, student_page: String(nextPage) });
    if (params.class_id) search.set('class_id', params.class_id);
    if (params.q) search.set('q', params.q);
    return `?${search.toString()}`;
  };

  const queryForPage = (nextPage: number) => {
    const search = new URLSearchParams();
    if (academicYearId) search.set('academic_year_id', academicYearId);
    if (params.class_id) search.set('class_id', params.class_id);
    if (params.q) search.set('q', params.q);
    if (params.student_id) search.set('student_id', params.student_id);
    if (params.from) search.set('from', params.from);
    if (params.to) search.set('to', params.to);
    search.set('page', String(nextPage));
    return `?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div><p className="text-sm font-medium uppercase text-brand">Finance</p><h2 className="mt-1 text-xl font-semibold text-ink">Payments</h2><p className="help-text mt-1">Record receipts against specific outstanding charges and review payment history.</p></div>
        <Link href="/dashboard/finance" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink">Finance dashboard</Link>
      </header>

      <Card>
        <CardHeader><CardTitle>Find student and academic year</CardTitle></CardHeader>
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><Label htmlFor="academic_year_id">Academic year</Label><Select id="academic_year_id" name="academic_year_id" defaultValue={academicYearId} required><option value="">Choose year</option>{(years ?? []).map((year) => <option key={year.id} value={year.id}>{year.name}{year.is_current ? ' (current)' : ''}</option>)}</Select></div>
          <div><Label htmlFor="class_id">Class</Label><Select id="class_id" name="class_id" defaultValue={params.class_id ?? ''}><option value="">All classes</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
          <div><Label htmlFor="q">Search student</Label><Input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Name or admission number" /></div>
          <div><Label htmlFor="student_id">Enrolled student</Label><Select id="student_id" name="student_id" defaultValue={params.student_id ?? ''}><option value="">Choose student</option>{studentOptions.map((enrollment) => { const student = Array.isArray(enrollment.students) ? enrollment.students[0] : enrollment.students; return <option key={enrollment.student_id} value={enrollment.student_id}>{student?.admission_number} · {student?.first_name} {student?.last_name}</option>; })}</Select></div>
          <div className="flex items-end"><button type="submit" className="h-10 w-full rounded-md bg-brand px-4 text-sm font-medium text-white">Load student</button></div>
        </form>
        {!params.student_id && <div className="mt-3 flex items-center justify-between text-sm"><p className="help-text">{enrollmentCount ?? 0} active enrollments · 50 per page. Filter by class to narrow the list.</p><div className="flex gap-2">{studentPage > 1 && <Link className="rounded-md border border-border px-3 py-2" href={studentPickerHref(studentPage - 1)}>Previous students</Link>}{studentPage < studentPickerPages && <Link className="rounded-md border border-border px-3 py-2" href={studentPickerHref(studentPage + 1)}>More students</Link>}</div></div>}
      </Card>

      {selectedEnrollment && session.permissions.has('record_payments') && <Card>
        <CardHeader><CardTitle>Record payment</CardTitle></CardHeader>
        {openCharges.length ? <FinancePaymentForm studentId={selectedEnrollment.student_id} academicYearId={academicYearId} charges={openCharges} /> : <p className="help-text">No outstanding charges are available to allocate for this student and year.</p>}
      </Card>}

      <Card>
        <CardHeader><CardTitle>Payment history ({count ?? 0})</CardTitle></CardHeader>
        <form method="get" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="academic_year_id" value={academicYearId} />
          <div><Label htmlFor="history_class_id">Class</Label><Select id="history_class_id" name="class_id" defaultValue={params.class_id ?? ''}><option value="">All classes</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
          <div><Label htmlFor="history_q">Student</Label><Input id="history_q" name="q" defaultValue={params.q ?? ''} placeholder="Name or admission number" /></div>
          <div><Label htmlFor="from">From</Label><Input id="from" name="from" type="date" defaultValue={params.from ?? ''} /></div>
          <div><Label htmlFor="to">To</Label><Input id="to" name="to" type="date" defaultValue={params.to ?? ''} /></div>
          <div className="flex items-end"><button type="submit" className="h-10 w-full rounded-md border border-border bg-white px-4 text-sm font-medium text-ink">Filter history</button></div>
        </form>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Receipt</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Method / reference</th><th className="px-3 py-2">Received by</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Statement</th></tr></thead>
          <tbody>{(payments ?? []).map((payment) => {
            const student = Array.isArray(payment.students) ? payment.students[0] : payment.students;
            const enrollment = Array.isArray(payment.student_enrollments) ? payment.student_enrollments[0] : payment.student_enrollments;
            const classItem = Array.isArray(enrollment?.classes) ? enrollment.classes[0] : enrollment?.classes;
            const receiver = Array.isArray(payment.receiver) ? payment.receiver[0] : payment.receiver;
            return <tr key={payment.id} className="border-b border-line"><td className="px-3 py-3 font-mono text-xs font-medium">{session.permissions.has('view_financial_statements') ? <Link className="text-brand-dark hover:underline" href={`/api/finance/receipts/${payment.id}`}>{payment.receipt_number}</Link> : payment.receipt_number}<span className="help-text block capitalize">{String(payment.status ?? 'completed').replaceAll('_', ' ')}</span></td><td className="px-3 py-3">{payment.payment_date}</td><td className="px-3 py-3">{student?.admission_number} · {student?.first_name} {student?.last_name}</td><td className="px-3 py-3">{classItem?.name ?? '—'}</td><td className="px-3 py-3 capitalize">{String(payment.method).replaceAll('_', ' ')}{payment.reference ? ` · ${payment.reference}` : ''}</td><td className="px-3 py-3">{receiver?.full_name ?? '—'}</td><td className="px-3 py-3 font-semibold">{money(Number(payment.amount))}</td><td className="px-3 py-3">{session.permissions.has('view_financial_statements') ? <Link className="text-brand-dark hover:underline" href={`/dashboard/students/${payment.student_id}/finance?academic_year_id=${academicYearId}`}>Open</Link> : '—'}</td></tr>;
          })}</tbody>
        </table></div>
        {!payments?.length && <p className="help-text p-4">No payments match these filters.</p>}
        <div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted">Page {page} of {totalPages}</span><div className="flex gap-2">{page > 1 && <Link className="rounded-md border border-border px-3 py-2" href={queryForPage(page - 1)}>Previous</Link>}{page < totalPages && <Link className="rounded-md border border-border px-3 py-2" href={queryForPage(page + 1)}>Next</Link>}</div></div>
      </Card>
    </div>
  );
}