-- 0013 created a school/education-level-only unique constraint.
-- Scope uniqueness is now enforced by active_division_scheme_scope_idx,
-- which includes academic year, class, and examination type.
alter table division_rules
  drop constraint if exists division_rules_school_id_education_level_id_key;

create unique index if not exists active_division_scheme_scope_idx
  on division_rules (
    school_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(education_level_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(examination_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where status = 'active';