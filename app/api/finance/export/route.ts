import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvResponse(rows: unknown[][], fileName: string) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'private, no-store',
    },
  });
}

export async function GET(request: Request) {
  const session = await requirePermission('export_finance');
  const search = new URL(request.url).searchParams;
  const report = search.get('report');
  const academicYearId = search.get('academic_year_id') ?? '';
  const classId = search.get('class_id');
  const categoryId = search.get('category_id');
  const minBalance = search.get('min_balance') ? Number(search.get('min_balance')) : null;
  const maxBalance = search.get('max_balance') ? Number(search.get('max_balance')) : null;
  const paymentStatus = search.get('payment_status');
  if (!academicYearId || !['outstanding', 'payments'].includes(report ?? '')) {
    return NextResponse.json({ error: 'Choose an academic year and supported report.' }, { status: 400 });
  }
  if ((minBalance !== null && (!Number.isFinite(minBalance) || minBalance < 0))
    || (maxBalance !== null && (!Number.isFinite(maxBalance) || maxBalance < 0))
    || (minBalance !== null && maxBalance !== null && minBalance > maxBalance)
    || (paymentStatus && !['all', 'unpaid', 'partial'].includes(paymentStatus))) {
    return NextResponse.json({ error: 'Check the outstanding report filters.' }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();
  const { data: year } = await supabase.from('academic_years').select('id, name').eq('id', academicYearId).eq('school_id', session.school!.id).maybeSingle();
  if (!year) return NextResponse.json({ error: 'Academic year not found.' }, { status: 404 });

  if (report === 'outstanding') {
    const rows: unknown[][] = [['Academic year', 'Student ID', 'Student', 'Class', 'Charges', 'Adjustments', 'Paid', 'Outstanding']];
    const query = search.get('q') ?? '';
    for (let page = 1; page <= 1000; page++) {
      const { data, error } = await supabase.rpc('finance_outstanding_report', {
        p_academic_year_id: academicYearId,
        p_class_id: classId || null,
        p_search: query || null,
        p_page: page,
        p_page_size: 100,
        p_fee_category_id: categoryId || null,
        p_min_balance: minBalance,
        p_max_balance: maxBalance,
        p_payment_status: paymentStatus || 'all',
      });
      if (error) return NextResponse.json({ error: 'Unable to export outstanding balances.' }, { status: 500 });
      for (const row of data ?? []) rows.push([year.name, row.admission_number, row.student_name, row.class_name, row.total_charges, row.total_adjustments, row.total_paid, row.balance]);
      if (!data?.length || data.length < 100) break;
    }
    await supabase.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'finance.report.export', resource_type: 'finance_report', resource_id: year.id, metadata: { report, academic_year_id: year.id, class_id: classId } });
    return csvResponse(rows, `outstanding-${year.name}.csv`);
  }

  const rows: unknown[][] = [['Receipt', 'Payment date', 'Student ID', 'Student', 'Class', 'Method', 'Reference', 'Gross amount', 'Approved reversals', 'Net collected']];
  for (let page = 0; page < 1000; page++) {
    let paymentQuery = supabase.from('fee_payments')
      .select('id, receipt_number, payment_date, amount, method, reference, students!inner(admission_number, first_name, last_name), student_enrollments!inner(class_id, classes(name))')
      .eq('school_id', session.school!.id).eq('academic_year_id', year.id).eq('legacy_year_unassigned', false);
    if (classId) paymentQuery = paymentQuery.eq('student_enrollments.class_id', classId);
    const { data, error } = await paymentQuery.order('payment_date', { ascending: false }).range(page * 100, page * 100 + 99);
    if (error) return NextResponse.json({ error: 'Unable to export collections.' }, { status: 500 });
    const paymentIds = (data ?? []).map((payment) => payment.id);
    const { data: reversals } = paymentIds.length ? await supabase.from('finance_adjustments').select('payment_id, amount').eq('school_id', session.school!.id).eq('adjustment_type', 'payment_reversal').eq('status', 'approved').in('payment_id', paymentIds) : { data: [] };
    const reversedByPayment = new Map<string, number>();
    for (const reversal of reversals ?? []) reversedByPayment.set(reversal.payment_id!, (reversedByPayment.get(reversal.payment_id!) ?? 0) + Math.abs(Number(reversal.amount)));
    for (const payment of data ?? []) {
      const student = Array.isArray(payment.students) ? payment.students[0] : payment.students;
      const enrollment = Array.isArray(payment.student_enrollments) ? payment.student_enrollments[0] : payment.student_enrollments;
      const schoolClass = Array.isArray(enrollment?.classes) ? enrollment.classes[0] : enrollment?.classes;
      const reversed = Math.min(Number(payment.amount), reversedByPayment.get(payment.id) ?? 0);
      rows.push([payment.receipt_number, payment.payment_date, student?.admission_number, `${student?.first_name ?? ''} ${student?.last_name ?? ''}`.trim(), schoolClass?.name, payment.method, payment.reference, payment.amount, reversed, Number(payment.amount) - reversed]);
    }
    if (!data?.length || data.length < 100) break;
  }
  await supabase.from('audit_logs').insert({ school_id: session.school!.id, actor_id: session.userId, action: 'finance.report.export', resource_type: 'finance_report', resource_id: year.id, metadata: { report, academic_year_id: year.id, class_id: classId } });
  return csvResponse(rows, `collections-${year.name}.csv`);
}