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
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 pl-16 sm:px-6 sm:pl-16 md:pl-6">
      <h1 className="truncate text-base font-semibold text-ink sm:text-lg">{title}</h1>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <Link
          href="/dashboard/notifications"
          className="rounded-md p-2 text-ink-soft hover:bg-paper"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </Link>
        <div className="hidden text-right sm:block">
          <p className="max-w-40 truncate text-sm font-medium leading-tight text-ink">{userName}</p>
          {roleName && <p className="text-xs leading-tight text-muted">{roleName}</p>}
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}
