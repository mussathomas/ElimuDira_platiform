-- Keep one canonical active grading and division scheme per school scope.
-- Older rows remain available as inactive history and are not deleted.
with ranked_scales as (
  select id, row_number() over (
    partition by school_id,
      coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(education_level_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(examination_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
    order by updated_at desc, created_at desc, id desc
  ) as duplicate_rank
  from grading_scales
  where status = 'active'
)
update grading_scales scale
set status = 'inactive'
from ranked_scales ranked
where scale.id = ranked.id and ranked.duplicate_rank > 1;

with ranked_rules as (
  select id, row_number() over (
    partition by school_id,
      coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(education_level_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(examination_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
    order by created_at desc, id desc
  ) as duplicate_rank
  from division_rules
  where status = 'active'
)
update division_rules rule
set status = 'inactive'
from ranked_rules ranked
where rule.id = ranked.id and ranked.duplicate_rank > 1;