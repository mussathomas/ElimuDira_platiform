-- Repair Administrator roles created before the permission catalog was seeded.

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.is_system = true
on conflict (role_id, permission_id) do nothing;