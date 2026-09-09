import Link from 'next/link';
import { requireSchoolSession } from '@/lib/permissions/session';
import { schoolNav } from '@/lib/permissions/nav';
import { Sidebar } from '@/components/sidebar/sidebar';
import { Topbar } from '@/components/sidebar/topbar';
import { Progress } from '@/components/ui/card';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSchoolSession();
  const setupPercent = Math.round((session.school.setupStep / 8) * 100);

  return (
    <div className="flex h-screen">
      <Sidebar
        sections={schoolNav}
        permissions={session.permissions}
        isSuperAdmin={session.isSuperAdmin}
        brand={{ title: session.school.name, subtitle: 'ElimuDira' }}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={session.school.name} userName={session.fullName} roleName={session.roleName} />
        {!session.school.setupCompleted && (
          <div className="flex items-center gap-4 border-b border-border bg-amber-light px-6 py-2.5">
            <span className="text-sm font-medium text-amber-dark">
              School setup {setupPercent}% complete
            </span>
            <Progress value={setupPercent} className="max-w-[160px]" />
            <Link href="/dashboard/setup" className="ml-auto text-sm font-medium text-brand hover:underline">
              Continue setup
            </Link>
          </div>
        )}
        <main className="flex-1 overflow-y-auto bg-paper p-6">{children}</main>
      </div>
    </div>
  );
}
