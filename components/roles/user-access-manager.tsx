'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { setUserPermissionOverrides } from '@/lib/actions/roles';

interface StaffOption {
  profileId: string;
  fullName: string;
  email: string;
  roleName: string;
}

interface PermissionOption {
  id: string;
  code: string;
  description: string | null;
}

export function UserAccessManager({
  staff,
  permissionsByModule,
  initialAccessByUser,
}: {
  staff: StaffOption[];
  permissionsByModule: Record<string, PermissionOption[]>;
  initialAccessByUser: Record<string, string[]>;
}) {
  const [selectedProfileId, setSelectedProfileId] = React.useState(staff[0]?.profileId ?? '');
  const [accessByUser, setAccessByUser] = React.useState(initialAccessByUser);
  const [, startTransition] = useTransition();

  if (staff.length === 0) return <p className="help-text">There are no other staff accounts to manage.</p>;

  const selectedStaff = staff.find((member) => member.profileId === selectedProfileId);
  if (!selectedStaff) return null;

  const currentAccess = new Set(accessByUser[selectedProfileId] ?? []);
  const updateAccess = (permissionIds: string[], granted: boolean) => {
    const profileId = selectedProfileId;
    const previous = accessByUser[profileId] ?? [];
    const next = new Set(previous);
    for (const permissionId of permissionIds) {
      granted ? next.add(permissionId) : next.delete(permissionId);
    }
    setAccessByUser((current) => ({ ...current, [profileId]: [...next] }));

    startTransition(async () => {
      const result = await setUserPermissionOverrides(profileId, permissionIds, granted);
      if (!result.ok) {
        window.alert(result.error);
        setAccessByUser((current) => ({ ...current, [profileId]: previous }));
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="max-w-xl">
        <label htmlFor="access_profile_id" className="mb-1 block text-sm font-medium text-ink">Staff member</label>
        <select
          id="access_profile_id"
          value={selectedProfileId}
          onChange={(event) => setSelectedProfileId(event.target.value)}
          className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-ink"
        >
          {staff.map((member) => (
            <option key={member.profileId} value={member.profileId}>
              {member.fullName} · {member.email} · {member.roleName}
            </option>
          ))}
        </select>
        <p className="help-text mt-1">Individual access overrides this person&apos;s role permissions.</p>
      </div>

      <div className="divide-y divide-line border-y border-line">
        {Object.entries(permissionsByModule).map(([module, permissions]) => {
          const allGranted = permissions.every((permission) => currentAccess.has(permission.id));
          return (
            <section key={module} className="py-3">
              <label className="flex items-center gap-2 text-sm font-semibold capitalize text-ink">
                <input
                  type="checkbox"
                  checked={allGranted}
                  onChange={(event) => updateAccess(permissions.map((permission) => permission.id), event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-brand"
                  aria-label={`Grant all ${module} permissions`}
                />
                {module}
              </label>
              <div className="mt-2 grid gap-x-6 gap-y-2 pl-6 sm:grid-cols-2">
                {permissions.map((permission) => (
                  <label key={permission.id} className="flex items-start gap-2 text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      checked={currentAccess.has(permission.id)}
                      onChange={(event) => updateAccess([permission.id], event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-brand"
                    />
                    <span>
                      <span className="font-medium">{permission.code}</span>
                      {permission.description && <span className="help-text block">{permission.description}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}