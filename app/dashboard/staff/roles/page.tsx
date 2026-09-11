import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { ActionForm } from '@/components/ui/action-form';
import { DeleteButton } from '@/components/ui/delete-button';
import { RolePermissionMatrix } from '@/components/roles/role-permission-matrix';
import { createRole, deleteRole } from '@/lib/actions/roles';
import { assignTeacher, removeTeacherAssignment } from '@/lib/actions/teaching-assignments';

export default async function RolesPage() {
  const session = await requirePermission('manage_roles');
  const supabase = await createServerSupabaseClient();

  const [{ data: roles }, { data: permissions }, { data: rolePermissions }, { data: staff }, { data: classes }, { data: subjects }, { data: assignments }] = await Promise.all([
    supabase.from('roles').select('id, name, description, is_system').eq('school_id', session.school!.id).order('created_at'),
    supabase.from('permissions').select('id, code, module, action, description').order('module'),
    supabase
      .from('role_permissions')
      .select('role_id, permission_id, roles!inner(school_id)')
      .eq('roles.school_id', session.school!.id),
    supabase.from('staff_members').select('profile_id, profiles(full_name, email)').eq('school_id', session.school!.id).order('employee_number'),
    supabase.from('classes').select('id, name').eq('school_id', session.school!.id).order('order_index'),
    supabase.from('subjects').select('id, name').eq('school_id', session.school!.id).order('name'),
    supabase.from('teacher_assignments').select('id, profiles(full_name), classes(name), subjects(name)').eq('school_id', session.school!.id).order('created_at'),
  ]);

  type PermissionRow = { id: string; code: string; module: string; action: string; description: string | null };
  const permissionsByModule: Record<string, PermissionRow[]> = {};
  for (const p of permissions ?? []) {
    (permissionsByModule[p.module] ??= []).push(p);
  }

  const initialGrants = new Set((rolePermissions ?? []).map((rp) => `${rp.role_id}:${rp.permission_id}`));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Roles & permissions</h2>
        <p className="help-text">
          Administrator always has full access. Grant or revoke individual actions for every other role — changes
          take effect immediately.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
        </CardHeader>
        <ul className="mb-4 divide-y divide-line">
          {(roles ?? []).map((role) => (
            <li key={role.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-medium text-ink">{role.name}</span>
                {role.description && <span className="help-text ml-2">{role.description}</span>}
              </div>
              {!role.is_system && <DeleteButton action={deleteRole} id={role.id} label="Delete role" />}
            </li>
          ))}
        </ul>
        <ActionForm action={createRole} submitLabel="Add role">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Role name</Label>
              <Input id="name" name="name" placeholder="e.g. Librarian" required />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Input id="description" name="description" />
            </div>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader><CardTitle>Teacher class & subject assignments</CardTitle></CardHeader>
        <p className="help-text mb-4">Teachers can enter marks only for the classes and subjects assigned here.</p>
        <ActionForm action={assignTeacher} submitLabel="Assign teacher">
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label htmlFor="profile_id">Teacher account</Label><Select id="profile_id" name="profile_id" defaultValue="" required><option value="" disabled>Choose a teacher</option>{(staff ?? []).map((member) => { const profile = member.profiles as { full_name?: string; email?: string } | null; return <option key={member.profile_id} value={member.profile_id}>{profile?.full_name} · {profile?.email}</option>; })}</Select></div>
            <div><Label htmlFor="assignment_class_id">Class</Label><Select id="assignment_class_id" name="class_id" defaultValue="" required><option value="" disabled>Choose a class</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
            <div><Label htmlFor="assignment_subject_id">Subject</Label><Select id="assignment_subject_id" name="subject_id" defaultValue="" required><option value="" disabled>Choose a subject</option>{(subjects ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
          </div>
        </ActionForm>
        <div className="mt-5 divide-y divide-line">{(assignments ?? []).map((assignment) => { const profile = assignment.profiles as { full_name?: string } | null; const classItem = assignment.classes as { name?: string } | null; const subject = assignment.subjects as { name?: string } | null; return <div key={assignment.id} className="flex items-center justify-between py-2 text-sm"><span><strong>{profile?.full_name}</strong><span className="help-text ml-2">{classItem?.name} · {subject?.name}</span></span><DeleteButton action={removeTeacherAssignment} id={assignment.id} label="Remove assignment" /></div>; })}{(assignments ?? []).length === 0 && <p className="help-text mt-4">No teacher assignments yet.</p>}</div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permission matrix</CardTitle>
        </CardHeader>
        <RolePermissionMatrix
          roles={(roles ?? []) as any}
          permissionsByModule={permissionsByModule as any}
          initialGrants={initialGrants}
        />
      </Card>
    </div>
  );
}
