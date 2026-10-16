import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { deleteObject, getSignedDownloadUrl, schoolObjectKey, uploadObject } from '@/lib/storage/r2';

export const runtime = 'nodejs';

const MAX_LOGO_SIZE = 3 * 1024 * 1024;
const SCHOOL_LOGO_PREFIX = 'schools/';

export async function POST(request: Request) {
  const session = await requirePermission('edit_settings');
  const formData = await request.formData();
  const file = formData.get('logo');

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose a PNG or JPEG logo to upload.' }, { status: 400 });
  }
  if (file.size > MAX_LOGO_SIZE) {
    return NextResponse.json({ error: 'The logo must be 3 MB or smaller.' }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const imageType = detectLogoType(bytes);
  if (!imageType) {
    return NextResponse.json({ error: 'Use a valid PNG or JPEG image.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('logo_path')
    .eq('id', session.school!.id)
    .single();
  if (schoolError || !school) {
    console.error('School logo lookup failed', schoolError);
    return NextResponse.json({ error: 'Unable to load the current school logo.' }, { status: 500 });
  }

  const newPath = schoolObjectKey(session.school!.id, 'logo', `${randomUUID()}.${imageType.extension}`);
  try {
    await uploadObject(newPath, bytes, imageType.contentType);
  } catch (error) {
    console.error('School logo upload failed', error);
    return NextResponse.json({ error: 'Unable to upload the school logo. Check the storage configuration and try again.' }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from('schools')
    .update({ logo_path: newPath })
    .eq('id', session.school!.id);
  if (updateError) {
    console.error('School logo update failed', updateError);
    await removeUploadedObject(newPath);
    return NextResponse.json({ error: 'The logo uploaded but could not be saved to the school profile.' }, { status: 500 });
  }

  await logLogoChange(supabase, session.school!.id, session.userId, 'school.update_logo', newPath);
  await removePreviousLogo(school.logo_path, session.school!.id);
  revalidateSchoolPages();

  let logoUrl: string | null = null;
  try {
    logoUrl = await getSignedDownloadUrl(newPath);
  } catch (error) {
    console.error('School logo preview URL generation failed', error);
  }
  return NextResponse.json({ ok: true, logoUrl });
}

export async function DELETE() {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('logo_path')
    .eq('id', session.school!.id)
    .single();
  if (schoolError || !school) {
    console.error('School logo lookup failed', schoolError);
    return NextResponse.json({ error: 'Unable to load the current school logo.' }, { status: 500 });
  }
  if (!school.logo_path) return NextResponse.json({ ok: true });

  const { error: updateError } = await supabase
    .from('schools')
    .update({ logo_path: null })
    .eq('id', session.school!.id);
  if (updateError) {
    console.error('School logo removal failed', updateError);
    return NextResponse.json({ error: 'Unable to remove the school logo.' }, { status: 500 });
  }

  await logLogoChange(supabase, session.school!.id, session.userId, 'school.remove_logo', null);
  await removePreviousLogo(school.logo_path, session.school!.id);
  revalidateSchoolPages();
  return NextResponse.json({ ok: true });
}

function detectLogoType(bytes: Buffer) {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= pngSignature.length && pngSignature.every((byte, index) => bytes[index] === byte)) {
    return { extension: 'png', contentType: 'image/png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: 'jpg', contentType: 'image/jpeg' };
  }
  return null;
}

async function removePreviousLogo(path: string | null, schoolId: string) {
  if (!path || !path.startsWith(`${SCHOOL_LOGO_PREFIX}${schoolId}/`)) return;
  await removeUploadedObject(path);
}

async function removeUploadedObject(path: string) {
  try {
    await deleteObject(path);
  } catch (error) {
    console.error('School logo cleanup failed', error);
  }
}

async function logLogoChange(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  schoolId: string,
  actorId: string,
  action: string,
  objectPath: string | null
) {
  const { error } = await supabase.from('audit_logs').insert({
    school_id: schoolId,
    actor_id: actorId,
    action,
    resource_type: 'school',
    resource_id: schoolId,
    metadata: { logo_path: objectPath },
  });
  if (error) console.error('School logo audit log failed', error);
}

function revalidateSchoolPages() {
  revalidatePath('/dashboard/settings/school');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/exams/class-results');
  revalidatePath('/dashboard/exams/reports');
}
