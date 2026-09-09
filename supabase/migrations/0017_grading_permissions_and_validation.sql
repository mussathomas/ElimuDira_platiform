-- Dedicated grading permissions. Existing edit_settings administrators remain compatible.
insert into permissions (code, module, action, description) values
  ('view_grading_settings', 'settings', 'view', 'View grading and division configuration'),
  ('manage_grading_settings', 'settings', 'edit', 'Create, edit, activate, and recalculate grading configuration')
on conflict (code) do nothing;

create or replace function can_manage_grading_settings()
returns boolean language sql stable security invoker as $$
  select has_permission('manage_grading_settings') or has_permission('edit_settings');
$$;

create or replace function can_view_grading_settings()
returns boolean language sql stable security invoker as $$
  select has_permission('view_grading_settings') or can_manage_grading_settings();
$$;

drop policy if exists grading_scales_select on grading_scales;
create policy grading_scales_select on grading_scales for select using (school_id = current_school_id() and can_view_grading_settings() or is_super_admin());
drop policy if exists grading_scales_write on grading_scales;
create policy grading_scales_write on grading_scales for all using (school_id = current_school_id() and can_manage_grading_settings()) with check (school_id = current_school_id() and can_manage_grading_settings());
drop policy if exists grade_bands_write on grade_bands;
create policy grade_bands_write on grade_bands for all using (grading_scale_id in (select id from grading_scales where school_id = current_school_id() and can_manage_grading_settings())) with check (grading_scale_id in (select id from grading_scales where school_id = current_school_id() and can_manage_grading_settings()));
drop policy if exists grade_bands_select on grade_bands;
create policy grade_bands_select on grade_bands for select using (grading_scale_id in (select id from grading_scales where school_id = current_school_id() and can_view_grading_settings()) or is_super_admin());
drop policy if exists division_rules_select on division_rules;
create policy division_rules_select on division_rules for select using (school_id = current_school_id() and can_view_grading_settings() or is_super_admin());
drop policy if exists division_rules_write on division_rules;
create policy division_rules_write on division_rules for all using (school_id = current_school_id() and can_manage_grading_settings()) with check (school_id = current_school_id() and can_manage_grading_settings());
drop policy if exists division_bands_write on division_bands;
create policy division_bands_write on division_bands for all using (division_rule_id in (select id from division_rules where school_id = current_school_id() and can_manage_grading_settings())) with check (division_rule_id in (select id from division_rules where school_id = current_school_id() and can_manage_grading_settings()));
drop policy if exists division_bands_select on division_bands;
create policy division_bands_select on division_bands for select using (division_rule_id in (select id from division_rules where school_id = current_school_id() and can_view_grading_settings()) or is_super_admin());
drop policy if exists compulsory_subjects_write on compulsory_subjects;
create policy compulsory_subjects_write on compulsory_subjects for all using (division_rule_id in (select id from division_rules where school_id = current_school_id() and can_manage_grading_settings())) with check (division_rule_id in (select id from division_rules where school_id = current_school_id() and can_manage_grading_settings()));
drop policy if exists compulsory_subjects_select on compulsory_subjects;
create policy compulsory_subjects_select on compulsory_subjects for select using (division_rule_id in (select id from division_rules where school_id = current_school_id() and can_view_grading_settings()) or is_super_admin());
drop policy if exists excluded_subjects_write on excluded_division_subjects;
create policy excluded_subjects_write on excluded_division_subjects for all using (division_rule_id in (select id from division_rules where school_id = current_school_id() and can_manage_grading_settings())) with check (division_rule_id in (select id from division_rules where school_id = current_school_id() and can_manage_grading_settings()));
drop policy if exists excluded_subjects_select on excluded_division_subjects;
create policy excluded_subjects_select on excluded_division_subjects for select using (division_rule_id in (select id from division_rules where school_id = current_school_id() and can_view_grading_settings()) or is_super_admin());

-- NULL comparisons previously allowed an open-ended range to overlap another range.
create or replace function validate_division_band_bounds()
returns trigger language plpgsql as $$
begin
  if new.min_points < 0 then raise exception 'Minimum aggregate cannot be negative'; end if;
  if new.max_points is not null and new.min_points > new.max_points then raise exception 'Minimum aggregate cannot exceed maximum aggregate'; end if;
  if exists (
    select 1 from division_bands
    where division_rule_id = new.division_rule_id
      and id <> new.id
      and new.min_points <= coalesce(max_points, 999999999)
      and coalesce(new.max_points, 999999999) >= min_points
  ) then raise exception 'Division ranges cannot overlap'; end if;
  return new;
end;
$$;

drop trigger if exists division_band_bounds_check on division_bands;
create trigger division_band_bounds_check before insert or update on division_bands for each row execute function validate_division_band_bounds();

create or replace function bump_grading_configuration_versions(p_school_id uuid)
returns void language sql security invoker as $$
  update grading_scales set version = version + 1 where school_id = p_school_id;
$$;

create index if not exists grading_scales_active_scope_idx on grading_scales (school_id, education_level_id, academic_year_id) where status = 'active';
create index if not exists division_rules_active_scope_idx on division_rules (school_id, education_level_id, academic_year_id) where status = 'active';
create index if not exists student_exam_results_school_exam_idx on student_exam_results (school_id, examination_id, student_id);