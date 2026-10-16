import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  School,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { requireSchoolSession } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getFinanceYearSummary, type FinanceSummary } from '@/lib/finance/service';
import { Card, CardHeader, CardTitle, Progress } from '@/components/ui/card';

type Metric = { value: number | null; error: boolean };
type Loaded<T> = { data: T | null; error: boolean };
type QueryFailure = { message: string };

const numberFormat = new Intl.NumberFormat('en-TZ');
const currencyFormat = new Intl.NumberFormat('en-TZ', {
  style: 'currency',
  currency: 'TZS',
  maximumFractionDigits: 0,
});
const dateFormat = new Intl.DateTimeFormat('en-TZ', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Africa/Dar_es_Salaam',
});

function logDashboardError(section: string, error: unknown) {
  console.error(`Dashboard ${section} failed to load`, error);
}

async function readCount(
  section: string,
  query: () => PromiseLike<{ count: number | null; error: QueryFailure | null }>
): Promise<Metric> {
  try {
    const { count, error } = await query();
    if (error) {
      logDashboardError(section, error);
      return { value: null, error: true };
    }
    return { value: count ?? 0, error: false };
  } catch (error) {
    logDashboardError(section, error);
    return { value: null, error: true };
  }
}

async function readRows<T>(
  section: string,
  query: () => PromiseLike<{ data: T[] | null; error: QueryFailure | null }>
): Promise<Loaded<T[]>> {
  try {
    const { data, error } = await query();
    if (error) {
      logDashboardError(section, error);
      return { data: null, error: true };
    }
    return { data: data ?? [], error: false };
  } catch (error) {
    logDashboardError(section, error);
    return { data: null, error: true };
  }
}

async function readFinanceSummary(yearId: string): Promise<Loaded<FinanceSummary>> {
  try {
    return { data: await getFinanceYearSummary(yearId), error: false };
  } catch (error) {
    logDashboardError('finance overview', error);
    return { data: null, error: true };
  }
}

async function loadLatestPublishedExam(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  schoolId: string,
  exams: Array<{ id: string; name: string; term: string; status: string; created_at: string | null }>
) {
  const exam = [...exams]
    .filter((item) => item.status === 'published')
    .sort((left, right) => (right.created_at ?? '').localeCompare(left.created_at ?? ''))[0];
  if (!exam) return { data: null, error: false };

  const results: Array<{ average_mark: number | null; division: string | null }> = [];
  const pageSize = 500;
  try {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('student_exam_results')
        .select('average_mark, division')
        .eq('school_id', schoolId)
        .eq('examination_id', exam.id)
        .eq('status', 'PUBLISHED')
        .range(offset, offset + pageSize - 1);
      if (error) {
        logDashboardError('academic performance', error);
        return { data: null, error: true };
      }
      const page = data ?? [];
      results.push(...page);
      if (page.length < pageSize) break;
    }
  } catch (error) {
    logDashboardError('academic performance', error);
    return { data: null, error: true };
  }

  const averages = results
    .filter((result) => result.average_mark !== null)
    .map((result) => Number(result.average_mark))
    .filter(Number.isFinite);
  const divisions = new Map<string, number>();
  for (const result of results) {
    if (result.division) divisions.set(result.division, (divisions.get(result.division) ?? 0) + 1);
  }
  return {
    data: {
      exam,
      students: results.length,
      average: averages.length ? averages.reduce((sum, value) => sum + value, 0) / averages.length : null,
      divisions: [...divisions.entries()].sort((left, right) => right[1] - left[1]),
    },
    error: false,
  };
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: 'Africa/Dar_es_Salaam',
  }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function SectionError({ children = 'This section could not be loaded. Please try again.' }: { children?: string }) {
  return <p className="rounded-md border border-danger/20 bg-danger-light px-3 py-2 text-sm text-danger">{children}</p>;
}

