-- ElimuDira — permissions catalog.
-- This is a platform-defined list, identical for every school. Schools don't
-- edit this table; they decide which of these codes each of their roles (or
-- individual users) is granted, via role_permissions / user_permission_overrides.
-- New modules add rows here in their own migration as they're built.

insert into permissions (code, module, action, description) values
  -- Students (Phase 2)
  ('view_students',      'students',   'view',    'View student records'),
  ('create_student',     'students',   'create',  'Register new students'),
  ('edit_student',       'students',   'edit',    'Edit student records'),
  ('transfer_student',   'students',   'approve', 'Transfer or promote a student'),
  ('delete_student',     'students',   'delete',  'Archive/delete a student record'),
  ('export_students',    'students',   'export',  'Export student lists'),

  -- Staff & Users (Phase 2)
  ('view_staff',         'staff',      'view',    'View staff records'),
  ('create_staff',       'staff',      'create',  'Register new staff'),
  ('edit_staff',         'staff',      'edit',    'Edit staff records'),
  ('delete_staff',       'staff',      'delete',  'Archive/delete a staff record'),
  ('view_users',         'users',      'view',    'View system user accounts'),
  ('manage_users',       'users',      'edit',    'Create/edit user accounts and assign roles'),
  ('manage_roles',       'users',      'edit',    'Create/edit roles and permission assignments'),
  ('view_audit',         'audit',      'view',    'View audit logs'),

  -- Attendance (Phase 3)
  ('view_attendance',    'attendance', 'view',    'View attendance records'),
  ('mark_attendance',    'attendance', 'create',  'Mark student or staff attendance'),
  ('approve_attendance',  'attendance', 'approve', 'Approve staff attendance records'),

  -- Syllabus progress (Phase 3)
  ('view_syllabus',      'syllabus',   'view',    'View syllabus progress'),
  ('edit_syllabus',      'syllabus',   'edit',    'Record syllabus/teaching progress'),

  -- Exams & Results (Phase 4)
  ('view_exams',         'exams',      'view',    'View examinations and results'),
  ('create_exam',        'exams',      'create',  'Create examinations'),
  ('enter_marks',        'exams',      'create',  'Enter student marks'),
  ('verify_marks',       'exams',      'approve', 'Verify entered marks'),
  ('publish_results',    'exams',      'approve', 'Publish examination results'),
  ('download_reports',   'exams',      'download','Download student/class reports'),
  ('send_reports',       'exams',      'send',    'Send reports to guardians'),

  -- Finance (Phase 5)
  ('view_finance',       'finance',    'view',    'View financial records'),
  ('create_payment',     'finance',    'create',  'Record a payment'),
  ('edit_payment',       'finance',    'edit',    'Edit a payment record'),
  ('delete_payment',     'finance',    'delete',  'Void/delete a payment record'),
  ('export_finance',     'finance',    'export',  'Export financial reports'),

  -- Letters & Documents (Phase 6)
  ('view_documents',     'documents',  'view',    'View generated documents/letters'),
  ('generate_document',  'documents',  'create',  'Generate a letter/certificate'),
  ('download_document',  'documents',  'download','Download a generated document'),

  -- Settings
  ('view_settings',      'settings',   'view',    'View school settings'),
  ('edit_settings',      'settings',   'edit',    'Edit academic structure, grading, and school settings')
on conflict (code) do nothing;
