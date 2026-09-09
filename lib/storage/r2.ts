import 'server-only';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// `import 'server-only'` makes it a build error to import this module from
// any Client Component — R2 credentials must never reach the browser.

function getClient() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
  });
}

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!;

/**
 * Object key builder. Every school's files live under their own prefix —
 * schools/{schoolId}/... — so authorization is enforced by *always* deriving
 * the school id server-side (from the caller's session) rather than trusting
 * a school id supplied by the client. Never build a key from a client-
 * provided schoolId directly; pass it through requireSchoolSession() first.
 */
export function schoolObjectKey(schoolId: string, ...segments: string[]) {
  return ['schools', schoolId, ...segments].join('/');
}

export async function uploadObject(key: string, body: Buffer, contentType: string) {
  await getClient().send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
  );
  return key;
}

export async function deleteObject(key: string) {
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Time-limited signed URL — the only way objects are ever read from the browser. */
export async function getSignedDownloadUrl(key: string, expiresInSeconds = 3600) {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}
