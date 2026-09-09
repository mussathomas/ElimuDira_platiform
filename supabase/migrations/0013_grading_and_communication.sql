create table if not exists grading_scales (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  education_level_id uuid references education_levels(id) on delete set null,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists grade_bands (
  id uuid primary key default gen_random_uuid(),
  grading_scale_id uuid not null references grading_scales(id) on delete cascade,
  grade_name text not null,
  min_score numeric(5,2) not null,
  max_score numeric(5,2) not null,
  points numeric(5,2),
  remark text,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  unique (grading_scale_id, grade_name)
);

create table if not exists division_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  education_level_id uuid references education_levels(id) on delete set null,
  subjects_counted int not null default 5 check (subjects_counted > 0),
  created_at timestamptz not null default now(),
  unique (school_id, education_level_id)
);

create table if not exists division_bands (
  id uuid primary key default gen_random_uuid(),
  division_rule_id uuid not null references division_rules(id) on delete cascade,
  division_name text not null,
  min_points numeric(5,2) not null,
  max_points numeric(5,2) not null,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  unique (division_rule_id, division_name)
);

create table if not exists communication_settings (
  school_id uuid primary key references schools(id) on delete cascade,
  whatsapp_enabled boolean not null default false,
  whatsapp_provider text,
  whatsapp_sender_id text,
  sms_enabled boolean not null default false,
  sms_provider text,
  sms_sender_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists communication_credentials (
  school_id uuid primary key references schools(id) on delete cascade,
  whatsapp_api_token text,
  sms_api_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grading_scales_school_idx on grading_scales(school_id);
create index if not exists grade_bands_scale_idx on grade_bands(grading_scale_id);
create index if not exists division_rules_school_idx on division_rules(school_id);
create index if not exists division_bands_rule_idx on division_bands(division_rule_id);

alter table grading_scales enable row level security;
alter table grade_bands enable row level security;
alter table division_rules enable row level security;
alter table division_bands enable row level security;
alter table communication_settings enable row level security;
alter table communication_credentials enable row level security;

create policy grading_scales_select on grading_scales
  for select using (school_id = current_school_id() or is_super_admin());
create policy grading_scales_write on grading_scales
  for all using (school_id = current_school_id() and has_permission('edit_settings'))
  with check (school_id = current_school_id());

create policy grade_bands_select on grade_bands
  for select using (
    grading_scale_id in (select id from grading_scales where school_id = current_school_id())
    or is_super_admin()
  );
create policy grade_bands_write on grade_bands
  for all using (
    grading_scale_id in (select id from grading_scales where school_id = current_school_id() and has_permission('edit_settings'))
  )
  with check (
    grading_scale_id in (select id from grading_scales where school_id = current_school_id() and has_permission('edit_settings'))
  );

create policy division_rules_select on division_rules
  for select using (school_id = current_school_id() or is_super_admin());
create policy division_rules_write on division_rules
  for all using (school_id = current_school_id() and has_permission('edit_settings'))
  with check (school_id = current_school_id());

create policy division_bands_select on division_bands
  for select using (
    division_rule_id in (select id from division_rules where school_id = current_school_id())
    or is_super_admin()
  );
create policy division_bands_write on division_bands
  for all using (
    division_rule_id in (select id from division_rules where school_id = current_school_id() and has_permission('edit_settings'))
  )
  with check (
    division_rule_id in (select id from division_rules where school_id = current_school_id() and has_permission('edit_settings'))
  );

create policy communication_settings_select on communication_settings
  for select using (school_id = current_school_id() or is_super_admin());
create policy communication_settings_write on communication_settings
  for all using (school_id = current_school_id() and has_permission('edit_settings'))
  with check (school_id = current_school_id());

create policy communication_credentials_insert on communication_credentials
  for insert with check (school_id = current_school_id() and has_permission('edit_settings'));
create policy communication_credentials_update on communication_credentials
  for update using (school_id = current_school_id() and has_permission('edit_settings'))
  with check (school_id = current_school_id() and has_permission('edit_settings'));
-- Intentionally no select policy on communication_credentials so secrets are never readable back to the client.

create trigger grading_scales_set_updated_at before update on grading_scales for each row execute function set_updated_at();
create trigger communication_settings_set_updated_at before update on communication_settings for each row execute function set_updated_at();
create trigger communication_credentials_set_updated_at before update on communication_credentials for each row execute function set_updated_at();
