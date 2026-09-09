-- 0023: make the existing grading configuration and snapshot pipeline authoritative.
-- Legacy grading_scales/division_rules remain in place for compatibility; published
-- results point to an immutable configuration snapshot instead of live settings.

alter table student_exam_results
  add column if not exists configuration_version_id uuid references grading_configuration_versions(id) on delete set null,
  add column if not exists status text not null default 'CALCULATED',
  add column if not exists updated_at timestamptz not null default now();

alter table student_exam_results
  drop constraint if exists student_exam_results_status_check;
alter table student_exam_results
  add constraint student_exam_results_status_check
  check (status in ('DRAFT', 'CALCULATED', 'REVIEWED', 'APPROVED', 'PUBLISHED'));

create index if not exists student_exam_results_configuration_idx
  on student_exam_results (school_id, configuration_version_id);

create or replace function validate_exam_mark_configuration()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  configured_school uuid;
  configured_max numeric;
begin
  if new.configuration_version_id is null then
    return new;
  end if;

  select school_id, nullif(snapshot -> 'scale' ->> 'max_mark', '')::numeric
    into configured_school, configured_max
  from grading_configuration_versions
  where id = new.configuration_version_id;

  if configured_school is null or configured_school <> new.school_id then
    raise exception 'Exam mark configuration does not belong to this school';
  end if;
  if configured_max is null or new.score > configured_max then
    raise exception 'Exam mark exceeds the configured grading scheme maximum';
  end if;
  return new;
end;
$$;

drop trigger if exists exam_mark_configuration_check on exam_marks;
create trigger exam_mark_configuration_check
  before insert or update on exam_marks
  for each row execute function validate_exam_mark_configuration();

create or replace function resolve_active_grading_configuration(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_education_level_id uuid,
  p_class_id uuid default null,
  p_examination_type_id uuid default null
)
returns table (grading_scale_id uuid, division_rule_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_school_id <> current_school_id() and not is_super_admin() then
    raise exception 'Cannot resolve grading configuration for another school';
  end if;

  return query
  select scale.id,
    (
      select rule.id
      from division_rules rule
      where rule.school_id = p_school_id
        and rule.status = 'active'
        and (rule.academic_year_id = p_academic_year_id or rule.academic_year_id is null)
        and (rule.education_level_id = p_education_level_id or rule.education_level_id is null)
        and (rule.class_id = p_class_id or rule.class_id is null)
        and (rule.examination_type_id = p_examination_type_id or rule.examination_type_id is null)
      order by
        (rule.academic_year_id = p_academic_year_id)::int desc,
        (rule.education_level_id = p_education_level_id)::int desc,
        (rule.class_id = p_class_id)::int desc,
        (rule.examination_type_id = p_examination_type_id)::int desc,
        rule.updated_at desc,
        rule.id desc
      limit 1
    )
  from grading_scales scale
  where scale.school_id = p_school_id
    and scale.status = 'active'
    and (scale.academic_year_id = p_academic_year_id or scale.academic_year_id is null)
    and (scale.education_level_id = p_education_level_id or scale.education_level_id is null)
    and (scale.class_id = p_class_id or scale.class_id is null)
    and (scale.examination_type_id = p_examination_type_id or scale.examination_type_id is null)
  order by
    (scale.academic_year_id = p_academic_year_id)::int desc,
    (scale.education_level_id = p_education_level_id)::int desc,
    (scale.class_id = p_class_id)::int desc,
    (scale.examination_type_id = p_examination_type_id)::int desc,
    scale.updated_at desc,
    scale.id desc
  limit 1;
end;
$$;

drop policy if exists student_exam_results_write on student_exam_results;
create policy student_exam_results_write on student_exam_results
  for all
  using (school_id = current_school_id() and (has_permission('enter_marks') or has_permission('edit_settings')))
  with check (school_id = current_school_id() and (has_permission('enter_marks') or has_permission('edit_settings')));

drop trigger if exists student_exam_results_set_updated_at on student_exam_results;
create trigger student_exam_results_set_updated_at
  before update on student_exam_results
  for each row execute function set_updated_at();

comment on table student_exam_results is 'Authoritative calculated result; configuration_version_id preserves historical grading rules.';
comment on function resolve_active_grading_configuration(uuid, uuid, uuid, uuid, uuid) is 'Returns the most specific active grading scale and division rule for one tenant-scoped exam context.';
