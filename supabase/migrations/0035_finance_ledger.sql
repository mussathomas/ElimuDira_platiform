-- Normalize school finance around academic-year charges and allocated payments.

create table if not exists finance_fee_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, name),
  unique (school_id, id)
);

alter table fee_structures
  add column if not exists education_level_id uuid references education_levels(id) on delete set null;
alter table fee_structures drop constraint if exists fee_structures_academic_year_id_fkey;
alter table fee_structures add constraint fee_structures_academic_year_id_fkey
  foreign key (academic_year_id) references academic_years(id) on delete restrict;

create table if not exists fee_structure_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  fee_structure_id uuid not null references fee_structures(id) on delete cascade,
  fee_category_id uuid not null references finance_fee_categories(id) on delete restrict,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date,
  installment_count integer not null default 1 check (installment_count between 1 and 24),
  created_at timestamptz not null default now(),
  unique (school_id, id)
);

create index if not exists finance_fee_categories_school_idx on finance_fee_categories(school_id, active, name);
create index if not exists fee_structure_items_structure_idx on fee_structure_items(school_id, fee_structure_id);

create or replace function finance_validate_structure_item()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_academic_year_id uuid;
begin
  select structure.academic_year_id into v_academic_year_id from fee_structures structure
    where structure.id = new.fee_structure_id and structure.school_id = new.school_id;
  if v_academic_year_id is null
    or not exists (select 1 from finance_fee_categories category where category.id = new.fee_category_id and category.school_id = new.school_id) then
    raise exception 'Fee structure and category must belong to the same school';
  end if;
  if finance_year_is_closed(new.school_id, v_academic_year_id) then raise exception 'This financial year is closed'; end if;
  return new;
end;
$$;

drop trigger if exists finance_structure_item_guard on fee_structure_items;
create trigger finance_structure_item_guard before insert or update on fee_structure_items
for each row execute function finance_validate_structure_item();

create or replace function finance_audit_configuration_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_school_id uuid;
  v_resource_type text := tg_table_name;
  v_resource_id uuid;
  v_action text;
  v_previous jsonb := null;
  v_new jsonb := null;
begin
  if tg_op = 'DELETE' then
    v_school_id := old.school_id;
    v_resource_id := old.id;
    v_previous := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    v_school_id := new.school_id;
    v_resource_id := new.id;
    v_previous := to_jsonb(old);
    v_new := to_jsonb(new);
  else
    v_school_id := new.school_id;
    v_resource_id := new.id;
    v_new := to_jsonb(new);
  end if;
  v_action := 'finance.' || replace(tg_table_name, 'finance_', '') || '.' || lower(tg_op);
  insert into audit_logs(school_id, actor_id, action, resource_type, resource_id, metadata)
  values (
    v_school_id,
    auth.uid(),
    v_action,
    v_resource_type,
    v_resource_id::text,
    jsonb_build_object(
      'previous_value', v_previous,
      'new_value', v_new
    )
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists finance_category_audit on finance_fee_categories;
create trigger finance_category_audit after insert or update on finance_fee_categories
for each row execute function finance_audit_configuration_change();
drop trigger if exists finance_structure_audit on fee_structures;
create trigger finance_structure_audit after insert or update on fee_structures
for each row execute function finance_audit_configuration_change();
drop trigger if exists finance_structure_item_audit on fee_structure_items;
create trigger finance_structure_item_audit after insert or update on fee_structure_items
for each row execute function finance_audit_configuration_change();

alter table fee_assessments
  add column if not exists student_enrollment_id uuid references student_enrollments(id) on delete restrict,
  add column if not exists fee_category_id uuid references finance_fee_categories(id) on delete restrict,
  add column if not exists fee_structure_item_id uuid references fee_structure_items(id) on delete set null,
  add column if not exists installment_number smallint not null default 1 check (installment_number between 1 and 24),
  add column if not exists legacy_year_unassigned boolean not null default false;
alter table fee_assessments drop constraint if exists fee_assessments_academic_year_id_fkey;
alter table fee_assessments add constraint fee_assessments_academic_year_id_fkey
  foreign key (academic_year_id) references academic_years(id) on delete restrict;
alter table fee_assessments add column if not exists source_academic_year_id uuid references academic_years(id) on delete restrict;

insert into finance_fee_categories(school_id, name, active)
select school.id, category_name.name, category_name.active
from schools school
cross join (values ('Legacy / Unclassified', false), ('Previous-year balance', true)) as category_name(name, active)
on conflict (school_id, name) do nothing;

update fee_assessments assessment
set fee_category_id = category.id
from finance_fee_categories category
where assessment.fee_category_id is null
  and category.school_id = assessment.school_id
  and category.name = 'Legacy / Unclassified';

update fee_assessments assessment
set academic_year_id = structure.academic_year_id
from fee_structures structure
where assessment.fee_structure_id = structure.id
  and assessment.academic_year_id is null
  and structure.academic_year_id is not null;

update fee_assessments charge
set student_enrollment_id = enrollment.id
from student_enrollments enrollment
where charge.student_enrollment_id is null
  and charge.academic_year_id = enrollment.academic_year_id
  and charge.student_id = enrollment.student_id
  and charge.school_id = enrollment.school_id;

update fee_assessments set legacy_year_unassigned = true
where academic_year_id is null or student_enrollment_id is null;

alter table fee_payments
  add column if not exists academic_year_id uuid references academic_years(id) on delete restrict,
  add column if not exists student_enrollment_id uuid references student_enrollments(id) on delete restrict,
  add column if not exists receipt_number text,
  add column if not exists receipt_path text,
  add column if not exists status text not null default 'completed' check (status in ('completed', 'partially_reversed', 'reversed')),
  add column if not exists legacy_year_unassigned boolean not null default false;

update fee_payments payment
set academic_year_id = assessment.academic_year_id,
    student_enrollment_id = assessment.student_enrollment_id
from fee_assessments assessment
where payment.assessment_id = assessment.id
  and payment.academic_year_id is null
  and assessment.academic_year_id is not null;

update fee_payments payment
set student_enrollment_id = enrollment.id
from student_enrollments enrollment
where payment.student_enrollment_id is null
  and payment.academic_year_id = enrollment.academic_year_id
  and payment.student_id = enrollment.student_id
  and payment.school_id = enrollment.school_id;

update fee_payments set legacy_year_unassigned = true
where academic_year_id is null or student_enrollment_id is null;
update fee_payments set receipt_number = 'LEGACY-' || upper(left(id::text, 12)) where receipt_number is null;

alter table fee_payments alter column assessment_id drop not null;
alter table fee_payments alter column receipt_number set not null;
create unique index if not exists fee_payments_school_receipt_uidx on fee_payments(school_id, receipt_number);
create index if not exists fee_assessments_school_year_enrollment_idx on fee_assessments(school_id, academic_year_id, student_enrollment_id, student_id);
create unique index if not exists fee_assessments_structure_installment_uidx
  on fee_assessments(school_id, student_enrollment_id, fee_structure_item_id, installment_number)
;
create unique index if not exists fee_assessments_carry_forward_uidx
  on fee_assessments(school_id, student_enrollment_id, source_academic_year_id)
  where source_academic_year_id is not null;
create index if not exists fee_payments_school_year_student_idx on fee_payments(school_id, academic_year_id, student_id, payment_date desc);

create table if not exists fee_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  payment_id uuid not null references fee_payments(id) on delete restrict,
  assessment_id uuid not null references fee_assessments(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  allocated_at timestamptz not null default now(),
  unique (payment_id, assessment_id)
);

create index if not exists fee_payment_allocations_charge_idx on fee_payment_allocations(school_id, assessment_id);
create index if not exists fee_payment_allocations_payment_idx on fee_payment_allocations(school_id, payment_id);

insert into fee_payment_allocations(school_id, payment_id, assessment_id, amount)
select school_id, id, assessment_id, amount
from fee_payments
where assessment_id is not null
on conflict (payment_id, assessment_id) do nothing;

create table if not exists finance_adjustments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  student_enrollment_id uuid not null references student_enrollments(id) on delete restrict,
  assessment_id uuid references fee_assessments(id) on delete restrict,
  payment_id uuid references fee_payments(id) on delete restrict,
  fee_category_id uuid references finance_fee_categories(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('additional_charge', 'discount', 'waiver', 'correction', 'payment_reversal')),
  amount numeric(12,2) not null check (amount <> 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null references profiles(id) on delete restrict,
  approved_by uuid references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (school_id, id)
);

create index if not exists finance_adjustments_student_year_idx on finance_adjustments(school_id, academic_year_id, student_id, status);
create index if not exists finance_adjustments_assessment_idx on finance_adjustments(school_id, assessment_id, status);

create table if not exists finance_year_closures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  closed_by uuid not null references profiles(id) on delete restrict,
  closed_at timestamptz not null default now(),
  reason text not null,
  reopened_by uuid references profiles(id) on delete restrict,
  reopened_at timestamptz,
  reopen_reason text
);
create unique index if not exists finance_year_closures_active_idx on finance_year_closures(school_id, academic_year_id) where reopened_at is null;

