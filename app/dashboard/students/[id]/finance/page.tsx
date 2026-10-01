import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getStudentFinancialStatement } from '@/lib/finance/service';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { PrintStatementButton } from '@/components/finance/print-statement-button';

const money = (amount: number) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 2 }).format(amount);

export default async function StudentFinancePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ academic_year_id?: string }>;
}) {
  const session = await requirePermission('view_financial_statements');
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createServerSupabaseClient();
  const [{ data: student }, { data: enrollments }, { data: school }] = await Promise.all([
    supabase.from('students').select('id, admission_number, first_name, last_name').eq('id', id).eq('school_id', session.school!.id).maybeSingle(),
    supabase.from('student_enrollments').select('id, academic_year_id, academic_years(id, name, is_current)').eq('student_id', id).eq('school_id', session.school!.id).order('placed_at', { ascending: false }),
    supabase.from('schools').select('name, logo_path, phone, email, address').eq('id', session.school!.id).maybeSingle(),
  ]);
  if (!student) notFound();
  const enrollmentYears = (enrollments ?? []).map((enrollment) => Array.isArray(enrollment.academic_years) ? enrollment.academic_years[0] : enrollment.academic_years).filter(Boolean);
  const selectedYearId = query.academic_year_id ?? enrollmentYears.find((year: any) => year.is_current)?.id ?? enrollmentYears[0]?.id ?? '';
  const statement = selectedYearId ? await getStudentFinancialStatement(id, selectedYearId) : null;
  const previousStatements = await Promise.all(enrollmentYears.filter((year: any) => year.id !== selectedYearId).slice(0, 10).map((year: any) => getStudentFinancialStatement(id, year.id)));
  if (selectedYearId && !statement) notFound();
  const accountNumber = student.admission_number;

  return (
    <div className="space-y-6 print:space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5 print:hidden">
        <div><Link href="/dashboard/students" className="text-sm text-brand-dark hover:underline">Students</Link><p className="mt-2 text-sm font-medium uppercase text-brand">Financial statement</p><h2 className="mt-1 text-xl font-semibold text-ink">{student.first_name} {student.last_name}</h2><p className="help-text">{accountNumber} · {school?.name}</p></div>
        <div className="flex gap-2"><PrintStatementButton />{statement && <Link href={`/api/finance/statements/${id}?academic_year_id=${selectedYearId}`} className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white">Download PDF</Link>}</div>
      </header>

      <Card className="print:rounded-none print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div><h1 className="text-lg font-semibold text-ink">{school?.name}</h1><p className="help-text">{school?.address}{school?.phone ? ` · ${school.phone}` : ''}{school?.email ? ` · ${school.email}` : ''}</p></div>
          <div className="text-right"><p className="text-sm font-semibold text-ink">Student financial statement</p><p className="help-text">{student.first_name} {student.last_name} · {accountNumber}</p></div>
        </div>
        <form method="get" className="my-4 flex flex-wrap items-end gap-3 print:hidden">
          <div><label className="label-text" htmlFor="academic_year_id">Academic year</label><select id="academic_year_id" name="academic_year_id" defaultValue={selectedYearId} className="h-10 rounded-md border border-border bg-white px-3 text-sm"><option value="">Choose year</option>{enrollmentYears.map((year: any) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></div>
          <button type="submit" className="h-10 rounded-md border border-border px-4 text-sm font-medium">View year</button>
        </form>
        {!enrollmentYears.length && <p className="help-text py-3">This student has no academic-year enrollments.</p>}
        {statement && <>
          <div className="grid gap-4 border-b border-line py-4 sm:grid-cols-4">
            <div><p className="help-text">Academic year</p><p className="mt-1 font-semibold text-ink">{statement.academicYear.name}</p></div>
            <div><p className="help-text">Enrollment</p><p className="mt-1 font-semibold text-ink">{statement.enrollment.className ?? 'No class'}{statement.enrollment.streamName ? ` · ${statement.enrollment.streamName}` : ''}</p></div>
            <div><p className="help-text">Charges</p><p className="mt-1 font-semibold text-ink">{money(statement.totalCharges + Math.max(0, statement.totalAdjustments))}</p></div>
            <div><p className="help-text">Payments allocated</p><p className="mt-1 font-semibold text-brand-dark">{money(statement.totalPaid)}</p></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-4"><p className="text-sm text-muted">Adjustments: {money(statement.totalAdjustments)}</p><p className="text-lg font-semibold text-ink">Outstanding: {money(statement.outstanding)}</p></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th></tr></thead><tbody>{statement.transactions.map((transaction, index) => <tr key={`${transaction.date}-${index}`} className="border-b border-line"><td className="px-3 py-3">{transaction.date.slice(0, 10)}</td><td className="px-3 py-3">{transaction.description}{transaction.receiptNumber && <span className="help-text ml-2 font-mono">{transaction.receiptNumber}</span>}</td><td className="px-3 py-3 text-right">{transaction.debit ? money(transaction.debit) : '—'}</td><td className="px-3 py-3 text-right">{transaction.credit ? money(transaction.credit) : '—'}</td><td className="px-3 py-3 text-right font-medium">{money(transaction.balance)}</td></tr>)}</tbody></table></div>
          {!statement.transactions.length && <p className="help-text py-4">No charges or payments are recorded for this year.</p>}
          {previousStatements.length > 0 && <div className="mt-6 border-t border-line pt-4 print:hidden"><h2 className="mb-2 text-sm font-semibold text-ink">Previous academic-year balances</h2><div className="divide-y divide-line">{previousStatements.map((previous) => previous && <div key={previous.academicYear.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm"><span>{previous.academicYear.name} · {previous.enrollment.className ?? 'No class'}</span><span className="font-medium">Outstanding: {money(previous.outstanding)}</span><Link className="text-brand-dark hover:underline" href={`/dashboard/students/${id}/finance?academic_year_id=${previous.academicYear.id}`}>View statement</Link></div>)}</div></div>}
        </>}
      </Card>
    </div>
  );
}