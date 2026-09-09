import Link from 'next/link';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { deleteStudent } from '@/lib/actions/students';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteButton } from '@/components/ui/delete-button';
import { Select } from '@/components/ui/field';

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ class_id?: string; q?: string; page?: string }> }) {
  const session = await requirePermission('view_students');
  const { class_id: selectedClassId, q = '', page: pageParam } = await searchParams;
  const pageSize = 25;
  const page = Math.max(Number(pageParam) || 1, 1);
  const supabase = await createServerSupabaseClient();
  let studentQuery = supabase.from('students').select('id, admission_number, first_name, last_name, sex, status, classes(name), streams(name)', { count: 'exact' }).eq('school_id', session.school!.id).eq(selectedClassId ? 'class_id' : 'school_id', selectedClassId || session.school!.id);
  if (q.trim()) {
    const term = q.trim().replace(/[%(),]/g, '');
    studentQuery = studentQuery.or(`admission_number.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  }
  const [{ data: students, count: studentCount }, { data: classes }] = await Promise.all([
    studentQuery.order('last_name').range((page - 1) * pageSize, page * pageSize - 1),
    supabase.from('classes').select('id, name').eq('school_id', session.school!.id).order('order_index'),
  ]);
  const totalPages = Math.max(Math.ceil((studentCount ?? 0) / pageSize), 1);
  const grouped = new Map<string, any[]>();
  for (const student of students ?? []) {
    const className = (Array.isArray(student.classes) ? student.classes[0] : student.classes)?.name ?? 'Unassigned';
    grouped.set(className, [...(grouped.get(className) ?? []), student]);
  }
  const query = (nextPage: number) => new URLSearchParams({ ...(selectedClassId ? { class_id: selectedClassId } : {}), ...(q ? { q } : {}), page: String(nextPage) }).toString();
  const canEdit = session.permissions.has('edit_student');
  const canDelete = session.permissions.has('delete_student');

  return <div className="space-y-6"><div className="flex items-end justify-between border-b border-border pb-5"><div><h2 className="text-2xl font-semibold text-ink">Students</h2><p className="help-text mt-1">Enroll learners and maintain their current records.</p></div>{session.permissions.has('manage_students') && <Link href="/dashboard/students/add" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Add student</Link>}</div><Card><CardHeader><CardTitle>Students ({studentCount ?? 0})</CardTitle></CardHeader><form className="mb-5 flex flex-wrap items-end gap-3"><div className="w-full max-w-sm"><label htmlFor="q" className="label-text mb-1.5 block">Search</label><input id="q" name="q" defaultValue={q} className="h-10 w-full rounded-md border border-border px-3 text-sm" /></div><div><label htmlFor="class_id" className="label-text mb-1.5 block">Class</label><Select id="class_id" name="class_id" defaultValue={selectedClassId ?? ''}><option value="">All classes</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><button className="h-10 rounded-md border border-border bg-white px-4 text-sm font-medium" type="submit">Filter</button></form>{Array.from(grouped.entries()).map(([className, classStudents]) => <div key={className} className="mb-6 last:mb-0"><h3 className="mb-2 font-semibold text-ink">{className} <span className="help-text">({classStudents.length} on this page)</span></h3><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Admission no.</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Stream</th><th className="px-3 py-2">Status</th>{(canEdit || canDelete) && <th className="px-3 py-2">Actions</th>}</tr></thead><tbody>{classStudents.map((student) => { const stream = Array.isArray(student.streams) ? student.streams[0] : student.streams; return <tr key={student.id} className="border-b border-line"><td className="px-3 py-2">{student.admission_number}</td><td className="px-3 py-2 font-medium">{student.first_name} {student.last_name}</td><td className="px-3 py-2">{stream?.name ?? 'Unassigned'}</td><td className="px-3 py-2 capitalize">{student.status}</td>{(canEdit || canDelete) && <td className="px-3 py-2"><div className="flex items-center gap-2">{canEdit && <Link href={`/dashboard/students/${student.id}/edit`} className="text-sm font-medium text-brand hover:underline">Edit</Link>}{canDelete && <DeleteButton action={deleteStudent} id={student.id} label="Delete" confirmText="Delete this student? Students with academic history cannot be deleted." />}</div></td>}</tr>; })}</tbody></table></div></div>)}{!grouped.size && <p className="help-text">No students match this selection.</p>}<div className="flex items-center justify-between border-t border-border pt-4 text-sm"><span className="text-muted">Page {page} of {totalPages}</span><div className="flex gap-3">{page > 1 && <Link className="text-brand hover:underline" href={`/dashboard/students?${query(page - 1)}`}>Previous</Link>}{page < totalPages && <Link className="text-brand hover:underline" href={`/dashboard/students?${query(page + 1)}`}>Next</Link>}</div></div></Card></div>;
}
