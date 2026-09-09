import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { approveAttendance } from '@/lib/actions/attendance';
import { ActionForm } from '@/components/ui/action-form';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default async function AttendanceApprovalPage() {
  const session = await requirePermission('approve_attendance');
  const supabase = await createServerSupabaseClient();
  const { data: days } = await supabase.from('attendance_days').select('id, attendance_date, approved, approved_at, student_attendance(id), staff_attendance(id)').eq('school_id', session.school!.id).order('attendance_date', { ascending: false }).limit(30);
  return <div className="space-y-6"><div><h2 className="text-xl font-semibold text-ink">Attendance approval</h2><p className="help-text">Approve a whole school day to lock student and staff sign-in changes.</p></div><Card><CardHeader><CardTitle>Daily attendance</CardTitle></CardHeader><div className="space-y-3">{(days ?? []).map((day: any) => <div key={day.id} className="flex items-center justify-between border-b border-line py-3"><div><p className="font-medium">{new Date(day.attendance_date).toLocaleDateString()}</p><p className="text-sm text-muted">{day.student_attendance?.length ?? 0} student records · {day.staff_attendance?.length ?? 0} staff records</p></div>{day.approved ? <span className="text-sm text-muted">Approved</span> : <ActionForm action={approveAttendance} submitLabel="Approve"><input type="hidden" name="date" value={day.attendance_date} /></ActionForm>}</div>)}{!(days ?? []).length && <p className="text-sm text-muted">No attendance days have been submitted.</p>}</div></Card></div>;
}
