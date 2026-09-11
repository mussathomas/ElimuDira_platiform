-- Reusable fee structures for school finance.
create table if not exists fee_structures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  class_id uuid references classes (id) on delete cascade,
  academic_year_id uuid references academic_years (id) on delete set null,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date,
  active boolean not null default true,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fee_structures_school_class_idx on fee_structures (school_id, class_id);
create index if not exists fee_structures_school_year_idx on fee_structures (school_id, academic_year_id);

alter table fee_structures enable row level security;
drop policy if exists fee_structures_select on fee_structures;
create policy fee_structures_select on fee_structures
  for select using (school_id = current_school_id() or is_super_admin());
drop policy if exists fee_structures_write on fee_structures;
create policy fee_structures_write on fee_structures
  for all using (school_id = current_school_id() and has_permission('create_payment'))
  with check (school_id = current_school_id() and has_permission('create_payment'));

alter table fee_assessments add column if not exists fee_structure_id uuid references fee_structures (id) on delete set null;
create index if not exists fee_assessments_structure_idx on fee_assessments (fee_structure_id);
