import { requirePermission } from '@/lib/permissions/session';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { loadStudentReports } from '@/lib/reports/student-reports';

export default async function ClassResultsPage({ searchParams }: { searchParams: Promise<{ class_id?: string }> }) {
  const session = await requirePermission('view_exams');
  const params = await searchParams;
  const data = await loadStudentReports(session.school!.id, params.class_id);
  const studentsById = new Map((data.students as any[]).map((student) => [student.id, student]));
  const marksByResult = new Map<string, any[]>();
  for (const mark of data.marks as any[]) {
    const key = `${mark.student_id}-${mark.examination_id}`;
    marksByResult.set(key, [...(marksByResult.get(key) ?? []), mark]);
  }
  const results = (data.results as any[]).map((result) => ({ ...result, class_id: studentsById.get(result.student_id)?.class_id ?? null }));
  const school = data.school;
  const schoolLine = [school?.address, school?.region, school?.district].filter(Boolean).join(', ') || 'School details not configured';

  return <main className="space-y-6">
    <Card><div className="border-b border-border pb-4"><p className="text-lg font-semibold text-ink">{school?.name ?? session.school!.name}</p><p className="help-text">{schoolLine}{school?.phone ? ` · ${school.phone}` : ''}{school?.email ? ` · ${school.email}` : ''}</p>{school?.motto && <p className="help-text italic">{school.motto}</p>}</div><div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-semibold text-ink">Class results</h2><p className="help-text mt-1">{data.selectedClass?.name ?? 'All classes'} · Subjects, marks, grades, points, averages, divisions, and positions.</p></div><form method="get" className="flex items-end gap-2"><div><label className="label-text" htmlFor="class_id">Class</label><Select id="class_id" name="class_id" defaultValue={params.class_id ?? ''}><option value="">All classes</option>{(data.classes as any[]).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div><button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white" type="submit">View</button></form></div></Card>
    <div className="space-y-5">{results.map((result: any) => { const student = studentsById.get(result.student_id); const exam = Array.isArray(result.examinations) ? result.examinations[0] : result.examinations; const rows = marksByResult.get(`${result.student_id}-${result.examination_id}`) ?? []; const total = rows.length ? rows.reduce((sum, row) => sum + Number(row.score ?? 0), 0) : null; const average = rows.length ? (Number(result.average_mark ?? total! / rows.length)).toFixed(2) : 'Pending'; return <Card key={`${result.student_id}-${result.examination_id}`}><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"><div><h3 className="font-semibold text-ink">{student?.first_name} {student?.last_name}</h3><p className="help-text">{student?.admission_number ?? 'No admission number'} · {student?.classes?.name ?? 'Unassigned'} · {exam?.name ?? 'Examination'} ({exam?.term ?? ''})</p></div><p className="text-sm font-semibold text-brand-dark">Position: {result.position ?? 'Pending calculation'}</p></div><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-2 py-2">Subject</th><th className="px-2 py-2">Mark</th><th className="px-2 py-2">Grade</th><th className="px-2 py-2">Point</th><th className="px-2 py-2">Remark</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.subject_id ?? index}`} className="border-b border-line"><td className="px-2 py-2">{row.subjects?.name ?? 'Subject'}</td><td className="px-2 py-2">{row.score ?? 'Pending'}</td><td className="px-2 py-2 font-medium">{row.grade ?? 'Pending'}</td><td className="px-2 py-2">{row.points ?? 'Pending'}</td><td className="px-2 py-2">{row.remark ?? 'Pending'}</td></tr>)}</tbody></table></div><div className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2 lg:grid-cols-6"><span>Total: <strong>{result.total_marks ?? total ?? 'Pending'}</strong></span><span>Average: <strong>{average}</strong></span><span>Points: <strong>{result.aggregate ?? 'Pending'}</strong></span><span>Division: <strong>{result.division ?? 'Not calculated'}</strong></span><span>Position: <strong>{result.position ?? 'Pending calculation'}</strong></span><span>Status: <strong>{result.overall_status ?? 'Awaiting processing'}</strong></span></div></Card>; })}</div>
    {!results.length && <Card><p className="help-text">No marks or processed results are available for this class.</p></Card>}
  </main>;
}
