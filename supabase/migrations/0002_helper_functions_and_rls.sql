-- ElimuDira — helper functions + Row Level Security policies.
--
-- This file is the actual security boundary for multi-tenancy. Every
-- school-owned table is locked down here so that cross-school access is
-- impossible through ordinary Supabase queries, regardless of what the
-- client sends. The Next.js layer adds a second layer of enforcement
-- (permission checks before calling a Server Action), but RLS is what
-- makes tenant isolation non-negotiable even if application code has a bug.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can read profiles/roles
-- regardless of the calling row's own RLS, without ever accepting a
-- client-supplied school_id or user_id — they always resolve from auth.uid()).
-- ---------------------------------------------------------------------------

create or replace function current_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id from profiles where id = auth.uid();
$$;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where profile_id = auth.uid());
$$;

create or replace function has_permission(p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_override boolean;
  v_has_role_perm boolean;
begin
  -- An explicit per-user override always wins, in either direction.
  select upo.granted into v_override
  from user_permission_overrides upo
  join permissions p on p.id = upo.permission_id
  where upo.profile_id = auth.uid() and p.code = p_code
  limit 1;

  if v_override is not null then
    return v_override;
  end if;

  select exists (
    select 1
    from profiles pr
    join role_permissions rp on rp.role_id = pr.role_id
    join permissions p on p.id = rp.permission_id
    where pr.id = auth.uid() and p.code = p_code
  ) into v_has_role_perm;

  return coalesce(v_has_role_perm, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- schools
-- ---------------------------------------------------------------------------

alter table schools enable row level security;

create policy schools_select on schools
  for select using (id = current_school_id() or is_super_admin());

-- School admins can edit their own school's profile fields (name, address,
-- logo, motto, contacts). Status changes (activate/suspend/deactivate) are
-- blocked for non-super-admins by the trigger below, not by this policy,
-- because RLS alone can't compare OLD vs NEW column-by-column.
create policy schools_update_own on schools
  for update using (id = current_school_id())
  with check (id = current_school_id());

create policy schools_update_platform on schools
  for update using (is_super_admin())
  with check (is_super_admin());

-- No insert policy: rows are only created via the register_school() function
-- (security definer, added in 0004), so ordinary clients can never insert
-- directly into schools.

create or replace function schools_protect_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status or new.slug is distinct from old.slug)
     and not is_super_admin() then
    raise exception 'Only a platform administrator can change school status or slug';
  end if;
  return new;
end;
$$;

create trigger schools_protect_status_trigger
  before update on schools
  for each row execute function schools_protect_status();

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;

create policy profiles_select on profiles
  for select using (
    id = auth.uid()
    or school_id = current_school_id()
    or is_super_admin()
  );

create policy profiles_update_self on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_by_admin on profiles
  for update using (school_id = current_school_id() and has_permission('manage_users'))
  with check (school_id = current_school_id());

-- Inserts happen via register_school() (new admin) or invite_staff_member()
-- (added alongside the Staff module in Phase 2) — both security definer.

-- ---------------------------------------------------------------------------
-- platform_admins
-- ---------------------------------------------------------------------------

alter table platform_admins enable row level security;

create policy platform_admins_select on platform_admins
  for select using (profile_id = auth.uid() or is_super_admin());

-- Deliberately no insert/update/delete policy for authenticated users —
-- granting platform admin status is a service-role-only operation performed
-- outside normal request flow (e.g. an internal script), never something a
-- school-level admin can trigger, even indirectly.

-- ---------------------------------------------------------------------------
-- permissions (global, read-only catalog)
-- ---------------------------------------------------------------------------

alter table permissions enable row level security;

create policy permissions_select on permissions
  for select using (auth.role() = 'authenticated' or is_super_admin());

-- ---------------------------------------------------------------------------
-- roles / role_permissions / user_permission_overrides
-- ---------------------------------------------------------------------------

alter table roles enable row level security;

create policy roles_select on roles
  for select using (school_id = current_school_id() or is_super_admin());

create policy roles_write on roles
  for all using (
    school_id = current_school_id() and has_permission('manage_roles') and not is_system
  )
  with check (school_id = current_school_id());

alter table role_permissions enable row level security;

create policy role_permissions_select on role_permissions
  for select using (
    role_id in (select id from roles where school_id = current_school_id())
    or is_super_admin()
  );

create policy role_permissions_write on role_permissions
  for all using (
    role_id in (
      select id from roles
      where school_id = current_school_id() and has_permission('manage_roles')
    )
  )
  with check (
    role_id in (select id from roles where school_id = current_school_id())
  );

alter table user_permission_overrides enable row level security;

create policy user_permission_overrides_select on user_permission_overrides
  for select using (
    profile_id = auth.uid()
    or (
      has_permission('manage_users')
      and profile_id in (select id from profiles where school_id = current_school_id())
    )
    or is_super_admin()
  );

create policy user_permission_overrides_write on user_permission_overrides
  for all using (
    has_permission('manage_users')
    and profile_id in (select id from profiles where school_id = current_school_id())
  )
  with check (
    profile_id in (select id from profiles where school_id = current_school_id())
  );

-- ---------------------------------------------------------------------------
-- Academic structure — same tenant-isolation shape for every table
-- ---------------------------------------------------------------------------

alter table academic_years enable row level security;
alter table education_levels enable row level security;
alter table classes enable row level security;
alter table streams enable row level security;
alter table subjects enable row level security;

create policy academic_years_select on academic_years
  for select using (school_id = current_school_id() or is_super_admin());
create policy academic_years_write on academic_years
  for all using (school_id = current_school_id() and has_permission('edit_settings'))
  with check (school_id = current_school_id());

create policy education_levels_select on education_levels
  for select using (school_id = current_school_id() or is_super_admin());
create policy education_levels_write on education_levels
  for all using (school_id = current_school_id() and has_permission('edit_settings'))
  with check (school_id = current_school_id());

create policy classes_select on classes
  for select using (school_id = current_school_id() or is_super_admin());
create policy classes_write on classes
  for all using (school_id = current_school_id() and has_permission('edit_settings'))
  with check (school_id = current_school_id());

create policy streams_select on streams
  for select using (school_id = current_school_id() or is_super_admin());
create policy streams_write on streams
  for all using (school_id = current_school_id() and has_permission('edit_settings'))
  with check (school_id = current_school_id());

create policy subjects_select on subjects
  for select using (school_id = current_school_id() or is_super_admin());
create policy subjects_write on subjects
  for all using (school_id = current_school_id() and has_permission('edit_settings'))
  with check (school_id = current_school_id());

-- ---------------------------------------------------------------------------
-- audit_logs — append-only, no update/delete policy for anyone
-- ---------------------------------------------------------------------------

alter table audit_logs enable row level security;

create policy audit_logs_select on audit_logs
  for select using (
    (school_id = current_school_id() and has_permission('view_audit'))
    or is_super_admin()
  );

create policy audit_logs_insert on audit_logs
  for insert with check (
    actor_id = auth.uid()
    and (school_id = current_school_id() or is_super_admin())
  );
