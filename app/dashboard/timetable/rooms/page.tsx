import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createTimetableRoom, deleteTimetableRoom } from '@/lib/actions/timetable';
import { ActionForm } from '@/components/ui/action-form';
import { DeleteButton } from '@/components/ui/delete-button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';

export default async function TimetableRoomsPage() {
  const session = await requirePermission('edit_timetable_settings');
  const supabase = await createServerSupabaseClient();
  const { data: rooms } = await supabase.from('timetable_rooms').select('id, name, room_type, capacity, notes').eq('school_id', session.school!.id).order('name');
  return <div className="space-y-6"><div><h2 className="text-2xl font-semibold text-ink">Timetable rooms</h2><p className="help-text mt-1">Manage rooms once and reuse them across all school timetables.</p></div><Card><CardHeader><CardTitle>Add room</CardTitle></CardHeader><ActionForm action={createTimetableRoom} submitLabel="Add room"><div className="grid gap-4 sm:grid-cols-3"><div><Label htmlFor="name">Room name</Label><Input id="name" name="name" placeholder="Physics Lab" required /></div><div><Label htmlFor="room_type">Type</Label><Select id="room_type" name="room_type"><option value="classroom">Classroom</option><option value="laboratory">Laboratory</option><option value="hall">Hall</option><option value="library">Library</option></Select></div><div><Label htmlFor="capacity">Capacity</Label><Input id="capacity" name="capacity" type="number" min="1" /></div></div></ActionForm></Card><Card><CardHeader><CardTitle>Rooms ({rooms?.length ?? 0})</CardTitle></CardHeader><div className="divide-y divide-line">{(rooms ?? []).map((room: any) => <div key={room.id} className="flex items-center justify-between py-3 text-sm"><span><strong>{room.name}</strong><span className="help-text ml-2">{room.room_type}{room.capacity ? ` · ${room.capacity} seats` : ''}</span></span><DeleteButton action={deleteTimetableRoom} id={room.id} label="Remove" /></div>)}{!rooms?.length && <p className="help-text py-3">No rooms configured.</p>}</div></Card></div>;
}
