import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

export default async function FinancePage() {
  const session = await requirePermission('view_finance');
  const supabase = await createServerSupabaseClient();

  const [{ count: totalStudents }, { count: payments }, { data: recentSchool }] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', session.school!.id),
    supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('school_id', session.school!.id).like('action', '%payment%'),
    supabase.from('schools').select('name').eq('id', session.school!.id).single(),
  ]);

  const kpis = [
    { label: 'Learners', value: totalStudents ?? 0 },
    { label: 'Payments tracked', value: payments ?? 0 },
    { label: 'School', value: recentSchool?.name ?? 'School' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Finance</h2>
        <p className="help-text">Monitor fee structures, balances, and school cash flow.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {kpis.map((item) => (
          <Card key={item.label} className="p-4">
            <p className="help-text">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{item.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
