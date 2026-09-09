import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/permissions/session';
import { loadTimetableWorkspace } from '@/lib/timetable/data';
import { TimetableWorkspace } from '@/components/timetable/timetable-workspace';

export default async function TimetableDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const session = await requirePermission('view_timetable');
  const { id } = await params;
  const query = await searchParams;
  const data = await loadTimetableWorkspace(session.school!.id, id);
  if (!data.timetable) notFound();
  const canManage = data.timetable.created_by === session.userId || session.permissions.has('manage_timetable');
  const initialView = query.view === 'class' || query.view === 'teacher' || query.view === 'room' ? query.view : 'weekly';
  return <TimetableWorkspace timetable={data.timetable} entries={data.entries as any} classes={data.classes} subjects={data.subjects} teachers={data.teachers} rooms={data.rooms} periods={data.periods as any} canManage={canManage} canApprove={session.permissions.has('manage_timetable')} canPublish={session.permissions.has('publish_timetable')} initialView={initialView} />;
}
