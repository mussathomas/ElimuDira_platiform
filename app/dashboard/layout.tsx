import Link from 'next/link';
import { requireSchoolSession } from '@/lib/permissions/session';
import { schoolNav } from '@/lib/permissions/nav';
import { Sidebar } from '@/components/sidebar/sidebar';
import { Topbar } from '@/components/sidebar/topbar';
import { Progress } from '@/components/ui/card';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSchoolSession();
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase.from('school_notification_recipients').select('notification_id', { count: 'exact', head: true }).eq('profile_id', session.userId).is('read_at', null);
  const setupPercent = Math.round((session.school.setupStep / 8) * 100);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        sections={schoolNav}
        permissions={session.permissions}
        isSuperAdmin={session.isSuperAdmin}
        brand={{ title: session.school.name, subtitle: 'ElimuDira', logoUrl: session.school.logoUrl }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar title={session.school.name} userName={session.fullName} roleName={session.roleName} unreadCount={count ?? 0} />
        {!session.school.setupCompleted && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-amber-light px-4 py-2.5 sm:px-6">
            <span className="text-sm font-medium text-amber-dark">
              School setup {setupPercent}% complete
            </span>
            <Progress value={setupPercent} className="max-w-[160px] flex-1 sm:flex-none" />
            <Link href="/dashboard/setup" className="text-sm font-medium text-brand hover:underline sm:ml-auto">
              Continue setup
            </Link>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-paper p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
