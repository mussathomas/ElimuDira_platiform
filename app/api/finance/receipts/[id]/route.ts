import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { renderFinancePdf } from '@/lib/finance/pdf';
import { schoolObjectKey, uploadObject, getSignedDownloadUrl, objectExists } from '@/lib/storage/r2';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('view_financial_statements');
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const schoolId = session.school!.id;
    const [{ data: payment }, { data: school }] = await Promise.all([
      supabase.from('fee_payments').select('id, student_id, academic_year_id, student_enrollment_id, received_by, amount, payment_date, method, reference, receipt_number, receipt_path, students!inner(admission_number, first_name, last_name), student_enrollments!inner(classes(name), academic_years(name)), fee_payment_allocations(amount, fee_assessments(description, finance_fee_categories(name)))').eq('id', id).eq('school_id', schoolId).eq('legacy_year_unassigned', false).maybeSingle(),
      supabase.from('schools').select('name, logo_path, phone, email, address').eq('id', schoolId).maybeSingle(),
    ]);
    if (!payment || !school) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
    const { data: receivedBy } = await supabase.from('profiles').select('full_name').eq('id', payment.received_by).eq('school_id', schoolId).maybeSingle();

    let receiptPath = payment.receipt_path;
    if (!receiptPath) {
      const { data: path, error: pathError } = await supabase.rpc('finance_store_receipt_path', { p_payment_id: payment.id });
      if (pathError || !path) return NextResponse.json({ error: 'Unable to prepare this receipt.' }, { status: 500 });
      receiptPath = path;
    }

    if (!(await objectExists(receiptPath))) {
      const student = Array.isArray(payment.students) ? payment.students[0] : payment.students;
      const enrollment = Array.isArray(payment.student_enrollments) ? payment.student_enrollments[0] : payment.student_enrollments;
      const schoolClass = Array.isArray(enrollment?.classes) ? enrollment.classes[0] : enrollment?.classes;
      const academicYear = Array.isArray(enrollment?.academic_years) ? enrollment.academic_years[0] : enrollment?.academic_years;
      const allocations = (payment.fee_payment_allocations ?? []).map((allocation: any) => {
        const charge = Array.isArray(allocation.fee_assessments) ? allocation.fee_assessments[0] : allocation.fee_assessments;
        const category = Array.isArray(charge?.finance_fee_categories) ? charge.finance_fee_categories[0] : charge?.finance_fee_categories;
        return [`${category?.name ? `${category.name} · ` : ''}${charge?.description ?? 'Student charge'}`, Number(allocation.amount).toFixed(2)];
      });
      const pdf = await renderFinancePdf({
        title: 'Official payment receipt',
        school: { name: school.name, contact: [school.address, school.phone, school.email].filter(Boolean).join(' · '), logoPath: school.logo_path },
        details: [
          ['Receipt number', payment.receipt_number],
          ['Student', `${student?.first_name ?? ''} ${student?.last_name ?? ''}`.trim()],
          ['Student ID', student?.admission_number ?? '—'],
          ['Class', schoolClass?.name ?? '—'],
          ['Academic year', academicYear?.name ?? '—'],
          ['Payment date', payment.payment_date],
          ['Payment method', String(payment.method).replaceAll('_', ' ')],
          ['Reference', payment.reference ?? '—'],
          ['Amount received', `TZS ${Number(payment.amount).toFixed(2)}`],
          ['Received by', receivedBy?.full_name ?? 'Staff member'],
        ],
        columns: [{ label: 'Allocation', width: 390 }, { label: 'Amount (TZS)', width: 134, align: 'right' }],
        rows: allocations,
      });
      await uploadObject(receiptPath, pdf, 'application/pdf');
      await supabase.from('audit_logs').insert({ school_id: schoolId, actor_id: session.userId, action: 'finance.receipt.generate', resource_type: 'fee_payment', resource_id: payment.id, metadata: { receipt_number: payment.receipt_number, object_key: receiptPath } });
    }

    return NextResponse.redirect(await getSignedDownloadUrl(receiptPath, 3600, `receipt-${payment.receipt_number}.pdf`));
  } catch (error) {
    console.error('finance receipt generation', error);
    return NextResponse.json({ error: 'Unable to generate the receipt.' }, { status: 500 });
  }
}