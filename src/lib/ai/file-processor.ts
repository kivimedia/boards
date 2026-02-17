import { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// FILE PROCESSOR — PDF text extraction + image base64 for Claude vision
// ============================================================================

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PDF_TEXT_LENGTH = 3000;

export interface ProcessedFile {
  fileName: string;
  mimeType: string;
  type: 'text' | 'image';
  /** Extracted text content (for PDFs and text files) */
  textContent?: string;
  /** Base64-encoded image data (for images) */
  base64Data?: string;
  /** Media type for Claude vision API */
  mediaType?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  /** File size in bytes */
  fileSize: number;
}

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const PDF_MIME_TYPE = 'application/pdf';

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/html',
  'application/json',
]);

/**
 * Process attachments from a card for inclusion in chat context.
 * - PDFs: text extracted via pdf-parse
 * - Images: converted to base64 for Claude vision
 * - Text files: content read directly
 * - Other types: skipped
 */
export async function processCardAttachments(
  supabase: SupabaseClient,
  cardId: string,
  opts?: { maxFiles?: number }
): Promise<ProcessedFile[]> {
  const maxFiles = opts?.maxFiles ?? MAX_FILES;

  // Fetch attachment records
  const { data: attachments } = await supabase
    .from('attachments')
    .select('id, file_name, file_size, mime_type, storage_path')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false })
    .limit(maxFiles);

  if (!attachments || attachments.length === 0) return [];

  const results: ProcessedFile[] = [];

  for (const att of attachments as {
    id: string;
    file_name: string;
    file_size: number;
    mime_type: string;
    storage_path: string;
  }[]) {
    // Skip files too large
    if (att.file_size > MAX_FILE_SIZE) continue;

    // Determine processing type
    if (att.mime_type === PDF_MIME_TYPE) {
      const result = await processPdf(supabase, att);
      if (result) results.push(result);
    } else if (IMAGE_MIME_TYPES.has(att.mime_type)) {
      const result = await processImage(supabase, att);
      if (result) results.push(result);
    } else if (TEXT_MIME_TYPES.has(att.mime_type)) {
      const result = await processTextFile(supabase, att);
      if (result) results.push(result);
    }
    // Skip unsupported types silently
  }

  return results;
}

// ============================================================================
// PDF PROCESSOR
// ============================================================================

async function processPdf(
  supabase: SupabaseClient,
  att: { file_name: string; file_size: number; mime_type: string; storage_path: string }
): Promise<ProcessedFile | null> {
  try {
    const { data, error } = await supabase.storage
      .from('card-attachments')
      .download(att.storage_path);

    if (error || !data) return null;

    const buffer = Buffer.from(await data.arrayBuffer());

    // Dynamic import to avoid bundling issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;
    const parsed = await pdfParse(buffer);

    const text = parsed.text?.trim() || '';
    if (!text) return null;

    const truncated = text.length > MAX_PDF_TEXT_LENGTH
      ? text.slice(0, MAX_PDF_TEXT_LENGTH) + `\n\n[... truncated, ${text.length - MAX_PDF_TEXT_LENGTH} more characters]`
      : text;

    return {
      fileName: att.file_name,
      mimeType: att.mime_type,
      type: 'text',
      textContent: truncated,
      fileSize: att.file_size,
    };
  } catch {
    // PDF parsing failed — skip
    return null;
  }
}

// ============================================================================
// IMAGE PROCESSOR
// ============================================================================

async function processImage(
  supabase: SupabaseClient,
  att: { file_name: string; file_size: number; mime_type: string; storage_path: string }
): Promise<ProcessedFile | null> {
  try {
    const { data, error } = await supabase.storage
      .from('card-attachments')
      .download(att.storage_path);

    if (error || !data) return null;

    const buffer = Buffer.from(await data.arrayBuffer());
    const base64 = buffer.toString('base64');

    return {
      fileName: att.file_name,
      mimeType: att.mime_type,
      type: 'image',
      base64Data: base64,
      mediaType: att.mime_type as ProcessedFile['mediaType'],
      fileSize: att.file_size,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// TEXT FILE PROCESSOR
// ============================================================================

async function processTextFile(
  supabase: SupabaseClient,
  att: { file_name: string; file_size: number; mime_type: string; storage_path: string }
): Promise<ProcessedFile | null> {
  try {
    const { data, error } = await supabase.storage
      .from('card-attachments')
      .download(att.storage_path);

    if (error || !data) return null;

    const text = await data.text();
    const truncated = text.length > MAX_PDF_TEXT_LENGTH
      ? text.slice(0, MAX_PDF_TEXT_LENGTH) + `\n\n[... truncated]`
      : text;

    return {
      fileName: att.file_name,
      mimeType: att.mime_type,
      type: 'text',
      textContent: truncated,
      fileSize: att.file_size,
    };
  } catch {
    return null;
  }
}

/**
 * Format processed files as text context for the system prompt.
 */
export function formatFilesAsContext(files: ProcessedFile[]): string {
  const textFiles = files.filter((f) => f.type === 'text' && f.textContent);
  if (textFiles.length === 0) return '';

  const parts: string[] = ['## Card Attachments'];
  for (const file of textFiles) {
    parts.push(`\n### ${file.fileName}`);
    parts.push(file.textContent!);
  }

  return parts.join('\n');
}
