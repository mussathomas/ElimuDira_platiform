alter table exam_marks drop constraint if exists exam_marks_score_check;
alter table exam_marks
  add constraint exam_marks_score_check
  check (score >= 0 and score <= 100) not valid;