drop trigger if exists finance_charge_audit on fee_assessments;
create trigger finance_charge_audit after insert or update on fee_assessments
for each row execute function finance_audit_configuration_change();
drop trigger if exists finance_adjustment_audit on finance_adjustments;
create trigger finance_adjustment_audit after insert or update on finance_adjustments
for each row execute function finance_audit_configuration_change();
drop trigger if exists finance_year_closure_audit on finance_year_closures;
create trigger finance_year_closure_audit after insert or update on finance_year_closures
for each row execute function finance_audit_configuration_change();
drop trigger if exists finance_payment_status_audit on fee_payments;
create trigger finance_payment_status_audit after update on fee_payments
for each row when (old.status is distinct from new.status)
execute function finance_audit_configuration_change();

create table if not exists finance_receipt_sequences (
  school_id uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  last_value bigint not null default 0 check (last_value >= 0),
  primary key (school_id, academic_year_id)
);

create or replace function finance_validate_year_reopen()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.reopened_at is not null then raise exception 'Finance year closure is immutable'; end if;
  if new.school_id is distinct from old.school_id
    or new.academic_year_id is distinct from old.academic_year_id
    or new.closed_by is distinct from old.closed_by
    or new.closed_at is distinct from old.closed_at
    or new.reason is distinct from old.reason then
    raise exception 'Closure details cannot be changed';
  end if;
  if new.reopened_at is null or new.reopened_by is null or nullif(btrim(new.reopen_reason), '') is null then
    raise exception 'Reopening requires an authorized user, date, and reason';
  end if;
  return new;
end;
$$;

drop trigger if exists finance_year_reopen_guard on finance_year_closures;
create trigger finance_year_reopen_guard before update on finance_year_closures
for each row execute function finance_validate_year_reopen();

create or replace function finance_year_is_closed(p_school_id uuid, p_academic_year_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from finance_year_closures closure
    where closure.school_id = p_school_id
      and closure.academic_year_id = p_academic_year_id
      and closure.reopened_at is null
  );
$$;

create or replace function finance_validate_fee_structure()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.academic_year_id is null then
    raise exception 'A fee structure must belong to an academic year';
  end if;
  if not exists (select 1 from academic_years where id = new.academic_year_id and school_id = new.school_id) then
    raise exception 'Academic year does not belong to this school';
  end if;
  if new.class_id is not null and not exists (select 1 from classes where id = new.class_id and school_id = new.school_id) then
    raise exception 'Class does not belong to this school';
  end if;
  if new.education_level_id is not null and not exists (select 1 from education_levels where id = new.education_level_id and school_id = new.school_id) then
    raise exception 'Education level does not belong to this school';
  end if;
  if new.class_id is not null and new.education_level_id is not null and not exists (
    select 1 from classes where id = new.class_id and education_level_id = new.education_level_id and school_id = new.school_id
  ) then raise exception 'Class does not belong to the selected education level'; end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'active') is distinct from (to_jsonb(old) - 'active') then
    raise exception 'Fee structure details are immutable; create a new academic-year structure instead';
  end if;
  if finance_year_is_closed(new.school_id, new.academic_year_id) then
    raise exception 'This financial year is closed';
  end if;
  return new;
end;
$$;

drop trigger if exists finance_fee_structure_guard on fee_structures;
create trigger finance_fee_structure_guard before insert or update on fee_structures
for each row execute function finance_validate_fee_structure();

