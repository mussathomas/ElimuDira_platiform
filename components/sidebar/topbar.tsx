import Link from 'next/link';
import { Bell } from 'lucide-react';
import { LogoutButton } from '@/components/sidebar/logout-button';

export function Topbar({
  title,
  userName,
  roleName,
}: {
  title: string;
  userName: string;
  roleName?: string | null;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-6">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/notifications"
          className="rounded-md p-2 text-ink-soft hover:bg-paper"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </Link>
        <div className="text-right">
          <p className="text-sm font-medium leading-tight text-ink">{userName}</p>
          {roleName && <p className="text-xs leading-tight text-muted">{roleName}</p>}
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}
