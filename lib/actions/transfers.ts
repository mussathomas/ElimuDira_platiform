'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/school';

const placementSchema = z.object({
  student_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
  class_id: z.string().uuid(),
  stream_id: z.string().uuid().optional().or(z.literal('')),
});
const classTransferSchema = z.object({
  student_id: z.string().uuid(),
  class_id: z.string().uuid(),
  stream_id: z.string().uuid().optional().or(z.literal('')),
});
const schoolTransferSchema = z.object({
  student_id: z.string().uuid(),
  target_school_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});

async function audit(schoolId: string, actorId: string, action: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  const supabase = await createServerSupabaseClient();
  await supabase.from('audit_logs').insert({ school_id: schoolId, actor_id: actorId, action, resource_type: 'student_transfer', resource_id: resourceId, metadata });
}

async function validatePlacement(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, schoolId: string, classId: string, streamId: string) {
  const { data: classRow } = await supabase.from('classes').select('id').eq('id', classId).eq('school_id', schoolId).maybeSingle();
  if (!classRow) return 'That class is not available in this school.';
  if (streamId) {
    const { data: stream } = await supabase.from('streams').select('id').eq('id', streamId).eq('class_id', classId).eq('school_id', schoolId).maybeSingle();
    if (!stream) return 'That stream does not belong to the selected class.';
  }
  return null;
}

export async function promoteStudent(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('transfer_student');
  const parsed = placementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a student, academic year, class, and valid stream.' };
  const supabase = await createServerSupabaseClient();
  const placementError = await validatePlacement(supabase, session.school!.id, parsed.data.class_id, parsed.data.stream_id || '');
  if (placementError) return { ok: false, error: placementError };
  const { data: student } = await supabase.from('students').select('id, class_id, stream_id').eq('id', parsed.data.student_id).eq('school_id', session.school!.id).maybeSingle();
  if (!student) return { ok: false, error: 'That student is not in this school.' };
  const { data: previous } = await supabase.from('student_enrollments').select('id').eq('student_id', student.id).eq('academic_year_id', parsed.data.academic_year_id).maybeSingle();
  const { data: enrollment, error: enrollmentError } = await supabase.from('student_enrollments').upsert({ school_id: session.school!.id, student_id: student.id, academic_year_id: parsed.data.academic_year_id, class_id: parsed.data.class_id, stream_id: parsed.data.stream_id || null, status: 'active', promoted_from_enrollment_id: previous?.id ?? null, placed_by: session.userId }, { onConflict: 'student_id,academic_year_id' }).select('id').single();
  if (enrollmentError || !enrollment) return { ok: false, error: enrollmentError?.code === '23505' ? 'This student already has a placement for that academic year.' : 'Unable to save the academic placement.' };
  const { error: studentError } = await supabase.from('students').update({ class_id: parsed.data.class_id, stream_id: parsed.data.stream_id || null }).eq('id', student.id).eq('school_id', session.school!.id);
  if (studentError) return { ok: false, error: 'Placement was not applied to the student record.' };
  await audit(session.school!.id, session.userId, 'student.promoted', student.id, { enrollment_id: enrollment.id, academic_year_id: parsed.data.academic_year_id, previous_class_id: student.class_id, class_id: parsed.data.class_id });
  revalidatePath('/dashboard/students');
  revalidatePath('/dashboard/students/transfers');
  revalidatePath('/dashboard/attendance/class');
  return { ok: true };
}

export async function transferStudentWithinSchool(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('transfer_student');
  const parsed = classTransferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a student, class, and valid stream.' };
  const supabase = await createServerSupabaseClient();
  const placementError = await validatePlacement(supabase, session.school!.id, parsed.data.class_id, parsed.data.stream_id || '');
  if (placementError) return { ok: false, error: placementError };
  const { data: student } = await supabase.from('students').select('id, class_id, stream_id').eq('id', parsed.data.student_id).eq('school_id', session.school!.id).maybeSingle();
  if (!student) return { ok: false, error: 'That student is not in this school.' };
  const { error } = await supabase.from('students').update({ class_id: parsed.data.class_id, stream_id: parsed.data.stream_id || null }).eq('id', student.id).eq('school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to transfer the student to the selected class.' };
  await audit(session.school!.id, session.userId, 'student.class_transfer', student.id, { previous_class_id: student.class_id, class_id: parsed.data.class_id, previous_stream_id: student.stream_id, stream_id: parsed.data.stream_id || null });
  revalidatePath('/dashboard/students');
  revalidatePath('/dashboard/students/transfers');
  revalidatePath('/dashboard/attendance/class');
  return { ok: true };
}

export async function requestSchoolTransfer(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('transfer_student');
  const parsed = schoolTransferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Choose a student and destination school.' };
  if (parsed.data.target_school_id === session.school!.id) return { ok: false, error: 'Choose another school for a school transfer.' };
  const supabase = await createServerSupabaseClient();
  const { data: targetSchool } = await supabase.rpc('list_transfer_schools').then((result) => ({ data: (result.data ?? []).find((school: any) => school.id === parsed.data.target_school_id) }));
  if (!targetSchool) return { ok: false, error: 'That destination school is not available for transfer.' };
  const { data: student } = await supabase.from('students').select('id, admission_number, first_name, last_name, sex, date_of_birth, guardian_name, guardian_phone, guardian_email, class_id, stream_id').eq('id', parsed.data.student_id).eq('school_id', session.school!.id).maybeSingle();
  if (!student) return { ok: false, error: 'That student is not in this school.' };
  const { data: request, error } = await supabase.from('student_transfer_requests').insert({ source_school_id: session.school!.id, target_school_id: parsed.data.target_school_id, source_student_id: student.id, student_snapshot: student, reason: parsed.data.reason || null, requested_by: session.userId }).select('id').single();
  if (error || !request) return { ok: false, error: error?.code === '23505' ? 'A pending transfer to that school already exists.' : 'Unable to submit the school transfer.' };
  const { error: studentError } = await supabase.from('students').update({ status: 'transferred' }).eq('id', student.id).eq('school_id', session.school!.id);
  if (studentError) return { ok: false, error: 'The transfer request was created but the student status could not be updated.' };
  await audit(session.school!.id, session.userId, 'student.school_transfer_requested', request.id, { target_school_id: parsed.data.target_school_id, student_id: student.id });
  revalidatePath('/dashboard/students/transfers');
  revalidatePath('/dashboard/students');
  return { ok: true };
}