create or replace function finance_validate_charge()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.academic_year_id is null then
    if tg_op = 'INSERT' then raise exception 'A student charge must belong to an academic year'; end if;
    if old.academic_year_id is not null then raise exception 'A student charge cannot lose its academic year'; end if;
    return new;
  end if;
  if not exists (select 1 from students where id = new.student_id and school_id = new.school_id) then
    raise exception 'Student does not belong to this school';
  end if;
  if not exists (select 1 from academic_years where id = new.academic_year_id and school_id = new.school_id) then
    raise exception 'Academic year does not belong to this school';
  end if;
  if new.student_enrollment_id is null or not exists (
    select 1 from student_enrollments enrollment
    where enrollment.id = new.student_enrollment_id
      and enrollment.school_id = new.school_id
      and enrollment.student_id = new.student_id
      and enrollment.academic_year_id = new.academic_year_id
  ) then
    raise exception 'Charge must reference the student enrollment for its academic year';
  end if;
  if new.fee_category_id is not null and not exists (
    select 1 from finance_fee_categories category where category.id = new.fee_category_id and category.school_id = new.school_id
  ) then
    raise exception 'Fee category does not belong to this school';
  end if;
  if new.fee_structure_id is not null and not exists (
    select 1 from fee_structures structure
    where structure.id = new.fee_structure_id and structure.school_id = new.school_id
      and structure.academic_year_id = new.academic_year_id
  ) then raise exception 'Fee structure does not belong to this school and academic year'; end if;
  if new.fee_structure_item_id is not null and not exists (
    select 1 from fee_structure_items item
    join fee_structures structure on structure.id = item.fee_structure_id and structure.school_id = item.school_id
    where item.id = new.fee_structure_item_id and item.school_id = new.school_id
      and item.fee_structure_id = new.fee_structure_id and item.fee_category_id = new.fee_category_id
      and structure.academic_year_id = new.academic_year_id
  ) then raise exception 'Fee structure item does not match this school, year, and category'; end if;
  if new.source_academic_year_id is not null and not exists (
    select 1 from academic_years source_year where source_year.id = new.source_academic_year_id and source_year.school_id = new.school_id
  ) then raise exception 'Source academic year does not belong to this school'; end if;
  if new.source_academic_year_id is not null and not exists (
    select 1 from academic_years source_year join academic_years target_year on target_year.id = new.academic_year_id
    where source_year.id = new.source_academic_year_id and source_year.school_id = new.school_id
      and target_year.school_id = new.school_id and source_year.start_date < target_year.start_date
  ) then raise exception 'Previous-year balance must come from an earlier academic year'; end if;
  if finance_year_is_closed(new.school_id, new.academic_year_id) then
    raise exception 'This financial year is closed';
  end if;
  new.legacy_year_unassigned := false;
  return new;
end;
$$;

drop trigger if exists finance_charge_guard on fee_assessments;
create trigger finance_charge_guard before insert or update on fee_assessments
for each row execute function finance_validate_charge();

create or replace function finance_apply_enrollment_fees()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_item record;
  v_installment integer;
  v_base_amount numeric(12,2);
  v_amount numeric(12,2);
  v_due_date date;
begin
  if new.status <> 'active' or new.class_id is null then return new; end if;
  for v_item in
    select item.id, item.fee_category_id, item.name, item.amount, item.due_date, item.installment_count
    from fee_structures structure
    join fee_structure_items item on item.fee_structure_id = structure.id and item.school_id = structure.school_id
    join classes class on class.id = new.class_id and class.school_id = new.school_id
    where structure.school_id = new.school_id
      and structure.academic_year_id = new.academic_year_id
      and structure.active
      and (structure.class_id is null or structure.class_id = new.class_id)
      and (structure.education_level_id is null or structure.education_level_id = class.education_level_id)
      and not finance_year_is_closed(new.school_id, new.academic_year_id)
  loop
    v_base_amount := round(v_item.amount / v_item.installment_count, 2);
    for v_installment in 1..v_item.installment_count loop
      v_amount := case when v_installment = v_item.installment_count
        then v_item.amount - v_base_amount * (v_item.installment_count - 1)
        else v_base_amount end;
      v_due_date := case when v_item.due_date is null then null
        else (
          date_trunc('month', v_item.due_date::timestamp) + ((v_installment - 1) * interval '1 month')
          + (least(
              extract(day from v_item.due_date)::integer,
              extract(day from (date_trunc('month', v_item.due_date::timestamp) + (v_installment * interval '1 month') - interval '1 day'))::integer
            ) - 1) * interval '1 day'
        )::date end;
      insert into fee_assessments(
        school_id, student_id, student_enrollment_id, academic_year_id,
        fee_structure_id, fee_structure_item_id, fee_category_id, installment_number,
        description, amount, due_date, created_by
      ) values (
        new.school_id, new.student_id, new.id, new.academic_year_id,
        (select structure.id from fee_structures structure join fee_structure_items item on item.fee_structure_id = structure.id where item.id = v_item.id),
        v_item.id, v_item.fee_category_id, v_installment,
        case when v_item.installment_count > 1 then v_item.name || ' (' || v_installment || '/' || v_item.installment_count || ')' else v_item.name end,
        v_amount, v_due_date, new.placed_by
      ) on conflict (school_id, student_enrollment_id, fee_structure_item_id, installment_number) do nothing;
    end loop;
  end loop;
  return new;
end;
$$;

drop trigger if exists finance_enrollment_fee_generation on student_enrollments;
create trigger finance_enrollment_fee_generation after insert or update of class_id, status on student_enrollments
for each row execute function finance_apply_enrollment_fees();

create or replace function finance_validate_payment()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.academic_year_id is null then
    raise exception 'A payment must belong to an academic year';
  end if;
  if new.academic_year_id is null then return new; end if;
  if not exists (select 1 from academic_years where id = new.academic_year_id and school_id = new.school_id) then
    raise exception 'Academic year does not belong to this school';
  end if;
  if new.student_enrollment_id is null or not exists (
    select 1 from student_enrollments enrollment
    where enrollment.id = new.student_enrollment_id
      and enrollment.school_id = new.school_id
      and enrollment.student_id = new.student_id
      and enrollment.academic_year_id = new.academic_year_id
  ) then
    raise exception 'Payment must reference the student enrollment for its academic year';
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'receipt_path') = (to_jsonb(old) - 'receipt_path') then
    return new;
  end if;
  if finance_year_is_closed(new.school_id, new.academic_year_id) then
    raise exception 'This financial year is closed';
  end if;
  new.legacy_year_unassigned := false;
  return new;
end;
$$;

drop trigger if exists finance_payment_guard on fee_payments;
create trigger finance_payment_guard before insert or update on fee_payments
for each row execute function finance_validate_payment();

create or replace function finance_validate_allocation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_payment fee_payments%rowtype;
  v_charge fee_assessments%rowtype;
begin
  select * into v_payment from fee_payments where id = new.payment_id for update;
  select * into v_charge from fee_assessments where id = new.assessment_id for update;
  if v_payment.id is null or v_charge.id is null
    or v_payment.school_id <> new.school_id or v_charge.school_id <> new.school_id
    or v_payment.student_id <> v_charge.student_id
    or v_payment.academic_year_id <> v_charge.academic_year_id then
    raise exception 'Payment allocation must match the charge school, student, and academic year';
  end if;
  if finance_year_is_closed(new.school_id, v_payment.academic_year_id) then
    raise exception 'This financial year is closed';
  end if;
  return new;
