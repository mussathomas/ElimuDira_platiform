alter table schools
  add column if not exists grading_system text not null default 'percentage';

alter table schools
  drop constraint if exists schools_grading_system_check;

alter table schools
  add constraint schools_grading_system_check
  check (grading_system in ('percentage', 'letter', 'division'));