'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Attachment } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';

interface CardAttachmentsProps {
  cardId: string;
  coverImageUrl?: string | null;
  onCoverChange?: (url: string | null) => void;
  onRefresh: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'spreadsheet';
  if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('text')) return 'document';
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) return 'archive';
  return 'file';
}

function FileIcon({ type }: { type: string }) {
  const iconColors: Record<string, string> = {
    image: 'text-purple-500',
    video: 'text-pink-500',
    audio: 'text-green-500',
    pdf: 'text-red-500',
    spreadsheet: 'text-emerald-500',
    document: 'text-blue-500',
    archive: 'text-amber-500',
    file: 'text-navy/40',
  };

  return (
    <div className={`w-8 h-8 rounded-lg bg-cream-dark dark:bg-slate-700 flex items-center justify-center ${iconColors[type] || iconColors.file}`}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {type === 'image' ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        ) : type === 'pdf' ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        )}
      </svg>
    </div>
  );
}

function ImageThumbnail({ storagePath, fileName, supabase }: { storagePath: string; fileName: string; supabase: ReturnType<typeof createClient> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (storagePath.startsWith('s3://')) return;
    supabase.storage
      .from('card-attachments')
      .createSignedUrl(storagePath, 300, { transform: { width: 80, height: 80, resize: 'cover' } })
      .then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl); });
  }, [storagePath, supabase]);

  if (!url) {
    return <FileIcon type="image" />;
  }
  return (
    <img
      src={url}
      alt={fileName}
      className="w-10 h-10 rounded-lg object-cover bg-cream-dark dark:bg-slate-700"
    />
  );
}

