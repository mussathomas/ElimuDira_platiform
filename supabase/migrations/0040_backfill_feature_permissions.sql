insert into role_permissions (role_id, permission_id)
select distinct role_permission.role_id, target_permission.id
from role_permissions role_permission
join permissions existing_permission on existing_permission.id = role_permission.permission_id
join permissions target_permission on target_permission.code = 'manage_fee_structures'
where existing_permission.code in ('record_payments', 'create_payment')
on conflict (role_id, permission_id) do nothing;

insert into role_permissions (role_id, permission_id)
select distinct role_permission.role_id, target_permission.id
from role_permissions role_permission
join permissions existing_permission on existing_permission.id = role_permission.permission_id
join permissions target_permission on target_permission.code = 'manage_notifications'
where existing_permission.code in ('manage_users', 'edit_settings')
on conflict (role_id, permission_id) do nothing;

insert into role_permissions (role_id, permission_id)
select role.id, permission.id
from roles role
cross join permissions permission
where lower(btrim(role.name)) = 'accountant'
	and permission.code in ('view_finance', 'manage_fee_structures', 'create_student_charges')
on conflict (role_id, permission_id) do nothing;

insert into role_permissions (role_id, permission_id)
select role.id, permission.id
from roles role
cross join permissions permission
where lower(btrim(role.name)) = 'secretary'
	and permission.code = 'manage_notifications'
on conflict (role_id, permission_id) do nothing;