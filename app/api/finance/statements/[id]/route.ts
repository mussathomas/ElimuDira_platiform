import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getStudentFinancialStatement } from '@/lib/finance/service';
import { renderFinancePdf } from '@/lib/finance/pdf';
import { schoolObjectKey, uploadObject, getSignedDownloadUrl } from '@/lib/storage/r2';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('view_financial_statements');
    const { id } = await params;
    const academicYearId = new URL(request.url).searchParams.get('academic_year_id') ?? '';
    if (!academicYearId) return NextResponse.json({ error: 'Choose an academic year.' }, { status: 400 });
    const statement = await getStudentFinancialStatement(id, academicYearId);
    if (!statement) return NextResponse.json({ error: 'Student statement not found.' }, { status: 404 });
    const supabase = await createServerSupabaseClient();
    const { data: school } = await supabase.from('schools').select('name, logo_path, phone, email, address').eq('id', session.school!.id).maybeSingle();
    if (!school) return NextResponse.json({ error: 'School not found.' }, { status: 404 });

    const rows = statement.transactions.map((transaction) => [
      transaction.date.slice(0, 10),
      `${transaction.description}${transaction.receiptNumber ? ` · ${transaction.receiptNumber}` : ''}`,
      transaction.debit ? transaction.debit.toFixed(2) : '—',
      transaction.credit ? transaction.credit.toFixed(2) : '—',
      transaction.balance.toFixed(2),
    ]);
    rows.push(['', 'Outstanding balance', '', '', statement.outstanding.toFixed(2)]);
    const pdf = await renderFinancePdf({
      title: 'Student financial statement',
      school: { name: school.name, contact: [school.address, school.phone, school.email].filter(Boolean).join(' · '), logoPath: school.logo_path },
      details: [
        ['Student', statement.student.name],
        ['Student ID', statement.student.admissionNumber],
        ['Class', statement.enrollment.className ?? '—'],
        ['Academic year', statement.academicYear.name],
        ['Charges', `TZS ${statement.totalCharges.toFixed(2)}`],
        ['Allocated payments', `TZS ${statement.totalPaid.toFixed(2)}`],
      ],
      columns: [
        { label: 'Date', width: 62 },
        { label: 'Description', width: 204 },
        { label: 'Debit', width: 80, align: 'right' },
        { label: 'Credit', width: 80, align: 'right' },
        { label: 'Balance', width: 98, align: 'right' },
      ],
      rows,
    });
    const path = schoolObjectKey(session.school!.id, 'finance', `statement-${id}-${academicYearId}.pdf`);
    await uploadObject(path, pdf, 'application/pdf');
    await supabase.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'finance.statement.generate', resource_type: 'student', resource_id: id, metadata: { academic_year_id: academicYearId, object_key: path } });
    return NextResponse.redirect(await getSignedDownloadUrl(path, 3600, `statement-${id}-${statement.academicYear.name}.pdf`));
  } catch (error) {
    console.error('finance statement generation', error);
    return NextResponse.json({ error: 'Unable to generate the financial statement.' }, { status: 500 });
  }
}