export interface NavLeaf {
  label: string;
  href: string;
  permission?: string; // omit = visible to any authenticated school user
}

export interface NavSection {
  label: string;
  href?: string; // present when the section itself is also a page (e.g. Dashboard)
  permission?: string;
  children?: NavLeaf[];
}

/** School-workspace sidebar. Mirrors the structure in the product brief. */
export const schoolNav: NavSection[] = [
  { label: 'Dashboard', href: '/dashboard' },
  {
    label: 'Students',
    permission: 'view_students',
    children: [
      { label: 'All Students', href: '/dashboard/students', permission: 'view_students' },
      { label: 'Add Student', href: '/dashboard/students/add', permission: 'create_student' },
      { label: 'Transfers', href: '/dashboard/students/transfers', permission: 'transfer_student' },
    ],
  },
  {
    label: 'Staff & Administration',
    children: [
      { label: 'Manage Staff', href: '/dashboard/staff', permission: 'view_staff' },
      { label: 'Users', href: '/dashboard/staff/users', permission: 'view_users' },
      { label: 'Positions', href: '/dashboard/staff/positions', permission: 'view_staff' },
      { label: 'Roles', href: '/dashboard/staff/roles', permission: 'manage_roles' },
      { label: 'Permissions', href: '/dashboard/staff/permissions', permission: 'manage_roles' },
      { label: 'Audit', href: '/dashboard/staff/audit', permission: 'view_audit' },
    ],
  },
  {
    label: 'Attendance',
    children: [
      { label: 'Class Attendance', href: '/dashboard/attendance/class', permission: 'mark_attendance' },
      { label: 'Personal Attendance', href: '/dashboard/attendance/personal', permission: 'view_attendance' },
      { label: 'Attendance Approval', href: '/dashboard/attendance/approval', permission: 'approve_attendance' },
      { label: 'Attendance History', href: '/dashboard/attendance/history', permission: 'view_attendance' },
    ],
  },
  {
    label: 'Syllabus Progress',
    permission: 'view_syllabus',
    children: [
      { label: 'Overview', href: '/dashboard/syllabus', permission: 'view_syllabus' },
      { label: 'Class Progress', href: '/dashboard/syllabus/class', permission: 'view_syllabus' },
      { label: 'Subject Progress', href: '/dashboard/syllabus/subject', permission: 'view_syllabus' },
      { label: 'Topics', href: '/dashboard/syllabus/topics', permission: 'edit_syllabus' },
    ],
  },
  {
    label: 'Exams & Reports',
    children: [
      { label: 'Examinations', href: '/dashboard/exams', permission: 'create_exam' },
      { label: 'Marks', href: '/dashboard/exams/marks', permission: 'enter_marks' },
      { label: 'Results', href: '/dashboard/exams/results', permission: 'view_exams' },
      { label: 'Class Results', href: '/dashboard/exams/class-results', permission: 'view_exams' },
      { label: 'Student Reports', href: '/dashboard/exams/reports', permission: 'download_reports' },
    ],
  },
  {
    label: 'Timetable',
    permission: 'view_timetable',
    children: [
      { label: 'Overview', href: '/dashboard/timetable', permission: 'view_timetable' },
      { label: 'Create / Manage', href: '/dashboard/timetable/manage', permission: 'create_timetable' },
      { label: 'Weekly Timetable', href: '/dashboard/timetable/weekly', permission: 'view_timetable' },
      { label: 'Class Timetables', href: '/dashboard/timetable/class', permission: 'view_timetable' },
      { label: 'Teacher Timetables', href: '/dashboard/timetable/teacher', permission: 'view_timetable' },
      { label: 'Room Timetables', href: '/dashboard/timetable/room', permission: 'view_timetable' },
      { label: 'Periods & Time Slots', href: '/dashboard/timetable/periods', permission: 'edit_timetable_settings' },
      { label: 'Rooms', href: '/dashboard/timetable/rooms', permission: 'edit_timetable_settings' },
      { label: 'Scheduling Rules', href: '/dashboard/timetable/rules', permission: 'edit_timetable_settings' },
      { label: 'Conflicts', href: '/dashboard/timetable/conflicts', permission: 'view_timetable' },
      { label: 'Published Timetables', href: '/dashboard/timetable/published', permission: 'view_timetable' },
      { label: 'Settings', href: '/dashboard/timetable/settings', permission: 'edit_timetable_settings' },
    ],
  },
  {
    label: 'Finance',
    permission: 'view_finance',
    children: [
      { label: 'Fee Structures', href: '/dashboard/finance/fee-structures', permission: 'view_finance' },
      { label: 'Payments', href: '/dashboard/finance/payments', permission: 'create_payment' },
      { label: 'Outstanding Fees', href: '/dashboard/finance/outstanding', permission: 'view_finance' },
      { label: 'Financial Reports', href: '/dashboard/finance/reports', permission: 'export_finance' },
    ],
  },
  {
    label: 'Letters & Documents',
    permission: 'view_documents',
    children: [
      { label: 'Templates', href: '/dashboard/letters/templates', permission: 'generate_document' },
      { label: 'Generated Documents', href: '/dashboard/letters', permission: 'view_documents' },
      { label: 'Certificates', href: '/dashboard/letters/certificates', permission: 'generate_document' },
    ],
  },
  { label: 'Notifications', href: '/dashboard/notifications' },
  {
    label: 'Settings',
    permission: 'edit_settings',
    children: [
      { label: 'School Settings', href: '/dashboard/settings/school', permission: 'edit_settings' },
      { label: 'Academic Settings', href: '/dashboard/settings/academics', permission: 'edit_settings' },
      { label: 'Grading', href: '/dashboard/settings/grading', permission: 'edit_settings' },
      { label: 'Communication', href: '/dashboard/settings/communication', permission: 'edit_settings' },
      { label: 'System Settings', href: '/dashboard/settings/system', permission: 'edit_settings' },
    ],
  },
];

/** Platform (Super Admin) sidebar — entirely separate from the school sidebar. */
export const platformNav: NavSection[] = [
  { label: 'Dashboard', href: '/platform' },
  {
    label: 'Schools',
    children: [
      { label: 'All Schools', href: '/platform/schools' },
      { label: 'Register School', href: '/platform/schools/register' },
      { label: 'Active Schools', href: '/platform/schools?status=active' },
      { label: 'Suspended Schools', href: '/platform/schools?status=suspended' },
    ],
  },
  { label: 'Platform Analytics', href: '/platform/analytics' },
  { label: 'Platform Users', href: '/platform/users' },
  { label: 'System Audit', href: '/platform/audit' },
  { label: 'Platform Settings', href: '/platform/settings' },
];

/** Flat lookup for resolving the selected module or submodule from the URL. */
export function findNavLeafByHref(href: string): NavLeaf | undefined {
  for (const section of [...schoolNav, ...platformNav]) {
    if (section.href === href) return { label: section.label, href, permission: section.permission };
    const match = section.children?.find((c) => c.href === href);
    if (match) return match;
  }
  return undefined;
}
