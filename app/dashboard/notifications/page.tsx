import { requireSchoolSession } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default async function NotificationsPage() {
  const session = await requireSchoolSession();
  const supabase = await createServerSupabaseClient();

  const { data: recentActivity } = await supabase
    .from('audit_logs')
    .select('action, resource_type, created_at')
    .eq('school_id', session.school.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Notifications</h2>
        <p className="help-text">Recent alerts, updates, and administrative activity for the school workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest notifications</CardTitle>
        </CardHeader>
        {recentActivity && recentActivity.length > 0 ? (
          <ul className="space-y-3">
            {recentActivity.map((entry: any, index: number) => (
              <li key={`${entry.action}-${index}`} className="flex items-center justify-between border-b border-line pb-2 last:border-0 last:pb-0">
                <span className="text-ink-soft">{entry.action} · {entry.resource_type}</span>
                <span className="help-text">{new Date(entry.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="help-text">No notifications have been recorded yet.</p>
        )}
      </Card>
    </div>
  );
}
