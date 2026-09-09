-- ElimuDira — Phase 1 core schema
-- Multi-tenant education management platform.
-- Every school-owned table carries a school_id and is locked down by RLS
-- in 0002_helper_functions_and_rls.sql. This file only defines structure.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Platform level
-- ---------------------------------------------------------------------------

create type school_status as enum ('active', 'suspended', 'deactivated');

create table schools (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  school_type       text not null,               -- e.g. 'primary', 'secondary', 'mixed'
  education_levels  text[] not null default '{}', -- e.g. {'O-Level','A-Level'} — informational; real structure lives in education_levels table
  address           text,
  region            text,
  district          text,
  phone             text,
  email             text,
  motto             text,
  logo_path         text,                         -- R2 object key, not a public URL
  status            school_status not null default 'active',
  setup_step        int not null default 1,
  setup_completed   boolean not null default false,
  grading_system    text not null default 'percentage',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index schools_status_idx on schools (status);
create index schools_slug_idx on schools (slug);

-- Platform-level administrators. Deliberately a separate table from
-- `profiles` so platform permissions can never be confused with, or
-- accidentally inherited from, a school-level role.
create table platform_admins (
  profile_id  uuid primary key,
  role        text not null default 'super_admin' check (role in ('super_admin', 'support')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Identity — one row per auth.users member
-- ---------------------------------------------------------------------------

create type profile_status as enum ('active', 'suspended');

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  school_id   uuid references schools (id) on delete cascade, -- null only for platform_admins
  role_id     uuid,                                            -- fk added after `roles` exists
  full_name   text not null,
  email       text not null,
  phone       text,
  avatar_path text,
  status      profile_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_school_id_idx on profiles (school_id);

alter table platform_admins
  add constraint platform_admins_profile_fk
  foreign key (profile_id) references profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Permissions catalog (platform-defined, shared by every school)
-- ---------------------------------------------------------------------------

create table permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,   -- e.g. 'view_students'
  module      text not null,          -- e.g. 'students'
  action      text not null,          -- e.g. 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'download' | 'send'
  description text
);

create index permissions_module_idx on permissions (module);

-- ---------------------------------------------------------------------------
-- Roles — belong to a school, hold a set of permissions
-- ---------------------------------------------------------------------------

create table roles (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  name        text not null,
  description text,
  is_system   boolean not null default false, -- true for the seeded Administrator role; cannot be deleted
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

create index roles_school_id_idx on roles (school_id);

alter table profiles
  add constraint profiles_role_fk foreign key (role_id) references roles (id) on delete set null;

create table role_permissions (
  role_id       uuid not null references roles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- Per-user overrides layered on top of the role's permissions — lets an
-- administrator grant/revoke one specific action for one specific person
-- without creating a whole new role.
create table user_permission_overrides (
  profile_id    uuid not null references profiles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  granted       boolean not null, -- true = grant even if role lacks it, false = revoke even if role has it
  primary key (profile_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- Academic structure
-- ---------------------------------------------------------------------------

create table academic_years (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  name        text not null,      -- e.g. '2026'
  start_date  date not null,
  end_date    date not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (school_id, name),
  constraint academic_years_dates_check check (end_date > start_date)
);

create index academic_years_school_id_idx on academic_years (school_id);

-- Only one current academic year per school.
create unique index academic_years_one_current_idx
  on academic_years (school_id)
  where is_current;

create table education_levels (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  name        text not null,       -- e.g. 'O-Level'
  order_index int not null default 0,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

create index education_levels_school_id_idx on education_levels (school_id);

create table classes (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools (id) on delete cascade,
  education_level_id  uuid not null references education_levels (id) on delete cascade,
  name                text not null,  -- e.g. 'Form 2'
  order_index         int not null default 0,
  created_at          timestamptz not null default now(),
  unique (school_id, education_level_id, name)
);

create index classes_school_id_idx on classes (school_id);

create table streams (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  class_id    uuid not null references classes (id) on delete cascade,
  name        text not null, -- e.g. 'Form 2A'
  created_at  timestamptz not null default now(),
  unique (school_id, class_id, name)
);

create index streams_school_id_idx on streams (school_id);

create table subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  name        text not null,
  code        text,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

create index subjects_school_id_idx on subjects (school_id);

-- ---------------------------------------------------------------------------
-- Audit log — read-only for ordinary users, written by server-side actions
-- ---------------------------------------------------------------------------

create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid references schools (id) on delete cascade, -- null = platform-level action
  actor_id      uuid references profiles (id) on delete set null,
  action        text not null,          -- e.g. 'student.create', 'payment.void', 'school.suspend'
  resource_type text not null,
  resource_id   text,
  metadata      jsonb not null default '{}',
  ip_address    text,
  created_at    timestamptz not null default now()
);

create index audit_logs_school_id_idx on audit_logs (school_id);
create index audit_logs_actor_id_idx on audit_logs (actor_id);
create index audit_logs_created_at_idx on audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger schools_set_updated_at
  before update on schools
  for each row execute function set_updated_at();

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();
