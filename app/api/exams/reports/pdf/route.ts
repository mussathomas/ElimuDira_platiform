import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { requirePermission } from '@/lib/permissions/session';
import { loadStudentReports } from '@/lib/reports/student-reports';

export async function GET(request: Request) {
  const session = await requirePermission('download_reports');
  const url = new URL(request.url);
  const classId = url.searchParams.get('class_id') || undefined;
  const examinationId = url.searchParams.get('examination_id') || undefined;
  const academicYearId = url.searchParams.get('academic_year_id') || undefined;
  const term = url.searchParams.get('term') || undefined;
  const educationLevelId = url.searchParams.get('education_level_id') || undefined;
  const streamId = url.searchParams.get('stream_id') || undefined;
  const gender = url.searchParams.get('gender') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const data = await loadStudentReports(session.school!.id, classId, examinationId, { academicYearId, term, educationLevelId, streamId, gender });
  if (status) {
    data.results = (data.results as any[]).filter((result) => result.status === status);
    const matchingStudentIds = new Set((data.results as any[]).map((result) => result.student_id));
    data.students = (data.students as any[]).filter((student) => matchingStudentIds.has(student.id));
  }
  if (url.searchParams.get('format') === 'class-roster') return createClassRosterPdf(data, session.school!.name, classId, examinationId);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const student of data.students as any[]) {
    const summaries = (data.results as any[]).filter((result) => result.student_id === student.id);
    let page = pdf.addPage([595, 842]);
    let y = drawStudentHeader(page, student, data.school, session.school!.name, font, bold, pdf.getPageCount());
    const startContinuation = (summary: any, includeTableHeader = true) => {
      page = pdf.addPage([595, 842]);
      y = drawStudentHeader(page, student, data.school, session.school!.name, font, bold, pdf.getPageCount(), true);
      y = drawExamHeading(page, summary, y, font, bold, true);
      if (includeTableHeader) y = drawTableHeader(page, y, bold);
    };

    for (const summary of summaries) {
      const studentMarks = (data.marks as any[])
        .filter((mark) => mark.student_id === student.id && mark.examination_id === summary.examination_id)
        .sort((left, right) => String(relation(left.subjects)?.name ?? '').localeCompare(String(relation(right.subjects)?.name ?? '')));
      if (y < 160) {
        startContinuation(summary);
      } else {
        y = drawExamHeading(page, summary, y, font, bold);
        y = drawTableHeader(page, y, bold);
      }
      const marksToPrint = studentMarks.length ? studentMarks : [{ subjects: { name: 'No subject marks recorded' }, score: null, grade: null, points: null, remark: '' }];
      for (const mark of marksToPrint) {
        const cells = [
          String(relation(mark.subjects)?.name ?? 'Subject'),
          mark.score == null ? 'Pending' : String(mark.score),
          String(mark.grade ?? '-'),
          String(mark.points ?? '-'),
          String(mark.remark ?? '-'),
        ];
        const lines = cells.map((value, index) => wrapText(value, (TABLE_COLUMN_WIDTHS[index] ?? 12) - 12, font, 8));
        const rowHeight = Math.max(21, Math.max(...lines.map((cellLines) => cellLines.length)) * 10 + 8);
        if (y - rowHeight < 54) {
          startContinuation(summary);
        }
        page.drawRectangle({ x: TABLE_X, y: y - rowHeight, width: TABLE_WIDTH, height: rowHeight, color: studentMarks.indexOf(mark) % 2 === 0 ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1), borderColor: rgb(0.82, 0.85, 0.88), borderWidth: 0.45 });
        let x = TABLE_X;
        cells.forEach((_cell, index) => {
          (lines[index] ?? []).forEach((line, lineIndex) => page.drawText(line, {
            x: x + 6,
            y: y - 13 - lineIndex * 10,
            size: 8,
            font,
            color: rgb(0.08, 0.12, 0.16),
          }));
          x += TABLE_COLUMN_WIDTHS[index] ?? 0;
          if (index < cells.length - 1) {
            page.drawLine({ start: { x, y }, end: { x, y: y - rowHeight }, thickness: 0.35, color: rgb(0.82, 0.85, 0.88) });
          }
        });
        y -= rowHeight;
      }
      if (y < 128) startContinuation(summary, false);
      y = drawResultSummary(page, summary, y, font, bold);
      y -= 14;
    }
    if (!summaries.length) {
      page.drawText('No processed results are available for this student under the selected filters.', { x: 42, y, size: 9, font, color: rgb(0.35, 0.39, 0.43) });
    }
  }

  if (!data.students.length) {
    const page = pdf.addPage([595, 842]);
    page.drawText('No student reports are available for the selected filters.', { x: 42, y: 780, size: 12, font });
  }

  const bytes = await pdf.save();
  const className = (data.classes as any[]).find((item) => item.id === classId)?.name ?? 'all-classes';
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${className.replace(/[^a-z0-9-_]+/gi, '-')}-reports.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