export async function acceptSchoolTransfer(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('transfer_student');
  const requestId = String(formData.get('request_id') ?? '');
  const classId = String(formData.get('class_id') ?? '');
  const streamId = String(formData.get('stream_id') ?? '');
  const admissionNumber = String(formData.get('admission_number') ?? '').trim();
  if (!z.string().uuid().safeParse(requestId).success || !z.string().uuid().safeParse(classId).success || !admissionNumber) return { ok: false, error: 'Provide the transfer, admission number, and destination class.' };
  const supabase = await createServerSupabaseClient();
  const placementError = await validatePlacement(supabase, session.school!.id, classId, streamId);
  if (placementError) return { ok: false, error: placementError };
  const { data: request } = await supabase.from('student_transfer_requests').select('id, source_school_id, source_student_id, student_snapshot, status').eq('id', requestId).eq('target_school_id', session.school!.id).maybeSingle();
  if (!request || request.status !== 'pending') return { ok: false, error: 'That transfer request is no longer pending.' };
  const snapshot = request.student_snapshot as any;
  const { data: student, error: studentError } = await supabase.from('students').insert({ school_id: session.school!.id, admission_number: admissionNumber, first_name: snapshot.first_name, last_name: snapshot.last_name, sex: snapshot.sex ?? null, date_of_birth: snapshot.date_of_birth ?? null, class_id: classId, stream_id: streamId || null, guardian_name: snapshot.guardian_name ?? null, guardian_phone: snapshot.guardian_phone ?? null, guardian_email: snapshot.guardian_email ?? null, status: 'active' }).select('id').single();
  if (studentError || !student) return { ok: false, error: studentError?.code === '23505' ? 'That admission number already exists in this school.' : 'Unable to enroll the transferred student.' };
  const { error: requestError } = await supabase.from('student_transfer_requests').update({ target_student_id: student.id, status: 'accepted', decided_by: session.userId, decided_at: new Date().toISOString() }).eq('id', request.id).eq('target_school_id', session.school!.id).eq('status', 'pending');
  if (requestError) return { ok: false, error: 'The student was enrolled but the transfer request could not be completed.' };
  await audit(session.school!.id, session.userId, 'student.school_transfer_accepted', request.id, { source_school_id: request.source_school_id, source_student_id: request.source_student_id, target_student_id: student.id });
  revalidatePath('/dashboard/students/transfers');
  revalidatePath('/dashboard/students');
  return { ok: true };
}

export async function rejectSchoolTransfer(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('transfer_student');
  const requestId = String(formData.get('request_id') ?? '');
  if (!z.string().uuid().safeParse(requestId).success) return { ok: false, error: 'Choose a valid transfer request.' };
  const supabase = await createServerSupabaseClient();
  const { data: request } = await supabase.from('student_transfer_requests').select('id, source_student_id, source_school_id').eq('id', requestId).eq('target_school_id', session.school!.id).eq('status', 'pending').maybeSingle();
  if (!request) return { ok: false, error: 'That transfer request is no longer pending.' };
  const { error } = await supabase.from('student_transfer_requests').update({ status: 'rejected', decided_by: session.userId, decided_at: new Date().toISOString() }).eq('id', request.id).eq('target_school_id', session.school!.id);
  if (error) return { ok: false, error: 'Unable to reject the transfer request.' };
  await audit(session.school!.id, session.userId, 'student.school_transfer_rejected', request.id, { source_school_id: request.source_school_id, source_student_id: request.source_student_id });
  revalidatePath('/dashboard/students/transfers');
  return { ok: true };
}

export async function cancelSchoolTransfer(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission('transfer_student');
  const requestId = String(formData.get('request_id') ?? '');
  if (!z.string().uuid().safeParse(requestId).success) return { ok: false, error: 'Choose a valid transfer request.' };
  const supabase = await createServerSupabaseClient();
  const { data: request } = await supabase.from('student_transfer_requests').select('id, source_student_id').eq('id', requestId).eq('source_school_id', session.school!.id).eq('status', 'pending').maybeSingle();
  if (!request) return { ok: false, error: 'That transfer request is no longer pending.' };
  const { error } = await supabase.from('student_transfer_requests').update({ status: 'cancelled', decided_by: session.userId, decided_at: new Date().toISOString() }).eq('id', request.id).eq('source_school_id', session.school!.id).eq('status', 'pending');
  if (error) return { ok: false, error: 'Unable to cancel the transfer request.' };
  const { error: studentError } = await supabase.from('students').update({ status: 'active' }).eq('id', request.source_student_id).eq('school_id', session.school!.id).eq('status', 'transferred');
  if (studentError) return { ok: false, error: 'The request was cancelled but the student status could not be restored.' };
  await audit(session.school!.id, session.userId, 'student.school_transfer_cancelled', request.id, { student_id: request.source_student_id });
  revalidatePath('/dashboard/students/transfers');
  revalidatePath('/dashboard/students');
  return { ok: true };
}
