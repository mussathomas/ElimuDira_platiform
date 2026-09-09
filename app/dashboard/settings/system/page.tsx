import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, Badge } from '@/components/ui/card';

export default async function SystemSettingsPage() {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { data: school } = await supabase
    .from('schools')
    .select('slug, status, created_at')
    .eq('id', session.school!.id)
    .single();

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-ink">System settings</h2>
        <p className="help-text">Workspace-level information about your ElimuDira account.</p>
      </div>
      <Card>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Workspace ID</dt>
            <dd className="font-mono text-ink-soft">{session.school!.id}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Workspace slug</dt>
            <dd className="text-ink-soft">{school?.slug}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Status</dt>
            <dd><Badge variant={school?.status === 'active' ? 'success' : 'warning'}>{school?.status}</Badge></dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Registered on</dt>
            <dd className="text-ink-soft">{school ? new Date(school.created_at).toLocaleDateString() : '—'}</dd>
          </div>
        </dl>
      </Card>
      <p className="help-text">
        Subscription/plan management and platform-wide system preferences are introduced alongside billing in a
        later phase.
      </p>
    </div>
  );
}
