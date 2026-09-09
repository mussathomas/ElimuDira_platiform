import Link from 'next/link';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { ActionForm } from '@/components/ui/action-form';
import { createStudent } from '@/lib/actions/students';

export default async function AddStudentPage() {
  const session = await requirePermission('manage_students');
  const supabase = await createServerSupabaseClient();
  const [{ data: classes }, { data: streams }] = await Promise.all([
    supabase.from('classes').select('id, name, education_level_id').eq('school_id', session.school!.id).order('order_index'),
    supabase.from('streams').select('id, name, class_id').eq('school_id', session.school!.id).order('name'),
  ]);

  return <Card>
    <div className="mb-6 flex items-start justify-between"><div><h2 className="text-xl font-semibold text-ink">Register student</h2><p className="help-text mt-1">Create a learner record and optionally assign a class and stream.</p></div><Link href="/dashboard/students" className="text-sm font-medium text-brand hover:underline">Back to students</Link></div>
    <ActionForm action={createStudent} submitLabel="Register student" className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label htmlFor="admission_number">Admission number</Label><Input id="admission_number" name="admission_number" required /></div>
        <div><Label htmlFor="sex">Sex</Label><Select id="sex" name="sex" defaultValue=""><option value="">Choose</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select></div>
        <div><Label htmlFor="first_name">First name</Label><Input id="first_name" name="first_name" required /></div>
        <div><Label htmlFor="last_name">Last name</Label><Input id="last_name" name="last_name" required /></div>
        <div><Label htmlFor="date_of_birth">Date of birth</Label><Input id="date_of_birth" name="date_of_birth" type="date" /></div>
        <div><Label htmlFor="class_id">Class</Label><Select id="class_id" name="class_id" defaultValue=""><option value="">Unassigned</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
        <div><Label htmlFor="stream_id">Stream</Label><Select id="stream_id" name="stream_id" defaultValue=""><option value="">Unassigned</option>{(streams ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
      </div>
      <div className="border-t border-line pt-4"><p className="label-text mb-3">Guardian contact</p><div className="grid grid-cols-3 gap-4"><div><Label htmlFor="guardian_name">Name</Label><Input id="guardian_name" name="guardian_name" /></div><div><Label htmlFor="guardian_phone">Phone</Label><Input id="guardian_phone" name="guardian_phone" /></div><div><Label htmlFor="guardian_email">Email</Label><Input id="guardian_email" name="guardian_email" type="email" /></div></div></div>
    </ActionForm>
  </Card>;
}
