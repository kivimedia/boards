'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Attachment } from '@/lib/types';

interface CardDetailAttachmentsProps {
  cardId: string;
  coverImageUrl: string | null;
  onCoverChange: (url: string | null) => void;
  onRefresh: () => void;
}

function ImageThumb({ storagePath, supabase }: { storagePath: string; supabase: ReturnType<typeof createClient> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (storagePath.startsWith('s3://') || storagePath.startsWith('http')) return;
    supabase.storage
      .from('card-attachments')
      .createSignedUrl(storagePath, 300, { transform: { width: 64, height: 64, resize: 'cover' } })
      .then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl); });
  }, [storagePath, supabase]);

  if (!url) {
    return (
      <div className="w-16 h-16 rounded-lg bg-cream-dark dark:bg-slate-700 flex items-center justify-center">
        <svg className="w-5 h-5 text-navy/20 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }
  return <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover" />;
}

export default function CardDetailAttachments({ cardId, coverImageUrl, onCoverChange, onRefresh }: CardDetailAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('attachments')
        .select('*')
        .eq('card_id', cardId)
        .order('created_at', { ascending: false });
      setAttachments(data || []);
      setLoading(false);
    })();
  }, [cardId]);

  const imageAttachments = attachments.filter(
    (a) => a.mime_type?.startsWith('image/') && !a.storage_path.startsWith('s3://')
  );
  const otherAttachments = attachments.filter(
    (a) => !a.mime_type?.startsWith('image/') || a.storage_path.startsWith('s3://')
  );

  const isCurrentCover = (att: Attachment) => {
    if (!coverImageUrl) return false;
    return coverImageUrl.includes(att.storage_path) || att.storage_path.includes(coverImageUrl);
  };

  const handleSetCover = async (att: Attachment) => {
    const { error } = await supabase
      .from('cards')
      .update({ cover_image_url: att.storage_path })
      .eq('id', cardId);
    if (!error) {
      const { data: signedData } = await supabase.storage
        .from('card-attachments')
        .createSignedUrl(att.storage_path, 3600);
      onCoverChange(signedData?.signedUrl || att.storage_path);
      onRefresh();
    }
  };

  const handleRemoveCover = async () => {
    const { error } = await supabase
      .from('cards')
      .update({ cover_image_url: null })
      .eq('id', cardId);
    if (!error) {
      onCoverChange(null);
      onRefresh();
    }
  };

  if (loading) return null;
  if (attachments.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 font-heading mb-2">
        Attachments ({attachments.length})
      </h3>

      {/* Image attachments as thumbnail grid with cover controls */}
      {imageAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {imageAttachments.map((att) => {
            const isCover = isCurrentCover(att);
            return (
              <div key={att.id} className="relative group">
                <ImageThumb storagePath={att.storage_path} supabase={supabase} />
                {/* Cover badge */}
                {isCover && (
                  <span className="absolute top-0.5 left-0.5 text-[8px] font-bold uppercase bg-amber-400 text-white px-1 rounded">
                    Cover
                  </span>
                )}
                {/* Hover overlay with make/remove featured */}
                <div className="absolute inset-0 rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {isCover ? (
                    <button
                      onClick={() => handleRemoveCover()}
                      className="text-[9px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded hover:bg-black/80 transition-colors"
                    >
                      Remove cover
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSetCover(att)}
                      className="text-[9px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded hover:bg-black/80 transition-colors"
                    >
                      Make cover
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Other attachments as compact list */}
      {otherAttachments.length > 0 && (
        <div className="space-y-1">
          {otherAttachments.slice(0, 5).map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 text-xs text-navy/60 dark:text-slate-400 font-body"
            >
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span className="truncate">{att.file_name}</span>
            </div>
          ))}
          {otherAttachments.length > 5 && (
            <p className="text-[10px] text-navy/30 dark:text-slate-500 font-body pl-5">
              +{otherAttachments.length - 5} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}
