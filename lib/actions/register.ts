'use server';

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { deleteObject, schoolObjectKey, uploadObject } from '@/lib/storage/r2';

const registerSchema = z
  .object({
    admin_full_name: z.string().trim().min(2, 'Enter your full name'),
    admin_email: z.string().trim().email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
    school_name: z.string().trim().min(2, 'Enter your school name'),
    school_type: z.enum(['primary', 'secondary', 'combined', 'other']),
    school_email: z.string().trim().email('Enter a valid school email'),
    phone: z.string().trim().min(6, 'Enter a valid phone number'),
    address: z.string().trim().optional().or(z.literal('')),
    region: z.string().trim().optional().or(z.literal('')),
    district: z.string().trim().optional().or(z.literal('')),
    motto: z.string().trim().optional().or(z.literal('')),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'school'}-${suffix}`;
}

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerSchool(_prev: RegisterResult | null, formData: FormData): Promise<RegisterResult> {
  const educationLevels = formData.getAll('education_levels').map(String);
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' };
  }
  if (educationLevels.length === 0) {
    return { ok: false, error: 'Select at least one education level.' };
  }

  const supabase = await createServerSupabaseClient();

  let signUpData;
  let signUpError;
  try {
    ({ data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.admin_email,
      password: parsed.data.password,
      options: { data: { full_name: parsed.data.admin_full_name } },
    }));
  } catch (error) {
    console.error('Supabase signup request failed', error);
    return { ok: false, error: 'Unable to reach Supabase. Check your connection and try again.' };
  }

  if (signUpError || !signUpData.user) {
    const authErrorMessage = signUpError?.message ?? 'Supabase did not return a user.';
    console.error('Supabase signup failed', {
      message: authErrorMessage,
      status: signUpError?.status,
      code: signUpError?.code,
    });
    if (signUpError?.status === 429 || signUpError?.code === 'over_email_send_rate_limit') {
      return { ok: false, error: 'Too many signup emails were requested. Wait a while and try again, or disable email confirmation for local development.' };
    }
    return {
      ok: false,
      error: authErrorMessage.toLowerCase().includes('already registered')
        ? 'An account with this email already exists.'
        : process.env.NODE_ENV === 'development'
          ? authErrorMessage
          : 'Unable to create your account. Please try again.',
    };
  }

  const schoolId = randomUUID();
  let logoPath: string | null = null;

  const logoFile = formData.get('logo');
  if (logoFile instanceof File && logoFile.size > 0) {
    if (logoFile.size > 3 * 1024 * 1024) {
      return { ok: false, error: 'Logo must be smaller than 3MB.' };
    }
    const buffer = Buffer.from(await logoFile.arrayBuffer());
    const extension = logoFile.name.split('.').pop() ?? 'png';
    logoPath = schoolObjectKey(schoolId, 'logo', `logo.${extension}`);
    try {
      await uploadObject(logoPath, buffer, logoFile.type || 'image/png');
    } catch (error) {
      console.error('School logo upload failed', error);
      return { ok: false, error: 'The logo could not be uploaded. Check your Cloudflare R2 settings or continue without a logo.' };
    }
  }

  const { error: rpcError } = await supabase.rpc('register_school', {
    p_admin_user_id: signUpData.user.id,
    p_school_name: parsed.data.school_name,
    p_slug: slugify(parsed.data.school_name),
    p_school_type: parsed.data.school_type,
    p_education_levels: educationLevels,
    p_address: parsed.data.address || null,
    p_region: parsed.data.region || null,
    p_district: parsed.data.district || null,
    p_phone: parsed.data.phone,
    p_email: parsed.data.school_email,
    p_motto: parsed.data.motto || null,
    p_admin_full_name: parsed.data.admin_full_name,
    p_school_id: schoolId,
    p_logo_path: logoPath,
  });

  if (rpcError) {
    console.error('register_school RPC failed', rpcError);
    if (logoPath) {
      try {
        await deleteObject(logoPath);
      } catch (cleanupError) {
        console.error('Uploaded school logo cleanup failed', cleanupError);
      }
    }
    if (rpcError.code === 'PGRST202') {
      return {
        ok: false,
        error: 'Workspace setup is not available yet. Run the Supabase migrations (0001 through 0005), then sign in again.',
      };
    }
    return {
      ok: false,
      error: process.env.NODE_ENV === 'development'
        ? `School setup failed: ${rpcError.message}`
        : 'Your account was created, but we could not set up your school workspace. Please contact support.',
    };
  }

  redirect('/dashboard/setup');
}
