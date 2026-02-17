import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ============================================================================
// AWS S3 Client — used for large file storage (>50MB Supabase limit)
// ============================================================================

const SUPABASE_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — Supabase free tier limit

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client;

  const region = process.env.AWS_S3_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_S3_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS S3 credentials not configured. Set AWS_S3_ACCESS_KEY_ID and AWS_S3_SECRET_ACCESS_KEY in .env.local');
  }

  _s3Client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  return _s3Client;
}

function getBucket(): string {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET not configured in .env.local');
  }
  return bucket;
}

/**
 * Check if S3 is configured (all required env vars present)
 */
export function isS3Configured(): boolean {
  return !!(
    process.env.AWS_S3_ACCESS_KEY_ID &&
    process.env.AWS_S3_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET
  );
}

/**
 * Check if a file should go to S3 based on size
 */
export function shouldUseS3(fileSizeBytes: number): boolean {
  return fileSizeBytes > SUPABASE_MAX_FILE_SIZE && isS3Configured();
}

/**
 * Upload a file buffer to S3.
 * Returns the S3 key (path) for storage in the database.
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return key;
}

/**
 * Generate a presigned download URL for an S3 object.
 * URL expires after `expiresIn` seconds (default: 1 hour).
 */
export async function getS3DownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Delete a file from S3.
 */
export async function deleteFromS3(key: string): Promise<void> {
  const client = getS3Client();
  const bucket = getBucket();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

/**
 * Build a standard S3 key for card attachments.
 * Format: card-attachments/{cardId}/{timestamp}_{filename}
 */
export function buildS3Key(cardId: string, filename: string): string {
  return `card-attachments/${cardId}/${Date.now()}_${filename}`;
}
