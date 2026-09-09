-- ElimuDira — school registration.
--
-- Registration is a two-step client flow (see app/(auth)/register/actions.ts):
--   1. supabase.auth.signUp() creates the auth.users row for the new admin.
--   2. This function is called via RPC with that new user's id. It creates
--      the school, seeds its default roles (Administrator/Teacher/
--      Accountant/Secretary), grants the Administrator role every current
--      permission, and links the new user to the school as its admin —
--      all in one transaction, so a failure partway through can't leave a
--      school without an administrator or an administrator without a school.
--
-- security definer lets this run before the new user has a `profiles` row
-- (and therefore before current_school_id()/has_permission() would resolve
-- anything for them) — the function is the one and only door into `schools`
-- inserts, so there is no separate insert policy on that table to misuse.

create or replace function register_school(
  p_admin_user_id     uuid,
  p_school_name       text,
  p_slug              text,
  p_school_type       text,
  p_education_levels  text[],
  p_address           text,
  p_region            text,
  p_district          text,
  p_phone             text,
  p_email             text,
  p_motto             text,
  p_admin_full_name   text,
  -- Pre-generated client-side (crypto.randomUUID()) so the caller can upload
  -- a logo to R2 under schools/{id}/logo/... *before* this function runs,
  -- and pass the resulting object key straight in — avoiding a chicken-and-
  -- egg problem where the school id doesn't exist until after the upload.
  p_school_id         uuid default gen_random_uuid(),
  p_logo_path         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id      uuid := p_school_id;
  v_admin_role_id  uuid;
begin
  if exists (select 1 from profiles where id = p_admin_user_id) then
    raise exception 'This account is already linked to a school';
  end if;

  insert into schools (id, name, slug, school_type, education_levels, address, region, district, phone, email, motto, logo_path)
  values (v_school_id, p_school_name, p_slug, p_school_type, p_education_levels, p_address, p_region, p_district, p_phone, p_email, p_motto, p_logo_path);

  insert into education_levels (school_id, name, order_index)
  select v_school_id, trim(level_name), level_order - 1
  from unnest(p_education_levels) with ordinality as levels(level_name, level_order)
  where trim(level_name) <> '';

  -- Default roles. Administrator is a protected system role (cannot be
  -- deleted or edited away) so a school can never lock itself out.
  insert into roles (school_id, name, description, is_system)
  values (v_school_id, 'Administrator', 'Full access to the school workspace', true)
  returning id into v_admin_role_id;

  insert into roles (school_id, name, description, is_system) values
    (v_school_id, 'Teacher',   'Assigned classes, attendance, syllabus progress, exams for their subjects', false),
    (v_school_id, 'Accountant','Student finance, payments, and financial reports', false),
    (v_school_id, 'Secretary', 'Students, documents, and permitted finance/exam views', false);

  -- Administrator starts with every permission that exists today. New
  -- permissions added by future modules are NOT auto-granted retroactively —
  -- an administrator opts in via Settings → Roles, consistent with
  -- "permissions must be configurable, not hard-coded".
  insert into role_permissions (role_id, permission_id)
  select v_admin_role_id, id from permissions;

  insert into profiles (id, school_id, role_id, full_name, email)
  values (p_admin_user_id, v_school_id, v_admin_role_id, p_admin_full_name, p_email);

  insert into audit_logs (school_id, actor_id, action, resource_type, resource_id, metadata)
  values (v_school_id, p_admin_user_id, 'school.register', 'school', v_school_id::text,
          jsonb_build_object('school_name', p_school_name));

  return v_school_id;
end;
$$;

-- Advances (or jumps to) a step of the setup wizard. Kept as its own
-- function, rather than a raw UPDATE from the client, so we can validate the
-- step range and compute setup_completed consistently in one place.
create or replace function advance_setup_step(p_step int, p_completed boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid := current_school_id();
begin
  if v_school_id is null then
    raise exception 'No school associated with this account';
  end if;
  if not has_permission('edit_settings') then
    raise exception 'You do not have permission to change setup progress';
  end if;
  if p_step < 1 or p_step > 8 then
    raise exception 'Invalid setup step %', p_step;
  end if;

  update schools
  set setup_step = greatest(setup_step, p_step),
      setup_completed = setup_completed or p_completed
  where id = v_school_id;
end;
$$;
