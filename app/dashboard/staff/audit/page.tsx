import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

const PAGE_SIZE = 50;

export default async function SchoolAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requirePermission('view_audit');
  const { page: pageParam } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const page = Math.max(Number(pageParam) || 1, 1);
  const from = (page - 1) * PAGE_SIZE;

  const { data: logs, count } = await supabase
    .from('audit_logs')
    .select('id, action, resource_type, resource_id, created_at, actor_id, profiles(full_name)', { count: 'exact' })
    .eq('school_id', session.school!.id)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-ink">Audit log</h2>
        <p className="help-text">Read-only record of sensitive actions taken in your school&apos;s workspace.</p>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Who</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Resource</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((log) => (
              <tr key={log.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-ink-soft">{new Date(log.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-ink-soft">{(log.profiles as any)?.full_name ?? 'System'}</td>
                <td className="px-4 py-3 font-medium text-ink">{log.action}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {log.resource_type}
                  {log.resource_id ? ` · ${log.resource_id.slice(0, 8)}` : ''}
                </td>
              </tr>
            ))}
            {(logs ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center help-text">No activity recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <p className="help-text">{count ?? 0} total entries · page {page}</p>
    </div>
  );
}
