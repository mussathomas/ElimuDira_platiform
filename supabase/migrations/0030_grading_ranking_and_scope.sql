-- Complete grading settings used by result calculation and ranking.

alter table division_rules
  add column if not exists ranking_method text not null default 'aggregate'
  check (ranking_method in ('aggregate', 'total_marks', 'average_mark'));

create index if not exists division_rules_ranking_idx on division_rules(school_id, ranking_method);
