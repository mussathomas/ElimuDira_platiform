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
  if new.student_enrollment_id is not null and not exists (
    select 1 from student_enrollments enrollment
    where enrollment.id = new.student_enrollment_id
      and enrollment.school_id = new.school_id
      and enrollment.student_id = new.student_id
      and enrollment.academic_year_id = new.academic_year_id
  ) then
    raise exception 'Charge enrollment must match the student and academic year';
  end if;
  if new.fee_category_id is not null and not exists (
    select 1 from finance_fee_categories category where category.id = new.fee_category_id and category.school_id = new.school_id
  ) then raise exception 'Fee category does not belong to this school'; end if;
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
    select 1 from academic_years source_year join academic_years target_year on target_year.id = new.academic_year_id
    where source_year.id = new.source_academic_year_id and source_year.school_id = new.school_id
      and target_year.school_id = new.school_id and source_year.start_date < target_year.start_date
  ) then raise exception 'Previous-year balance must come from an earlier academic year'; end if;
  if finance_year_is_closed(new.school_id, new.academic_year_id) then raise exception 'This financial year is closed'; end if;
  new.legacy_year_unassigned := false;
  return new;
end;
$$;

create or replace function finance_validate_payment()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.academic_year_id is null then
    raise exception 'A payment must belong to an academic year';
  end if;
  if new.academic_year_id is null then return new; end if;
  if not exists (select 1 from students where id = new.student_id and school_id = new.school_id) then
    raise exception 'Student does not belong to this school';
  end if;
  if not exists (select 1 from academic_years where id = new.academic_year_id and school_id = new.school_id) then
    raise exception 'Academic year does not belong to this school';
  end if;
  if new.student_enrollment_id is not null and not exists (
    select 1 from student_enrollments enrollment
    where enrollment.id = new.student_enrollment_id
      and enrollment.school_id = new.school_id
      and enrollment.student_id = new.student_id
      and enrollment.academic_year_id = new.academic_year_id
  ) then raise exception 'Payment enrollment must match the student and academic year'; end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'receipt_path') = (to_jsonb(old) - 'receipt_path') then return new; end if;
  if finance_year_is_closed(new.school_id, new.academic_year_id) then raise exception 'This financial year is closed'; end if;
  new.legacy_year_unassigned := false;
  return new;
end;
$$;

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
  if not exists (select 1 from students where id = p_student_id and school_id = v_school_id) then raise exception 'Student not found'; end if;
  if finance_year_is_closed(v_school_id, p_academic_year_id) then raise exception 'This financial year is closed'; end if;

  for v_allocation in
    select item.assessment_id, sum(item.amount)::numeric as amount
    from jsonb_to_recordset(p_allocations) as item(assessment_id uuid, amount numeric)
    group by item.assessment_id order by item.assessment_id
  loop
    if v_allocation.assessment_id is null or v_allocation.amount is null or v_allocation.amount <= 0 then
      raise exception 'Every allocation must have a charge and a positive amount';
    end if;
    select * into v_charge from fee_assessments charge
      where charge.id = v_allocation.assessment_id and charge.school_id = v_school_id
        and charge.student_id = p_student_id and charge.academic_year_id = p_academic_year_id
        and not charge.legacy_year_unassigned
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
  values (v_school_id, null, p_student_id, p_academic_year_id, null, p_amount, p_payment_date, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''), auth.uid(), v_receipt)
  returning id into v_payment_id;

  for v_allocation in
    select item.assessment_id, sum(item.amount)::numeric as amount
    from jsonb_to_recordset(p_allocations) as item(assessment_id uuid, amount numeric)
    group by item.assessment_id order by item.assessment_id
  loop
    insert into fee_payment_allocations(school_id, payment_id, assessment_id, amount)
    values (v_school_id, v_payment_id, v_allocation.assessment_id, v_allocation.amount);
  end loop;
  insert into audit_logs(school_id, actor_id, action, resource_type, resource_id, metadata)
  values (v_school_id, auth.uid(), 'finance.payment.create', 'fee_payment', v_payment_id,
    jsonb_build_object('receipt_number', v_receipt, 'student_id', p_student_id,
      'academic_year_id', p_academic_year_id, 'amount', p_amount, 'method', p_method, 'allocations', p_allocations));
  return query select v_payment_id, v_receipt;
