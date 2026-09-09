alter table grading_scales
  add column if not exists description text,
  add column if not exists academic_year_id uuid references academic_years(id) on delete set null,
  add column if not exists class_id uuid references classes(id) on delete set null,
  add column if not exists examination_type_id uuid references examination_types(id) on delete set null,
  add column if not exists minimum_pass_mark numeric(6,2) not null default 0,
  add column if not exists status text not null default 'active' check (status in ('active', 'inactive')),
  add column if not exists effective_from date,
  add column if not exists effective_to date;

alter table division_rules
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists academic_year_id uuid references academic_years(id) on delete set null,
  add column if not exists class_id uuid references classes(id) on delete set null,
  add column if not exists examination_type_id uuid references examination_types(id) on delete set null,
  add column if not exists selection_method text not null default 'best_n' check (selection_method in ('best_n', 'all_subjects', 'compulsory_plus_best_optional', 'manual')),
  add column if not exists maximum_subjects_allowed integer not null default 20 check (maximum_subjects_allowed > 0),
  add column if not exists include_subsidiary_subjects boolean not null default true,
  add column if not exists allow_failed_subjects boolean not null default true,
  add column if not exists compulsory_must_pass boolean not null default false,
  add column if not exists failed_compulsory_fails_overall boolean not null default false,
  add column if not exists division_zero_on_failure boolean not null default false,
  add column if not exists minimum_passed_subjects integer not null default 0,
  add column if not exists maximum_failed_subjects integer not null default 999,
  add column if not exists status text not null default 'active' check (status in ('active', 'inactive')),
  add column if not exists effective_from date,
  add column if not exists effective_to date;

update division_rules set name = coalesce(name, 'Division Rule') where name is null;
alter table division_rules alter column name set not null;

alter table examinations
  add column if not exists grading_scale_id uuid references grading_scales(id) on delete set null,
  add column if not exists division_rule_id uuid references division_rules(id) on delete set null;

create table if not exists exam_scheme_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  examination_id uuid not null references examinations(id) on delete cascade,
  grading_scale_id uuid references grading_scales(id) on delete set null,
  division_rule_id uuid references division_rules(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, examination_id)
);

create index if not exists grading_scales_scope_idx on grading_scales(school_id, academic_year_id, education_level_id, class_id, examination_type_id);
create index if not exists division_rules_scope_idx on division_rules(school_id, academic_year_id, education_level_id, class_id, examination_type_id);
create index if not exists exam_scheme_assignments_school_idx on exam_scheme_assignments(school_id, examination_id);

create unique index if not exists active_grading_scheme_scope_idx on grading_scales (
  school_id,
  coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(education_level_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(examination_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where status = 'active';

create unique index if not exists active_division_scheme_scope_idx on division_rules (
  school_id,
  coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(education_level_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(examination_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where status = 'active';

alter table exam_scheme_assignments enable row level security;
create policy exam_scheme_assignments_select on exam_scheme_assignments for select using (school_id = current_school_id() or is_super_admin());
create policy exam_scheme_assignments_write on exam_scheme_assignments for all using (school_id = current_school_id() and has_permission('edit_settings')) with check (school_id = current_school_id() and has_permission('edit_settings'));

create or replace function validate_grading_scheme_scope()
returns trigger language plpgsql as $$
begin
  if new.minimum_pass_mark < 0 or new.minimum_pass_mark > new.max_mark then raise exception 'Minimum pass mark must be between zero and maximum mark'; end if;
  if new.effective_to is not null and new.effective_from is not null and new.effective_to < new.effective_from then raise exception 'Effective end date cannot precede effective start date'; end if;
  return new;
end;
$$;
drop trigger if exists grading_scheme_scope_check on grading_scales;
create trigger grading_scheme_scope_check before insert or update on grading_scales for each row execute function validate_grading_scheme_scope();

create or replace function validate_division_scheme_scope()
returns trigger language plpgsql as $$
begin
  if new.minimum_subjects_required > new.maximum_subjects_allowed then raise exception 'Minimum subjects cannot exceed maximum subjects'; end if;
  if new.subjects_counted < new.minimum_subjects_required or new.subjects_counted > new.maximum_subjects_allowed then raise exception 'Subjects used must be within configured limits'; end if;
  if new.effective_to is not null and new.effective_from is not null and new.effective_to < new.effective_from then raise exception 'Effective end date cannot precede effective start date'; end if;
  return new;
end;
$$;
drop trigger if exists division_scheme_scope_check on division_rules;
create trigger division_scheme_scope_check before insert or update on division_rules for each row execute function validate_division_scheme_scope();

create or replace function validate_grade_band_scheme_limit()
returns trigger language plpgsql as $$
declare scheme_max numeric;
begin
  select max_mark into scheme_max from grading_scales where id = new.grading_scale_id;
  if new.min_score < 0 or new.max_score > scheme_max then raise exception 'Grade range is outside the grading scheme maximum'; end if;
  return new;
end;
$$;
drop trigger if exists grade_band_scheme_limit_check on grade_bands;
create trigger grade_band_scheme_limit_check before insert or update on grade_bands for each row execute function validate_grade_band_scheme_limit();
