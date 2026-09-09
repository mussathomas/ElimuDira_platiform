-- Indexes match existing tenant-scoped list and result/report query patterns.
create index if not exists students_school_class_last_name_idx
  on students (school_id, class_id, last_name, first_name);

create index if not exists exam_marks_school_student_exam_idx
  on exam_marks (school_id, student_id, examination_id);

create index if not exists audit_logs_school_created_idx
  on audit_logs (school_id, created_at desc);

create index if not exists student_attendance_school_student_day_idx
  on student_attendance (school_id, student_id, attendance_day_id);