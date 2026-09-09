'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { setRolePermission } from '@/lib/actions/roles';

interface Role {
  id: string;
  name: string;
  is_system: boolean;
}

interface Permission {
  id: string;
  code: string;
  module: string;
  action: string;
  description: string | null;
}

export function RolePermissionMatrix({
  roles,
  permissionsByModule,
  initialGrants,
}: {
  roles: Role[];
  permissionsByModule: Record<string, Permission[]>;
  initialGrants: Set<string>; // keys are `${roleId}:${permissionId}`
}) {
  const [grants, setGrants] = React.useState(initialGrants);
  const [, startTransition] = useTransition();

  const toggle = (roleId: string, permissionId: string, isSystem: boolean, checked: boolean) => {
    if (isSystem) return; // Administrator always has everything — no-op
    const key = `${roleId}:${permissionId}`;
    setGrants((prev) => {
      const next = new Set(prev);
      checked ? next.add(key) : next.delete(key);
      return next;
    });
    startTransition(async () => {
      const result = await setRolePermission(roleId, permissionId, checked);
      if (!result.ok) {
        window.alert(result.error);
        // revert on failure
        setGrants((prev) => {
          const next = new Set(prev);
          checked ? next.delete(key) : next.add(key);
          return next;
        });
      }
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="px-3 py-2 font-medium">Permission</th>
            {roles.map((r) => (
              <th key={r.id} className="px-3 py-2 text-center font-medium">
                {r.name}
                {r.is_system && <span className="ml-1 text-xs">(all)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(permissionsByModule).map(([module, perms]) => (
            <React.Fragment key={module}>
              <tr>
                <td colSpan={roles.length + 1} className="bg-paper px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  {module}
                </td>
              </tr>
              {perms.map((perm) => (
                <tr key={perm.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink-soft">
                    {perm.code}
                    {perm.description && <span className="help-text block">{perm.description}</span>}
                  </td>
                  {roles.map((role) => {
                    const checked = role.is_system || grants.has(`${role.id}:${perm.id}`);
                    return (
                      <td key={role.id} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={role.is_system}
                          onChange={(e) => toggle(role.id, perm.id, role.is_system, e.target.checked)}
                          className="h-4 w-4 rounded border-border accent-brand disabled:opacity-60"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
