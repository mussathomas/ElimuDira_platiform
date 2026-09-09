create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  attendance_date date not null default current_date,
  status text not null check (status in ('present','absent','late','excused')),
  note text,
  recorded_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, student_id, attendance_date)
);

create index if not exists attendance_school_date_idx on attendance_records(school_id, attendance_date desc);
create index if not exists attendance_class_date_idx on attendance_records(school_id, class_id, attendance_date desc);
drop trigger if exists attendance_set_updated_at on attendance_records;
create trigger attendance_set_updated_at before update on attendance_records for each row execute function set_updated_at();

alter table attendance_records enable row level security;
drop policy if exists attendance_select on attendance_records;
create policy attendance_select on attendance_records for select using (school_id = current_school_id() or is_super_admin());
drop policy if exists attendance_write on attendance_records;
create policy attendance_write on attendance_records for all using (school_id = current_school_id() and has_permission('mark_attendance')) with check (school_id = current_school_id() and has_permission('mark_attendance'));
drop policy if exists attendance_approve on attendance_records;
create policy attendance_approve on attendance_records for update using (school_id = current_school_id() and has_permission('approve_attendance')) with check (school_id = current_school_id() and has_permission('approve_attendance'));

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.is_system and p.code in ('mark_attendance','view_attendance','approve_attendance')
on conflict (role_id, permission_id) do nothing;
