-- Align student RLS with the existing edit/delete permission catalog.

drop policy if exists students_write on students;
create policy students_write on students
  for all using (
    school_id = current_school_id()
    and (has_permission('manage_students') or has_permission('edit_student') or has_permission('delete_student'))
  ) with check (school_id = current_school_id());

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r cross join permissions p
where r.is_system and p.code in ('edit_student', 'delete_student')
on conflict (role_id, permission_id) do nothing;
