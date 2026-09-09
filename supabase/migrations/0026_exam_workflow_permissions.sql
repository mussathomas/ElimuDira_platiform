-- Publishing and recalculation are exam workflow operations, not settings edits.

drop policy if exists examinations_write on examinations;
create policy examinations_write on examinations
  for all using (school_id = current_school_id() and (has_permission('create_exam') or has_permission('publish_results')))
  with check (school_id = current_school_id());

drop policy if exists student_exam_results_write on student_exam_results;
create policy student_exam_results_write on student_exam_results
  for all using (school_id = current_school_id() and (has_permission('enter_marks') or has_permission('publish_results') or has_permission('edit_settings')))
  with check (school_id = current_school_id());

drop policy if exists grading_versions_write on grading_configuration_versions;
create policy grading_versions_write on grading_configuration_versions
  for insert with check (school_id = current_school_id() and (has_permission('enter_marks') or has_permission('publish_results') or has_permission('edit_settings')));

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r cross join permissions p
where r.is_system and p.code in ('publish_results', 'send_reports', 'verify_marks')
on conflict (role_id, permission_id) do nothing;