const TABLE_X = 42;
const TABLE_WIDTH = 511;
const TABLE_COLUMN_WIDTHS = [174, 72, 66, 66, 133];
const TABLE_HEADERS = ['Subject', 'Score', 'Grade', 'Points', 'Remark'];

function relation(value: any) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function drawStudentHeader(page: PDFPage, student: any, school: any, fallbackSchoolName: string, font: any, bold: any, pageNumber: number, continuation = false) {
  let y = 800;
  const draw = (text: string, size: number, isBold = false) => {
    page.drawText(fitText(text, (isBold ? bold : font), size, 511), {
      x: 42,
      y,
      size,
      font: isBold ? bold : font,
      color: rgb(0.08, 0.12, 0.16),
    });
    y -= size + 5;
  };

  draw(school?.name ?? fallbackSchoolName, 16, true);
  const address = [school?.address, school?.region, school?.district].filter(Boolean).join(', ');
  if (address) draw(address, 8);
  const contact = [school?.phone, school?.email].filter(Boolean).join(' | ');
  if (contact) draw(contact, 8);
  if (school?.motto) draw(school.motto, 8);
  y -= 5;
  draw(continuation ? 'STUDENT REPORT CARD - CONTINUED' : 'STUDENT REPORT CARD', 12, true);
  draw(`${student.first_name ?? ''} ${student.last_name ?? ''}`.trim(), 11, true);
  draw(`Admission No: ${student.admission_number ?? '-'}    Class: ${relation(student.classes)?.name ?? 'Unassigned'}`, 9);
  if (student.guardian_name) draw(`Guardian: ${student.guardian_name}`, 9);
  page.drawLine({ start: { x: 42, y: y - 2 }, end: { x: 553, y: y - 2 }, thickness: 1, color: rgb(0.72, 0.76, 0.8) });
  page.drawText(`ElimuDira | Page ${pageNumber}`, { x: 42, y: 24, size: 7, font, color: rgb(0.4, 0.44, 0.48) });
  return y - 16;
}

function drawExamHeading(page: PDFPage, summary: any, y: number, font: any, bold: any, continuation = false) {
  const exam = relation(summary.examinations);
  const year = relation(exam?.academic_years);
  const details = [exam?.term, year?.name].filter(Boolean).join(' | ');
  const title = `${exam?.name ?? 'Examination'}${details ? ` - ${details}` : ''}${continuation ? ' (continued)' : ''}`;
  page.drawText(fitText(title, bold, 10, TABLE_WIDTH), { x: TABLE_X, y, size: 10, font: bold, color: rgb(0.08, 0.12, 0.16) });
  return y - 18;
}

function drawTableHeader(page: PDFPage, y: number, bold: any) {
  const height = 21;
  page.drawRectangle({ x: TABLE_X, y: y - height, width: TABLE_WIDTH, height, color: rgb(0.12, 0.2, 0.29) });
  let x = TABLE_X;
  TABLE_HEADERS.forEach((label, index) => {
    page.drawText(label, { x: x + 6, y: y - 14, size: 8, font: bold, color: rgb(1, 1, 1) });
    x += TABLE_COLUMN_WIDTHS[index] ?? 0;
    if (index < TABLE_HEADERS.length - 1) {
      page.drawLine({ start: { x, y }, end: { x, y: y - height }, thickness: 0.45, color: rgb(0.68, 0.73, 0.78) });
    }
  });
  return y - height;
}

