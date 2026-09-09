import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { markClassAttendance } from '@/lib/actions/attendance';
import { ActionForm } from '@/components/ui/action-form';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/field';

export default async function AttendanceClassPage({ searchParams }: { searchParams: Promise<{ class_id?: string; stream_id?: string; date?: string }> }) {
  const session = await requirePermission('mark_attendance');
  const supabase = await createServerSupabaseClient();
  const { class_id: classId = '', stream_id: streamId = '', date = new Date().toISOString().slice(0, 10) } = await searchParams;
  const [{ data: classes }, { data: streams }, { data: records }] = await Promise.all([
    supabase.from('classes').select('id, name').eq('school_id', session.school!.id).order('order_index'),
    supabase.from('streams').select('id, name, class_id').eq('school_id', session.school!.id).order('name'),
    supabase.from('student_attendance').select('student_id, status, attendance_days!inner(attendance_date)').eq('school_id', session.school!.id).eq('attendance_days.attendance_date', date),
  ]);
  const selectedClass = (classes ?? []).find((item: any) => item.id === classId);
  const selectedStream = (streams ?? []).find((item: any) => item.id === streamId && item.class_id === classId);
  let studentsQuery = supabase
    .from('students')
    .select('id, admission_number, first_name, last_name')
    .eq('school_id', session.school!.id)
    .eq('class_id', classId)
    .order('last_name');
  if (streamId && selectedStream) studentsQuery = studentsQuery.eq('stream_id', streamId);
  const { data: students } = classId && selectedClass ? await studentsQuery : { data: [] };
  const statusByStudent = new Map<string, string>((records ?? []).map((record: any) => [record.student_id, record.status]));
  return <div className="space-y-6"><div><h2 className="text-xl font-semibold text-ink">Class attendance</h2><p className="help-text">Mark the full roster and save it in one action.</p></div><Card><CardHeader><CardTitle>Daily register</CardTitle></CardHeader><form method="get" className="mb-5 grid gap-3 md:grid-cols-3"><Select name="class_id" defaultValue={classId}><option value="">Select class</option>{(classes ?? []).map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Select name="stream_id" defaultValue={selectedStream?.id ?? ''}><option value="">All streams</option>{(streams ?? []).filter((item: any) => !classId || item.class_id === classId).map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Input name="date" type="date" defaultValue={date} /><button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white" type="submit">Load roster</button></form>{classId && !selectedClass ? <p className="help-text">That class is not available in this school.</p> : classId ? <ActionForm action={markClassAttendance} submitLabel="Save register"><input type="hidden" name="class_id" value={classId} /><input type="hidden" name="stream_id" value={selectedStream?.id ?? ''} /><input type="hidden" name="date" value={date} /><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-2 py-2">Admission no.</th><th className="px-2 py-2">Student</th><th className="px-2 py-2">Status</th></tr></thead><tbody>{(students ?? []).map((student: any) => <tr key={student.id} className="border-b border-line"><td className="px-2 py-2">{student.admission_number}</td><td className="px-2 py-2 font-medium">{student.first_name} {student.last_name}</td><td className="px-2 py-2"><Select name={`status_${student.id}`} defaultValue={statusByStudent.get(student.id) ?? 'present'}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></Select></td></tr>)}</tbody></table></div>{!(students ?? []).length && <p className="help-text mt-4">No active students are assigned to this class{selectedStream ? ` and stream ${selectedStream.name}` : ''}.</p>}</ActionForm> : <p className="help-text">Choose a class and select Load roster to view its students.</p>}</Card></div>;
}
