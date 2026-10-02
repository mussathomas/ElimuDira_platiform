import Link from 'next/link';
import { Bell } from 'lucide-react';
import { LogoutButton } from '@/components/sidebar/logout-button';

export function Topbar({
  title,
  userName,
  roleName,
  unreadCount = 0,
}: {
  title: string;
  userName: string;
  roleName?: string | null;
  unreadCount?: number;
}) {
  return (
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 pl-16 sm:px-6 sm:pl-16 md:pl-6">
      <h1 className="truncate text-base font-semibold text-ink sm:text-lg">{title}</h1>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <Link
          href="/dashboard/notifications"
          className="relative rounded-md p-2 text-ink-soft hover:bg-paper"
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Bell size={18} />
          {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
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
