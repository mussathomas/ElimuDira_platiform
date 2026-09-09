import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CommunicationSettingsPage() {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { data: school } = await supabase
    .from('schools')
    .select('name, phone, email, motto')
    .eq('id', session.school!.id)
    .single();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Communication</h2>
        <p className="help-text">Manage the school contact preferences used in notices, reports, and reminders.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Primary contact details</CardTitle>
        </CardHeader>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">School</dt><dd className="text-ink-soft">{school?.name ?? '—'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Phone</dt><dd className="text-ink-soft">{school?.phone ?? 'Not set'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Email</dt><dd className="text-ink-soft">{school?.email ?? 'Not set'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Motto</dt><dd className="text-ink-soft">{school?.motto ?? 'Not set'}</dd></div>
        </dl>
      </Card>
    </div>
  );
}
