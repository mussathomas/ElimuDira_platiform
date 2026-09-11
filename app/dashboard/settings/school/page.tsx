import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/field';
import { ActionForm } from '@/components/ui/action-form';
import { updateSchoolProfile } from '@/lib/actions/school';

export default async function SchoolSettingsPage() {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();
  const { data: school } = await supabase.from('schools').select('id, name, address, region, district, phone, email, motto').eq('id', session.school!.id).single();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">School settings</h2>
        <p className="help-text">These details appear on dashboards, letters, certificates and reports.</p>
      </div>

      <Card>
        <ActionForm action={updateSchoolProfile} submitLabel="Save changes">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="col-span-2">
              <Label htmlFor="name">School name</Label>
              <Input id="name" name="name" defaultValue={school?.name} required />
            </div>
            <div className="col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" defaultValue={school?.address ?? ''} />
            </div>
            <div>
              <Label htmlFor="region">Region</Label>
              <Input id="region" name="region" defaultValue={school?.region ?? ''} />
            </div>
            <div>
              <Label htmlFor="district">District</Label>
              <Input id="district" name="district" defaultValue={school?.district ?? ''} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={school?.phone ?? ''} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={school?.email ?? ''} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="motto">School motto</Label>
              <Input id="motto" name="motto" defaultValue={school?.motto ?? ''} />
            </div>
          </div>
        </ActionForm>
      </Card>

      <p className="help-text">
        The school logo is set once during registration and can be updated here when your document workflow is configured.
      </p>
    </div>
  );
}
