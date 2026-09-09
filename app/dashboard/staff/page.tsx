import Link from 'next/link';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default async function StaffPage() {
  const session = await requirePermission('view_staff');
  const supabase = await createServerSupabaseClient();
  const { data: staff } = await supabase.from('staff_members').select('id, employee_number, position, profiles(full_name, email, phone, role:roles(name))').eq('school_id', session.school!.id).order('employee_number');

  return <div className="space-y-6">
    <div className="flex items-end justify-between border-b border-border pb-5"><div><h2 className="text-2xl font-semibold text-ink">Staff</h2><p className="help-text mt-1">Register staff members and create their school accounts.</p></div>{session.permissions.has('manage_staff') && <Link href="/dashboard/staff/users" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Register staff</Link>}</div>
    <Card><CardHeader><CardTitle>Staff register ({staff?.length ?? 0})</CardTitle></CardHeader><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Employee no.</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Position</th><th className="px-3 py-2">Role</th></tr></thead><tbody>{(staff ?? []).map((member) => { const profile = member.profiles as { full_name?: string; email?: string; role?: { name?: string } | null } | null; return <tr key={member.id} className="border-b border-line"><td className="px-3 py-2">{member.employee_number}</td><td className="px-3 py-2 font-medium">{profile?.full_name}</td><td className="px-3 py-2">{profile?.email}</td><td className="px-3 py-2">{member.position ?? 'Not set'}</td><td className="px-3 py-2">{profile?.role?.name ?? 'Not set'}</td></tr>; })}</tbody></table></div>{(staff ?? []).length === 0 && <p className="help-text mt-4">No staff members have been registered yet.</p>}</Card>
  </div>;
}
