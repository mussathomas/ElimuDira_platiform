create table if not exists attendance_days (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  attendance_date date not null,
  approved boolean not null default false,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, attendance_date)
);

create table if not exists student_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  attendance_day_id uuid not null references attendance_days(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  stream_id uuid references streams(id) on delete set null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  note text,
  marked_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attendance_day_id, student_id)
);

create table if not exists staff_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  attendance_day_id uuid not null references attendance_days(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  signed_in_at timestamptz,
  signed_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attendance_day_id, profile_id),
  check (signed_out_at is null or signed_in_at is not null)
);

create index if not exists attendance_days_school_date_idx on attendance_days(school_id, attendance_date desc);
create index if not exists student_attendance_school_day_idx on student_attendance(school_id, attendance_day_id);
create index if not exists staff_attendance_school_day_idx on staff_attendance(school_id, attendance_day_id);

create or replace function attendance_day_is_open(day_id uuid)
returns boolean
language sql
stable
as $$
  select not exists (select 1 from attendance_days where id = day_id and approved)
$$;

alter table attendance_days enable row level security;
alter table student_attendance enable row level security;
alter table staff_attendance enable row level security;

create policy attendance_days_select on attendance_days for select
  using (school_id = current_school_id() or is_super_admin());
create policy attendance_days_insert on attendance_days for insert
  with check (school_id = current_school_id());
create policy attendance_days_approve on attendance_days for update
  using (school_id = current_school_id() and has_permission('approve_attendance'))
  with check (school_id = current_school_id() and has_permission('approve_attendance'));

create policy student_attendance_select on student_attendance for select
  using (school_id = current_school_id() or is_super_admin());
create policy student_attendance_write on student_attendance for all
  using (school_id = current_school_id() and has_permission('mark_attendance') and attendance_day_is_open(attendance_day_id))
  with check (school_id = current_school_id() and has_permission('mark_attendance') and attendance_day_is_open(attendance_day_id));

create policy staff_attendance_select on staff_attendance for select
  using (school_id = current_school_id() or profile_id = auth.uid() or is_super_admin());
create policy staff_attendance_self_write on staff_attendance for insert
  with check (school_id = current_school_id() and profile_id = auth.uid() and attendance_day_is_open(attendance_day_id));
create policy staff_attendance_self_update on staff_attendance for update
  using (school_id = current_school_id() and profile_id = auth.uid() and attendance_day_is_open(attendance_day_id))
  with check (school_id = current_school_id() and profile_id = auth.uid() and attendance_day_is_open(attendance_day_id));
create policy staff_attendance_approval on staff_attendance for update
  using (school_id = current_school_id() and has_permission('approve_attendance'))
  with check (school_id = current_school_id() and has_permission('approve_attendance'));

create trigger student_attendance_set_updated_at before update on student_attendance for each row execute function set_updated_at();
create trigger staff_attendance_set_updated_at before update on staff_attendance for each row execute function set_updated_at();

insert into permissions (code, module, action, description) values
  ('mark_attendance', 'attendance', 'mark', 'Mark student attendance'),
  ('view_attendance', 'attendance', 'view', 'View attendance records'),
  ('approve_attendance', 'attendance', 'approve', 'Approve daily attendance')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.is_system and p.code in ('mark_attendance','view_attendance','approve_attendance')
on conflict (role_id, permission_id) do nothing;
