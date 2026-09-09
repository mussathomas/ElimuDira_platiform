-- Backfill metrics for results processed before the result-card fields existed.
with mark_totals as (
  select
    school_id,
    examination_id,
    student_id,
    sum(score) as total_marks,
    avg(score) as average_mark
  from exam_marks
  group by school_id, examination_id, student_id
)
update student_exam_results result
set total_marks = totals.total_marks,
    average_mark = totals.average_mark
from mark_totals totals
where result.school_id = totals.school_id
  and result.examination_id = totals.examination_id
  and result.student_id = totals.student_id;

with ranked_results as (
  select
    id,
    dense_rank() over (
      partition by school_id, examination_id
      order by aggregate asc nulls last
    ) as calculated_position
  from student_exam_results
)
update student_exam_results result
set position = ranked.calculated_position
from ranked_results ranked
where result.id = ranked.id;

-- The grading engine supports configurable mark scales above 100.
alter table exam_marks drop constraint if exists exam_marks_score_check;
alter table exam_marks add constraint exam_marks_score_check check (score >= 0 and score <= 1000);

create index if not exists exam_marks_student_exam_idx
  on exam_marks (school_id, student_id, examination_id);