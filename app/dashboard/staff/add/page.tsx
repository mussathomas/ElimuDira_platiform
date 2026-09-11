import Link from 'next/link';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { ActionForm } from '@/components/ui/action-form';
import { createStaffAccount } from '@/lib/actions/staff';

export default async function AddStaffPage() {
  const session = await requirePermission('manage_staff');
  const supabase = await createServerSupabaseClient();
  const { data: roles } = await supabase.from('roles').select('id, name, is_system').eq('school_id', session.school!.id).order('created_at');
  return <Card><div className="mb-6 flex items-start justify-between"><div><h2 className="text-xl font-semibold text-ink">Register staff</h2><p className="help-text mt-1">Create a staff account and assign a school role.</p></div><Link href="/dashboard/staff" className="text-sm font-medium text-brand hover:underline">Back to Admin Manager</Link></div><ActionForm action={createStaffAccount} submitLabel="Create staff account" className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="employee_number">Employee number</Label><Input id="employee_number" name="employee_number" required /></div><div><Label htmlFor="full_name">Full name</Label><Input id="full_name" name="full_name" required /></div><div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div><div><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" /></div><div><Label htmlFor="position">Position</Label><Input id="position" name="position" placeholder="Teacher, bursar, secretary" /></div><div><Label htmlFor="role_id">Access role</Label><Select id="role_id" name="role_id" defaultValue="" required><option value="" disabled>Choose a role</option>{(roles ?? []).map((role) => <option key={role.id} value={role.id}>{role.name}{role.is_system ? ' (full access)' : ''}</option>)}</Select></div><div className="sm:col-span-2"><Label htmlFor="password">Temporary password</Label><Input id="password" name="password" type="password" minLength={8} required /></div></div></ActionForm></Card>;
}