function KpiCard({
  label,
  value,
  detail,
  href,
  icon: Icon,
  error = false,
}: {
  label: string;
  value: number | string | null;
  detail?: string;
  href?: string;
  icon: typeof Users;
  error?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-soft">{label}</p>
        <span className="rounded-md bg-brand-light p-2 text-brand-dark"><Icon size={18} aria-hidden="true" /></span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">
        {error ? 'Unavailable' : value === null ? '—' : typeof value === 'number' ? numberFormat.format(value) : value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
      {href && <span className="sr-only">Open {label}</span>}
    </>
  );

  return href && !error ? (
    <Link href={href} className="card block p-4 transition-colors hover:border-brand/40 focus-visible:outline">
      {content}
    </Link>
  ) : <Card className="p-4">{content}</Card>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ academic_year_id?: string }>;
}) {
  const session = await requireSchoolSession();
  const { academic_year_id: requestedYearId } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school.id;
  const permissions = session.permissions;
  const canViewStudents = permissions.has('view_students');
  const canViewStaff = permissions.has('view_staff');
  const canManageUsers = permissions.has('manage_users');
  const canManageRoles = permissions.has('manage_roles');
  const canViewUsers = permissions.has('view_users') || canManageUsers;
  const canViewFinance = permissions.has('view_finance');
  const canViewAttendance = permissions.has('view_attendance');
  const canMarkAttendance = permissions.has('mark_attendance');
  const canApproveAttendance = permissions.has('approve_attendance');
  const canViewSyllabus = permissions.has('view_syllabus');
  const canEditSettings = permissions.has('edit_settings');
  const canViewExams = permissions.has('view_exams');
  const canViewTimetable = permissions.has('view_timetable')
    || permissions.has('create_timetable')
    || permissions.has('edit_timetable_settings');
  const canViewAcademicStructure = canViewStudents
    || permissions.has('manage_students')
    || canViewSyllabus
    || canViewExams
    || permissions.has('create_exam')
    || permissions.has('enter_marks')
    || canViewAttendance
    || canMarkAttendance
    || canApproveAttendance
    || canViewTimetable
    || canEditSettings
    || canManageRoles;
  const canAddStudents = permissions.has('manage_students');
  const canAddStaff = permissions.has('manage_staff') && canManageUsers;
  const canRecordPayments = permissions.has('record_payments');
  const canEnterMarks = permissions.has('enter_marks');
  const canCreateExams = permissions.has('create_exam') && canViewExams;

  const yearsResult = await readRows<{
    id: string;
    name: string;
    is_current: boolean;
    start_date: string;
    end_date: string;
  }>('academic year context', () => supabase
    .from('academic_years')
    .select('id, name, is_current, start_date, end_date')
    .eq('school_id', schoolId)
    .order('start_date', { ascending: false }));
  const years = yearsResult.data ?? [];
  const selectedYear = years.find((year) => year.id === requestedYearId)
    ?? years.find((year) => year.is_current)
    ?? years[0]
    ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const todayIsInYear = Boolean(selectedYear && selectedYear.start_date <= today && selectedYear.end_date >= today);
  const name = session.fullName.trim().split(/\s+/)[0] || 'Administrator';

  const [
    students,
    staff,
    activeUsers,
    classes,
    subjects,
    attendanceDays,
    attendanceApprovals,
    syllabusTopics,
    finance,
    examRows,
  ] = await Promise.all([
    canViewStudents
      ? readCount('student count', () => {
          return supabase.from('students').select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId).eq('status', 'active').not('class_id', 'is', null);
        })
      : Promise.resolve({ value: null, error: false }),
    canViewStaff
      ? readCount('staff count', () => supabase.from('staff_members')
          .select('id, profiles!inner(status)', { count: 'exact', head: true })
          .eq('school_id', schoolId).eq('profiles.status', 'active'))
      : Promise.resolve({ value: null, error: false }),
    canViewUsers
      ? readCount('active user count', () => supabase.from('profiles')
          .select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'))
      : Promise.resolve({ value: null, error: false }),
    canViewAcademicStructure
      ? readCount('class count', () => supabase.from('classes')
          .select('id', { count: 'exact', head: true }).eq('school_id', schoolId))
      : Promise.resolve({ value: null, error: false }),
    canViewAcademicStructure
      ? readCount('subject count', () => supabase.from('subjects')
          .select('id', { count: 'exact', head: true }).eq('school_id', schoolId))
      : Promise.resolve({ value: null, error: false }),
    (canViewAttendance || canMarkAttendance || canApproveAttendance) && selectedYear
      ? readRows<{
          id: string;
          attendance_date: string;
          student_attendance: Array<{ status: string }>;
        }>('attendance overview', () => {
          let query = supabase.from('attendance_days')
            .select('id, attendance_date, student_attendance(status)')
            .eq('school_id', schoolId);
          query = query.gte('attendance_date', selectedYear.start_date).lte('attendance_date', selectedYear.end_date);
          return query.order('attendance_date', { ascending: false }).limit(5);
        })
      : Promise.resolve({ data: [], error: false }),
    canApproveAttendance && selectedYear
      ? readRows<{
          id: string;
          student_attendance: Array<{ id: string }>;
          staff_attendance: Array<{ id: string }>;
        }>('attendance approvals', () => supabase.from('attendance_days')
          .select('id, student_attendance(id), staff_attendance(id)')
          .eq('school_id', schoolId).eq('approved', false)
          .gte('attendance_date', selectedYear.start_date).lte('attendance_date', selectedYear.end_date))
      : Promise.resolve({ data: [], error: false }),
    canViewSyllabus && selectedYear
      ? readRows<{
          subject_id: string;
          target_lessons: number;
          syllabus_progress: { lessons_completed: number } | Array<{ lessons_completed: number }> | null;
          subjects: { name: string } | Array<{ name: string }> | null;
        }>('syllabus progress', () => supabase.from('syllabus_topics')
          .select('subject_id, target_lessons, syllabus_progress(lessons_completed), subjects(name)')
          .eq('school_id', schoolId).eq('academic_year_id', selectedYear.id))
      : Promise.resolve({ data: [], error: false }),
    canViewFinance && selectedYear
      ? readFinanceSummary(selectedYear.id)
      : Promise.resolve({ data: null, error: false }),
    canViewExams && selectedYear
      ? readRows<{
          id: string;
          name: string;
          term: string;
          starts_on: string | null;
          status: string;
          created_at: string | null;
        }>('examinations', () => supabase.from('examinations')
          .select('id, name, term, starts_on, status, created_at')
          .eq('school_id', schoolId).eq('academic_year_id', selectedYear.id))
      : Promise.resolve({ data: [], error: false }),
  ]);

  const days = attendanceDays.data ?? [];
  const todayAttendance = days.find((day) => day.attendance_date === today);
  const attendanceDayIds = days.map((day) => day.id);
  const staffAttendance = canViewStaff && attendanceDayIds.length
    ? await readRows<{ attendance_day_id: string; signed_in_at: string | null }>(
        'staff attendance overview',
        () => supabase.from('staff_attendance')
          .select('attendance_day_id, signed_in_at')
          .eq('school_id', schoolId)
          .in('attendance_day_id', attendanceDayIds)
      )
    : { data: [], error: false };
  const attendanceStatuses = todayAttendance?.student_attendance ?? [];
  const todayPresent = attendanceStatuses.filter((record) => record.status === 'present').length;
  const todayAbsent = attendanceStatuses.filter((record) => record.status === 'absent').length;
  const todayLate = attendanceStatuses.filter((record) => record.status === 'late').length;
  const todayRecorded = todayPresent + todayAbsent + todayLate;
  const staffSignedIn = (staffAttendance.data ?? [])
    .filter((record) => record.attendance_day_id === todayAttendance?.id)
    .filter((record) => record.signed_in_at).length;

  const subjectsById = new Map<string, { name: string; target: number; completed: number }>();
  for (const topic of syllabusTopics.data ?? []) {
    const progress = Array.isArray(topic.syllabus_progress) ? topic.syllabus_progress[0] : topic.syllabus_progress;
    const subject = Array.isArray(topic.subjects) ? topic.subjects[0] : topic.subjects;
    const target = Number(topic.target_lessons) || 0;
    const current = subjectsById.get(topic.subject_id) ?? {
      name: subject?.name ?? 'Subject',
      target: 0,
      completed: 0,
    };
    current.target += target;
    current.completed += Math.min(Number(progress?.lessons_completed ?? 0), target);
    subjectsById.set(topic.subject_id, current);
  }
  const syllabusRows = [...subjectsById.values()]
    .map((subject) => ({
      ...subject,
      percent: subject.target ? Math.round((subject.completed / subject.target) * 100) : 0,
    }))
    .sort((left, right) => left.percent - right.percent);
  const totalSyllabusTarget = syllabusRows.reduce((sum, row) => sum + row.target, 0);
  const totalSyllabusCompleted = syllabusRows.reduce((sum, row) => sum + row.completed, 0);
  const syllabusPercent = totalSyllabusTarget
    ? Math.round((totalSyllabusCompleted / totalSyllabusTarget) * 100)
    : null;

  const approvalCount = (attendanceApprovals.data ?? [])
    .filter((day) => day.student_attendance.length > 0 || day.staff_attendance.length > 0).length;
  const examList = examRows.data ?? [];
  const upcomingExams = examList
    .filter((exam) => exam.starts_on && exam.starts_on >= today)
    .sort((left, right) => (left.starts_on ?? '').localeCompare(right.starts_on ?? ''))
    .slice(0, 5);
  const examSummary = canViewExams && selectedYear && !examRows.error
    ? await loadLatestPublishedExam(supabase, schoolId, examList)
    : { data: null, error: examRows.error };

  const attentionItems: Array<{ label: string; detail: string; href: string }> = [];
  if (canViewFinance && finance.data && finance.data.studentsWithBalance > 0) {
    attentionItems.push({
      label: `${numberFormat.format(finance.data.studentsWithBalance)} students have an outstanding balance`,
      detail: 'Review balances for the selected academic year.',
      href: `/dashboard/finance/outstanding?academic_year_id=${selectedYear?.id ?? ''}`,
    });
  }
  if (canApproveAttendance && approvalCount > 0) {
    attentionItems.push({
      label: `${numberFormat.format(approvalCount)} attendance submissions need approval`,
      detail: 'Review submitted attendance days.',
      href: '/dashboard/attendance/approval',
    });
  }
  const attentionFailed = (canViewFinance && finance.error)
    || (canApproveAttendance && attendanceApprovals.error);

  const performance: Array<{ label: string; percent: number }> = [];
  if (!attendanceDays.error && todayRecorded > 0) {
    performance.push({
      label: 'Student attendance (present + late)',
      percent: Math.round(((todayPresent + todayLate) / todayRecorded) * 100),
    });
  }
  if (!attendanceDays.error && todayAttendance && canViewStaff && !staff.error && (staff.value ?? 0) > 0) {
    performance.push({
      label: 'Staff attendance',
      percent: Math.round((staffSignedIn / (staff.value ?? 1)) * 100),
    });
  }
  if (!finance.error && finance.data) {
    const expected = finance.data.totalCharges + finance.data.totalAdjustments;
    if (expected > 0) {
      performance.push({
        label: 'Fee collection',
        percent: Math.round((finance.data.totalAllocatedPayments / expected) * 100),
      });
    }
  }
  if (syllabusPercent !== null) performance.push({ label: 'Syllabus completion', percent: syllabusPercent });
  if (examSummary.data?.average !== null && examSummary.data?.average !== undefined) {
    performance.push({ label: 'Examination average', percent: Math.round(examSummary.data.average * 10) / 10 });
  }

  const quickActions: Array<{ label: string; href: string; icon: typeof Users }> = [];
  if (canAddStudents) quickActions.push({ label: 'Add student', href: '/dashboard/students/add', icon: Users });
  if (canAddStaff) quickActions.push({ label: 'Register staff', href: '/dashboard/staff/add', icon: GraduationCap });
  if (canEditSettings) quickActions.push({ label: 'Manage classes & subjects', href: '/dashboard/settings/academics', icon: School });
  if (canManageUsers) quickActions.push({ label: 'Manage user access', href: '/dashboard/staff/access', icon: Users });
  if (canManageRoles) quickActions.push({ label: 'Manage roles & permissions', href: '/dashboard/staff/roles', icon: ShieldCheck });
  if (canRecordPayments) quickActions.push({ label: 'Record payment', href: '/dashboard/finance/payments', icon: CreditCard });
  else if (canViewFinance) quickActions.push({ label: 'View payments', href: '/dashboard/finance/payments', icon: CreditCard });
  if (canCreateExams) quickActions.push({ label: 'Create examination', href: '/dashboard/exams', icon: ClipboardCheck });
  if (canEnterMarks) quickActions.push({ label: 'Enter exam results', href: '/dashboard/exams/marks', icon: ClipboardCheck });
  if (canMarkAttendance) quickActions.push({ label: 'Manage attendance', href: '/dashboard/attendance/class', icon: CalendarCheck });
  if (canViewAttendance && !canMarkAttendance) quickActions.push({ label: 'View attendance', href: '/dashboard/attendance/history', icon: CalendarCheck });
  if (canApproveAttendance) quickActions.push({ label: 'Approve attendance', href: '/dashboard/attendance/approval', icon: CalendarCheck });

  const dashboardTabs = [
    { label: 'Overview', href: '#overview', show: true },
    { label: 'Performance', href: '#performance', show: true },
    { label: 'Attendance', href: '#attendance', show: canViewAttendance || canMarkAttendance || canApproveAttendance },
    { label: 'Finance', href: '#finance', show: canViewFinance },
    { label: 'Academics', href: '#academics', show: canViewSyllabus || canViewExams },
    { label: 'Upcoming', href: '#upcoming', show: canViewExams },
    { label: 'Quick actions', href: '#quick-actions', show: quickActions.length > 0 },
  ].filter((tab) => tab.show);

  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-border bg-white p-4 shadow-card sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-paper">
              {session.school.logoUrl
                ? <Image src={session.school.logoUrl} alt="" width={56} height={56} className="h-full w-full object-contain" />
                : <School className="text-brand" size={26} aria-hidden="true" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-brand-dark">{session.school.name}</p>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                {greeting()}, {name}
              </h2>
              <p className="help-text mt-1">Here&apos;s your school&apos;s overview for today.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <form method="get" action="/dashboard" className="grid grid-cols-2 gap-2 sm:min-w-[22rem]">
              <div>
                <label className="label-text" htmlFor="academic_year_id">Academic year</label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-ink"
                  id="academic_year_id"
                  name="academic_year_id"
                  defaultValue={selectedYear?.id ?? ''}
                  disabled={yearsResult.error || years.length === 0}
                >
                  {years.length === 0 && <option value="">No academic year</option>}
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>{year.name}{year.is_current ? ' · Current' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label-text">Term</span>
                <p className="mt-1 flex h-10 items-center rounded-md border border-border bg-paper px-3 text-sm text-muted">
                  Not configured
                </p>
              </div>
              <button
                className="col-span-2 h-9 rounded-md border border-border px-3 text-sm font-medium text-ink hover:bg-paper disabled:opacity-50"
                type="submit"
                disabled={yearsResult.error || years.length === 0}
              >
                Apply academic year
              </button>
            </form>
            {quickActions.length > 0 && (
              <Link href="#quick-actions" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark">
                Quick actions <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
        {yearsResult.error && <div className="mt-4"><SectionError>Academic year context could not be loaded.</SectionError></div>}
      </header>

      <nav aria-label="Dashboard sections" className="sticky top-0 z-20 -mx-4 overflow-x-auto border-y border-border bg-paper/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <ul className="flex min-w-max gap-2">
          {dashboardTabs.map((tab, index) => (
            <li key={tab.href}>
              <a
                href={tab.href}
                className={`inline-flex items-center rounded-full border px-3.5 py-2 text-sm font-medium transition-colors hover:border-brand/40 hover:bg-brand-light hover:text-brand-dark focus-visible:outline ${index === 0 ? 'border-brand bg-brand text-white hover:bg-brand-dark hover:text-white' : 'border-border bg-white text-ink-soft'}`}
              >
                {tab.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="overview" aria-label="School overview" className="scroll-mt-20">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {canViewStudents && (
            <KpiCard
              label="Students"
              value={students.value}
              detail="Active students registered in a class"
              href="/dashboard/students"
              icon={Users}
              error={students.error}
            />
          )}
          {(canViewStaff || canViewUsers) && (
            <KpiCard
              label="Staff & users"
              value={canViewStaff ? staff.value : activeUsers.value}
              detail={canViewUsers ? `${activeUsers.error ? 'Active accounts unavailable' : numberFormat.format(activeUsers.value ?? 0)} active accounts` : 'Registered staff'}
              href={canViewStaff ? '/dashboard/staff' : canManageUsers ? '/dashboard/staff/access' : undefined}
              icon={GraduationCap}
              error={canViewStaff ? staff.error : activeUsers.error}
            />
          )}
          {canViewAcademicStructure && (
            <>
              <KpiCard
                label="Classes"
                value={classes.value}
                detail="Configured school classes"
                href={canEditSettings ? '/dashboard/settings/academics' : undefined}
                icon={School}
                error={classes.error}
              />
              <KpiCard
                label="Subjects"
                value={subjects.value}
                detail="Configured school subjects"
                href={canEditSettings ? '/dashboard/settings/academics' : undefined}
                icon={BookOpen}
                error={subjects.error}
              />
            </>
          )}
        </div>
      </section>

      <div id="performance" className="scroll-mt-20 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>School performance</CardTitle>
            <span className="text-xs text-muted">{selectedYear?.name ?? 'No academic year selected'}</span>
          </CardHeader>
          {!selectedYear && !yearsResult.error ? (
            <p className="help-text">Create an academic year to see year-specific performance.</p>
          ) : (
            <>
              {yearsResult.error && <SectionError>Academic year context is unavailable, so year-specific performance cannot be shown.</SectionError>}
              {performance.length ? (
                <div className="space-y-4">
                  {performance.map((item) => (
                    <div key={item.label}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                        <span className="text-ink-soft">{item.label}</span>
                        <span className="shrink-0 font-semibold text-ink">{item.percent}%</span>
                      </div>
                      <Progress value={item.percent} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="help-text">Performance metrics will appear here when the selected year has attendance, finance, syllabus, or published examination data.</p>
              )}
              {(attendanceDays.error || staffAttendance.error) && <SectionError>Attendance performance is unavailable.</SectionError>}
              {finance.error && canViewFinance && <SectionError>Fee collection performance is unavailable.</SectionError>}
              {syllabusTopics.error && canViewSyllabus && <SectionError>Syllabus performance is unavailable.</SectionError>}
              {examSummary.error && canViewExams && <SectionError>Examination performance is unavailable.</SectionError>}
            </>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Attention required</CardTitle>
            <span className="text-xs text-muted">{selectedYear?.name ?? 'Selected year'}</span>
          </CardHeader>
          <div className="space-y-3">
            {attentionItems.map((item) => (
              <Link key={item.label} href={item.href} className="flex items-start gap-3 rounded-md border border-amber/30 bg-amber-light/40 p-3 hover:border-amber/60">
                <span className="mt-0.5 text-amber-dark"><CalendarCheck size={17} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{item.detail}</span>
                </span>
                <ArrowRight size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
              </Link>
            ))}
            {attentionFailed && <SectionError>Some attention checks could not be loaded.</SectionError>}
            {!attentionItems.length && yearsResult.error && <SectionError>Academic year context is unavailable, so attention items cannot be checked.</SectionError>}
            {!attentionItems.length && !attentionFailed && !selectedYear && !yearsResult.error && (
              <p className="help-text">Set up an academic year before reviewing year-specific attention items.</p>
            )}
            {!attentionItems.length && !attentionFailed && selectedYear && !canViewFinance && !canApproveAttendance && (
              <p className="help-text">No attention checks are available for your permissions.</p>
            )}
            {!attentionItems.length && !attentionFailed && selectedYear && (canViewFinance || canApproveAttendance) && (
              <div className="flex items-center gap-3 rounded-md border border-brand/20 bg-brand-light/40 p-4">
                <CheckCircle2 size={20} className="shrink-0 text-brand-dark" aria-hidden="true" />
                <p className="text-sm font-medium text-brand-dark">Everything is up to date.</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div id="attendance" className="scroll-mt-20 grid gap-4 xl:grid-cols-2">
        {(canViewAttendance || canMarkAttendance || canApproveAttendance) && (
          <Card>
            <CardHeader>
              <CardTitle>Attendance overview</CardTitle>
              {(canViewAttendance || canMarkAttendance || canApproveAttendance) && (
                <Link href={canViewAttendance
                  ? '/dashboard/attendance/history'
                  : canMarkAttendance
                    ? '/dashboard/attendance/class'
                    : '/dashboard/attendance/approval'} className="text-sm font-medium text-brand-dark hover:underline">
                  View attendance
                </Link>
              )}
            </CardHeader>
            {attendanceDays.error || staffAttendance.error ? <SectionError>Attendance data could not be loaded.</SectionError>
              : yearsResult.error ? <SectionError>Academic year context is unavailable, so attendance cannot be filtered safely.</SectionError>
                : !selectedYear ? <p className="help-text">Set up an academic year to view attendance by year.</p>
                  : !todayIsInYear ? <p className="help-text">Today is outside the selected academic year.</p>
                    : (
                    <>
                      {todayAttendance ? (
                        <>
                          <div className="grid grid-cols-3 gap-2">
                            <AttendanceStat label="Present" value={todayPresent} tone="text-brand-dark" />
                            <AttendanceStat label="Absent" value={todayAbsent} tone="text-danger" />
                            <AttendanceStat label="Late" value={todayLate} tone="text-amber-dark" />
                          </div>
                          {canViewStaff && staffAttendance.data?.some((record) => record.attendance_day_id === todayAttendance.id) && (
                            <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
                              Staff signed in: <span className="font-semibold text-ink">{numberFormat.format(staffSignedIn)}</span>
                            </p>
                          )}
                        </>
                      ) : <p className="help-text">No attendance has been submitted for today.</p>}
                      {days.length > 0 && (
                        <div className="mt-5 border-t border-line pt-4">
                          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Recent school days</p>
                          <div className="space-y-2.5">
                            {days.slice(0, 5).map((day) => {
                              const statuses = day.student_attendance ?? [];
                              const counted = statuses.filter((record) => ['present', 'absent', 'late'].includes(record.status)).length;
                              const attended = statuses.filter((record) => ['present', 'late'].includes(record.status)).length;
                              const percent = counted ? Math.round((attended / counted) * 100) : 0;
                              return (
                                <div key={day.id} className="flex items-center gap-3 text-xs">
                                  <span className="w-14 shrink-0 text-muted">{dateFormat.format(new Date(`${day.attendance_date}T00:00:00`))}</span>
                                  <Progress value={percent} className="h-1.5" />
                                  <span className="w-9 text-right font-medium text-ink">{counted ? `${percent}%` : '—'}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
          </Card>
        )}

        {canViewFinance && (
          <Card id="finance" className="scroll-mt-20">
            <CardHeader>
              <CardTitle>Finance overview</CardTitle>
              {selectedYear && <Link href={`/dashboard/finance?academic_year_id=${selectedYear.id}`} className="text-sm font-medium text-brand-dark hover:underline">View finance</Link>}
            </CardHeader>
            {yearsResult.error ? <SectionError>Academic year context could not be loaded.</SectionError>
              : !selectedYear ? <p className="help-text">Set up an academic year to view year-specific balances.</p>
              : finance.error ? <SectionError>Finance data could not be loaded.</SectionError>
                : finance.data ? (
                  <>
                    <p className="mb-4 text-xs text-muted">Balances for academic year {selectedYear.name}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <FinanceStat label="Expected" value={finance.data.totalCharges + finance.data.totalAdjustments} />
                      <FinanceStat label="Collected" value={finance.data.totalAllocatedPayments} />
                      <FinanceStat label="Outstanding" value={finance.data.totalOutstanding} />
                      <FinanceStat
                        label="Collection"
                        value={finance.data.totalCharges + finance.data.totalAdjustments > 0
                          ? `${Math.round((finance.data.totalAllocatedPayments / (finance.data.totalCharges + finance.data.totalAdjustments)) * 100)}%`
                          : '—'}
                      />
                    </div>
                    {finance.data.totalCharges + finance.data.totalAdjustments > 0 && (
                      <Progress
                        value={(finance.data.totalAllocatedPayments / (finance.data.totalCharges + finance.data.totalAdjustments)) * 100}
                        className="mt-4"
                      />
                    )}
                  </>
                ) : <p className="help-text">No finance summary is available for this academic year.</p>}
          </Card>
        )}
      </div>

      <div id="academics" className="scroll-mt-20 grid gap-4 xl:grid-cols-2">
        {canViewSyllabus && (
          <Card>
            <CardHeader>
              <CardTitle>Syllabus progress</CardTitle>
              <Link href="/dashboard/syllabus" className="text-sm font-medium text-brand-dark hover:underline">View syllabus</Link>
            </CardHeader>
            {syllabusTopics.error ? <SectionError>Syllabus data could not be loaded.</SectionError>
              : !selectedYear ? <p className="help-text">Set up an academic year to view syllabus progress.</p>
                : syllabusRows.length ? (
                  <div className="space-y-4">
                    {syllabusRows.slice(0, 5).map((row) => (
                      <div key={row.name}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-medium text-ink">{row.name}</span>
                          <span className="shrink-0 text-muted">{row.percent}%</span>
                        </div>
                        <Progress value={row.percent} />
                      </div>
                    ))}
                  </div>
                ) : <p className="help-text">No syllabus topics have been recorded for {selectedYear.name}.</p>}
          </Card>
        )}

        {canViewExams && (
          <Card id="upcoming" className="scroll-mt-20">
            <CardHeader>
              <CardTitle>Academic performance</CardTitle>
              <Link href="/dashboard/exams/results" className="text-sm font-medium text-brand-dark hover:underline">View results</Link>
            </CardHeader>
            {yearsResult.error ? <SectionError>Academic year context could not be loaded.</SectionError>
              : !selectedYear ? <p className="help-text">Set up an academic year to view examination results.</p>
              : examSummary.error ? <SectionError>Examination performance could not be loaded.</SectionError>
                : examSummary.data ? (
                  <>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-ink">{examSummary.data.exam.name}</p>
                        <p className="text-xs text-muted">{examSummary.data.exam.term} · {numberFormat.format(examSummary.data.students)} published results</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted">Overall average</p>
                        <p className="text-xl font-semibold text-ink">{examSummary.data.average === null ? '—' : `${examSummary.data.average.toFixed(1)}%`}</p>
                      </div>
                    </div>
                    {examSummary.data.divisions.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                        {examSummary.data.divisions.map(([division, count]) => (
                          <span key={division} className="rounded-full border border-border px-3 py-1 text-xs text-ink-soft">
                            Division {division}: <strong>{numberFormat.format(count)}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : <p className="help-text">No published examination results are available for {selectedYear.name}.</p>}
          </Card>
        )}
      </div>

      {canViewExams && (
        <Card>
          <CardHeader><CardTitle>Upcoming</CardTitle></CardHeader>
          {yearsResult.error ? <SectionError>Academic year context could not be loaded.</SectionError>
            : canViewExams && examRows.error ? <SectionError>Upcoming examination dates could not be loaded.</SectionError>
            : upcomingExams.length ? (
              <ul className="divide-y divide-line">
                {upcomingExams.map((exam) => (
                  <li key={exam.id} className="flex items-center gap-3 py-3">
                    <CalendarDays size={17} className="shrink-0 text-brand-dark" aria-hidden="true" />
                    <span className="w-14 shrink-0 text-sm font-semibold text-ink">{dateFormat.format(new Date(`${exam.starts_on}T00:00:00`))}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{exam.name} <span className="text-muted">· {exam.term}</span></span>
                    <Link href="/dashboard/exams" className="text-xs font-medium text-brand-dark hover:underline">Details</Link>
                  </li>
                ))}
              </ul>
            ) : <p className="help-text">No upcoming examination dates are scheduled for {selectedYear?.name ?? 'this year'}.</p>}
        </Card>
      )}

      <section id="quick-actions" className="scroll-mt-20">
        <Card>
          <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
          {quickActions.length ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {quickActions.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm font-medium text-ink-soft hover:border-brand/40 hover:bg-paper">
                  <span className="rounded-md bg-brand-light p-2 text-brand-dark"><Icon size={17} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">{label}</span>
                  <ArrowRight size={15} className="shrink-0 text-muted" aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : <p className="help-text">There are no quick actions available for your account permissions.</p>}
        </Card>
      </section>
    </div>
  );
}

function AttendanceStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border bg-paper/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone}`}>{numberFormat.format(value)}</p>
    </div>
  );
}

function FinanceStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-paper/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 break-words text-base font-semibold text-ink sm:text-lg">
        {typeof value === 'number' ? currencyFormat.format(value) : value}
      </p>
    </div>
  );
}
