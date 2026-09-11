'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { registerSchool, type RegisterResult } from '@/lib/actions/register';

const EDUCATION_LEVEL_OPTIONS = ['Pre-Primary', 'Primary', 'O-Level', 'A-Level'];

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState<RegisterResult | null, FormData>(registerSchool, null);

  return (
    <Card>
      <h1 className="mb-1 font-display text-2xl font-medium text-ink">Register your school</h1>
      <p className="help-text mb-6">
        Set up your school&apos;s own ElimuDira workspace. This creates your administrator account and a setup wizard
        will walk you through the rest.
      </p>

      <form action={formAction} className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="label-text mb-1">Your administrator account</legend>
          <div>
            <Label htmlFor="admin_full_name">Your full name</Label>
            <Input id="admin_full_name" name="admin_full_name" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="admin_email">Your email</Label>
              <Input id="admin_email" name="admin_email" type="email" required autoComplete="email" />
            </div>
            <div />
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required autoComplete="new-password" />
            </div>
            <div>
              <Label htmlFor="confirm_password">Confirm password</Label>
              <Input id="confirm_password" name="confirm_password" type="password" required autoComplete="new-password" />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-line pt-4">
          <legend className="label-text mb-1">School information</legend>
          <div>
            <Label htmlFor="school_name">School name</Label>
            <Input id="school_name" name="school_name" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="school_type">School type</Label>
              <Select id="school_type" name="school_type" defaultValue="secondary" required>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="combined">Combined</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" required />
            </div>
            <div>
              <Label htmlFor="school_email">School email</Label>
              <Input id="school_email" name="school_email" type="email" required />
            </div>
            <div>
              <Label htmlFor="motto">School motto (optional)</Label>
              <Input id="motto" name="motto" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="region">Region</Label>
              <Input id="region" name="region" />
            </div>
            <div>
              <Label htmlFor="district">District</Label>
              <Input id="district" name="district" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" />
            </div>
          </div>
          <div>
            <span className="label-text mb-1.5 block">Education levels taught</span>
            <div className="flex flex-wrap gap-4">
              {EDUCATION_LEVEL_OPTIONS.map((level) => (
                <label key={level} className="flex items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" name="education_levels" value={level} className="rounded border-border" />
                  {level}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="logo">School logo (optional)</Label>
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border-0 file:bg-brand-light file:px-3 file:py-1.5 file:text-brand-dark"
            />
            <p className="help-text mt-1">PNG, JPEG or WebP, up to 3MB.</p>
          </div>
        </fieldset>

        {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Creating your workspace…' : 'Create school workspace'}
        </Button>
      </form>

      <p className="help-text mt-6 text-center">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
