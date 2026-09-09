import { requireSchoolSession } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { signIn, signOut } from '@/lib/actions/attendance';
import { ActionForm } from '@/components/ui/action-form';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default async function AttendancePersonalPage() {
  const session = await requireSchoolSession();
  const supabase = await createServerSupabaseClient();
  const date = new Date().toISOString().slice(0, 10);
  const { data: today } = await supabase.from('staff_attendance').select('signed_in_at, signed_out_at, attendance_days!inner(attendance_date)').eq('school_id', session.school.id).eq('profile_id', session.userId).eq('attendance_days.attendance_date', date).maybeSingle();
  return <div className="max-w-xl space-y-6"><div><h2 className="text-xl font-semibold text-ink">Personal attendance</h2><p className="help-text">Record your own arrival and departure time automatically.</p></div><Card><CardHeader><CardTitle>Today</CardTitle></CardHeader><p className="text-sm text-muted">{today?.signed_in_at ? `Signed in at ${new Date(today.signed_in_at).toLocaleTimeString()}` : 'Not signed in yet.'}</p>{today?.signed_out_at && <p className="mt-1 text-sm text-muted">Signed out at {new Date(today.signed_out_at).toLocaleTimeString()}</p>}<div className="mt-4 flex gap-3">{!today?.signed_in_at && <ActionForm action={signIn} submitLabel="Sign in"><input type="hidden" name="intent" value="sign-in" /></ActionForm>} {today?.signed_in_at && !today.signed_out_at && <ActionForm action={signOut} submitLabel="Sign out"><input type="hidden" name="intent" value="sign-out" /></ActionForm>}</div></Card></div>;
}