export default function CardAttachments({ cardId, coverImageUrl, onCoverChange, onRefresh }: CardAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const supabase = createClient();

  useEffect(() => {
    fetchAttachments();
  }, [cardId]);

  const fetchAttachments = async () => {
    const { data } = await supabase
      .from('attachments')
      .select('*')
      .eq('card_id', cardId)
      .order('created_at', { ascending: false });
    setAttachments(data || []);
  };

  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

  const uploadFile = async (file: File) => {
    if (!user) {
      alert('You must be logged in to upload files.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert(`File "${file.name}" exceeds the 500MB limit.`);
      return;
    }

    setUploading(true);

    try {
      // Use server-side upload endpoint (handles S3 for large files >50MB, Supabase for smaller)
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/cards/${cardId}/attachments/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        console.error('Upload failed:', json.error || response.statusText);
        alert(json.error || 'Upload failed. Please try again.');
      } else {
        await fetchAttachments();
        onRefresh();
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected (or a new pick triggers onChange reliably)
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => uploadFile(file));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const isLinkAttachment = (att: Attachment) => att.mime_type === 'text/uri-list';

  const addLinkAttachment = async () => {
    if (!user || !linkUrl.trim()) return;
    setAddingLink(true);
    try {
      let url = linkUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      const displayName = linkName.trim() || new URL(url).hostname;

      const response = await fetch(`/api/cards/${cardId}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: displayName,
          file_size: 0,
          mime_type: 'text/uri-list',
          storage_path: url,
          uploaded_by: user.id,
        }),
      });

      if (response.ok) {
        setLinkUrl('');
        setLinkName('');
        setShowLinkForm(false);
        await fetchAttachments();
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to add link:', err);
    } finally {
      setAddingLink(false);
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    // S3-stored files need a server-side presigned URL
    if (attachment.storage_path.startsWith('s3://')) {
      try {
        const res = await fetch(`/api/cards/${cardId}/attachments/${attachment.id}/download`);
        const json = await res.json();
        if (json.data?.url) {
          window.open(json.data.url, '_blank');
        }
      } catch (err) {
        console.error('Failed to get S3 download URL:', err);
      }
      return;
    }

    // Supabase Storage files
    const { data } = await supabase.storage
      .from('card-attachments')
      .createSignedUrl(attachment.storage_path, 60);

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };

  const handleSetCover = async (attachment: Attachment) => {
    try {
      // Store the storage path as the cover (board-data.ts will sign it)
      const storagePath = attachment.storage_path;

      const { error } = await supabase
        .from('cards')
        .update({ cover_image_url: storagePath })
        .eq('id', cardId);

      if (!error) {
        // Get a signed URL for immediate display in the modal
        const { data: signedData } = await supabase.storage
          .from('card-attachments')
          .createSignedUrl(storagePath, 3600);
        onCoverChange?.(signedData?.signedUrl || storagePath);
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to set cover:', err);
    }
  };

  const handleRemoveCover = async () => {
    try {
      const { error } = await supabase
        .from('cards')
        .update({ cover_image_url: null })
        .eq('id', cardId);

      if (!error) {
        onCoverChange?.(null);
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to remove cover:', err);
    }
  };

  const isCurrentCover = (attachment: Attachment) => {
    if (!coverImageUrl) return false;
    // Check if the current cover URL contains this attachment's storage path
    return coverImageUrl.includes(attachment.storage_path) ||
      attachment.storage_path.includes(coverImageUrl);
  };

  const handleDelete = async (attachmentId: string) => {
    const response = await fetch(`/api/cards/${cardId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      await fetchAttachments();
      onRefresh();
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 mb-3 font-heading">
        Attachments ({attachments.length})
      </h3>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative rounded-xl border-2 border-dashed p-6 mb-4 text-center transition-all
          ${isDragOver
            ? 'border-electric bg-electric/5'
            : 'border-cream-dark dark:border-slate-700 hover:border-navy/20 dark:hover:border-slate-600 bg-cream dark:bg-navy'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />

        {uploading ? (
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm text-navy/50 dark:text-slate-400 font-body">Uploading...</span>
          </div>
        ) : (
          <>
            <svg className="w-8 h-8 text-navy/20 dark:text-slate-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-navy/40 dark:text-slate-400 font-body mb-2">
              Drag and drop files here, or
            </p>
            <div className="flex items-center gap-2 justify-center">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse files
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowLinkForm(!showLinkForm)}
              >
                Add link
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Link attachment form */}
      {showLinkForm && (
        <div className="mb-4 p-3 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700">
          <div className="space-y-2">
            <input
              type="url"
              placeholder="https://example.com/resource"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-600 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body placeholder:text-navy/30 dark:placeholder:text-slate-500"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && addLinkAttachment()}
            />
            <input
              type="text"
              placeholder="Display name (optional)"
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-600 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body placeholder:text-navy/30 dark:placeholder:text-slate-500"
              onKeyDown={(e) => e.key === 'Enter' && addLinkAttachment()}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={addLinkAttachment} disabled={addingLink || !linkUrl.trim()}>
                {addingLink ? 'Adding...' : 'Add'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setShowLinkForm(false); setLinkUrl(''); setLinkName(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Attachment list */}
      <div className="space-y-2">
        {attachments.map((attachment) => {
          const isLink = isLinkAttachment(attachment);
          return (
            <div
              key={attachment.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 group hover:border-navy/10 dark:hover:border-slate-600 transition-all"
            >
              {isLink ? (
                <div className="w-8 h-8 rounded-lg bg-electric/10 flex items-center justify-center text-electric">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
              ) : attachment.mime_type?.startsWith('image/') && !attachment.storage_path.startsWith('s3://') ? (
                <ImageThumbnail storagePath={attachment.storage_path} fileName={attachment.file_name} supabase={supabase} />
              ) : (
                <FileIcon type={getFileIcon(attachment.mime_type)} />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-navy dark:text-slate-100 truncate font-body">
                  {attachment.file_name}
                  {!isLink && isCurrentCover(attachment) && (
                    <span className="ml-1.5 inline-block text-[9px] font-semibold uppercase bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 px-1 py-0.5 rounded">Cover</span>
                  )}
                  {attachment.storage_path?.startsWith('s3://') && (
                    <span className="ml-1.5 inline-block text-[9px] font-semibold uppercase bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1 py-0.5 rounded">S3</span>
                  )}
                </p>
                <p className="text-[11px] text-navy/30 dark:text-slate-500 font-body truncate">
                  {isLink ? (
                    attachment.storage_path
                  ) : (
                    <>
                      {formatFileSize(attachment.file_size)} &middot;{' '}
                      {new Date(attachment.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                {/* Set as Cover / Remove Cover for image attachments */}
                {!isLink && attachment.mime_type?.startsWith('image/') && attachment.storage_path && !attachment.storage_path.startsWith('s3://') && (
                  isCurrentCover(attachment) ? (
                    <button
                      onClick={() => handleRemoveCover()}
                      className="p-1.5 rounded-lg text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                      title="Remove cover"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSetCover(attachment)}
                      className="p-1.5 rounded-lg text-navy/40 dark:text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                      title="Set as cover"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </button>
                  )
                )}
                {isLink ? (
                  <button
                    onClick={() => window.open(attachment.storage_path, '_blank')}
                    className="p-1.5 rounded-lg text-navy/40 dark:text-slate-400 hover:text-electric hover:bg-electric/10 transition-all"
                    title="Open link"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={() => handleDownload(attachment)}
                    className="p-1.5 rounded-lg text-navy/40 dark:text-slate-400 hover:text-electric hover:bg-electric/10 transition-all"
                    title="Download"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => handleDelete(attachment.id)}
                  className="p-1.5 rounded-lg text-navy/40 dark:text-slate-400 hover:text-danger hover:bg-danger/10 transition-all"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}

        {attachments.length === 0 && (
          <p className="text-sm text-navy/30 dark:text-slate-500 text-center py-4 font-body">
            No attachments yet
          </p>
        )}
      </div>
    </div>
  );
}
