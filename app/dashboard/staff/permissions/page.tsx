import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

export default async function PermissionsCatalogPage() {
  await requirePermission('manage_roles');
  const supabase = await createServerSupabaseClient();
  const { data: permissions } = await supabase.from('permissions').select('code, module, action, description').order('module');

  const byModule: Record<string, typeof permissions> = {};
  for (const p of permissions ?? []) {
    (byModule[p.module] ??= []).push(p);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Permissions catalog</h2>
        <p className="help-text">
          Every permission code available on ElimuDira. Assign these to roles under Staff & Administration → Roles.
        </p>
      </div>

      {Object.entries(byModule).map(([module, perms]) => (
        <Card key={module}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{module}</h3>
          <ul className="divide-y divide-line">
            {(perms ?? []).map((p) => (
              <li key={p.code} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono text-ink-soft">{p.code}</span>
                <span className="help-text">{p.description}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
