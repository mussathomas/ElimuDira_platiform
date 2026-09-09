import Link from 'next/link';
import { requireSchoolSession } from '@/lib/permissions/session';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default async function TimetableSettingsPage() {
  const session = await requireSchoolSession();
  if (!session.isSuperAdmin && !session.permissions.has('edit_timetable_settings')) {
    return <Card><CardHeader><CardTitle>Timetable settings</CardTitle></CardHeader><p className="help-text">You do not have permission to manage timetable settings. Ask a school administrator to grant timetable settings access.</p></Card>;
  }
  return <div className="space-y-6"><div><h2 className="text-2xl font-semibold text-ink">Timetable settings</h2><p className="help-text mt-1">Configure the reusable building blocks for every timetable.</p></div><div className="grid gap-4 sm:grid-cols-3"><Card><CardHeader><CardTitle>Periods</CardTitle></CardHeader><p className="help-text">Define periods, breaks, lunch, and school-day times.</p><Link className="mt-4 inline-block text-sm font-medium text-brand hover:underline" href="/dashboard/timetable/periods">Manage periods</Link></Card><Card><CardHeader><CardTitle>Rooms</CardTitle></CardHeader><p className="help-text">Maintain rooms and availability for conflict checking.</p><Link className="mt-4 inline-block text-sm font-medium text-brand hover:underline" href="/dashboard/timetable/rooms">Manage rooms</Link></Card><Card><CardHeader><CardTitle>Rules</CardTitle></CardHeader><p className="help-text">Configure workload and scheduling restrictions.</p><Link className="mt-4 inline-block text-sm font-medium text-brand hover:underline" href="/dashboard/timetable/rules">Manage rules</Link></Card></div></div>;
}
