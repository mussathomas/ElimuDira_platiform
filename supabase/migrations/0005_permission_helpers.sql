-- One round trip for "what can this user do" — used to build the
-- permission-aware sidebar and to seed the client-side UI gating (which is
-- a convenience only; has_permission() is re-checked server-side on every
-- actual read/write via RLS + Server Action guards).

create or replace function get_my_permission_codes()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select p.code
  from permissions p
  where
    exists (
      select 1 from user_permission_overrides upo
      where upo.profile_id = auth.uid() and upo.permission_id = p.id and upo.granted = true
    )
    or (
      exists (
        select 1 from profiles pr
        join role_permissions rp on rp.role_id = pr.role_id
        where pr.id = auth.uid() and rp.permission_id = p.id
      )
      and not exists (
        select 1 from user_permission_overrides upo2
        where upo2.profile_id = auth.uid() and upo2.permission_id = p.id and upo2.granted = false
      )
    );
$$;
