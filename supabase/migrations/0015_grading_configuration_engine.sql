alter table grading_scales
  add column if not exists coverage_required boolean not null default true,
  add column if not exists max_mark numeric(5,2) not null default 100,
  add column if not exists version integer not null default 1;

alter table grade_bands
  add column if not exists passed boolean not null default true;

alter table division_rules
  add column if not exists use_best_subjects boolean not null default true,
  add column if not exists minimum_subjects_required integer not null default 1 check (minimum_subjects_required > 0),
  add column if not exists include_compulsory boolean not null default true,
  add column if not exists auto_select_optional boolean not null default true,
  add column if not exists principal_subjects_count integer,
  add column if not exists subsidiary_subjects_count integer;

alter table division_bands
  add column if not exists description text,
  add column if not exists passed boolean not null default true;

alter table division_bands
  alter column max_points drop not null;

create table if not exists compulsory_subjects (
  division_rule_id uuid not null references division_rules(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (division_rule_id, subject_id)
);

create table if not exists excluded_division_subjects (
  division_rule_id uuid not null references division_rules(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (division_rule_id, subject_id)
);

create table if not exists examination_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  contributes_to_final_result boolean not null default true,
  contributes_to_division boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists exam_grading_configs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  examination_type_id uuid not null references examination_types(id) on delete cascade,
  grading_scale_id uuid references grading_scales(id) on delete set null,
  division_rule_id uuid references division_rules(id) on delete set null,
  use_standard_scale boolean not null default true,
  contributes_to_final_result boolean not null default true,
  contributes_to_division boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, examination_type_id)
);

create table if not exists grading_scale_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  grading_scale_id uuid not null references grading_scales(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  examination_type_id uuid references examination_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (school_id, grading_scale_id, class_id, examination_type_id)
);

create table if not exists grading_configuration_versions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  grading_scale_id uuid references grading_scales(id) on delete set null,
  division_rule_id uuid references division_rules(id) on delete set null,
  version_number integer not null,
  snapshot jsonb not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, grading_scale_id, division_rule_id, version_number)
);

alter table examinations
  add column if not exists examination_type_id uuid references examination_types(id) on delete set null,
  add column if not exists grading_configuration_version_id uuid references grading_configuration_versions(id) on delete set null,
  add column if not exists processed_at timestamptz,
  add column if not exists processed_by uuid references profiles(id) on delete set null;

alter table exam_marks
  add column if not exists points numeric(6,2),
  add column if not exists remark text,
  add column if not exists passed boolean,
  add column if not exists included_in_division boolean not null default true,
  add column if not exists configuration_version_id uuid references grading_configuration_versions(id) on delete set null;

create table if not exists student_exam_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  examination_id uuid not null references examinations(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  subject_count integer not null default 0,
  pass_count integer not null default 0,
  fail_count integer not null default 0,
  aggregate numeric(8,2),
  division text,
  overall_remark text,
  included_subject_ids uuid[] not null default '{}',
  processed_at timestamptz not null default now(),
  unique (examination_id, student_id)
);

create index if not exists exam_types_school_idx on examination_types(school_id);
create index if not exists exam_grading_configs_school_idx on exam_grading_configs(school_id);
create index if not exists grading_versions_school_idx on grading_configuration_versions(school_id, created_at desc);

alter table compulsory_subjects enable row level security;
alter table excluded_division_subjects enable row level security;
alter table examination_types enable row level security;
alter table exam_grading_configs enable row level security;
alter table grading_scale_assignments enable row level security;
alter table grading_configuration_versions enable row level security;
alter table student_exam_results enable row level security;

create policy compulsory_subjects_select on compulsory_subjects for select using (division_rule_id in (select id from division_rules where school_id = current_school_id()) or is_super_admin());
create policy compulsory_subjects_write on compulsory_subjects for all using (division_rule_id in (select id from division_rules where school_id = current_school_id() and has_permission('edit_settings'))) with check (division_rule_id in (select id from division_rules where school_id = current_school_id() and has_permission('edit_settings')));
create policy excluded_subjects_select on excluded_division_subjects for select using (division_rule_id in (select id from division_rules where school_id = current_school_id()) or is_super_admin());
create policy excluded_subjects_write on excluded_division_subjects for all using (division_rule_id in (select id from division_rules where school_id = current_school_id() and has_permission('edit_settings'))) with check (division_rule_id in (select id from division_rules where school_id = current_school_id() and has_permission('edit_settings')));

create policy examination_types_select on examination_types for select using (school_id = current_school_id() or is_super_admin());
create policy examination_types_write on examination_types for all using (school_id = current_school_id() and has_permission('edit_settings')) with check (school_id = current_school_id() and has_permission('edit_settings'));
create policy exam_grading_configs_select on exam_grading_configs for select using (school_id = current_school_id() or is_super_admin());
create policy exam_grading_configs_write on exam_grading_configs for all using (school_id = current_school_id() and has_permission('edit_settings')) with check (school_id = current_school_id() and has_permission('edit_settings'));
create policy grading_scale_assignments_select on grading_scale_assignments for select using (school_id = current_school_id() or is_super_admin());
create policy grading_scale_assignments_write on grading_scale_assignments for all using (school_id = current_school_id() and has_permission('edit_settings')) with check (school_id = current_school_id() and has_permission('edit_settings'));
create policy grading_versions_select on grading_configuration_versions for select using (school_id = current_school_id() or is_super_admin());
create policy grading_versions_write on grading_configuration_versions for insert with check (school_id = current_school_id() and (has_permission('edit_settings') or has_permission('enter_marks')));
create policy student_exam_results_select on student_exam_results for select using (school_id = current_school_id() or is_super_admin());
create policy student_exam_results_write on student_exam_results for all using (school_id = current_school_id() and has_permission('enter_marks')) with check (school_id = current_school_id() and has_permission('enter_marks'));

create trigger exam_grading_configs_set_updated_at before update on exam_grading_configs for each row execute function set_updated_at();

create or replace function validate_grade_band_bounds()
returns trigger language plpgsql as $$
begin
  if new.min_score > new.max_score then raise exception 'Minimum score cannot exceed maximum score'; end if;
  if exists (select 1 from grade_bands where grading_scale_id = new.grading_scale_id and id <> new.id and new.min_score <= max_score and new.max_score >= min_score) then raise exception 'Grade ranges cannot overlap'; end if;
  return new;
end;
$$;

drop trigger if exists grade_band_bounds_check on grade_bands;
create trigger grade_band_bounds_check before insert or update on grade_bands for each row execute function validate_grade_band_bounds();

create or replace function validate_division_band_bounds()
returns trigger language plpgsql as $$
begin
  if new.min_points > new.max_points then raise exception 'Minimum aggregate cannot exceed maximum aggregate'; end if;
  if exists (select 1 from division_bands where division_rule_id = new.division_rule_id and id <> new.id and new.min_points <= max_points and new.max_points >= min_points) then raise exception 'Division ranges cannot overlap'; end if;
  return new;
end;
$$;

drop trigger if exists division_band_bounds_check on division_bands;
create trigger division_band_bounds_check before insert or update on division_bands for each row execute function validate_division_band_bounds();
