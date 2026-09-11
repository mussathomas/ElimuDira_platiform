import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireSchoolSession } from '@/lib/permissions/session';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

async function loadDashboardStats(schoolId: string) {
  const supabase = await createServerSupabaseClient();

  const [{ count: staffCount }, { count: classCount }, { count: subjectCount }, { data: currentYear }, { data: recentActivity }] =
    await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      supabase.from('academic_years').select('name').eq('school_id', schoolId).eq('is_current', true).maybeSingle(),
      supabase
        .from('audit_logs')
        .select('action, resource_type, created_at')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

  return {
    staffCount: staffCount ?? 0,
    classCount: classCount ?? 0,
    subjectCount: subjectCount ?? 0,
    currentYear: currentYear?.name ?? 'Not set',
    recentActivity: recentActivity ?? [],
  };
}

export default async function DashboardPage() {
  const session = await requireSchoolSession();
  const stats = await loadDashboardStats(session.school.id);

  const kpis = [
    { label: 'Staff & users', value: stats.staffCount },
    { label: 'Classes', value: stats.classCount },
    { label: 'Subjects', value: stats.subjectCount },
    { label: 'Academic year', value: stats.currentYear },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Welcome back, {session.fullName.split(' ')[0]}</h2>
        <p className="help-text">Here&apos;s what&apos;s happening at {session.school.name} today.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-4">
            <p className="help-text">{kpi.label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{kpi.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        {stats.recentActivity.length === 0 ? (
          <p className="help-text">
            Nothing recorded yet — activity from staff and administrators will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {stats.recentActivity.map((entry, i) => (
              <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink-soft">
                  {entry.action} · {entry.resource_type}
                </span>
                <span className="help-text">{new Date(entry.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="help-text">
        Student attendance, syllabus progress, exam performance and outstanding fees will appear here
        as those modules come online (Phases 2–5).
      </p>
    </div>
  );
}
