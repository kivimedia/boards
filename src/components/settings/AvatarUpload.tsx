'use client';

import { useState, useRef } from 'react';
import Avatar from '@/components/ui/Avatar';

interface AvatarUploadProps {
  currentUrl: string | null;
  displayName: string;
  onUploaded?: (url: string | null) => void;
}

export default function AvatarUpload({ currentUrl, displayName, onUploaded }: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed');
        return;
      }

      setAvatarUrl(data.avatar_url);
      onUploaded?.(data.avatar_url);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setUploading(true);

    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to remove avatar');
        return;
      }

      setAvatarUrl(null);
      onUploaded?.(null);
    } catch {
      setError('Failed to remove avatar. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative group cursor-pointer"
        onClick={() => !uploading && fileRef.current?.click()}
      >
        {/* Avatar display */}
        <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-cream-dark dark:ring-slate-700">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <Avatar name={displayName} size="xl" className="!w-20 !h-20 !text-2xl !ring-0" />
          )}
        </div>

        {/* Hover overlay */}
        {!uploading && (
          <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
        )}

        {/* Uploading spinner */}
        {uploading && (
          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = '';
        }}
      />

      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-xs text-electric hover:text-electric/80 font-medium transition-colors disabled:opacity-50"
        >
          Change photo
        </button>
        {avatarUrl && (
          <>
            <span className="text-xs text-navy/20 dark:text-slate-600">|</span>
            <button
              onClick={handleRemove}
              disabled={uploading}
              className="text-xs text-danger hover:text-danger/80 font-medium transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-danger mt-1">{error}</p>
      )}
    </div>
  );
}