end;
$$;

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
    join students student on student.id = charge.student_id and student.school_id = charge.school_id
    left join lateral (
      select sum(case when item.adjustment_type in ('additional_charge', 'payment_reversal') then abs(item.amount)
        when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount) else item.amount end) as amount
      from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
    ) adjustment on true
    left join lateral (
      select sum(case when item.adjustment_type = 'additional_charge' then abs(item.amount)
        when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount)
        when item.adjustment_type = 'payment_reversal' then 0 else item.amount end) as amount
      from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
    ) reported_adjustment on true
    left join lateral (select sum(item.amount) as amount from fee_payment_allocations item where item.assessment_id = charge.id) allocation on true
    left join lateral (
      select sum(abs(item.amount)) as amount from finance_adjustments item
      where item.assessment_id = charge.id and item.adjustment_type = 'payment_reversal' and item.status = 'approved'
    ) reversal on true
    where charge.school_id = current_school_id() and charge.academic_year_id = p_academic_year_id
      and not charge.legacy_year_unassigned and (p_class_id is null or student.class_id = p_class_id)
  ), payment_today as (
    select coalesce(sum(greatest(payment.amount - coalesce(reversal.total, 0), 0)), 0) as amount
    from fee_payments payment
    join students student on student.id = payment.student_id and student.school_id = payment.school_id
    left join lateral (
      select sum(abs(adjustment.amount)) as total from finance_adjustments adjustment
      where adjustment.payment_id = payment.id and adjustment.adjustment_type = 'payment_reversal' and adjustment.status = 'approved'
    ) reversal on true
    where payment.school_id = current_school_id() and payment.academic_year_id = p_academic_year_id
      and payment.payment_date = current_date and not payment.legacy_year_unassigned
      and (p_class_id is null or student.class_id = p_class_id)
  )
  select coalesce(sum(charge.amount), 0), coalesce(sum(charge.reported_adjustment_total), 0),
    coalesce(sum(charge.paid_total), 0), coalesce(sum(charge.balance), 0),
    count(distinct charge.student_id) filter (where charge.balance > 0), max(payment_today.amount)
  from charge_rows charge cross join payment_today
  where has_permission('view_finance') or has_permission('generate_finance_reports');
$$;

create or replace function finance_payment_method_summary(p_academic_year_id uuid, p_class_id uuid default null)
returns table(method text, payment_count bigint, total_amount numeric)
language sql stable security definer set search_path = public
as $$
  select payment.method, count(*) filter (where payment.amount > coalesce(reversal.total, 0) + 0.005)::bigint,
    coalesce(sum(greatest(payment.amount - coalesce(reversal.total, 0), 0)), 0)
  from fee_payments payment
  join students student on student.id = payment.student_id and student.school_id = payment.school_id
  left join lateral (
    select sum(abs(adjustment.amount)) as total from finance_adjustments adjustment
    where adjustment.payment_id = payment.id and adjustment.adjustment_type = 'payment_reversal' and adjustment.status = 'approved'
  ) reversal on true
  where payment.school_id = current_school_id() and payment.academic_year_id = p_academic_year_id
    and not payment.legacy_year_unassigned and (p_class_id is null or student.class_id = p_class_id)
    and (has_permission('generate_finance_reports') or has_permission('view_finance'))
  group by payment.method
  order by sum(greatest(payment.amount - coalesce(reversal.total, 0), 0)) desc;
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
  with charge_rows as (
    select charge.student_id, charge.amount,
      coalesce(adjustment.total, 0) as adjustment_total,
      coalesce(reported_adjustment.total, 0) as reported_adjustment_total,
      coalesce(allocation.total, 0) - coalesce(reversal.total, 0) as paid_total,
      greatest(charge.amount + coalesce(adjustment.total, 0) - coalesce(allocation.total, 0), 0) as balance
    from fee_assessments charge
    left join lateral (
      select sum(case when item.adjustment_type in ('additional_charge', 'payment_reversal') then abs(item.amount)
        when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount) else item.amount end) as total
      from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
    ) adjustment on true
    left join lateral (
      select sum(case when item.adjustment_type = 'additional_charge' then abs(item.amount)
        when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount)
        when item.adjustment_type = 'payment_reversal' then 0 else item.amount end) as total
      from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
    ) reported_adjustment on true
    left join lateral (select sum(item.amount) as total from fee_payment_allocations item where item.assessment_id = charge.id) allocation on true
    left join lateral (
      select sum(abs(item.amount)) as total from finance_adjustments item
      where item.assessment_id = charge.id and item.adjustment_type = 'payment_reversal' and item.status = 'approved'
    ) reversal on true
    where charge.school_id = current_school_id() and charge.academic_year_id = p_academic_year_id
      and not charge.legacy_year_unassigned
      and (p_fee_category_id is null or charge.fee_category_id = p_fee_category_id)
  ), balances as (
    select student.id as student_id, student.admission_number,
      concat_ws(' ', student.first_name, student.last_name) as student_name,
      student.class_id, class.name as class_name,
      coalesce(sum(charge.amount), 0) as total_charges,
      coalesce(sum(charge.reported_adjustment_total), 0) as total_adjustments,
      coalesce(sum(charge.paid_total), 0) as total_paid,
      coalesce(sum(charge.balance), 0) as balance
    from students student
    left join classes class on class.id = student.class_id and class.school_id = student.school_id
    left join charge_rows charge on charge.student_id = student.id
    where student.school_id = current_school_id()
      and (p_class_id is null or student.class_id = p_class_id)
      and (nullif(btrim(p_search), '') is null
        or student.admission_number ilike '%' || btrim(p_search) || '%'
        or student.first_name ilike '%' || btrim(p_search) || '%'
        or student.last_name ilike '%' || btrim(p_search) || '%')
    group by student.id, student.admission_number, student.first_name, student.last_name, student.class_id, class.name
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

create or replace function finance_student_year_balance(p_student_id uuid, p_academic_year_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(greatest(charge.amount + coalesce(adjustment.total, 0) - coalesce(allocation.total, 0), 0)), 0)
  from fee_assessments charge
  left join lateral (
    select sum(case when item.adjustment_type in ('additional_charge', 'payment_reversal') then abs(item.amount)
      when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount) else item.amount end) as total
    from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
  ) adjustment on true
  left join lateral (select sum(item.amount) as total from fee_payment_allocations item where item.assessment_id = charge.id) allocation on true
  where charge.school_id = current_school_id() and charge.student_id = p_student_id
    and charge.academic_year_id = p_academic_year_id and not charge.legacy_year_unassigned
    and has_permission('manage_finance_adjustments');