end;
$$;

drop trigger if exists finance_allocation_guard on fee_payment_allocations;
create trigger finance_allocation_guard before insert or update on fee_payment_allocations
for each row execute function finance_validate_allocation();

create or replace function finance_validate_adjustment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_payment_amount numeric(12,2);
  v_existing_reversals numeric(12,2);
begin
  if not exists (select 1 from students where id = new.student_id and school_id = new.school_id)
    or not exists (select 1 from academic_years where id = new.academic_year_id and school_id = new.school_id)
    or not exists (
      select 1 from student_enrollments enrollment
      where enrollment.id = new.student_enrollment_id and enrollment.school_id = new.school_id
        and enrollment.student_id = new.student_id and enrollment.academic_year_id = new.academic_year_id
    ) then
    raise exception 'Adjustment must match a student enrollment and academic year in this school';
  end if;
  if new.assessment_id is not null and not exists (
    select 1 from fee_assessments charge where charge.id = new.assessment_id
      and charge.school_id = new.school_id and charge.student_id = new.student_id
      and charge.academic_year_id = new.academic_year_id
  ) then raise exception 'Adjustment charge does not match the student and year'; end if;
  if new.payment_id is not null and not exists (
    select 1 from fee_payments payment where payment.id = new.payment_id
      and payment.school_id = new.school_id and payment.student_id = new.student_id
      and payment.academic_year_id = new.academic_year_id
  ) then raise exception 'Adjustment payment does not match the student and year'; end if;
  if new.payment_id is not null and new.assessment_id is not null and not exists (
    select 1 from fee_payment_allocations allocation
    where allocation.school_id = new.school_id and allocation.payment_id = new.payment_id and allocation.assessment_id = new.assessment_id
  ) then raise exception 'Payment reversal charge is not allocated by this receipt'; end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'pending' then raise exception 'Approved or rejected adjustments are immutable'; end if;
    if new.school_id is distinct from old.school_id
      or new.academic_year_id is distinct from old.academic_year_id
      or new.student_id is distinct from old.student_id
      or new.student_enrollment_id is distinct from old.student_enrollment_id
      or new.assessment_id is distinct from old.assessment_id
      or new.payment_id is distinct from old.payment_id
      or new.fee_category_id is distinct from old.fee_category_id
      or new.adjustment_type is distinct from old.adjustment_type
      or new.amount is distinct from old.amount
      or new.reason is distinct from old.reason
      or new.created_by is distinct from old.created_by then
      raise exception 'Adjustment details cannot be changed during approval';
    end if;
  end if;
  if new.adjustment_type = 'payment_reversal' and new.status = 'approved' and new.payment_id is not null then
    if tg_op = 'INSERT' then raise exception 'Payment reversals must be approved from pending status'; end if;
    if old.status <> 'approved' then
      select amount into v_payment_amount from fee_payments where id = new.payment_id and school_id = new.school_id for update;
      select coalesce(sum(abs(adjustment.amount)), 0) into v_existing_reversals from finance_adjustments adjustment
        where adjustment.payment_id = new.payment_id and adjustment.adjustment_type = 'payment_reversal'
          and adjustment.status = 'approved' and adjustment.id <> new.id;
      if v_existing_reversals + abs(new.amount) > v_payment_amount + 0.005 then
        raise exception 'Approved reversals cannot exceed the original payment amount';
      end if;
    end if;
  end if;
  if finance_year_is_closed(new.school_id, new.academic_year_id) then
    raise exception 'This financial year is closed';
  end if;
  return new;
end;
$$;

drop trigger if exists finance_adjustment_guard on finance_adjustments;
create trigger finance_adjustment_guard before insert or update on finance_adjustments
for each row execute function finance_validate_adjustment();

create or replace function finance_sync_reversed_payment_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_payment_id uuid;
  v_payment fee_payments%rowtype;
  v_reversed numeric(12,2);
begin
  if new.adjustment_type <> 'payment_reversal' or new.payment_id is null or new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'approved' then return new; end if;
  else
    raise exception 'Payment reversals must be approved from pending status';
  end if;
  v_payment_id := new.payment_id;
  select * into v_payment from fee_payments where id = v_payment_id for update;
  select coalesce(sum(abs(amount)), 0) into v_reversed from finance_adjustments
    where payment_id = v_payment_id and adjustment_type = 'payment_reversal' and status = 'approved';
  update fee_payments set status = case
    when v_reversed >= v_payment.amount - 0.005 then 'reversed'
    else 'partially_reversed' end
  where id = v_payment_id;
  return new;
end;
$$;

drop trigger if exists finance_sync_reversed_payment on finance_adjustments;
create trigger finance_sync_reversed_payment after insert or update on finance_adjustments
for each row execute function finance_sync_reversed_payment_status();

