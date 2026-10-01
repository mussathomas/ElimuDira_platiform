import Link from 'next/link';
import { requireAnyPermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ActionForm } from '@/components/ui/action-form';
import { closeFinanceYear, reopenFinanceYear } from '@/lib/actions/finance-ledger';
import { getFinanceYearSummary } from '@/lib/finance/service';

const money = (amount: number) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 2 }).format(amount);

export default async function FinanceReportsPage({ searchParams }: { searchParams: Promise<{ academic_year_id?: string }> }) {
  const session = await requireAnyPermission(['view_finance', 'generate_finance_reports']);
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const { data: years } = await supabase.from('academic_years').select('id, name, is_current').eq('school_id', schoolId).order('start_date', { ascending: false });
  const academicYearId = params.academic_year_id ?? years?.find((year) => year.is_current)?.id ?? years?.[0]?.id ?? '';
  const year = (years ?? []).find((item) => item.id === academicYearId);
  const [{ data: methodRows }, { data: classRows }, { data: closure }] = year ? await Promise.all([
    supabase.rpc('finance_payment_method_summary', { p_academic_year_id: year.id, p_class_id: null }),
    supabase.rpc('finance_class_summary', { p_academic_year_id: year.id }),
    supabase.from('finance_year_closures').select('id, reason, closed_at').eq('school_id', schoolId).eq('academic_year_id', year.id).is('reopened_at', null).order('closed_at', { ascending: false }).limit(1).maybeSingle(),
  ]) : [{ data: [] }, { data: [] }, { data: null }];
  const summary = year ? await getFinanceYearSummary(year.id) : null;
  const canExport = session.permissions.has('export_finance');
  const canClose = session.permissions.has('close_financial_year');
  const exportOutstanding = `/api/finance/export?report=outstanding&academic_year_id=${academicYearId}`;
  const exportCollections = `/api/finance/export?report=payments&academic_year_id=${academicYearId}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"><div><p className="text-sm font-medium uppercase text-brand">Finance</p><h2 className="mt-1 text-xl font-semibold text-ink">Reports</h2><p className="help-text mt-1">Year-specific collections, outstanding balances, class summaries, and payment methods.</p></div><form method="get" className="flex items-end gap-2"><div><Label htmlFor="academic_year_id">Academic year</Label><Select id="academic_year_id" name="academic_year_id" defaultValue={academicYearId} required><option value="">Choose year</option>{(years ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><button type="submit" className="h-10 rounded-md border border-border px-3 text-sm">Run reports</button></form></header>

      <section className="grid gap-3 sm:grid-cols-3"><Card><p className="help-text">Charges, net approved adjustments</p><p className="mt-2 text-xl font-semibold">{money((summary?.totalCharges ?? 0) + (summary?.totalAdjustments ?? 0))}</p></Card><Card><p className="help-text">Allocated collections</p><p className="mt-2 text-xl font-semibold text-brand-dark">{money(summary?.totalAllocatedPayments ?? 0)}</p></Card><Card><p className="help-text">Outstanding at year end</p><p className="mt-2 text-xl font-semibold text-danger">{money(summary?.totalOutstanding ?? 0)}</p></Card></section>

      <Card><CardHeader><CardTitle>Collection by payment method</CardTitle></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Method</th><th className="px-3 py-2">Receipts</th><th className="px-3 py-2 text-right">Collected (TZS)</th></tr></thead><tbody>{(methodRows ?? []).map((row: any) => <tr key={row.method} className="border-b border-line"><td className="px-3 py-3 capitalize">{String(row.method).replaceAll('_', ' ')}</td><td className="px-3 py-3">{row.payment_count}</td><td className="px-3 py-3 text-right font-medium">{money(Number(row.total_amount))}</td></tr>)}</tbody></table></div>{!methodRows?.length && <p className="help-text p-4">No receipts for this academic year yet.</p>}{canExport && <div className="mt-4 flex flex-wrap gap-3"><Link href={exportCollections} className="text-sm font-medium text-brand-dark hover:underline">Export collection report CSV</Link><Link href={exportOutstanding} className="text-sm font-medium text-brand-dark hover:underline">Export outstanding fees CSV</Link></div>}</Card>

      <Card><CardHeader><CardTitle>Class financial summary</CardTitle></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Class</th><th className="px-3 py-2">Charges</th><th className="px-3 py-2">Adjustments</th><th className="px-3 py-2">Collected</th><th className="px-3 py-2">Outstanding</th><th className="px-3 py-2">Students owing</th></tr></thead><tbody>{(classRows ?? []).map((row: any) => <tr key={row.class_id ?? 'unassigned'} className="border-b border-line"><td className="px-3 py-3">{row.class_name}</td><td className="px-3 py-3">{money(Number(row.total_charges))}</td><td className="px-3 py-3">{money(Number(row.total_adjustments))}</td><td className="px-3 py-3">{money(Number(row.total_allocated_payments))}</td><td className="px-3 py-3 font-semibold">{money(Number(row.total_outstanding))}</td><td className="px-3 py-3">{row.students_with_balance}</td></tr>)}</tbody></table></div>{!classRows?.length && <p className="help-text p-4">No financial records for this academic year.</p>}</Card>

      {canClose && academicYearId && <Card><CardHeader><CardTitle>Academic-year closure</CardTitle></CardHeader>{closure ? <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-medium text-ink">{year?.name} is closed</p><p className="help-text">Closed {closure.closed_at.slice(0, 10)} · {closure.reason}</p></div><ActionForm action={reopenFinanceYear} submitLabel="Reopen year" className="flex items-end gap-3"><input type="hidden" name="academic_year_id" value={academicYearId} /><div><Label htmlFor="reopen_reason">Reason</Label><Input id="reopen_reason" name="reason" minLength={5} maxLength={300} required /></div></ActionForm></div> : <ActionForm action={closeFinanceYear} submitLabel="Close finance year" className="max-w-2xl space-y-3"><input type="hidden" name="academic_year_id" value={academicYearId} /><p className="help-text">Closing prevents new charges, payments, allocations, and adjustments for this year. Reopening requires an authorized user and reason.</p><div><Label htmlFor="close_reason">Closure reason</Label><Input id="close_reason" name="reason" minLength={5} maxLength={300} required /></div></ActionForm>}</Card>}
    </div>
  );
}