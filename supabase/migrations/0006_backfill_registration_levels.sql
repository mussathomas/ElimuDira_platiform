-- Keep the normalized education_levels table in sync for schools created by
-- older versions of register_school().

insert into education_levels (school_id, name, order_index)
select s.id, trim(level_name), level_order - 1
from schools s
cross join lateral unnest(s.education_levels) with ordinality as levels(level_name, level_order)
where trim(level_name) <> ''
on conflict (school_id, name) do nothing;

alter table schools
  add column if not exists grading_system text not null default 'percentage';

alter table schools
  add constraint schools_grading_system_check
  check (grading_system in ('percentage', 'letter', 'division'));

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
  p_school_id         uuid default gen_random_uuid(),
  p_logo_path         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid := p_school_id;
  v_admin_role_id uuid;
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

  insert into roles (school_id, name, description, is_system)
  values (v_school_id, 'Administrator', 'Full access to the school workspace', true)
  returning id into v_admin_role_id;

  insert into roles (school_id, name, description, is_system) values
    (v_school_id, 'Teacher', 'Assigned classes, attendance, syllabus progress, exams for their subjects', false),
    (v_school_id, 'Accountant', 'Student finance, payments, and financial reports', false),
    (v_school_id, 'Secretary', 'Students, documents, and permitted finance/exam views', false);

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