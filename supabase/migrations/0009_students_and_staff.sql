create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  admission_number text not null,
  first_name text not null,
  last_name text not null,
  sex text,
  date_of_birth date,
  class_id uuid references classes (id) on delete set null,
  stream_id uuid references streams (id) on delete set null,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  status text not null default 'active' check (status in ('active', 'inactive', 'transferred')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, admission_number)
);

create index if not exists students_school_id_idx on students (school_id);
create index if not exists students_name_idx on students (school_id, last_name, first_name);

create table if not exists staff_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  profile_id uuid not null unique references profiles (id) on delete cascade,
  employee_number text not null,
  position text,
  created_at timestamptz not null default now(),
  unique (school_id, employee_number)
);

create index if not exists staff_members_school_id_idx on staff_members (school_id);

drop trigger if exists students_set_updated_at on students;
create trigger students_set_updated_at
  before update on students
  for each row execute function set_updated_at();

alter table students enable row level security;
alter table staff_members enable row level security;

drop policy if exists students_select on students;
create policy students_select on students
  for select using (school_id = current_school_id() or is_super_admin());
drop policy if exists students_write on students;
create policy students_write on students
  for all using (school_id = current_school_id() and has_permission('manage_students'))
  with check (school_id = current_school_id() and has_permission('manage_students'));

drop policy if exists staff_members_select on staff_members;
create policy staff_members_select on staff_members
  for select using (school_id = current_school_id() or is_super_admin());
drop policy if exists staff_members_write on staff_members;
create policy staff_members_write on staff_members
  for all using (school_id = current_school_id() and has_permission('manage_users'))
  with check (school_id = current_school_id() and has_permission('manage_users'));

insert into permissions (code, module, action, description) values
  ('manage_students', 'students', 'edit', 'Enroll and update student records'),
  ('manage_staff', 'staff', 'edit', 'Register staff members and manage their records')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.is_system and p.code in ('manage_students', 'manage_staff')
on conflict (role_id, permission_id) do nothing;
