'use client';

import * as React from 'react';
import { approveTimetable, archiveTimetable, generateTimetable, publishTimetable, saveTimetableEntries, submitTimetableForReview } from '@/lib/actions/timetable';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select, Textarea } from '@/components/ui/field';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
type Entry = { id: string; class_id: string; subject_id: string; teacher_id: string | null; room_id: string | null; period_id: string; day_of_week: number; start_time: string | null; end_time: string | null; lesson_type: string; notes: string | null };
type Option = { id: string; name: string };
type Period = Option & { starts_at: string; ends_at: string; is_break: boolean };
type Props = { timetable: any; entries: Entry[]; classes: Option[]; subjects: Option[]; teachers: Option[]; rooms: Option[]; periods: Period[]; canManage: boolean; canApprove: boolean; canPublish: boolean; initialView?: 'weekly' | 'class' | 'teacher' | 'room' };

export function TimetableWorkspace({ timetable, entries: initialEntries, classes, subjects, teachers, rooms, periods, canManage, canApprove, canPublish, initialView = 'weekly' }: Props) {
  const [entries, setEntries] = React.useState(initialEntries);
  const [history, setHistory] = React.useState<Entry[][]>([]);
  const [future, setFuture] = React.useState<Entry[][]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [view, setView] = React.useState(initialView);
  const [filter, setFilter] = React.useState({ class_id: '', teacher_id: '', room_id: '', subject_id: '' });
  const [dirty, setDirty] = React.useState(false);
  const [autoSave, setAutoSave] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const dragId = React.useRef<string | null>(null);
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const className = new Map(classes.map((item) => [item.id, item.name]));
  const subjectName = new Map(subjects.map((item) => [item.id, item.name]));
  const teacherName = new Map(teachers.map((item) => [item.id, item.name]));
  const roomName = new Map(rooms.map((item) => [item.id, item.name]));
  const periodMap = new Map(periods.map((item) => [item.id, item]));
  const filteredEntries = entries.filter((entry) => (!filter.class_id || entry.class_id === filter.class_id) && (!filter.teacher_id || entry.teacher_id === filter.teacher_id) && (!filter.room_id || entry.room_id === filter.room_id) && (!filter.subject_id || entry.subject_id === filter.subject_id));

  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = 'You have unsaved timetable changes. Leave without saving?';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  React.useEffect(() => {
    if (!autoSave || !dirty || busy) return;
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
  }, [autoSave, dirty, entries, busy]);

  function commit(next: Entry[]) {
    setHistory((items) => [...items.slice(-19), entries]);
    setFuture([]);
    setEntries(next);
    setDirty(true);
  }

  function moveEntry(id: string, day: number, periodId: string) {
    const moving = entries.find((entry) => entry.id === id);
    if (!moving) return;
    const conflict = entries.find((entry) => entry.id !== id && entry.day_of_week === day && entry.period_id === periodId && (entry.class_id === moving.class_id || (moving.teacher_id && entry.teacher_id === moving.teacher_id) || (moving.room_id && entry.room_id === moving.room_id)));
    if (conflict) {
      setMessage('Cannot move lesson: the class, teacher, or room is already occupied in that slot.');
      return;
    }
    const period = periodMap.get(periodId);
    if (period?.is_break) {
      setMessage('Cannot place a lesson during a break.');
      return;
    }
    commit(entries.map((entry) => entry.id === id ? { ...entry, day_of_week: day, period_id: periodId, start_time: period?.starts_at ?? entry.start_time, end_time: period?.ends_at ?? entry.end_time } : entry));
    setMessage('Lesson moved. Unsaved changes.');
  }

  function updateSelected(fields: Partial<Entry>) {
    if (!selected) return;
    commit(entries.map((entry) => entry.id === selected.id ? { ...entry, ...fields } : entry));
  }

  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    setMessage('Saving changes...');
    const form = new FormData();
    form.set('timetable_id', timetable.id);
    form.set('entries', JSON.stringify(entries));
    try {
      const result = await saveTimetableEntries(form);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setDirty(false);
      setHistory([]);
      setFuture([]);
      setMessage('Changes saved successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save changes.');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (dirty) {
      setMessage('Save changes before publishing.');
      return;
    }
    setBusy(true);
    setMessage('Publishing timetable...');
    const form = new FormData();
    form.set('timetable_id', timetable.id);
    try {
      const result = await publishTimetable(form);
      setMessage(result.ok ? 'Timetable published successfully.' : result.error);
    } catch {
      setMessage('Failed to publish timetable.');
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: (form: FormData) => Promise<{ ok: boolean; error?: string }>, label: string) {
    setBusy(true);
    setMessage(`${label}...`);
    const form = new FormData();
    form.set('timetable_id', timetable.id);
    try {
      const result = await action(form);
      setMessage(result.ok ? `Timetable ${label.toLowerCase()} successfully.` : result.error ?? `Unable to ${label.toLowerCase()} timetable.`);
    } catch {
      setMessage(`Unable to ${label.toLowerCase()} timetable.`);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!window.confirm('Archive this timetable?')) return;
    setBusy(true);
    const form = new FormData();
    form.set('timetable_id', timetable.id);
    try {
      const result = await archiveTimetable(form);
      setMessage(result.ok ? 'Timetable archived successfully.' : result.error);
    } catch {
      setMessage('Failed to archive timetable.');
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setMessage('Generating draft...');
    const form = new FormData();
    form.set('timetable_id', timetable.id);
    try {
      const result = await generateTimetable(form);
      if (result.ok) window.location.reload();
      else setMessage(result.error);
    } catch {
      setMessage('Failed to generate timetable.');
    } finally {
      setBusy(false);
    }
  }

  function addLesson() {
    const period = periods.find((item) => !item.is_break);
    const subject = subjects[0];
    const schoolClass = classes[0];
    if (!period || !subject || !schoolClass) {
      setMessage('Add classes, subjects, and periods before adding lessons.');
      return;
    }
    const id = crypto.randomUUID();
    commit([...entries, { id, class_id: schoolClass.id, subject_id: subject.id, teacher_id: null, room_id: null, period_id: period.id, day_of_week: 1, start_time: period.starts_at, end_time: period.ends_at, lesson_type: 'lesson', notes: null }]);
    setSelectedId(id);
    setMessage('Lesson added. Unsaved changes.');
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [...items, entries]);
    setEntries(previous);
    setHistory((items) => items.slice(0, -1));
    setDirty(true);
  }

  function redo() {
    const next = future.at(-1);
    if (!next) return;
    setHistory((items) => [...items, entries]);
    setEntries(next);
    setFuture((items) => items.slice(0, -1));
    setDirty(true);
  }

  const visiblePeriods = periods;
  return <div className="space-y-5">
    <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">Timetable workspace</p><h2 className="text-2xl font-semibold text-ink">{timetable.name}</h2><p className="help-text">{timetable.term} · {timetable.status}{timetable.is_dirty ? ' · Pending republish' : ''}</p></div>
      <div className="flex flex-wrap gap-2">
        {canManage && <><Button variant="secondary" size="sm" onClick={addLesson}>Add lesson</Button><Button variant="secondary" size="sm" onClick={() => void generate()} disabled={busy}>Generate draft</Button></>}
        <Button variant="secondary" size="sm" onClick={undo} disabled={!history.length}>Undo</Button><Button variant="secondary" size="sm" onClick={redo} disabled={!future.length}>Redo</Button><Button variant="secondary" size="sm" onClick={() => window.print()}>Print</Button><Button variant="secondary" size="sm" onClick={() => window.open(`/api/timetable/export?timetable_id=${encodeURIComponent(timetable.id)}`, '_blank')}>Export CSV</Button><Button size="sm" onClick={() => void save()} disabled={!dirty || busy}>{busy ? 'Saving...' : 'Save changes'}</Button>{canManage && timetable.status === 'DRAFT' && <Button variant="secondary" size="sm" onClick={() => void transition(submitTimetableForReview, 'Submitting for review')} disabled={busy || dirty}>Submit for review</Button>}{canApprove && timetable.status === 'REVIEW' && <Button variant="secondary" size="sm" onClick={() => void transition(approveTimetable, 'Approving')} disabled={busy || dirty}>Approve</Button>}{canPublish && <Button size="sm" onClick={() => void publish()} disabled={busy || dirty}>{timetable.status === 'PUBLISHED' ? 'Republish' : 'Publish'}</Button>}{canPublish && <Button variant="ghost" size="sm" onClick={() => void archive()} disabled={busy}>Archive</Button>}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-3 text-sm"><span className={dirty ? 'font-semibold text-amber-dark' : 'text-brand-dark'}>{dirty ? 'Unsaved changes' : message || 'Saved'}</span><label className="ml-auto inline-flex items-center gap-2"><input type="checkbox" checked={autoSave} onChange={(event) => setAutoSave(event.target.checked)} /> Auto-save</label></div>
    {message && <p className="rounded-md border border-border bg-white px-3 py-2 text-sm text-ink-soft" role="status">{message}</p>}
    <div className="flex flex-wrap gap-2"><Button variant={view === 'weekly' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('weekly')}>Weekly</Button><Button variant={view === 'class' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('class')}>Class</Button><Button variant={view === 'teacher' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('teacher')}>Teacher</Button><Button variant={view === 'room' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('room')}>Room</Button></div>
    <Card><CardHeader><CardTitle>Filters</CardTitle><span className="text-sm text-muted">{filteredEntries.length} lessons</span></CardHeader><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Select aria-label="Class filter" value={filter.class_id} onChange={(event) => setFilter({ ...filter, class_id: event.target.value })}><option value="">All classes</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Select aria-label="Teacher filter" value={filter.teacher_id} onChange={(event) => setFilter({ ...filter, teacher_id: event.target.value })}><option value="">All teachers</option>{teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Select aria-label="Room filter" value={filter.room_id} onChange={(event) => setFilter({ ...filter, room_id: event.target.value })}><option value="">All rooms</option>{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Select aria-label="Subject filter" value={filter.subject_id} onChange={(event) => setFilter({ ...filter, subject_id: event.target.value })}><option value="">All subjects</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div></Card>
    <div className="overflow-auto rounded-lg border border-border bg-white shadow-card"><div className="min-w-[900px] p-3"><div className="grid grid-cols-[120px_repeat(5,minmax(145px,1fr))] border-b border-border"><div className="p-2 text-xs font-semibold uppercase text-muted">Period</div>{days.map((day) => <div key={day} className="border-l border-border p-2 text-center text-xs font-semibold uppercase text-muted">{day}</div>)}</div>{visiblePeriods.map((period) => <div key={period.id} className="grid min-h-[112px] grid-cols-[120px_repeat(5,minmax(145px,1fr))] border-b border-line last:border-b-0"><div className="bg-paper p-2 text-xs text-muted"><strong className="block text-ink">{period.name}</strong>{period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}</div>{days.map((_, dayIndex) => { const cellEntries = filteredEntries.filter((entry) => entry.day_of_week === dayIndex + 1 && entry.period_id === period.id); return <div key={`${period.id}-${dayIndex}`} onDragOver={(event) => event.preventDefault()} onDrop={() => dragId.current && moveEntry(dragId.current, dayIndex + 1, period.id)} className={`border-l border-border p-1.5 ${period.is_break ? 'bg-paper' : 'hover:bg-brand-light/30'}`}>{period.is_break ? <span className="block pt-3 text-center text-xs text-muted">Break</span> : cellEntries.map((entry) => <button key={entry.id} draggable={canManage} onDragStart={() => { dragId.current = entry.id; }} onClick={() => setSelectedId(entry.id)} className={`mb-1 w-full cursor-grab rounded-md border p-2 text-left text-xs shadow-sm ${selectedId === entry.id ? 'border-brand bg-brand-light' : 'border-border bg-white hover:border-brand'}`}><strong className="block text-ink">{subjectName.get(entry.subject_id) ?? 'Subject'}</strong><span className="block text-muted">{view === 'teacher' ? className.get(entry.class_id) : view === 'class' ? teacherName.get(entry.teacher_id ?? '') ?? 'No teacher' : view === 'room' ? roomName.get(entry.room_id ?? '') ?? 'No room' : className.get(entry.class_id)}</span><span className="block text-muted">{entry.room_id ? roomName.get(entry.room_id) : 'Room not assigned'}</span></button>)}</div>; })}</div>)}</div></div>
    {selected && canManage && <Card><CardHeader><CardTitle>Edit lesson</CardTitle><Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>Close</Button></CardHeader><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><Label>Subject</Label><Select value={selected.subject_id} onChange={(event) => updateSelected({ subject_id: event.target.value })}>{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><div><Label>Class</Label><Select value={selected.class_id} onChange={(event) => updateSelected({ class_id: event.target.value })}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><div><Label>Teacher</Label><Select value={selected.teacher_id ?? ''} onChange={(event) => updateSelected({ teacher_id: event.target.value || null })}><option value="">Unassigned</option>{teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><div><Label>Room</Label><Select value={selected.room_id ?? ''} onChange={(event) => updateSelected({ room_id: event.target.value || null })}><option value="">Unassigned</option>{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><div><Label>Day</Label><Select value={String(selected.day_of_week)} onChange={(event) => updateSelected({ day_of_week: Number(event.target.value) })}>{days.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</Select></div><div><Label>Period</Label><Select value={selected.period_id} onChange={(event) => { const period = periodMap.get(event.target.value); updateSelected({ period_id: event.target.value, start_time: period?.starts_at ?? selected.start_time, end_time: period?.ends_at ?? selected.end_time }); }}>{periods.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.starts_at.slice(0, 5)}</option>)}</Select></div><div><Label>Lesson type</Label><Input value={selected.lesson_type} onChange={(event) => updateSelected({ lesson_type: event.target.value })} /></div><div><Label>Notes</Label><Textarea value={selected.notes ?? ''} onChange={(event) => updateSelected({ notes: event.target.value || null })} /></div></div><div className="mt-4 flex justify-end"><Button variant="danger" size="sm" onClick={() => { if (window.confirm('Delete this lesson?')) { commit(entries.filter((entry) => entry.id !== selected.id)); setSelectedId(null); setMessage('Lesson deleted. Unsaved changes.'); } }}>Delete lesson</Button></div></Card>}
  </div>;
}