create or replace function finance_charge_balance(p_assessment_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select charge.amount
    + coalesce((select sum(case
      when adjustment.adjustment_type in ('additional_charge', 'payment_reversal') then abs(adjustment.amount)
      when adjustment.adjustment_type in ('discount', 'waiver') then -abs(adjustment.amount)
      else adjustment.amount end)
      from finance_adjustments adjustment
      where adjustment.assessment_id = charge.id and adjustment.status = 'approved'), 0)
    - coalesce((select sum(allocation.amount) from fee_payment_allocations allocation where allocation.assessment_id = charge.id), 0)
  from fee_assessments charge where charge.id = p_assessment_id;
$$;
revoke all on function finance_charge_balance(uuid) from public;
revoke all on function finance_year_is_closed(uuid, uuid) from public;

create or replace function finance_year_summary(p_academic_year_id uuid, p_class_id uuid default null)
returns table(total_charges numeric, total_adjustments numeric, total_allocated_payments numeric, total_outstanding numeric, students_with_balance bigint, payments_today numeric)
language sql stable security definer set search_path = public
as $$
  with charge_rows as (
    select charge.id, charge.student_id, charge.amount,
      coalesce(adjustment.amount, 0) as adjustment_total,
      coalesce(reported_adjustment.amount, 0) as reported_adjustment_total,
      coalesce(allocation.amount, 0) - coalesce(reversal.amount, 0) as paid_total,
      greatest(charge.amount + coalesce(adjustment.amount, 0) - coalesce(allocation.amount, 0), 0) as balance
    from fee_assessments charge
    join student_enrollments enrollment on enrollment.id = charge.student_enrollment_id
      and enrollment.school_id = charge.school_id and enrollment.student_id = charge.student_id
    left join lateral (
      select sum(case
        when item.adjustment_type in ('additional_charge', 'payment_reversal') then abs(item.amount)
        when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount)
        else item.amount end) as amount
      from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
    ) adjustment on true
    left join lateral (
      select sum(case
        when item.adjustment_type = 'additional_charge' then abs(item.amount)
        when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount)
        when item.adjustment_type = 'payment_reversal' then 0
        else item.amount end) as amount
      from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
    ) reported_adjustment on true
    left join lateral (
      select sum(item.amount) as amount from fee_payment_allocations item where item.assessment_id = charge.id
    ) allocation on true
    left join lateral (
      select sum(abs(item.amount)) as amount from finance_adjustments item
      where item.assessment_id = charge.id and item.adjustment_type = 'payment_reversal' and item.status = 'approved'
    ) reversal on true
    where charge.school_id = current_school_id()
      and charge.academic_year_id = p_academic_year_id
      and not charge.legacy_year_unassigned
      and (p_class_id is null or enrollment.class_id = p_class_id)
  ), payment_today as (
    select coalesce(sum(greatest(payment.amount - coalesce(reversal.total, 0), 0)), 0) as amount
    from fee_payments payment
    join student_enrollments enrollment on enrollment.id = payment.student_enrollment_id
    left join lateral (
      select sum(abs(adjustment.amount)) as total from finance_adjustments adjustment
      where adjustment.payment_id = payment.id and adjustment.adjustment_type = 'payment_reversal' and adjustment.status = 'approved'
    ) reversal on true
    where payment.school_id = current_school_id()
      and payment.academic_year_id = p_academic_year_id
      and payment.payment_date = current_date
      and not payment.legacy_year_unassigned
      and (p_class_id is null or enrollment.class_id = p_class_id)
  )
  select coalesce(sum(charge.amount), 0), coalesce(sum(charge.reported_adjustment_total), 0),
    coalesce(sum(charge.paid_total), 0), coalesce(sum(charge.balance), 0),
    count(distinct charge.student_id) filter (where charge.balance > 0), max(payment_today.amount)
  from charge_rows charge cross join payment_today
  where has_permission('view_finance') or has_permission('generate_finance_reports');
$$;

create or replace function finance_outstanding_report(
  p_academic_year_id uuid,
  p_class_id uuid default null,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 50,
  p_fee_category_id uuid default null,
  p_min_balance numeric default null,
  p_max_balance numeric default null,
  p_payment_status text default null
)
returns table(student_id uuid, admission_number text, student_name text, class_id uuid, class_name text, total_charges numeric, total_adjustments numeric, total_paid numeric, balance numeric, total_count bigint)
language sql stable security definer set search_path = public
as $$
  with balances as (
    select student.id as student_id, student.admission_number,
      concat_ws(' ', student.first_name, student.last_name) as student_name,
      enrollment.class_id, class.name as class_name,
      coalesce(ledger.total_charges, 0) as total_charges,
      coalesce(ledger.total_adjustments, 0) as total_adjustments,
      coalesce(ledger.total_paid, 0) as total_paid,
      coalesce(ledger.balance, 0) as balance
    from student_enrollments enrollment
    join students student on student.id = enrollment.student_id and student.school_id = enrollment.school_id
    left join classes class on class.id = enrollment.class_id and class.school_id = enrollment.school_id
    left join lateral (
      select sum(charge.amount) as total_charges,
        sum(coalesce(reported_adjustment.total, 0)) as total_adjustments,
        sum(coalesce(allocation.total, 0) - coalesce(reversal.total, 0)) as total_paid,
        sum(greatest(charge.amount + coalesce(adjustment.total, 0) - coalesce(allocation.total, 0), 0)) as balance
      from fee_assessments charge
      left join lateral (
        select sum(case
          when item.adjustment_type in ('additional_charge', 'payment_reversal') then abs(item.amount)
          when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount)
          else item.amount end) as total
        from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
      ) adjustment on true
      left join lateral (
        select sum(case
          when item.adjustment_type = 'additional_charge' then abs(item.amount)
          when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount)
          when item.adjustment_type = 'payment_reversal' then 0
          else item.amount end) as total
        from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
      ) reported_adjustment on true
      left join lateral (
        select sum(item.amount) as total from fee_payment_allocations item where item.assessment_id = charge.id
      ) allocation on true
      left join lateral (
        select sum(abs(item.amount)) as total from finance_adjustments item
        where item.assessment_id = charge.id and item.adjustment_type = 'payment_reversal' and item.status = 'approved'
      ) reversal on true
      where charge.student_enrollment_id = enrollment.id
        and charge.school_id = enrollment.school_id
        and charge.academic_year_id = enrollment.academic_year_id
        and not charge.legacy_year_unassigned
        and (p_fee_category_id is null or charge.fee_category_id = p_fee_category_id)
    ) ledger on true
    where enrollment.school_id = current_school_id()
      and enrollment.academic_year_id = p_academic_year_id
      and (p_class_id is null or enrollment.class_id = p_class_id)
      and (
        nullif(btrim(p_search), '') is null
        or student.admission_number ilike '%' || btrim(p_search) || '%'
        or student.first_name ilike '%' || btrim(p_search) || '%'
        or student.last_name ilike '%' || btrim(p_search) || '%'
      )
  )
  select balances.student_id, balances.admission_number, balances.student_name, balances.class_id,
    balances.class_name, balances.total_charges, balances.total_adjustments, balances.total_paid,
    balances.balance, count(*) over ()
  from balances
  where balances.balance > 0.005
    and (p_min_balance is null or balances.balance >= p_min_balance)
    and (p_max_balance is null or balances.balance <= p_max_balance)
    and (p_payment_status is null or p_payment_status = 'all'
      or (p_payment_status = 'unpaid' and balances.total_paid <= 0.005)
      or (p_payment_status = 'partial' and balances.total_paid > 0.005))
    and has_permission('view_finance')
  order by balances.balance desc, balances.student_name
  limit greatest(1, least(coalesce(p_page_size, 50), 100))
  offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(1, least(coalesce(p_page_size, 50), 100));
$$;

