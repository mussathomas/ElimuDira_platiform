import { requireSuperAdmin } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

export default async function PlatformDashboardPage() {
  await requireSuperAdmin();
  const supabase = await createServerSupabaseClient();

  const [{ count: total }, { count: active }, { count: suspended }, { count: userCount }] = await Promise.all([
    supabase.from('schools').select('id', { count: 'exact', head: true }),
    supabase.from('schools').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('schools').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  const kpis = [
    { label: 'Registered schools', value: total ?? 0 },
    { label: 'Active schools', value: active ?? 0 },
    { label: 'Suspended schools', value: suspended ?? 0 },
    { label: 'Total platform users', value: userCount ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Platform overview</h2>
        <p className="help-text">Every school registered on ElimuDira, at a glance.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <p className="help-text">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{k.value}</p>
          </Card>
        ))}
      </div>
      <p className="help-text">
        Platform analytics and administration are available from this workspace for monitoring schools, users, and settings.
      </p>
    </div>
  );
}