function drawResultSummary(page: PDFPage, summary: any, y: number, font: any, bold: any) {
  const height = 78;
  const bottom = y - height;
  page.drawRectangle({ x: TABLE_X, y: bottom, width: TABLE_WIDTH, height, color: rgb(0.96, 0.97, 0.98), borderColor: rgb(0.78, 0.81, 0.84), borderWidth: 0.7 });
  page.drawText('OVERALL RESULT', { x: TABLE_X + 8, y: y - 13, size: 8, font: bold, color: rgb(0.12, 0.2, 0.29) });

  const firstRow = [
    ['Total', summary.total_marks],
    ['Average', summary.average_mark == null ? '-' : Number(summary.average_mark).toFixed(2)],
    ['Aggregate points', summary.aggregate],
    ['Division', summary.division],
  ];
  const secondRow = [
    ['Position', summary.position],
    ['Subjects passed', summary.pass_count],
    ['Status', summary.overall_status ?? summary.status],
  ];
  const positions = [TABLE_X + 8, TABLE_X + 135, TABLE_X + 260, TABLE_X + 390];
  firstRow.forEach(([label, value], index) => {
    page.drawText(String(label), { x: positions[index], y: y - 30, size: 7, font, color: rgb(0.38, 0.42, 0.46) });
    page.drawText(fitText(String(value ?? '-'), bold, 9, 112), { x: positions[index], y: y - 43, size: 9, font: bold, color: rgb(0.08, 0.12, 0.16) });
  });
  secondRow.forEach(([label, value], index) => {
    const x = positions[index];
    page.drawText(String(label), { x, y: y - 55, size: 7, font, color: rgb(0.38, 0.42, 0.46) });
    page.drawText(fitText(String(value ?? '-'), bold, 8, 112), { x, y: y - 68, size: 8, font: bold, color: rgb(0.08, 0.12, 0.16) });
  });
  return bottom;
}

function wrapText(value: string, maxWidth: number, font: any, size: number) {
  const words = value.split(/\s+/).filter(Boolean);
  if (!words.length) return ['-'];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = fitText(word, font, size, maxWidth);
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(value: string, font: any, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let text = value;
  while (text.length > 1 && font.widthOfTextAtSize(`${text}...`, size) > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}...`;
}

async function createClassRosterPdf(data: any, fallbackSchoolName: string, classId?: string, examinationId?: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([842, 595]);
  const school = data.school;
  const draw = (text: string, x: number, y: number, size = 8, isBold = false) => page.drawText(text.slice(0, 150), { x, y, size, font: isBold ? bold : font, color: rgb(0.08, 0.12, 0.16) });
  let y = 560;
  draw(school?.name ?? fallbackSchoolName, 28, y, 16, true); y -= 18;
  draw([school?.address, school?.region, school?.district].filter(Boolean).join(', '), 28, y); y -= 12;
  draw([school?.phone, school?.email].filter(Boolean).join(' · '), 28, y); y -= 12;
  draw(school?.motto ?? '', 28, y, 8, false); y -= 22;
  const className = (data.classes as any[]).find((item) => item.id === classId)?.name ?? 'All classes';
  const examination = (data.examinations as any[]).find((item) => item.id === examinationId);
  const rosterTitle = `${className} Results${examination ? ` · ${examination.name} · ${examination.term}` : ''}`;
  draw(rosterTitle, 28, y, 12, true); y -= 18;
  const students = data.students as any[];
  const marks = data.marks as any[];
  const results = data.results as any[];
  const subjectMap = new Map<string, string>();
  for (const mark of marks) { const subject = Array.isArray(mark.subjects) ? mark.subjects[0] : mark.subjects; if (mark.subject_id) subjectMap.set(mark.subject_id, subject?.name ?? 'Subject'); }
  const subjects = [...subjectMap.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  const columns = ['No.', 'Adm No.', 'Student', ...subjects.map(([, name]) => name), 'Total', 'Average', 'Points', 'Division', 'Position'];
  const widths = [24, 55, 105, ...subjects.map(() => 55), 45, 48, 45, 48, 45];
  const xFor = (index: number) => 28 + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
  const headerHeight = 24;
  columns.forEach((column, index) => draw(column, xFor(index) + 2, y, 6, true));
  y -= headerHeight;
  for (const [rowIndex, student] of students.entries()) {
    if (y < 35) { page.drawText('Continued on next page', { x: 28, y: 18, size: 7, font }); break; }
    const result = results.find((item) => item.student_id === student.id);
    const studentMarks = marks.filter((mark) => mark.student_id === student.id);
    const values = [rowIndex + 1, student.admission_number ?? '', `${student.first_name ?? ''} ${student.last_name ?? ''}`, ...subjects.map(([id]) => { const mark = studentMarks.find((item) => item.subject_id === id); return mark ? `${mark.score ?? '—'} ${mark.grade ?? ''}` : '—'; }), result?.total_marks ?? '—', result?.average_mark != null ? Number(result.average_mark).toFixed(2) : '—', result?.aggregate ?? '—', result?.division ?? '—', result?.position ?? '—'];
    values.forEach((value, index) => draw(String(value), xFor(index) + 2, y, 6));
    page.drawLine({ start: { x: 28, y: y - 4 }, end: { x: 814, y: y - 4 }, thickness: 0.3, color: rgb(0.75, 0.75, 0.75) });
    y -= 15;
  }
  const bytes = await pdf.save();
  const filename = `${rosterTitle.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-roster.pdf`;
  return new Response(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store' } });
}
