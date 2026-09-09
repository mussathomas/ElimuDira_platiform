import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createTimetablePeriod, deleteTimetablePeriod } from '@/lib/actions/timetable';
import { ActionForm } from '@/components/ui/action-form';
import { DeleteButton } from '@/components/ui/delete-button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/field';

export default async function TimetablePeriodsPage() {
  const session = await requirePermission('edit_timetable_settings');
  const supabase = await createServerSupabaseClient();
  const { data: periods } = await supabase.from('timetable_periods').select('id, name, starts_at, ends_at, order_index, is_break').eq('school_id', session.school!.id).order('order_index').order('starts_at');
  return <div className="space-y-6"><div><h2 className="text-2xl font-semibold text-ink">Periods & time slots</h2><p className="help-text mt-1">Configure the school day once; timetable lessons use these slots.</p></div><Card><CardHeader><CardTitle>Add period or break</CardTitle></CardHeader><ActionForm action={createTimetablePeriod} submitLabel="Add period"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><Label htmlFor="name">Name</Label><Input id="name" name="name" placeholder="Period 1" required /></div><div><Label htmlFor="starts_at">Start time</Label><Input id="starts_at" name="starts_at" type="time" required /></div><div><Label htmlFor="ends_at">End time</Label><Input id="ends_at" name="ends_at" type="time" required /></div><div><Label htmlFor="order_index">Order</Label><Input id="order_index" name="order_index" type="number" min="0" defaultValue="0" /></div></div><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="is_break" /> Break or lunch</label></ActionForm></Card><Card><CardHeader><CardTitle>Configured slots ({periods?.length ?? 0})</CardTitle></CardHeader><div className="divide-y divide-line">{(periods ?? []).map((period: any) => <div key={period.id} className="flex items-center justify-between py-3 text-sm"><span><strong>{period.name}</strong><span className="help-text ml-2">{period.starts_at.slice(0, 5)} - {period.ends_at.slice(0, 5)}{period.is_break ? ' · Break' : ''}</span></span><DeleteButton action={deleteTimetablePeriod} id={period.id} label="Remove" /></div>)}{!periods?.length && <p className="help-text py-3">No periods configured. Add periods before creating lessons.</p>}</div></Card></div>;
}
