'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Subject = { id: string; name: string };
type Mark = { score: number | null; grade: string | null; passed: boolean | null };
type Row = { id: string; admissionNumber: string; name: string; subjects: Record<string, Mark>; total: number | null; average: number | null; points: number | null; division: string | null; position: number | null; status: string; studentId: string };
type SortKey = 'total' | 'average' | 'points' | 'position';

export function ClassResultsTable({ rows, subjects, examinationId, classId, canEdit }: { rows: Row[]; subjects: Subject[]; examinationId?: string; classId?: string; canEdit: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'position', direction: 'asc' });
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    const empty = sort.direction === 'asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
    const difference = Number(left[sort.key] ?? empty) - Number(right[sort.key] ?? empty);
    return difference * (sort.direction === 'asc' ? 1 : -1);
  }), [rows, sort]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const visibleRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);
  const setSortKey = (key: SortKey) => {
    setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: key === 'position' ? 'asc' : 'desc' });
    setPage(1);
  };
  const exportCsv = () => {
    const header = ['No.', 'Admission no.', 'Student', ...subjects.map((subject) => subject.name), 'Total', 'Average', 'Points', 'Division', 'Position', 'Status'];
    const lines = [header, ...sortedRows.map((row, index) => [index + 1, row.admissionNumber, row.name, ...subjects.map((subject) => { const mark = row.subjects[subject.id]; return mark?.score == null ? '' : `${mark.score} (${mark.grade ?? ''})`; }), row.total ?? '', row.average?.toFixed(2) ?? '', row.points ?? '', row.division ?? '', row.position ?? '', row.status])].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'class-results.csv'; anchor.click(); URL.revokeObjectURL(url);
  };
  const reportQuery = `class_id=${classId ?? ''}${examinationId ? `&examination_id=${examinationId}` : ''}`;

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="help-text">{rows.length} student result{rows.length === 1 ? '' : 's'} · {subjects.length} subjects · page {page} of {totalPages}</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => window.print()} className="rounded-md border border-border px-3 py-2 text-sm font-medium">Print results</button><button type="button" onClick={exportCsv} className="rounded-md border border-border px-3 py-2 text-sm font-medium">Export Excel</button><Link href={`/api/exams/reports/pdf?${reportQuery}`} className="rounded-md border border-border px-3 py-2 text-sm font-medium">Export PDF</Link><Link href={`/dashboard/exams/reports?${reportQuery}`} className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white">Generate report cards</Link></div></div>
    <div className="overflow-auto rounded-md border border-border" style={{ maxHeight: '65vh' }}><table className="min-w-max border-collapse text-left text-sm"><thead className="sticky top-0 z-20 bg-ink text-white"><tr><Header label="No." className="sticky left-0 z-30 bg-ink" /><Header label="Adm No." className="sticky left-12 z-30 bg-ink" /><Header label="Student Name" className="sticky left-36 z-30 min-w-56 bg-ink" />{subjects.map((subject) => <Header key={subject.id} label={subject.name} className="min-w-24 text-center" />)}<SortHeader label="Total" active={sort.key === 'total'} direction={sort.direction} onClick={() => setSortKey('total')} /><SortHeader label="Average" active={sort.key === 'average'} direction={sort.direction} onClick={() => setSortKey('average')} /><SortHeader label="Points" active={sort.key === 'points'} direction={sort.direction} onClick={() => setSortKey('points')} /><Header label="Division" /><SortHeader label="Position" active={sort.key === 'position'} direction={sort.direction} onClick={() => setSortKey('position')} /><Header label="Status" /><Header label="Actions" /></tr></thead><tbody>{visibleRows.map((row, index) => <tr key={row.id} className="border-b border-line align-middle"><td className="sticky left-0 z-10 border-r border-line bg-white px-3 py-3">{(page - 1) * pageSize + index + 1}</td><td className="sticky left-12 z-10 border-r border-line bg-white px-3 py-3 font-medium">{row.admissionNumber}</td><td className="sticky left-36 z-10 min-w-56 border-r border-line bg-white px-3 py-3 font-medium">{row.name}</td>{subjects.map((subject) => { const mark = row.subjects[subject.id]; const missing = !mark || mark.score === null; return <td key={subject.id} className={`px-3 py-2 text-center ${missing ? 'bg-amber-50 text-amber-800' : mark.passed === false ? 'bg-red-50 text-red-700' : mark.passed === true ? 'bg-emerald-50 text-emerald-700' : ''}`}>{missing ? 'Missing' : <><strong className="block">{mark.score}</strong><span className="text-xs">{mark.grade ?? 'No grade'}</span></>}</td>; })}<td className="px-3 py-3">{row.total ?? '—'}</td><td className="px-3 py-3">{row.average?.toFixed(2) ?? '—'}</td><td className="px-3 py-3">{row.points ?? '—'}</td><td className="px-3 py-3">{row.division ?? '—'}</td><td className="px-3 py-3 font-semibold">{row.position ?? '—'}</td><td className="px-3 py-3">{row.status}</td><td className="px-3 py-3"><div className="flex gap-2 whitespace-nowrap"><Link href={`/dashboard/exams/reports?${reportQuery}`} className="text-brand-dark hover:underline">View</Link>{canEdit && <Link href={`/dashboard/exams/marks?${reportQuery}&student_id=${row.studentId}`} className="text-brand-dark hover:underline">Edit</Link>}</div></td></tr>)}</tbody></table></div>{!visibleRows.length && <p className="rounded-md border border-border p-5 text-sm text-muted">No results found for these filters.</p>}<div className="flex justify-end gap-2"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-40">Previous</button><button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-40">Next</button></div>
  </div>;
}

function Header({ label, className = '' }: { label: string; className?: string }) { return <th className={`border-b border-white/20 px-3 py-3 font-semibold ${className}`}>{label}</th>; }
function SortHeader({ label, active, direction, onClick }: { label: string; active: boolean; direction: 'asc' | 'desc'; onClick: () => void }) { return <th className="border-b border-white/20 px-3 py-3"><button type="button" onClick={onClick} className="font-semibold hover:text-brand-light">{label}{active ? ` ${direction === 'asc' ? '↑' : '↓'}` : ''}</button></th>; }
