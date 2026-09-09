import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { updateStudent } from '@/lib/actions/students';
import { ActionForm } from '@/components/ui/action-form';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('edit_student');
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const [{ data: student }, { data: classes }, { data: streams }] = await Promise.all([
    supabase.from('students').select('id, admission_number, first_name, last_name, sex, date_of_birth, class_id, stream_id, guardian_name, guardian_phone, guardian_email').eq('id', id).eq('school_id', session.school!.id).maybeSingle(),
    supabase.from('classes').select('id, name').eq('school_id', session.school!.id).order('order_index'),
    supabase.from('streams').select('id, name, class_id').eq('school_id', session.school!.id).order('name'),
  ]);
  if (!student) notFound();
  return <Card><div className="mb-6 flex items-start justify-between"><div><h2 className="text-xl font-semibold text-ink">Edit student</h2><p className="help-text mt-1">Update the learner record without changing historical academic records.</p></div><Link href="/dashboard/students" className="text-sm font-medium text-brand hover:underline">Back to students</Link></div><ActionForm action={updateStudent} submitLabel="Save changes" className="space-y-4"><input type="hidden" name="student_id" value={student.id} /><div className="grid grid-cols-2 gap-4"><div><Label htmlFor="admission_number">Admission number</Label><Input id="admission_number" name="admission_number" defaultValue={student.admission_number} required /></div><div><Label htmlFor="sex">Sex</Label><Select id="sex" name="sex" defaultValue={student.sex ?? ''}><option value="">Choose</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select></div><div><Label htmlFor="first_name">First name</Label><Input id="first_name" name="first_name" defaultValue={student.first_name} required /></div><div><Label htmlFor="last_name">Last name</Label><Input id="last_name" name="last_name" defaultValue={student.last_name} required /></div><div><Label htmlFor="date_of_birth">Date of birth</Label><Input id="date_of_birth" name="date_of_birth" type="date" defaultValue={student.date_of_birth ?? ''} /></div><div><Label htmlFor="class_id">Class</Label><Select id="class_id" name="class_id" defaultValue={student.class_id ?? ''}><option value="">Unassigned</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><div><Label htmlFor="stream_id">Stream</Label><Select id="stream_id" name="stream_id" defaultValue={student.stream_id ?? ''}><option value="">Unassigned</option>{(streams ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div></div><div className="border-t border-line pt-4"><p className="label-text mb-3">Guardian contact</p><div className="grid grid-cols-3 gap-4"><div><Label htmlFor="guardian_name">Name</Label><Input id="guardian_name" name="guardian_name" defaultValue={student.guardian_name ?? ''} /></div><div><Label htmlFor="guardian_phone">Phone</Label><Input id="guardian_phone" name="guardian_phone" defaultValue={student.guardian_phone ?? ''} /></div><div><Label htmlFor="guardian_email">Email</Label><Input id="guardian_email" name="guardian_email" type="email" defaultValue={student.guardian_email ?? ''} /></div></div></div></ActionForm></Card>;
}
