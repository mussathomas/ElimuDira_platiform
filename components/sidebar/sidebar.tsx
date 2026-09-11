'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Menu,
  School,
  ScrollText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavSection } from '@/lib/permissions/nav';

interface SidebarProps {
  sections: NavSection[];
  permissions: Set<string>;
  isSuperAdmin: boolean;
  brand: { title: string; subtitle?: string; logoUrl?: string | null };
}

function isVisible(permission: string | undefined, permissions: Set<string>, isSuperAdmin: boolean) {
  if (!permission) return true;
  return isSuperAdmin || permissions.has(permission);
}

const icons = {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  School,
  ScrollText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  WalletCards,
};

export function Sidebar({ sections, permissions, isSuperAdmin, brand }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // A section starts expanded if the active route lives inside it.
  const [openSections, setOpenSections] = React.useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const section of sections) {
      if (section.children?.some((c) => pathname.startsWith(c.href))) {
        initial.add(section.label);
      }
    }
    return initial;
  });

  const toggle = (label: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-white text-ink shadow-sm md:hidden"
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
      >
        <Menu size={19} />
      </button>
      {mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-ink/30 md:hidden"
          aria-label="Close navigation"
        />
      )}
      <nav className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col border-r border-border bg-white shadow-xl transition-transform duration-200 md:static md:z-auto md:h-full md:w-64 md:shrink-0 md:translate-x-0 md:shadow-none',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-brand text-white">
          {brand.logoUrl ? (
            // Signed R2 URLs are request-scoped and are safe to pass to this client component.
            <img src={brand.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <LayoutDashboard size={16} />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-ink">{brand.title}</p>
          {brand.subtitle && <p className="text-xs leading-tight text-muted">{brand.subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-ink-soft hover:bg-paper md:hidden"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {sections.map((section) => {
            if (!isVisible(section.permission, permissions, isSuperAdmin)) return null;

            // Leaf-level section (e.g. Dashboard) — no children, just a link.
            if (!section.children) {
              const active = pathname === section.href;
              const Icon = icons[section.icon as keyof typeof icons] ?? LayoutDashboard;
              return (
                <li key={section.label}>
                  <Link
                    href={section.href!}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                      active ? 'bg-brand-light text-brand-dark' : 'text-ink-soft hover:bg-paper'
                    )}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                    {section.label}
                  </Link>
                </li>
              );
            }

            const visibleChildren = section.children.filter((c) =>
              isVisible(c.permission, permissions, isSuperAdmin)
            );
            if (visibleChildren.length === 0) return null;

            const isOpen = openSections.has(section.label);
            const Icon = icons[section.icon as keyof typeof icons] ?? LayoutDashboard;

            return (
              <li key={section.label}>
                <button
                  type="button"
                  onClick={() => toggle(section.label)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:bg-paper"
                  aria-expanded={isOpen}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={16} strokeWidth={1.8} />
                    {section.label}
                  </span>
                  <ChevronDown size={15} className={cn('transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <ul className="ml-2 mt-0.5 space-y-0.5 border-l border-line pl-3">
                    {visibleChildren.map((leaf) => {
                      const active = pathname === leaf.href;
                      return (
                        <li key={leaf.href}>
                          <Link
                            href={leaf.href}
                            className={cn(
                              'block rounded-md px-3 py-1.5 text-sm',
                              active
                                ? 'bg-brand-light font-medium text-brand-dark'
                                : 'text-ink-soft hover:bg-paper'
                            )}
                          >
                            {leaf.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      </nav>
    </>
  );
}
