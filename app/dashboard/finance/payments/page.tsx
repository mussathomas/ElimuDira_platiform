import Link from 'next/link';
import { requireAnyPermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getStudentOpenChargeBalances } from '@/lib/finance/service';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { FinancePaymentForm } from '@/components/finance/finance-payment-form';

const money = (amount: number) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 2 }).format(amount);
const pageSize = 25;

type SearchParams = {
  academic_year_id?: string;
  class_id?: string;
  student_id?: string;
  student_q?: string;
  student_page?: string;
  history_academic_year_id?: string;
  history_class_id?: string;
  history_q?: string;
  from?: string;
  to?: string;
  method?: string;
  status?: string;
  page?: string;
};

export default async function FinancePaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireAnyPermission(['view_finance', 'record_payments']);
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const [{ data: years, error: yearsError }, { data: classes, error: classesError }] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_current').eq('school_id', schoolId).order('start_date', { ascending: false }),
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('order_index'),
  ]);
  if (yearsError || classesError) throw new Error('Unable to load academic years and classes for payments.');

  const defaultYearId = years?.find((year) => year.is_current)?.id ?? years?.[0]?.id ?? '';
  const academicYearId = years?.some((year) => year.id === params.academic_year_id) ? params.academic_year_id! : defaultYearId;
  const historyAcademicYearId = years?.some((year) => year.id === params.history_academic_year_id) ? params.history_academic_year_id! : academicYearId;
  const classId = classes?.some((item) => item.id === params.class_id) ? params.class_id! : '';
  const historyClassId = classes?.some((item) => item.id === params.history_class_id) ? params.history_class_id! : '';
  const studentSearch = params.student_q?.trim() ?? '';
  const historySearch = params.history_q?.trim() ?? '';
  const studentPage = Math.max(Number(params.student_page) || 1, 1);
  const historyPage = Math.max(Number(params.page) || 1, 1);
  const canRecordPayments = session.permissions.has('record_payments');

  let rosterQuery = supabase.from('students')
    .select('id, admission_number, first_name, last_name, class_id, classes(name)', { count: 'exact' })
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .eq('status', 'active');
  if (studentSearch) {
    const term = studentSearch.replace(/[%(),]/g, '');
    rosterQuery = rosterQuery.or(`admission_number.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  }
  const rosterResult = classId && academicYearId
    ? await rosterQuery.order('last_name').order('first_name').range((studentPage - 1) * pageSize, studentPage * pageSize - 1)
    : { data: [], count: 0, error: null };
  if (rosterResult.error) throw new Error('Unable to load registered students in this class.');
  const students = rosterResult.data ?? [];
  const rosterCount = rosterResult.count ?? 0;
  const selectedStudentResult = params.student_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.student_id) && classId && academicYearId
    ? await supabase.from('students')
      .select('id, admission_number, first_name, last_name, class_id, classes(name)')
      .eq('school_id', schoolId)
      .eq('class_id', classId)
      .eq('id', params.student_id)
      .eq('status', 'active')
      .maybeSingle()
    : { data: null, error: null };
  if (selectedStudentResult.error) throw new Error('Unable to load the selected registered student.');
  const selectedStudent = selectedStudentResult.data;
  const openCharges = selectedStudent && canRecordPayments
    ? await getStudentOpenChargeBalances(selectedStudent.id, academicYearId)
    : [];

  const historyMethod = ['cash', 'bank', 'mobile_money', 'other'].includes(params.method ?? '') ? params.method : '';
  const historyStatus = ['completed', 'partially_reversed', 'reversed'].includes(params.status ?? '') ? params.status : '';
  let paymentsQuery = supabase.from('fee_payments')
    .select('id, student_id, amount, payment_date, method, reference, receipt_number, status, receiver:profiles!fee_payments_received_by_fkey(full_name), students!inner(admission_number, first_name, last_name, class_id, classes(name))', { count: 'exact' })
    .eq('school_id', schoolId)
    .eq('academic_year_id', historyAcademicYearId)
    .eq('legacy_year_unassigned', false);
  if (historyClassId) paymentsQuery = paymentsQuery.eq('students.class_id', historyClassId);
  if (historySearch) {
    const term = historySearch.replace(/[%(),]/g, '');
    paymentsQuery = paymentsQuery.or(`admission_number.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`, { referencedTable: 'students' });
  }
  if (params.from) paymentsQuery = paymentsQuery.gte('payment_date', params.from);
  if (params.to) paymentsQuery = paymentsQuery.lte('payment_date', params.to);
  if (historyMethod) paymentsQuery = paymentsQuery.eq('method', historyMethod);
  if (historyStatus) paymentsQuery = paymentsQuery.eq('status', historyStatus);
  const { data: payments, count: paymentCount, error: paymentsError } = await paymentsQuery
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range((historyPage - 1) * pageSize, historyPage * pageSize - 1);
  if (paymentsError) throw new Error('Unable to load payment history.');
  const totalHistoryPages = Math.max(1, Math.ceil((paymentCount ?? 0) / pageSize));
  const totalRosterPages = Math.max(1, Math.ceil(rosterCount / pageSize));
  const selectedClass = classes?.find((item) => item.id === classId);

  const rosterHref = (nextPage: number) => {
    const search = new URLSearchParams({ academic_year_id: academicYearId, class_id: classId, student_page: String(nextPage) });
    if (studentSearch) search.set('student_q', studentSearch);
    return `?${search.toString()}#student-roster`;
  };
  const recordHref = (studentId: string) => {
    const search = new URLSearchParams({ academic_year_id: academicYearId, class_id: classId, student_id: studentId });
    if (studentSearch) search.set('student_q', studentSearch);
    if (studentPage > 1) search.set('student_page', String(studentPage));
    return `?${search.toString()}#record-payment`;
  };
  const historyHref = (nextPage: number) => {
    const search = new URLSearchParams({ history_academic_year_id: historyAcademicYearId, page: String(nextPage) });
    if (historyClassId) search.set('history_class_id', historyClassId);
    if (historySearch) search.set('history_q', historySearch);
    if (params.from) search.set('from', params.from);
    if (params.to) search.set('to', params.to);
    if (historyMethod) search.set('method', historyMethod);
    if (historyStatus) search.set('status', historyStatus);
    return `?${search.toString()}#payment-history`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-sm font-medium uppercase text-brand">Finance</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Payments</h2>
          <p className="help-text mt-1">Record student payments against fee charges and review receipts by academic year.</p>
        </div>
        <div className="flex gap-2">
          <a href="#student-roster" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink">Record payments</a>
          <a href="#payment-history" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink">Payment history</a>
          <Link href="/dashboard/finance" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink">Finance dashboard</Link>
        </div>
      </header>

      <Card id="student-roster">
        <CardHeader><CardTitle>Record payments by class</CardTitle></CardHeader>
        <p className="help-text mb-4">Choose an academic year and class to load registered students. Search by student name or admission number, then open a student to allocate a payment across their outstanding fee charges.</p>
        <form method="get" className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="history_academic_year_id" value={historyAcademicYearId} />
          <input type="hidden" name="history_class_id" value={historyClassId} />
          <input type="hidden" name="history_q" value={historySearch} />
          <input type="hidden" name="from" value={params.from ?? ''} />
          <input type="hidden" name="to" value={params.to ?? ''} />
          <input type="hidden" name="method" value={historyMethod} />
          <input type="hidden" name="status" value={historyStatus} />
          <div>
            <Label htmlFor="academic_year_id">Academic year</Label>
            <Select id="academic_year_id" name="academic_year_id" defaultValue={academicYearId} required>
              <option value="">Choose year</option>
              {(years ?? []).map((year) => <option key={year.id} value={year.id}>{year.name}{year.is_current ? ' (current)' : ''}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="class_id">Class</Label>
            <Select id="class_id" name="class_id" defaultValue={classId} required>
              <option value="">Choose class</option>
              {(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="student_q">Find a student</Label>
            <Input id="student_q" name="student_q" defaultValue={studentSearch} placeholder="Name or admission number" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="h-10 w-full rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark">Load students</button>
          </div>
        </form>

        {selectedStudent && canRecordPayments && <section id="record-payment" className="mb-6 scroll-mt-6 rounded-lg border border-brand/30 bg-brand-light/30 p-4 sm:p-5">
          <CardHeader>
            <div>
              <CardTitle>Record payment for {selectedStudent?.first_name} {selectedStudent?.last_name}</CardTitle>
              <p className="help-text mt-1">{selectedStudent?.admission_number} · {selectedClass?.name} · {years?.find((year) => year.id === academicYearId)?.name}</p>
            </div>
            <Link href={rosterHref(studentPage)} className="text-sm font-medium text-brand-dark hover:underline">Close</Link>
          </CardHeader>
          {openCharges.length
            ? <FinancePaymentForm key={selectedStudent.id} studentId={selectedStudent.id} academicYearId={academicYearId} charges={openCharges} />
            : <p className="help-text rounded-md bg-white p-3">This student has no outstanding fee charges for the selected academic year.</p>}
        </section>}

        {!canRecordPayments && <p className="mb-4 rounded-md bg-paper p-3 text-sm text-muted">You can review payment history, but your role does not have permission to record payments.</p>}

        {!classId
          ? <p className="rounded-md bg-paper p-4 text-sm text-muted">Select an academic year and class to view its enrolled students.</p>
          : <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">{selectedClass?.name ?? 'Selected class'} · {rosterCount} registered student{rosterCount === 1 ? '' : 's'}</h3>
              <span className="text-xs text-muted">Page {studentPage} of {totalRosterPages}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Admission no.</th><th className="px-3 py-2">Student name</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Action</th></tr></thead>
                <tbody>{students.map((student) => {
                  const studentClass = Array.isArray(student.classes) ? student.classes[0] : student.classes;
                  const isSelected = student.id === selectedStudent?.id;
                  return <tr key={student.id} className={`border-b border-line ${isSelected ? 'bg-brand-light/30' : ''}`}>
                    <td className="px-3 py-3">{student.admission_number}</td>
                    <td className="px-3 py-3 font-medium text-ink">{student.first_name} {student.last_name}</td>
                    <td className="px-3 py-3">{studentClass?.name ?? '—'}</td>
                    <td className="px-3 py-3">{canRecordPayments
                      ? <Link href={recordHref(student.id)} className="inline-flex rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand-dark hover:bg-brand-light">{isSelected ? 'Selected' : 'Record payment'}</Link>
                      : <span className="text-muted">View only</span>}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {!students.length && <p className="help-text p-4">{studentSearch ? 'No registered students in this class match the search.' : 'No active students were found in this class.'}</p>}
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted">Showing {students.length ? (studentPage - 1) * pageSize + 1 : 0}–{Math.min(studentPage * pageSize, rosterCount)} of {rosterCount}</span>
              <div className="flex gap-2">
                {studentPage > 1 && <Link className="rounded-md border border-border px-3 py-2" href={rosterHref(studentPage - 1)}>Previous</Link>}
                {studentPage < totalRosterPages && <Link className="rounded-md border border-border px-3 py-2" href={rosterHref(studentPage + 1)}>Next</Link>}
              </div>
            </div>
          </>}
      </Card>

      <Card id="payment-history">
        <CardHeader>
          <div><CardTitle>Payment history</CardTitle><p className="help-text mt-1">{paymentCount ?? 0} receipt{paymentCount === 1 ? '' : 's'} match the selected filters.</p></div>
        </CardHeader>
        <form method="get" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="academic_year_id" value={academicYearId} />
          <input type="hidden" name="class_id" value={classId} />
          <input type="hidden" name="student_q" value={studentSearch} />
          <input type="hidden" name="student_page" value={studentPage} />
          {selectedStudent && <input type="hidden" name="student_id" value={selectedStudent.id} />}
          <div>
            <Label htmlFor="history_academic_year_id">Academic year</Label>
            <Select id="history_academic_year_id" name="history_academic_year_id" defaultValue={historyAcademicYearId} required>
              <option value="">Choose year</option>
              {(years ?? []).map((year) => <option key={year.id} value={year.id}>{year.name}{year.is_current ? ' (current)' : ''}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="history_class_id">Class</Label>
            <Select id="history_class_id" name="history_class_id" defaultValue={historyClassId}>
              <option value="">All classes</option>
              {(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </div>
          <div><Label htmlFor="history_q">Student</Label><Input id="history_q" name="history_q" defaultValue={historySearch} placeholder="Name or admission number" /></div>
          <div>
            <Label htmlFor="history_method">Payment method</Label>
            <Select id="history_method" name="method" defaultValue={historyMethod}>
              <option value="">All methods</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile money</option><option value="other">Other</option>
            </Select>
          </div>
          <div><Label htmlFor="from">From</Label><Input id="from" name="from" type="date" defaultValue={params.from ?? ''} /></div>
          <div><Label htmlFor="to">To</Label><Input id="to" name="to" type="date" defaultValue={params.to ?? ''} /></div>
          <div>
            <Label htmlFor="history_status">Receipt status</Label>
            <Select id="history_status" name="status" defaultValue={historyStatus}>
              <option value="">All statuses</option><option value="completed">Completed</option><option value="partially_reversed">Partially reversed</option><option value="reversed">Reversed</option>
            </Select>
          </div>
          <div className="flex items-end"><button type="submit" className="h-10 w-full rounded-md border border-border bg-white px-4 text-sm font-medium text-ink hover:bg-paper">Filter history</button></div>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Receipt</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Method / reference</th><th className="px-3 py-2">Received by</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Statement</th></tr></thead>
            <tbody>{(payments ?? []).map((payment) => {
              const student = Array.isArray(payment.students) ? payment.students[0] : payment.students;
              const paymentClass = Array.isArray(student?.classes) ? student.classes[0] : student?.classes;
              const receiver = Array.isArray(payment.receiver) ? payment.receiver[0] : payment.receiver;
              return <tr key={payment.id} className="border-b border-line">
                <td className="px-3 py-3 font-mono text-xs font-medium">
                  {session.permissions.has('view_financial_statements') ? <Link className="text-brand-dark hover:underline" href={`/api/finance/receipts/${payment.id}`}>{payment.receipt_number}</Link> : payment.receipt_number}
                  <span className="help-text block capitalize">{String(payment.status ?? 'completed').replaceAll('_', ' ')}</span>
                </td>
                <td className="px-3 py-3">{payment.payment_date}</td>
                <td className="px-3 py-3">{student?.admission_number} · {student?.first_name} {student?.last_name}</td>
                <td className="px-3 py-3">{paymentClass?.name ?? '—'}</td>
                <td className="px-3 py-3 capitalize">{String(payment.method).replaceAll('_', ' ')}{payment.reference ? ` · ${payment.reference}` : ''}</td>
                <td className="px-3 py-3">{receiver?.full_name ?? '—'}</td>
                <td className="px-3 py-3 font-semibold">{money(Number(payment.amount))}</td>
                <td className="px-3 py-3">{session.permissions.has('view_financial_statements') ? <Link className="text-brand-dark hover:underline" href={`/dashboard/students/${payment.student_id}/finance?academic_year_id=${historyAcademicYearId}`}>Open</Link> : '—'}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {!payments?.length && <p className="help-text p-4">No payments match these filters.</p>}
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">Page {historyPage} of {totalHistoryPages}</span>
          <div className="flex gap-2">
            {historyPage > 1 && <Link className="rounded-md border border-border px-3 py-2" href={historyHref(historyPage - 1)}>Previous</Link>}
            {historyPage < totalHistoryPages && <Link className="rounded-md border border-border px-3 py-2" href={historyHref(historyPage + 1)}>Next</Link>}
          </div>
        </div>
      </Card>
    </div>
  );
}
