create table if not exists examinations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  academic_year_id uuid references academic_years(id) on delete set null,
  name text not null,
  term text not null,
  starts_on date,
  ends_on date,
  status text not null default 'draft' check (status in ('draft','open','closed','published')),
  created_at timestamptz not null default now(),
  unique (school_id, name, term)
);

create table if not exists exam_marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  examination_id uuid not null references examinations(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  grade text,
  comment text,
  entered_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (examination_id, student_id, subject_id)
);

create index if not exists examinations_school_idx on examinations(school_id, created_at desc);
create index if not exists exam_marks_school_idx on exam_marks(school_id, examination_id);

drop trigger if exists exam_marks_set_updated_at on exam_marks;
create trigger exam_marks_set_updated_at before update on exam_marks for each row execute function set_updated_at();

alter table examinations enable row level security;
alter table exam_marks enable row level security;

drop policy if exists examinations_select on examinations;
create policy examinations_select on examinations for select using (school_id = current_school_id() or is_super_admin());
drop policy if exists examinations_write on examinations;
create policy examinations_write on examinations for all using (school_id = current_school_id() and has_permission('create_exam')) with check (school_id = current_school_id() and has_permission('create_exam'));

drop policy if exists exam_marks_select on exam_marks;
create policy exam_marks_select on exam_marks for select using (school_id = current_school_id() or is_super_admin());
drop policy if exists exam_marks_write on exam_marks;
create policy exam_marks_write on exam_marks for all using (school_id = current_school_id() and has_permission('enter_marks')) with check (school_id = current_school_id() and has_permission('enter_marks'));

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.is_system and p.code in ('create_exam','enter_marks','view_exams','download_reports')
on conflict (role_id, permission_id) do nothing;
