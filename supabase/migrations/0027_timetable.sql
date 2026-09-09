-- Timetable module: school-scoped schedules built on existing academic entities.

create table if not exists timetable_rooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  room_type text not null default 'classroom',
  capacity integer check (capacity is null or capacity > 0),
  available_days smallint[] not null default '{1,2,3,4,5}',
  available_period_ids uuid[] not null default '{}',
  notes text,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists timetable_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  starts_at time not null,
  ends_at time not null,
  order_index integer not null default 0,
  is_break boolean not null default false,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  constraint timetable_period_times check (ends_at > starts_at)
);

create table if not exists timetables (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  term text not null,
  name text not null,
  level text,
  status text not null default 'DRAFT' check (status in ('DRAFT','REVIEW','APPROVED','PUBLISHED','ARCHIVED')),
  is_dirty boolean not null default false,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references profiles(id) on delete set null,
  unique (school_id, academic_year_id, term, name)
);

create table if not exists timetable_entries (
  id uuid primary key default gen_random_uuid(),
  timetable_id uuid not null references timetables(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete restrict,
  subject_id uuid not null references subjects(id) on delete restrict,
  teacher_id uuid references profiles(id) on delete set null,
  room_id uuid references timetable_rooms(id) on delete set null,
  period_id uuid not null references timetable_periods(id) on delete restrict,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time,
  end_time time,
  lesson_type text not null default 'lesson',
  notes text,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists timetable_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  rules jsonb not null default '{}',
  enabled boolean not null default true,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create index if not exists timetables_school_year_idx on timetables(school_id, academic_year_id, status);
create index if not exists timetable_entries_grid_idx on timetable_entries(timetable_id, day_of_week, period_id);
create index if not exists timetable_entries_class_idx on timetable_entries(school_id, class_id, day_of_week, period_id);
create index if not exists timetable_entries_teacher_idx on timetable_entries(school_id, teacher_id, day_of_week, period_id);
create index if not exists timetable_entries_room_idx on timetable_entries(school_id, room_id, day_of_week, period_id);

alter table timetable_rooms enable row level security;
alter table timetable_periods enable row level security;
alter table timetables enable row level security;
alter table timetable_entries enable row level security;
alter table timetable_rules enable row level security;

create policy timetable_rooms_select on timetable_rooms for select using (school_id = current_school_id() or is_super_admin());
create policy timetable_rooms_write on timetable_rooms for all using (school_id = current_school_id() and (has_permission('manage_timetable') or has_permission('edit_timetable_settings'))) with check (school_id = current_school_id());
create policy timetable_periods_select on timetable_periods for select using (school_id = current_school_id() or is_super_admin());
create policy timetable_periods_write on timetable_periods for all using (school_id = current_school_id() and (has_permission('manage_timetable') or has_permission('edit_timetable_settings'))) with check (school_id = current_school_id());
create policy timetables_select on timetables for select using (school_id = current_school_id() or is_super_admin());
create policy timetables_insert on timetables for insert with check (school_id = current_school_id() and has_permission('create_timetable') and created_by = auth.uid());
create policy timetables_update on timetables for update using (school_id = current_school_id() and (created_by = auth.uid() or has_permission('manage_timetable'))) with check (school_id = current_school_id());
create policy timetables_delete on timetables for delete using (school_id = current_school_id() and (created_by = auth.uid() or has_permission('manage_timetable')));
create policy timetable_entries_select on timetable_entries for select using (school_id = current_school_id() or is_super_admin());
create policy timetable_entries_write on timetable_entries for all using (school_id = current_school_id() and exists (select 1 from timetables t where t.id = timetable_id and (t.created_by = auth.uid() or has_permission('manage_timetable')))) with check (school_id = current_school_id() and exists (select 1 from timetables t where t.id = timetable_id and (t.created_by = auth.uid() or has_permission('manage_timetable'))));
create policy timetable_rules_select on timetable_rules for select using (school_id = current_school_id() or is_super_admin());
create policy timetable_rules_write on timetable_rules for all using (school_id = current_school_id() and has_permission('edit_timetable_settings')) with check (school_id = current_school_id());

create trigger timetable_rooms_set_updated_at before update on timetable_rooms for each row execute function set_updated_at();
create trigger timetable_periods_set_updated_at before update on timetable_periods for each row execute function set_updated_at();
create trigger timetables_set_updated_at before update on timetables for each row execute function set_updated_at();
create trigger timetable_entries_set_updated_at before update on timetable_entries for each row execute function set_updated_at();
create trigger timetable_rules_set_updated_at before update on timetable_rules for each row execute function set_updated_at();

insert into permissions (code, module, action, description) values
  ('view_timetable', 'timetable', 'view', 'View school timetables'),
  ('create_timetable', 'timetable', 'create', 'Create timetable drafts'),
  ('manage_timetable', 'timetable', 'edit', 'Edit and manage timetables'),
  ('publish_timetable', 'timetable', 'approve', 'Publish and republish timetables'),
  ('archive_timetable', 'timetable', 'delete', 'Archive timetables'),
  ('edit_timetable_settings', 'timetable', 'edit', 'Manage timetable rooms, periods, and rules')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.is_system and p.code in ('view_timetable','create_timetable','manage_timetable','publish_timetable','archive_timetable','edit_timetable_settings')
on conflict (role_id, permission_id) do nothing;