-- 0024: auditable class promotion and school transfer workflows.
-- Student rows and historical marks remain in their source school. A school
-- transfer creates a new target-school enrollment after target acceptance.

create table if not exists student_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  class_id uuid references classes(id) on delete set null,
  stream_id uuid references streams(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'promoted', 'repeated', 'transferred')),
  promoted_from_enrollment_id uuid references student_enrollments(id) on delete set null,
  placed_by uuid references profiles(id) on delete set null,
  placed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year_id)
);

create index if not exists student_enrollments_school_year_idx
  on student_enrollments (school_id, academic_year_id, class_id);

create table if not exists student_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  source_school_id uuid not null references schools(id) on delete cascade,
  target_school_id uuid not null references schools(id) on delete cascade,
  source_student_id uuid not null references students(id) on delete restrict,
  target_student_id uuid references students(id) on delete set null,
  student_snapshot jsonb not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  requested_by uuid not null references profiles(id) on delete restrict,
  decided_by uuid references profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (source_student_id, target_school_id, status)
);

create index if not exists student_transfer_target_status_idx
  on student_transfer_requests (target_school_id, status, requested_at desc);
create index if not exists student_transfer_source_status_idx
  on student_transfer_requests (source_school_id, status, requested_at desc);

alter table student_enrollments enable row level security;
alter table student_transfer_requests enable row level security;

create policy student_enrollments_select on student_enrollments
  for select using (school_id = current_school_id() or is_super_admin());
create policy student_enrollments_write on student_enrollments
  for all using (school_id = current_school_id() and has_permission('transfer_student'))
  with check (school_id = current_school_id() and has_permission('transfer_student'));

create policy student_transfer_requests_select on student_transfer_requests
  for select using (source_school_id = current_school_id() or target_school_id = current_school_id() or is_super_admin());
create policy student_transfer_requests_insert on student_transfer_requests
  for insert with check (source_school_id = current_school_id() and has_permission('transfer_student'));
create policy student_transfer_requests_update on student_transfer_requests
  for update using ((source_school_id = current_school_id() or target_school_id = current_school_id()) and has_permission('transfer_student'))
  with check (source_school_id = current_school_id() or target_school_id = current_school_id() or is_super_admin());

create or replace function list_transfer_schools()
returns table (id uuid, name text, slug text)
language sql
security definer
set search_path = public
as $$
  select s.id, s.name, s.slug
  from schools s
  where s.status = 'active'
    and s.id <> current_school_id()
  order by s.name;
$$;
revoke all on function list_transfer_schools() from public;
grant execute on function list_transfer_schools() to authenticated;

create or replace function set_student_enrollment_school_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from students where id = new.student_id and school_id = new.school_id) then
    raise exception 'Student enrollment must belong to the student school';
  end if;
  if new.stream_id is not null and not exists (select 1 from streams where id = new.stream_id and class_id = new.class_id and school_id = new.school_id) then
    raise exception 'Enrollment stream does not belong to the enrollment class';
  end if;
  return new;
end;
$$;

drop trigger if exists student_enrollment_school_guard on student_enrollments;
create trigger student_enrollment_school_guard
  before insert or update on student_enrollments
  for each row execute function set_student_enrollment_school_guard();

create trigger student_enrollments_set_updated_at
  before update on student_enrollments
  for each row execute function set_updated_at();

comment on table student_enrollments is 'Academic-year placement history used for promotion without rewriting historical results.';
comment on table student_transfer_requests is 'Cross-school transfer requests; target acceptance creates a new student record and preserves source history.';
