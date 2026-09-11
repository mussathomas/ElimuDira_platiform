-- ElimuDira finance module: student fee assessments and payments.

create table if not exists fee_assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  student_id uuid not null references students (id) on delete restrict,
  academic_year_id uuid references academic_years (id) on delete set null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fee_assessments_school_student_idx on fee_assessments (school_id, student_id);
create index if not exists fee_assessments_due_date_idx on fee_assessments (school_id, due_date);

create table if not exists fee_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  assessment_id uuid not null references fee_assessments (id) on delete restrict,
  student_id uuid not null references students (id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  method text not null default 'cash' check (method in ('cash', 'bank', 'mobile_money', 'card', 'other')),
  reference text,
  notes text,
  received_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fee_payments_school_date_idx on fee_payments (school_id, payment_date desc);
create index if not exists fee_payments_assessment_idx on fee_payments (assessment_id);

alter table fee_assessments enable row level security;
alter table fee_payments enable row level security;

drop policy if exists fee_assessments_select on fee_assessments;
create policy fee_assessments_select on fee_assessments
  for select using (school_id = current_school_id() or is_super_admin());
drop policy if exists fee_assessments_write on fee_assessments;
create policy fee_assessments_write on fee_assessments
  for all using (school_id = current_school_id() and has_permission('create_payment'))
  with check (school_id = current_school_id() and has_permission('create_payment'));

drop policy if exists fee_payments_select on fee_payments;
create policy fee_payments_select on fee_payments
  for select using (school_id = current_school_id() or is_super_admin());
drop policy if exists fee_payments_write on fee_payments;
create policy fee_payments_write on fee_payments
  for insert with check (school_id = current_school_id() and has_permission('create_payment'));

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.is_system and p.code in ('view_finance', 'create_payment', 'edit_payment', 'delete_payment', 'export_finance')
on conflict (role_id, permission_id) do nothing;