create or replace function finance_payment_method_summary(p_academic_year_id uuid, p_class_id uuid default null)
returns table(method text, payment_count bigint, total_amount numeric)
language sql stable security definer set search_path = public
as $$
  select payment.method, count(*) filter (where payment.amount > coalesce(reversal.total, 0) + 0.005)::bigint,
    coalesce(sum(greatest(payment.amount - coalesce(reversal.total, 0), 0)), 0)
  from fee_payments payment
  join student_enrollments enrollment on enrollment.id = payment.student_enrollment_id
    and enrollment.school_id = payment.school_id
    and enrollment.academic_year_id = payment.academic_year_id
  left join lateral (
    select sum(abs(adjustment.amount)) as total from finance_adjustments adjustment
    where adjustment.payment_id = payment.id and adjustment.adjustment_type = 'payment_reversal' and adjustment.status = 'approved'
  ) reversal on true
  where payment.school_id = current_school_id()
    and payment.academic_year_id = p_academic_year_id
    and not payment.legacy_year_unassigned
    and (p_class_id is null or enrollment.class_id = p_class_id)
    and (has_permission('generate_finance_reports') or has_permission('view_finance'))
  group by payment.method
  order by sum(greatest(payment.amount - coalesce(reversal.total, 0), 0)) desc;
$$;

create or replace function finance_student_year_balance(p_student_id uuid, p_academic_year_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(greatest(charge.amount + coalesce(adjustment.total, 0) - coalesce(allocation.total, 0), 0)), 0)
  from fee_assessments charge
  join student_enrollments enrollment on enrollment.id = charge.student_enrollment_id
    and enrollment.school_id = charge.school_id and enrollment.student_id = charge.student_id
    and enrollment.academic_year_id = charge.academic_year_id
  left join lateral (
    select sum(case
      when item.adjustment_type in ('additional_charge', 'payment_reversal') then abs(item.amount)
      when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount)
      else item.amount end) as total
    from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
  ) adjustment on true
  left join lateral (
    select sum(item.amount) as total from fee_payment_allocations item where item.assessment_id = charge.id
  ) allocation on true
  where charge.school_id = current_school_id()
    and charge.student_id = p_student_id
    and charge.academic_year_id = p_academic_year_id
    and not charge.legacy_year_unassigned
    and has_permission('manage_finance_adjustments');
$$;

create or replace function finance_class_summary(p_academic_year_id uuid)
returns table(class_id uuid, class_name text, total_charges numeric, total_adjustments numeric, total_allocated_payments numeric, total_outstanding numeric, students_with_balance bigint)
language sql stable security definer set search_path = public
as $$
  with ledger as (
    select enrollment.class_id, class.name as class_name, charge.student_id, charge.amount,
      coalesce(reported_adjustment.amount, 0) as adjustment_amount,
      coalesce(allocation.amount, 0) - coalesce(reversal.amount, 0) as allocated_amount,
      greatest(charge.amount + coalesce(adjustment.amount, 0) - coalesce(allocation.amount, 0), 0) as balance
    from fee_assessments charge
    join student_enrollments enrollment on enrollment.id = charge.student_enrollment_id
      and enrollment.school_id = charge.school_id and enrollment.student_id = charge.student_id
    left join classes class on class.id = enrollment.class_id and class.school_id = enrollment.school_id
    left join lateral (
      select sum(case
        when item.adjustment_type in ('additional_charge', 'payment_reversal') then abs(item.amount)
        when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount)
        else item.amount end) as amount
      from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
    ) adjustment on true
    left join lateral (
      select sum(case
        when item.adjustment_type = 'additional_charge' then abs(item.amount)
        when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount)
        when item.adjustment_type = 'payment_reversal' then 0
        else item.amount end) as amount
      from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
    ) reported_adjustment on true
    left join lateral (select sum(item.amount) as amount from fee_payment_allocations item where item.assessment_id = charge.id) allocation on true
    left join lateral (
      select sum(abs(item.amount)) as amount from finance_adjustments item
      where item.assessment_id = charge.id and item.adjustment_type = 'payment_reversal' and item.status = 'approved'
    ) reversal on true
    where charge.school_id = current_school_id() and charge.academic_year_id = p_academic_year_id
      and not charge.legacy_year_unassigned
  )
  select ledger.class_id, coalesce(ledger.class_name, 'Unassigned'), sum(ledger.amount), sum(ledger.adjustment_amount),
    sum(ledger.allocated_amount), sum(ledger.balance), count(distinct ledger.student_id) filter (where ledger.balance > 0.005)
  from ledger where has_permission('generate_finance_reports') or has_permission('view_finance')
  group by ledger.class_id, ledger.class_name
  order by ledger.class_name;
$$;

