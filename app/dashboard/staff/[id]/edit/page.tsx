import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { ActionForm } from '@/components/ui/action-form';
import { updateStaffAccount } from '@/lib/actions/staff';

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('edit_staff');
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const [{ data: staff }, { data: roles }] = await Promise.all([
    supabase.from('staff_members').select('id, employee_number, position, profile_id, profiles(full_name, email, phone, role_id)').eq('id', id).eq('school_id', session.school!.id).maybeSingle(),
    supabase.from('roles').select('id, name, is_system').eq('school_id', session.school!.id).order('created_at'),
  ]);
  if (!staff) notFound();
  const profile = Array.isArray(staff.profiles) ? staff.profiles[0] : staff.profiles;

  return <Card><div className="mb-6 flex items-start justify-between"><div><h2 className="text-xl font-semibold text-ink">Edit staff details</h2><p className="help-text mt-1">Update the staff record, account details, role, or password.</p></div><Link href="/dashboard/staff" className="text-sm font-medium text-brand hover:underline">Back to Admin Manager</Link></div><ActionForm action={updateStaffAccount} submitLabel="Save staff details" className="space-y-4"><input type="hidden" name="staff_id" value={staff.id} /><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="employee_number">Employee number</Label><Input id="employee_number" name="employee_number" defaultValue={staff.employee_number} required /></div><div><Label htmlFor="full_name">Full name</Label><Input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ''} required /></div><div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" defaultValue={profile?.email ?? ''} required /></div><div><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" defaultValue={profile?.phone ?? ''} /></div><div><Label htmlFor="position">Position</Label><Input id="position" name="position" defaultValue={staff.position ?? ''} /></div><div><Label htmlFor="role_id">Access role</Label><Select id="role_id" name="role_id" defaultValue={profile?.role_id ?? ''} required><option value="" disabled>Choose a role</option>{(roles ?? []).map((role) => <option key={role.id} value={role.id}>{role.name}{role.is_system ? ' (full access)' : ''}</option>)}</Select></div><div className="sm:col-span-2"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" minLength={8} placeholder="Leave blank to keep the current password" /></div></div></ActionForm></Card>;
}
