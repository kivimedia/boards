'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

const COLOR_PRESETS = [
  { color: '#0079bf', label: 'Blue' },
  { color: '#d29034', label: 'Orange' },
  { color: '#519839', label: 'Green' },
  { color: '#b04632', label: 'Red' },
  { color: '#89609e', label: 'Purple' },
  { color: '#cd5a91', label: 'Pink' },
  { color: '#4bbf6b', label: 'Emerald' },
  { color: '#00aecc', label: 'Teal' },
  { color: '#344563', label: 'Dark Blue' },
];

const GRADIENT_PRESETS = [
  { color: 'linear-gradient(135deg, #0079bf 0%, #5067c5 100%)', label: 'Ocean' },
  { color: 'linear-gradient(135deg, #519839 0%, #00aecc 100%)', label: 'Forest' },
  { color: 'linear-gradient(135deg, #b04632 0%, #d29034 100%)', label: 'Sunset' },
  { color: 'linear-gradient(135deg, #89609e 0%, #cd5a91 100%)', label: 'Berry' },
  { color: 'linear-gradient(135deg, #344563 0%, #0079bf 100%)', label: 'Midnight' },
];

interface BoardBackgroundPickerProps {
  boardId: string;
  currentColor?: string | null;
  currentImage?: string | null;
  onUpdate: (color: string | null, image: string | null) => void;
  onClose: () => void;
}

export default function BoardBackgroundPicker({
  boardId,
  currentColor,
  currentImage,
  onUpdate,
  onClose,
}: BoardBackgroundPickerProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const updateBackground = async (color: string | null, image: string | null) => {
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background_color: color, background_image_url: image }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Failed to update background:', err);
        return;
      }
      onUpdate(color, image);
    } catch (err) {
      console.error('Failed to update background:', err);
    }
  };

  const handleColorSelect = (color: string) => {
    updateBackground(color, null);
  };

  const handleImageUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${boardId}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('board-backgrounds')
        .upload(path, file, { upsert: true });

      if (uploadErr) {
        // Bucket might not exist yet; try creating it
        console.error('Upload error:', uploadErr);
        alert('Failed to upload image. Make sure the "board-backgrounds" storage bucket exists.');
        return;
      }

      const { data: urlData } = supabase.storage
        .from('board-backgrounds')
        .getPublicUrl(path);

      await updateBackground(null, urlData.publicUrl);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    updateBackground(null, null);
  };

  return (
    <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-dark-surface rounded-xl shadow-modal border border-cream-dark dark:border-slate-700 z-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Board Background</h3>
        <button onClick={onClose} className="text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-white p-1 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Colors */}
      <div className="mb-3">
        <p className="text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-2">Colors</p>
        <div className="grid grid-cols-5 gap-1.5">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.color}
              onClick={() => handleColorSelect(preset.color)}
              title={preset.label}
              className={`w-full aspect-square rounded-lg transition-all hover:scale-110 hover:ring-2 hover:ring-electric/50 ${
                currentColor === preset.color ? 'ring-2 ring-electric' : ''
              }`}
              style={{ backgroundColor: preset.color }}
            />
          ))}
        </div>
      </div>

      {/* Gradients */}
      <div className="mb-3">
        <p className="text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-2">Gradients</p>
        <div className="grid grid-cols-5 gap-1.5">
          {GRADIENT_PRESETS.map((preset) => (
            <button
              key={preset.color}
              onClick={() => handleColorSelect(preset.color)}
              title={preset.label}
              className={`w-full aspect-square rounded-lg transition-all hover:scale-110 hover:ring-2 hover:ring-electric/50 ${
                currentColor === preset.color ? 'ring-2 ring-electric' : ''
              }`}
              style={{ background: preset.color }}
            />
          ))}
        </div>
      </div>

      {/* Image upload */}
      <div className="mb-3">
        <p className="text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-2">Image</p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full py-2 px-3 rounded-lg border border-dashed border-cream-dark dark:border-slate-600 text-sm text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 hover:border-navy/20 dark:hover:border-slate-400 transition-colors disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : currentImage ? 'Change Image' : 'Upload Image'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageUpload(file);
          }}
        />
      </div>

      {/* Remove */}
      {(currentColor || currentImage) && (
        <button
          onClick={handleRemove}
          className="w-full py-2 px-3 rounded-lg text-sm text-navy/50 dark:text-slate-400 hover:text-danger hover:bg-danger/10 transition-colors"
        >
          Remove Background
        </button>
      )}
    </div>
  );
}
