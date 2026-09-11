import 'server-only';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// `import 'server-only'` makes it a build error to import this module from
// any Client Component — R2 credentials must never reach the browser.

const requiredEnvironment = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET_NAME',
] as const;

function getConfig() {
  const missing = requiredEnvironment.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing Cloudflare R2 environment variable(s): ${missing.join(', ')}`);
  }

  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID as string,
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY as string,
    bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME as string,
  };
}

let client: S3Client | undefined;

function getClient() {
  if (!client) {
    const config = getConfig();
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return client;
}

function getBucket() {
  return getConfig().bucket;
}

/**
 * Object key builder. Every school's files live under their own prefix —
 * schools/{schoolId}/... — so authorization is enforced by *always* deriving
 * the school id server-side (from the caller's session) rather than trusting
 * a school id supplied by the client. Never build a key from a client-
 * provided schoolId directly; pass it through requireSchoolSession() first.
 */
export function schoolObjectKey(schoolId: string, ...segments: string[]) {
  const parts = [schoolId, ...segments];
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('/') || part.includes('\\'))) {
    throw new Error('Invalid R2 object key segment.');
  }
  return ['schools', ...parts].join('/');
}

export async function uploadObject(key: string, body: Buffer, contentType: string) {
  await getClient().send(
    new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: body, ContentType: contentType })
  );
  return key;
}

export async function deleteObject(key: string) {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

/** Time-limited signed URL — the only way objects are ever read from the browser. */
export async function getSignedDownloadUrl(key: string, expiresInSeconds = 3600) {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 604800) {
    throw new Error('R2 signed URL expiry must be between 1 second and 7 days.');
  }

  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: getBucket(), Key: key }), {
    expiresIn: expiresInSeconds,
  });
}
