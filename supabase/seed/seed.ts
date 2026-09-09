/**
 * Development seed script — creates "ElimuDira Demo School" with a demo
 * user for every default role, plus enough academic structure to explore
 * the dashboard immediately.
 *
 * Run with: npm run db:seed
 *
 * Uses the service-role key directly (never do this from app code) because
 * a standalone script has no request/session to run as. Demo accounts are
 * clearly namespaced (@demo.elimudira.local) so they're never mistaken for
 * real school data — do not point this at a production project.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_PASSWORD = 'ElimuDira-Demo-2026!';

async function createDemoUser(email: string, fullName: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`Failed to create ${email}: ${error?.message}`);
  return data.user.id;
}

async function main() {
  console.log('Seeding ElimuDira demo data...');

  const adminId = await createDemoUser('admin@demo.elimudira.local', 'Amina Demo-Admin');

  const { data: schoolId, error: registerError } = await supabase.rpc('register_school', {
    p_admin_user_id: adminId,
    p_school_name: 'ElimuDira Demo School',
    p_slug: `elimudira-demo-${Date.now().toString(36)}`,
    p_school_type: 'secondary',
    p_education_levels: ['O-Level', 'A-Level'],
    p_address: 'Iyunga, Mbeya',
    p_region: 'Mbeya',
    p_district: 'Mbeya City',
    p_phone: '+255700000000',
    p_email: 'info@demo.elimudira.local',
    p_motto: 'Learning, guided.',
    p_admin_full_name: 'Amina Demo-Admin',
  });

  if (registerError || !schoolId) throw new Error(`register_school failed: ${registerError?.message}`);
  console.log(`Created school ${schoolId}`);

  const { data: roles } = await supabase.from('roles').select('id, name').eq('school_id', schoolId);
  const roleId = (name: string) => roles?.find((r) => r.name === name)?.id;

  const demoStaff = [
    { email: 'teacher@demo.elimudira.local', name: 'Juma Demo-Teacher', role: 'Teacher' },
    { email: 'accountant@demo.elimudira.local', name: 'Grace Demo-Accountant', role: 'Accountant' },
    { email: 'secretary@demo.elimudira.local', name: 'Fatuma Demo-Secretary', role: 'Secretary' },
  ];

  for (const staff of demoStaff) {
    const userId = await createDemoUser(staff.email, staff.name);
    const { error } = await supabase.from('profiles').insert({
      id: userId,
      school_id: schoolId,
      role_id: roleId(staff.role),
      full_name: staff.name,
      email: staff.email,
    });
    if (error) throw new Error(`Failed to link ${staff.email}: ${error.message}`);
    console.log(`Created ${staff.role.toLowerCase()} ${staff.email}`);
  }

  const { data: year } = await supabase
    .from('academic_years')
    .insert({ school_id: schoolId, name: '2026', start_date: '2026-01-01', end_date: '2026-11-30', is_current: true })
    .select('id')
    .single();

  const { data: level } = await supabase
    .from('education_levels')
    .insert({ school_id: schoolId, name: 'O-Level', order_index: 1 })
    .select('id')
    .single();

  const { data: form2 } = await supabase
    .from('classes')
    .insert({ school_id: schoolId, education_level_id: level!.id, name: 'Form 2', order_index: 1 })
    .select('id')
    .single();

  await supabase.from('streams').insert([
    { school_id: schoolId, class_id: form2!.id, name: 'Form 2A' },
    { school_id: schoolId, class_id: form2!.id, name: 'Form 2B' },
  ]);

  await supabase.from('subjects').insert(
    ['Mathematics', 'English', 'Kiswahili', 'Physics', 'Chemistry', 'Biology'].map((name) => ({
      school_id: schoolId,
      name,
    }))
  );

  await supabase.from('schools').update({ setup_completed: true, setup_step: 8 }).eq('id', schoolId);

  console.log('\nDone. Demo login (all roles share the same password):');
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log('  admin@demo.elimudira.local (Administrator)');
  console.log('  teacher@demo.elimudira.local (Teacher)');
  console.log('  accountant@demo.elimudira.local (Accountant)');
  console.log('  secretary@demo.elimudira.local (Secretary)');
  void year;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
