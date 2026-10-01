drop policy if exists exam_marks_write on exam_marks;
create policy exam_marks_write on exam_marks
  for all
  using (
    school_id = current_school_id()
    and has_permission('enter_marks')
    and (
      exists (
        select 1
        from profiles profile
        join roles role on role.id = profile.role_id
        where profile.id = auth.uid()
          and profile.school_id = exam_marks.school_id
          and role.is_system
      )
      or exists (
        select 1
        from students student
        join teacher_assignments assignment
          on assignment.school_id = student.school_id
         and assignment.profile_id = auth.uid()
         and assignment.class_id = student.class_id
         and assignment.subject_id = exam_marks.subject_id
        where student.id = exam_marks.student_id
          and student.school_id = exam_marks.school_id
      )
    )
  )
  with check (
    school_id = current_school_id()
    and has_permission('enter_marks')
    and (
      exists (
        select 1
        from profiles profile
        join roles role on role.id = profile.role_id
        where profile.id = auth.uid()
          and profile.school_id = exam_marks.school_id
          and role.is_system
      )
      or exists (
        select 1
        from students student
        join teacher_assignments assignment
          on assignment.school_id = student.school_id
         and assignment.profile_id = auth.uid()
         and assignment.class_id = student.class_id
         and assignment.subject_id = exam_marks.subject_id
        where student.id = exam_marks.student_id
          and student.school_id = exam_marks.school_id
      )
    )
  );