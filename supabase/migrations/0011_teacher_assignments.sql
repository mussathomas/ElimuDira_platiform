create table if not exists teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (school_id, profile_id, class_id, subject_id)
);

create index if not exists teacher_assignments_lookup_idx on teacher_assignments(school_id, profile_id, class_id, subject_id);

alter table teacher_assignments enable row level security;
drop policy if exists teacher_assignments_select on teacher_assignments;
create policy teacher_assignments_select on teacher_assignments
  for select using (school_id = current_school_id() or is_super_admin());
drop policy if exists teacher_assignments_write on teacher_assignments;
create policy teacher_assignments_write on teacher_assignments
  for all using (school_id = current_school_id() and has_permission('manage_teaching_assignments'))
  with check (school_id = current_school_id() and has_permission('manage_teaching_assignments'));

insert into permissions (code, module, action, description) values
  ('manage_teaching_assignments', 'staff', 'edit', 'Assign teachers to classes and subjects')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.is_system and p.code = 'manage_teaching_assignments'
on conflict (role_id, permission_id) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where lower(r.name) = 'teacher' and p.code in ('view_exams', 'enter_marks')
on conflict (role_id, permission_id) do nothing;
