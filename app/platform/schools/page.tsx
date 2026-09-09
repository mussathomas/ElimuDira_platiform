import { requireSuperAdmin } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, Badge } from '@/components/ui/card';
import { SchoolStatusActions } from '@/components/platform/school-status-actions';
import type { SchoolStatus } from '@/types/database';

const STATUS_BADGE: Record<SchoolStatus, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  suspended: 'warning',
  deactivated: 'danger',
};

export default async function AllSchoolsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireSuperAdmin();
  const { status } = await searchParams;
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('schools')
    .select('id, name, slug, school_type, status, created_at')
    .order('created_at', { ascending: false });

  if (status && ['active', 'suspended', 'deactivated'].includes(status)) {
    query = query.eq('status', status);
  }

  const { data: schools } = await query;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-ink">Schools</h2>
        <p className="help-text">{status ? `Filtered: ${status}` : 'All registered schools.'}</p>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Registered</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(schools ?? []).map((school) => (
              <tr key={school.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{school.name}</p>
                  <p className="help-text">{school.slug}</p>
                </td>
                <td className="px-4 py-3 capitalize text-ink-soft">{school.school_type}</td>
                <td className="px-4 py-3 text-ink-soft">{new Date(school.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_BADGE[school.status as SchoolStatus]}>{school.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  <SchoolStatusActions schoolId={school.id} status={school.status} />
                </td>
              </tr>
            ))}
            {(schools ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center help-text">
                  No schools match this filter yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
