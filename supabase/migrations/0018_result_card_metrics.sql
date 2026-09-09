alter table student_exam_results
  add column if not exists total_marks numeric(8,2),
  add column if not exists average_mark numeric(8,2),
  add column if not exists overall_status text not null default 'Not Classified',
  add column if not exists position integer;

create index if not exists student_exam_results_exam_aggregate_idx
  on student_exam_results (school_id, examination_id, aggregate, student_id);