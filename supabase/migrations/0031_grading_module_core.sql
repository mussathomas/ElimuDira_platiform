-- 0031: build a clean grading submodule around the existing ElimuDira grade/division model.
-- This migration intentionally reuses the existing grading_scales / grade_bands / division_rules / division_bands tables
-- and adds the missing school-scoped configuration needed for subject-selection rules and audit-ready metadata.

alter table grading_scales
  add column if not exists created_by uuid references profiles(id) on delete set null,
  add column if not exists updated_by uuid references profiles(id) on delete set null,
  add column if not exists updated_at timestamptz;

alter table grade_bands
  add column if not exists created_by uuid references profiles(id) on delete set null,
  add column if not exists updated_by uuid references profiles(id) on delete set null,
  add column if not exists updated_at timestamptz;

alter table division_rules
  add column if not exists created_by uuid references profiles(id) on delete set null,
  add column if not exists updated_by uuid references profiles(id) on delete set null,
  add column if not exists updated_at timestamptz;

alter table division_bands
  add column if not exists created_by uuid references profiles(id) on delete set null,
  add column if not exists updated_by uuid references profiles(id) on delete set null,
  add column if not exists updated_at timestamptz;

create table if not exists subject_selection_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  education_level_id uuid references education_levels(id) on delete set null,
  academic_year_id uuid references academic_years(id) on delete set null,
  name text not null default 'Subject selection rule',
  description text,
  subjects_considered integer not null default 1 check (subjects_considered > 0),
  selection_method text not null default 'best_n' check (selection_method in ('best_n', 'all_subjects', 'compulsory_plus_best_optional', 'manual')),
  include_compulsory boolean not null default true,
  include_optional boolean not null default true,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, education_level_id, academic_year_id, name)
);

create table if not exists subject_selection_rule_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  rule_id uuid not null references subject_selection_rules(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  item_type text not null check (item_type in ('required', 'optional', 'compulsory', 'excluded')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (rule_id, subject_id, item_type)
);

create index if not exists subject_selection_rules_school_idx on subject_selection_rules(school_id);
create index if not exists subject_selection_rule_items_rule_idx on subject_selection_rule_items(rule_id);
create index if not exists subject_selection_rule_items_school_idx on subject_selection_rule_items(school_id);

alter table subject_selection_rules enable row level security;
alter table subject_selection_rule_items enable row level security;

create policy subject_selection_rules_select
  on subject_selection_rules for select
  using (school_id = current_school_id() or is_super_admin());

create policy subject_selection_rules_write
  on subject_selection_rules for all
  using (school_id = current_school_id() and has_permission('edit_settings'))
  with check (school_id = current_school_id() and has_permission('edit_settings'));

create policy subject_selection_rule_items_select
  on subject_selection_rule_items for select
  using (school_id = current_school_id() or is_super_admin());

create policy subject_selection_rule_items_write
  on subject_selection_rule_items for all
  using (school_id = current_school_id() and has_permission('edit_settings'))
  with check (school_id = current_school_id() and has_permission('edit_settings'));

drop trigger if exists grading_scales_set_updated_at on grading_scales;
create trigger grading_scales_set_updated_at
  before update on grading_scales
  for each row execute function set_updated_at();

drop trigger if exists grade_bands_set_updated_at on grade_bands;
create trigger grade_bands_set_updated_at
  before update on grade_bands
  for each row execute function set_updated_at();

drop trigger if exists division_rules_set_updated_at on division_rules;
drop trigger if exists division_bands_set_updated_at on division_bands;
create trigger division_rules_set_updated_at
  before update on division_rules
  for each row execute function set_updated_at();

create trigger division_bands_set_updated_at
  before update on division_bands
  for each row execute function set_updated_at();

drop trigger if exists subject_selection_rules_set_updated_at on subject_selection_rules;
create trigger subject_selection_rules_set_updated_at
  before update on subject_selection_rules
  for each row execute function set_updated_at();