create or replace function create_finance_fee_structure(
  p_academic_year_id uuid,
  p_class_id uuid,
  p_education_level_id uuid,
  p_name text,
  p_amount numeric,
  p_items jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_school_id uuid := current_school_id();
  v_structure_id uuid;
  v_item record;
  v_total numeric(12,2);
begin
  if not has_permission('manage_fee_structures') then raise exception 'Forbidden: manage_fee_structures permission required'; end if;
  if nullif(btrim(p_name), '') is null or p_amount <= 0 or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 40 then
    raise exception 'Invalid fee structure details';
  end if;
  if not exists (select 1 from academic_years where id = p_academic_year_id and school_id = v_school_id)
    or (p_class_id is not null and not exists (select 1 from classes where id = p_class_id and school_id = v_school_id))
    or (p_education_level_id is not null and not exists (select 1 from education_levels where id = p_education_level_id and school_id = v_school_id)) then
    raise exception 'Academic year, class, or level does not belong to this school';
  end if;
  if finance_year_is_closed(v_school_id, p_academic_year_id) then raise exception 'This financial year is closed'; end if;
  select sum(item.amount) into v_total from jsonb_to_recordset(p_items) as item(fee_category_id uuid, name text, amount numeric, due_date date, installment_count integer);
  if round(v_total, 2) <> round(p_amount, 2) then raise exception 'Fee structure total does not match its items'; end if;

  insert into fee_structures(school_id, academic_year_id, class_id, education_level_id, name, amount, active, created_by)
  values (v_school_id, p_academic_year_id, p_class_id, p_education_level_id, btrim(p_name), p_amount, true, auth.uid())
  returning id into v_structure_id;
  for v_item in select * from jsonb_to_recordset(p_items) as item(fee_category_id uuid, name text, amount numeric, due_date date, installment_count integer)
  loop
    if v_item.amount <= 0 or nullif(btrim(v_item.name), '') is null or v_item.installment_count not between 1 and 24
      or not exists (select 1 from finance_fee_categories category where category.id = v_item.fee_category_id and category.school_id = v_school_id and category.active) then
      raise exception 'Invalid fee item or inactive fee category';
    end if;
    insert into fee_structure_items(school_id, fee_structure_id, fee_category_id, name, amount, due_date, installment_count)
    values (v_school_id, v_structure_id, v_item.fee_category_id, btrim(v_item.name), v_item.amount, v_item.due_date, v_item.installment_count);
  end loop;
  return v_structure_id;
end;
$$;

revoke all on function create_finance_fee_structure(uuid, uuid, uuid, text, numeric, jsonb) from public;
grant execute on function create_finance_fee_structure(uuid, uuid, uuid, text, numeric, jsonb) to authenticated;

create or replace function record_finance_payment(
  p_student_id uuid,
  p_academic_year_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text,
  p_notes text,
  p_allocations jsonb
)
returns table(payment_id uuid, receipt_number text)
language plpgsql security definer set search_path = public
as $$
declare
  v_school_id uuid := current_school_id();
  v_enrollment student_enrollments%rowtype;
  v_year academic_years%rowtype;
  v_receipt_sequence bigint;
  v_payment_id uuid;
  v_receipt text;
  v_allocation record;
  v_charge fee_assessments%rowtype;
  v_current_balance numeric;
  v_allocated_total numeric := 0;
begin
  if not has_permission('record_payments') then raise exception 'Forbidden: record_payments permission required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'Payment amount must be a positive currency amount'; end if;
  if p_method not in ('cash', 'bank', 'mobile_money', 'other') then raise exception 'Unsupported payment method'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then raise exception 'Allocate the payment to at least one charge'; end if;
  select * into v_year from academic_years where id = p_academic_year_id and school_id = v_school_id;
  if v_year.id is null then raise exception 'Academic year not found'; end if;
  if finance_year_is_closed(v_school_id, p_academic_year_id) then raise exception 'This financial year is closed'; end if;
  select * into v_enrollment from student_enrollments
    where school_id = v_school_id and student_id = p_student_id and academic_year_id = p_academic_year_id;
  if v_enrollment.id is null then raise exception 'Student has no enrollment in this academic year'; end if;

  for v_allocation in
    select item.assessment_id, sum(item.amount)::numeric as amount
    from jsonb_to_recordset(p_allocations) as item(assessment_id uuid, amount numeric)
    group by item.assessment_id
    order by item.assessment_id
  loop
    if v_allocation.assessment_id is null or v_allocation.amount is null or v_allocation.amount <= 0 then
      raise exception 'Every allocation must have a charge and a positive amount';
    end if;
    select * into v_charge from fee_assessments charge
      where charge.id = v_allocation.assessment_id and charge.school_id = v_school_id
        and charge.student_id = p_student_id and charge.academic_year_id = p_academic_year_id
        and charge.student_enrollment_id = v_enrollment.id and not charge.legacy_year_unassigned
      for update;
    if v_charge.id is null then raise exception 'A selected charge does not belong to this student and year'; end if;
    v_current_balance := finance_charge_balance(v_charge.id);
    if v_allocation.amount > v_current_balance + 0.005 then raise exception 'An allocation exceeds its charge balance'; end if;
    v_allocated_total := v_allocated_total + v_allocation.amount;
  end loop;

  if abs(v_allocated_total - p_amount) > 0.005 then raise exception 'Payment amount must equal the total allocated amount'; end if;
  insert into finance_receipt_sequences(school_id, academic_year_id, last_value) values (v_school_id, p_academic_year_id, 1)
  on conflict (school_id, academic_year_id) do update set last_value = finance_receipt_sequences.last_value + 1
  returning last_value into v_receipt_sequence;
  v_receipt := 'RCP-' || extract(year from v_year.start_date)::integer::text || '-' || lpad(v_receipt_sequence::text, 6, '0');

  insert into fee_payments(school_id, assessment_id, student_id, academic_year_id, student_enrollment_id, amount, payment_date, method, reference, notes, received_by, receipt_number)
  values (v_school_id, null, p_student_id, p_academic_year_id, v_enrollment.id, p_amount, p_payment_date, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''), auth.uid(), v_receipt)
  returning id into v_payment_id;

  for v_allocation in
    select item.assessment_id, sum(item.amount)::numeric as amount
    from jsonb_to_recordset(p_allocations) as item(assessment_id uuid, amount numeric)
    group by item.assessment_id
    order by item.assessment_id
  loop
    insert into fee_payment_allocations(school_id, payment_id, assessment_id, amount)
    values (v_school_id, v_payment_id, v_allocation.assessment_id, v_allocation.amount);
  end loop;
  insert into audit_logs(school_id, actor_id, action, resource_type, resource_id, metadata)
  values (v_school_id, auth.uid(), 'finance.payment.create', 'fee_payment', v_payment_id,
    jsonb_build_object('receipt_number', v_receipt, 'student_id', p_student_id,
      'academic_year_id', p_academic_year_id, 'amount', p_amount, 'method', p_method,
      'allocations', p_allocations));
  return query select v_payment_id, v_receipt;
end;
$$;

