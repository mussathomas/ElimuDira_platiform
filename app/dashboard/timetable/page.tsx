import Link from 'next/link';
import { requirePermission } from '@/lib/permissions/session';
import { loadTimetableIndex } from '@/lib/timetable/data';
import { createTimetable } from '@/lib/actions/timetable';
import { ActionForm } from '@/components/ui/action-form';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';

type View = 'weekly' | 'class' | 'teacher' | 'room';

export async function TimetableIndexPage({ status, showCreate = false, view = 'weekly' }: { status?: string; showCreate?: boolean; view?: View }) {
  const session = await requirePermission('view_timetable');
  const data = await loadTimetableIndex(session.school!.id, status);
  const yearName = new Map(data.years.map((year: any) => [year.id, year.name]));
  const className = new Map(data.classes.map((item: any) => [item.id, item.name]));
  const subjectName = new Map(data.subjects.map((item: any) => [item.id, item.name]));
  const teacherName = new Map(data.teachers.map((item: any) => [item.id, item.name]));
  const roomName = new Map(data.rooms.map((item: any) => [item.id, item.name]));
  const entriesByTimetable = new Map<string, any[]>();
  for (const entry of data.entries) entriesByTimetable.set(entry.timetable_id, [...(entriesByTimetable.get(entry.timetable_id) ?? []), entry]);
  return <div className="space-y-6">
    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">Timetable</p><h2 className="text-2xl font-semibold text-ink">{view === 'class' ? 'Class timetables' : view === 'teacher' ? 'Teacher timetables' : view === 'room' ? 'Room timetables' : status === 'PUBLISHED' ? 'Published timetables' : 'School timetables'}</h2><p className="help-text mt-1">Open a saved timetable to arrange lessons, resolve conflicts, save changes, and publish it.</p></div>{session.permissions.has('create_timetable') && <Link href="/dashboard/timetable/manage" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">Create timetable</Link>}</div>
    {showCreate && session.permissions.has('create_timetable') && <Card><CardHeader><CardTitle>Create timetable</CardTitle></CardHeader><ActionForm action={createTimetable} submitLabel="Create timetable"><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div><div><Label htmlFor="term">Term / semester</Label><Input id="term" name="term" required /></div><div><Label htmlFor="academic_year_id">Academic year</Label><Select id="academic_year_id" name="academic_year_id" required defaultValue={data.years[0]?.id ?? ''}><option value="" disabled>Choose academic year</option>{data.years.map((year: any) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select></div><div><Label htmlFor="level">Level</Label><Select id="level" name="level"><option value="">All levels</option><option value="O-Level">O-Level</option><option value="A-Level">A-Level</option></Select></div></div></ActionForm></Card>}
    <Card><CardHeader><CardTitle>{data.timetables.length} timetable{data.timetables.length === 1 ? '' : 's'}</CardTitle><div className="flex gap-3 text-sm"><Link className="text-brand hover:underline" href="/dashboard/timetable">All</Link><Link className="text-brand hover:underline" href="/dashboard/timetable/published">Published</Link></div></CardHeader><div className="space-y-4">{data.timetables.map((timetable: any) => { const allEntries = entriesByTimetable.get(timetable.id) ?? []; const filteredEntries = allEntries.filter((entry) => view === 'class' ? Boolean(entry.class_id) : view === 'teacher' ? Boolean(entry.teacher_id) : view === 'room' ? Boolean(entry.room_id) : true); return <div key={timetable.id} className="rounded-md border border-border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-ink">{timetable.name}</p><p className="help-text">{yearName.get(timetable.academic_year_id) ?? 'Academic year'} · {timetable.term}{timetable.level ? ` · ${timetable.level}` : ''}</p></div><div className="flex items-center gap-3"><span className="text-xs font-semibold text-brand-dark">{timetable.status}{timetable.is_dirty ? ' · Pending republish' : ''}</span><Link className="text-sm font-medium text-brand hover:underline" href={`/dashboard/timetable/${timetable.id}?view=${view}`}>Open workspace</Link></div></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><span className="text-sm text-muted">{filteredEntries.length} lessons</span>{view === 'class' && <span className="text-sm text-muted">Classes: {[...new Set(filteredEntries.map((entry) => className.get(entry.class_id) ?? 'Unknown'))].join(', ') || 'None'}</span>}{view === 'teacher' && <span className="text-sm text-muted">Teachers: {[...new Set(filteredEntries.map((entry) => teacherName.get(entry.teacher_id) ?? 'Unassigned'))].join(', ') || 'None'}</span>}{view === 'room' && <span className="text-sm text-muted">Rooms: {[...new Set(filteredEntries.map((entry) => roomName.get(entry.room_id) ?? 'Unassigned'))].join(', ') || 'None'}</span>}{view === 'weekly' && <span className="text-sm text-muted">Subjects: {[...new Set(filteredEntries.map((entry) => subjectName.get(entry.subject_id) ?? 'Unknown'))].slice(0, 4).join(', ') || 'None'}</span>}</div></div>; })}{!data.timetables.length && <p className="help-text">No timetables match this view. Create a timetable to begin scheduling lessons.</p>}</div></Card>
  </div>;
}

export default async function TimetablePage() { return <TimetableIndexPage />; }
