import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default async function StaffPositionsPage() {
  await requirePermission('view_staff');
  const supabase = await createServerSupabaseClient();

  const { data: staff } = await supabase
    .from('staff_members')
    .select('position')
    .eq('school_id', (await requirePermission('view_staff')).school!.id)
    .not('position', 'is', null);

  const positions = Array.from(
    new Map(
      (staff ?? []).map((member: any) => [member.position, 0])
    ).keys()
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Positions</h2>
        <p className="help-text">View role titles currently used by school staff.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff positions ({positions.length})</CardTitle>
        </CardHeader>
        {positions.length === 0 ? (
          <p className="help-text">No positions have been assigned yet.</p>
        ) : (
          <ul className="space-y-2">
            {positions.map((position) => (
              <li key={position} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <span className="font-medium text-ink">{position}</span>
                <span className="help-text">{(staff ?? []).filter((member: any) => member.position === position).length} staff</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
