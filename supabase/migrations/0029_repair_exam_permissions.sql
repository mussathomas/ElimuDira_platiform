-- Ensure the built-in administrator role can use the complete exam workflow.

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r cross join permissions p
where r.is_system
  and p.code in ('view_exams', 'create_exam', 'enter_marks', 'verify_marks', 'publish_results', 'download_reports', 'send_reports')
on conflict (role_id, permission_id) do nothing;