$$;

create or replace function finance_class_summary(p_academic_year_id uuid)
returns table(class_id uuid, class_name text, total_charges numeric, total_adjustments numeric, total_allocated_payments numeric, total_outstanding numeric, students_with_balance bigint)
language sql stable security definer set search_path = public
as $$
  with ledger as (
    select student.class_id, class.name as class_name, charge.student_id, charge.amount,
      coalesce(reported_adjustment.amount, 0) as adjustment_amount,
      coalesce(allocation.amount, 0) - coalesce(reversal.amount, 0) as allocated_amount,
      greatest(charge.amount + coalesce(adjustment.amount, 0) - coalesce(allocation.amount, 0), 0) as balance
    from fee_assessments charge
    join students student on student.id = charge.student_id and student.school_id = charge.school_id
    left join classes class on class.id = student.class_id and class.school_id = student.school_id
    left join lateral (
      select sum(case when item.adjustment_type in ('additional_charge', 'payment_reversal') then abs(item.amount)
        when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount) else item.amount end) as amount
      from finance_adjustments item where item.assessment_id = charge.id and item.status = 'approved'
    ) adjustment on true
    left join lateral (
      select sum(case when item.adjustment_type = 'additional_charge' then abs(item.amount)
        when item.adjustment_type in ('discount', 'waiver') then -abs(item.amount)
        when item.adjustment_type = 'payment_reversal' then 0 else item.amount end) as amount
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
  select ledger.class_id, coalesce(ledger.class_name, 'Unassigned'), sum(ledger.amount),
    sum(ledger.adjustment_amount), sum(ledger.allocated_amount), sum(ledger.balance),
    count(distinct ledger.student_id) filter (where ledger.balance > 0.005)
  from ledger
  where has_permission('generate_finance_reports') or has_permission('view_finance')
  group by ledger.class_id, ledger.class_name
  order by ledger.class_name;
$$;

alter table finance_adjustments alter column student_enrollment_id drop not null;

create or replace function finance_validate_adjustment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_payment_amount numeric(12,2);
  v_existing_reversals numeric(12,2);
begin
  if not exists (select 1 from students where id = new.student_id and school_id = new.school_id)
    or not exists (select 1 from academic_years where id = new.academic_year_id and school_id = new.school_id) then
    raise exception 'Adjustment must match a student and academic year in this school';
  end if;
  if new.student_enrollment_id is not null and not exists (
    select 1 from student_enrollments enrollment
    where enrollment.id = new.student_enrollment_id and enrollment.school_id = new.school_id
      and enrollment.student_id = new.student_id and enrollment.academic_year_id = new.academic_year_id
  ) then raise exception 'Adjustment enrollment must match the student and academic year'; end if;
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
    if new.school_id is distinct from old.school_id or new.academic_year_id is distinct from old.academic_year_id
      or new.student_id is distinct from old.student_id or new.student_enrollment_id is distinct from old.student_enrollment_id
      or new.assessment_id is distinct from old.assessment_id or new.payment_id is distinct from old.payment_id
      or new.fee_category_id is distinct from old.fee_category_id or new.adjustment_type is distinct from old.adjustment_type
      or new.amount is distinct from old.amount or new.reason is distinct from old.reason
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
  if finance_year_is_closed(new.school_id, new.academic_year_id) then raise exception 'This financial year is closed'; end if;
  return new;
end;
$$;

update fee_assessments charge
set legacy_year_unassigned = false
where charge.legacy_year_unassigned
  and charge.academic_year_id is not null
  and exists (select 1 from students student where student.id = charge.student_id and student.school_id = charge.school_id)
  and exists (select 1 from academic_years year where year.id = charge.academic_year_id and year.school_id = charge.school_id)
  and not finance_year_is_closed(charge.school_id, charge.academic_year_id);

update fee_payments payment
set legacy_year_unassigned = false
where payment.legacy_year_unassigned
  and payment.academic_year_id is not null
  and exists (select 1 from students student where student.id = payment.student_id and student.school_id = payment.school_id)
  and exists (select 1 from academic_years year where year.id = payment.academic_year_id and year.school_id = payment.school_id)
  and not finance_year_is_closed(payment.school_id, payment.academic_year_id);
