/**
 * Migrate card attachments from Supabase Storage to AWS S3.
 * 
 * 1. Reads all attachments with non-s3:// storage_path
 * 2. Downloads from Supabase Storage
 * 3. Uploads to S3
 * 4. Updates storage_path to s3:// prefix
 * 5. Deletes from Supabase Storage
 * 
 * Run: npx tsx scripts/migrate-to-s3.ts [--dry-run] [--batch-size 50] [--delete]
 */

import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'fs'
// Load .env.local manually
const envContent = readFileSync('.env.local', 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx)
  const val = trimmed.slice(eqIdx + 1)
  if (!process.env[key]) process.env[key] = val
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const S3_BUCKET = process.env.AWS_S3_BUCKET || 'kmboards'
const S3_REGION = process.env.AWS_S3_REGION || 'us-east-1'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const DELETE_AFTER = args.includes('--delete')
const BATCH_SIZE = parseInt(args.find(a => a.startsWith('--batch-size'))?.split('=')[1] || '50')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const s3 = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY!,
  },
})

interface Attachment {
  id: string
  card_id: string
  file_name: string
  file_size: number
  mime_type: string
  storage_path: string
}

async function getSupabaseAttachments(offset: number, limit: number): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select('id, card_id, file_name, file_size, mime_type, storage_path')
    .not('storage_path', 'like', 's3://%')
    .not('storage_path', 'like', 'http%')
    .gt('file_size', 0)
    .order('file_size', { ascending: true }) // small files first for fast progress
    .range(offset, offset + limit - 1)

  if (error) throw new Error(`DB query failed: ${error.message}`)
  return data || []
}

async function downloadFromSupabase(storagePath: string): Promise<Buffer | null> {
  const { data, error } = await supabase.storage
    .from('card-attachments')
    .download(storagePath)

  if (error) {
    console.error(`  Download failed: ${error.message}`)
    return null
  }
  return Buffer.from(await data.arrayBuffer())
}

async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<boolean> {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }))
    return true
  } catch (err: any) {
    console.error(`  S3 upload failed: ${err.message}`)
    return false
  }
}

async function updateStoragePath(id: string, s3Key: string): Promise<boolean> {
  const { error } = await supabase
    .from('attachments')
    .update({ storage_path: `s3://${s3Key}` })
    .eq('id', id)

  if (error) {
    console.error(`  DB update failed: ${error.message}`)
    return false
  }
  return true
}

async function deleteFromSupabase(storagePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from('card-attachments')
    .remove([storagePath])

  if (error) {
    console.error(`  Supabase delete failed: ${error.message}`)
  }
}

async function main() {
  console.log('=== Supabase → S3 Migration ===')
  console.log(`Bucket: ${S3_BUCKET} | Region: ${S3_REGION}`)
  console.log(`Dry run: ${DRY_RUN} | Delete after: ${DELETE_AFTER} | Batch: ${BATCH_SIZE}`)
  console.log()

  // Count total
  const { count } = await supabase
    .from('attachments')
    .select('id', { count: 'exact', head: true })
    .not('storage_path', 'like', 's3://%')
    .not('storage_path', 'like', 'http%')
    .gt('file_size', 0)

  console.log(`Total files to migrate: ${count}`)
  if (DRY_RUN) {
    console.log('DRY RUN - no changes will be made')
  }
  console.log()

  let offset = 0
  let migrated = 0
  let failed = 0
  let skipped = 0
  let bytesTransferred = 0n

  while (true) {
    const batch = await getSupabaseAttachments(0, BATCH_SIZE) // always offset 0 since we update as we go
    if (batch.length === 0) break

    for (const att of batch) {
      const progress = `[${migrated + failed + skipped + 1}/${count}]`
      const sizeMB = (att.file_size / 1024 / 1024).toFixed(1)
      console.log(`${progress} ${att.file_name} (${sizeMB} MB)`)

      if (DRY_RUN) {
        console.log(`  Would migrate: ${att.storage_path} → s3://card-attachments/${att.card_id}/${att.file_name}`)
        skipped++
        continue
      }

      // Download from Supabase
      const buffer = await downloadFromSupabase(att.storage_path)
      if (!buffer) {
        console.log(`  SKIP - download failed`)
        failed++
        continue
      }

      // Build S3 key matching existing convention
      const s3Key = `card-attachments/${att.card_id}/${Date.now()}_${att.file_name}`

      // Upload to S3
      const uploaded = await uploadToS3(s3Key, buffer, att.mime_type)
      if (!uploaded) {
        console.log(`  SKIP - upload failed`)
        failed++
        continue
      }

      // Update DB
      const updated = await updateStoragePath(att.id, s3Key)
      if (!updated) {
        console.log(`  SKIP - DB update failed (file is in S3 but path not updated!)`)
        failed++
        continue
      }

      // Delete from Supabase Storage
      if (DELETE_AFTER) {
        await deleteFromSupabase(att.storage_path)
        console.log(`  ✓ migrated + deleted from Supabase`)
      } else {
        console.log(`  ✓ migrated (Supabase copy kept)`)
      }

      migrated++
      bytesTransferred += BigInt(att.file_size)

      // Throttle: 200ms between small files, 1s between large files (>5MB)
      const delay = att.file_size > 5 * 1024 * 1024 ? 1000 : 200
      await new Promise(r => setTimeout(r, delay))

      // Progress summary every 100 files
      if (migrated % 100 === 0) {
        const gbDone = Number(bytesTransferred) / 1024 / 1024 / 1024
        console.log(`\n--- Progress: ${migrated} migrated, ${failed} failed, ${gbDone.toFixed(2)} GB transferred ---\n`)
      }
    }
  }

  const gbTotal = Number(bytesTransferred) / 1024 / 1024 / 1024
  console.log('\n=== Migration Complete ===')
  console.log(`Migrated: ${migrated}`)
  console.log(`Failed: ${failed}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Data transferred: ${gbTotal.toFixed(2)} GB`)
}

main().catch(e => { console.error(e); process.exit(1) })
