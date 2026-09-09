import { requireSuperAdmin } from '@/lib/permissions/session';
import { platformNav } from '@/lib/permissions/nav';
import { Sidebar } from '@/components/sidebar/sidebar';
import { Topbar } from '@/components/sidebar/topbar';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSuperAdmin();

  return (
    <div className="flex h-screen">
      <Sidebar
        sections={platformNav}
        permissions={session.permissions}
        isSuperAdmin={true}
        brand={{ title: 'ElimuDira', subtitle: 'Platform Admin' }}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Platform administration" userName={session.fullName} roleName="Super Admin" />
        <main className="flex-1 overflow-y-auto bg-paper p-6">{children}</main>
      </div>
    </div>
  );
}