create or replace function finance_store_receipt_path(p_payment_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_school_id uuid := current_school_id();
  v_path text;
begin
  if not has_permission('view_financial_statements') then raise exception 'Forbidden: view_financial_statements permission required'; end if;
  select coalesce(receipt_path, 'schools/' || school_id::text || '/finance/receipt-' || id::text || '.pdf')
    into v_path
  from fee_payments
  where id = p_payment_id and school_id = v_school_id;
  if v_path is null then raise exception 'Payment not found'; end if;
  update fee_payments set receipt_path = v_path where id = p_payment_id and school_id = v_school_id and receipt_path is null;
  return v_path;
end;
$$;

revoke all on function record_finance_payment(uuid, uuid, numeric, date, text, text, text, jsonb) from public;
grant execute on function record_finance_payment(uuid, uuid, numeric, date, text, text, text, jsonb) to authenticated;
revoke all on function finance_store_receipt_path(uuid) from public;
grant execute on function finance_store_receipt_path(uuid) to authenticated;
revoke all on function finance_year_summary(uuid, uuid) from public;
grant execute on function finance_year_summary(uuid, uuid) to authenticated;
revoke all on function finance_outstanding_report(uuid, uuid, text, integer, integer, uuid, numeric, numeric, text) from public;
grant execute on function finance_outstanding_report(uuid, uuid, text, integer, integer, uuid, numeric, numeric, text) to authenticated;
revoke all on function finance_payment_method_summary(uuid, uuid) from public;
grant execute on function finance_payment_method_summary(uuid, uuid) to authenticated;
revoke all on function finance_student_year_balance(uuid, uuid) from public;
grant execute on function finance_student_year_balance(uuid, uuid) to authenticated;
revoke all on function finance_class_summary(uuid) from public;
grant execute on function finance_class_summary(uuid) to authenticated;

alter table finance_fee_categories enable row level security;
alter table fee_structure_items enable row level security;
alter table fee_payment_allocations enable row level security;
alter table finance_adjustments enable row level security;
alter table finance_year_closures enable row level security;
alter table finance_receipt_sequences enable row level security;

drop policy if exists finance_fee_categories_select on finance_fee_categories;
create policy finance_fee_categories_select on finance_fee_categories for select using (school_id = current_school_id() and (has_permission('view_finance') or has_permission('view_financial_statements') or has_permission('manage_fee_structures') or has_permission('record_payments') or has_permission('create_student_charges') or has_permission('manage_finance_adjustments')));
drop policy if exists finance_fee_categories_write on finance_fee_categories;
create policy finance_fee_categories_insert on finance_fee_categories for insert with check (school_id = current_school_id() and has_permission('manage_fee_structures'));
create policy finance_fee_categories_update on finance_fee_categories for update using (school_id = current_school_id() and has_permission('manage_fee_structures')) with check (school_id = current_school_id() and has_permission('manage_fee_structures'));

drop policy if exists fee_structure_items_select on fee_structure_items;
create policy fee_structure_items_select on fee_structure_items for select using (school_id = current_school_id() and (has_permission('view_finance') or has_permission('view_financial_statements') or has_permission('manage_fee_structures')));
drop policy if exists fee_structure_items_write on fee_structure_items;
create policy fee_structure_items_insert on fee_structure_items for insert with check (false);
create policy fee_structure_items_update on fee_structure_items for update using (false) with check (false);

drop policy if exists fee_structures_select on fee_structures;
create policy fee_structures_select on fee_structures for select using (school_id = current_school_id() and (has_permission('view_finance') or has_permission('view_financial_statements') or has_permission('manage_fee_structures')));
drop policy if exists fee_structures_write on fee_structures;
create policy fee_structures_insert on fee_structures for insert with check (false);
create policy fee_structures_update on fee_structures for update using (school_id = current_school_id() and has_permission('manage_fee_structures')) with check (school_id = current_school_id() and has_permission('manage_fee_structures'));

drop policy if exists fee_assessments_select on fee_assessments;
create policy fee_assessments_select on fee_assessments for select using (school_id = current_school_id() and (has_permission('view_finance') or has_permission('view_financial_statements') or has_permission('record_payments') or has_permission('create_student_charges') or has_permission('manage_finance_adjustments') or has_permission('approve_finance_corrections')));
drop policy if exists fee_assessments_write on fee_assessments;
create policy fee_assessments_write on fee_assessments for insert with check (school_id = current_school_id() and (has_permission('create_student_charges') or has_permission('manage_finance_adjustments')));

drop policy if exists fee_payments_select on fee_payments;
create policy fee_payments_select on fee_payments for select using (school_id = current_school_id() and (has_permission('view_finance') or has_permission('view_financial_statements') or has_permission('record_payments')));
drop policy if exists fee_payments_write on fee_payments;
create policy fee_payments_write on fee_payments for insert with check (false);

create policy fee_payment_allocations_select on fee_payment_allocations for select using (school_id = current_school_id() and (has_permission('view_finance') or has_permission('view_financial_statements') or has_permission('record_payments')));
create policy finance_adjustments_select on finance_adjustments for select using (school_id = current_school_id() and (has_permission('view_finance') or has_permission('view_financial_statements') or has_permission('record_payments') or has_permission('manage_finance_adjustments') or has_permission('approve_finance_corrections')));
create policy finance_adjustments_insert on finance_adjustments for insert with check (school_id = current_school_id() and has_permission('manage_finance_adjustments') and created_by = auth.uid() and status = 'pending');
create policy finance_adjustments_approve on finance_adjustments for update
  using (school_id = current_school_id() and has_permission('approve_finance_corrections') and status = 'pending' and created_by <> auth.uid())
  with check (school_id = current_school_id() and has_permission('approve_finance_corrections') and status in ('approved', 'rejected') and approved_by = auth.uid());
create policy finance_year_closures_select on finance_year_closures for select using (school_id = current_school_id() and (has_permission('view_finance') or has_permission('generate_finance_reports') or has_permission('close_financial_year')));
create policy finance_year_closures_insert on finance_year_closures for insert with check (school_id = current_school_id() and has_permission('close_financial_year') and closed_by = auth.uid());
create policy finance_year_closures_reopen on finance_year_closures for update
  using (school_id = current_school_id() and has_permission('close_financial_year') and reopened_at is null)
  with check (school_id = current_school_id() and has_permission('close_financial_year') and reopened_by = auth.uid() and reopened_at is not null);
create policy finance_receipt_sequences_select on finance_receipt_sequences for select using (school_id = current_school_id() and has_permission('view_finance'));

insert into permissions(code, module, action, description) values
  ('manage_fee_structures', 'finance', 'edit', 'Create and manage academic-year fee structures'),
  ('create_student_charges', 'finance', 'create', 'Apply fee structures and create student charges'),
  ('record_payments', 'finance', 'create', 'Record student payments and allocate receipts'),
  ('view_financial_statements', 'finance', 'view', 'View student financial statements'),
  ('manage_finance_adjustments', 'finance', 'edit', 'Request discounts, waivers, and financial adjustments'),
  ('generate_finance_reports', 'finance', 'view', 'Generate academic-year finance reports'),
  ('approve_finance_corrections', 'finance', 'approve', 'Approve financial corrections and payment reversals'),
  ('close_financial_year', 'finance', 'approve', 'Close or reopen an academic-year finance ledger')
on conflict (code) do nothing;

insert into role_permissions(role_id, permission_id)
select distinct existing.role_id, new_permission.id
from role_permissions existing
join permissions old_permission on old_permission.id = existing.permission_id
join permissions new_permission on new_permission.code = case
  when old_permission.code = 'create_payment' then 'record_payments'
  when old_permission.code = 'view_finance' then 'view_financial_statements'
end
where old_permission.code in ('create_payment', 'view_finance')
on conflict (role_id, permission_id) do nothing;

insert into role_permissions(role_id, permission_id)
select role.id, permission.id
from roles role cross join permissions permission
where role.is_system and permission.code in (
  'manage_fee_structures', 'create_student_charges', 'record_payments',
  'view_financial_statements', 'manage_finance_adjustments', 'generate_finance_reports',
  'approve_finance_corrections', 'close_financial_year'
)
on conflict (role_id, permission_id) do nothing;