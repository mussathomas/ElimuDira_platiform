'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';

export function SchoolLogoUpload({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState(logoUrl);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPreviewUrl(logoUrl), [logoUrl]);

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Choose a PNG or JPEG image.');
      event.target.value = '';
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError('The logo must be 3 MB or smaller.');
      event.target.value = '';
      return;
    }

    setPending(true);
    try {
      const formData = new FormData();
      formData.set('logo', file);
      const response = await fetch('/api/settings/school/logo', { method: 'POST', body: formData });
      const result = await response.json() as { ok?: boolean; logoUrl?: string | null; error?: string };
      if (!response.ok || !result.ok) {
        setError(result.error ?? 'Unable to upload the logo. Please try again.');
        return;
      }
      setPreviewUrl(result.logoUrl ?? null);
      router.refresh();
    } catch (uploadError) {
      console.error('School logo upload request failed', uploadError);
      setError('Unable to upload the logo. Check your connection and try again.');
    } finally {
      setPending(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function removeLogo() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch('/api/settings/school/logo', { method: 'DELETE' });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setError(result.error ?? 'Unable to remove the logo. Please try again.');
        return;
      }
      setPreviewUrl(null);
      router.refresh();
    } catch (removeError) {
      console.error('School logo removal request failed', removeError);
      setError('Unable to remove the logo. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="school-logo-heading" className="space-y-3">
      <div>
        <h3 id="school-logo-heading" className="text-sm font-semibold text-ink">School logo</h3>
        <p className="help-text">PNG or JPEG, up to 3 MB. It will appear on printable results, reports and finance documents.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-2">
          {previewUrl ? (
            <Image src={previewUrl} alt="Current school logo" width={88} height={88} unoptimized className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-center text-xs text-muted">No logo uploaded</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg"
            aria-label="Choose school logo"
            onChange={uploadLogo}
            disabled={pending}
            className="block max-w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-paper file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
          {previewUrl && (
            <Button type="button" variant="secondary" onClick={removeLogo} disabled={pending}>
              Remove logo
            </Button>
          )}
          {pending && <p role="status" className="w-full text-sm text-muted">Saving logo…</p>}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
}
