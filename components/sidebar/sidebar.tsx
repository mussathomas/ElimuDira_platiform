'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavSection } from '@/lib/permissions/nav';

interface SidebarProps {
  sections: NavSection[];
  permissions: Set<string>;
  isSuperAdmin: boolean;
  brand: { title: string; subtitle?: string };
}

function isVisible(permission: string | undefined, permissions: Set<string>, isSuperAdmin: boolean) {
  if (!permission) return true;
  return isSuperAdmin || permissions.has(permission);
}

export function Sidebar({ sections, permissions, isSuperAdmin, brand }: SidebarProps) {
  const pathname = usePathname();

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

  return (
    <nav className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-white">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-white">
          <LayoutDashboard size={16} />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-ink">{brand.title}</p>
          {brand.subtitle && <p className="text-xs leading-tight text-muted">{brand.subtitle}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {sections.map((section) => {
            if (!isVisible(section.permission, permissions, isSuperAdmin)) return null;

            // Leaf-level section (e.g. Dashboard) — no children, just a link.
            if (!section.children) {
              const active = pathname === section.href;
              return (
                <li key={section.label}>
                  <Link
                    href={section.href!}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm font-medium',
                      active ? 'bg-brand-light text-brand-dark' : 'text-ink-soft hover:bg-paper'
                    )}
                  >
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

            return (
              <li key={section.label}>
                <button
                  type="button"
                  onClick={() => toggle(section.label)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:bg-paper"
                  aria-expanded={isOpen}
                >
                  {section.label}
                  <ChevronDown
                    size={15}
                    className={cn('transition-transform', isOpen && 'rotate-180')}
                  />
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
  );
}
