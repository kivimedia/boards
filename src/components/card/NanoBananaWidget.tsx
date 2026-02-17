'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';

interface Attachment {
  id: string;
  file_name: string;
  mime_type: string;
  storage_path: string;
}

interface NanoBananaWidgetProps {
  cardId: string;
  attachments: Attachment[];
  onCoverSet?: (url: string) => void;
}

type Tab = 'edit' | 'generate';
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
type ImageProvider = 'gemini' | 'replicate';

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: '1:1', label: '1:1 (Square)' },
  { value: '16:9', label: '16:9 (Landscape)' },
  { value: '9:16', label: '9:16 (Portrait)' },
  { value: '4:3', label: '4:3 (Classic)' },
  { value: '3:4', label: '3:4 (Tall)' },
];

const STYLE_PRESETS = [
  { id: 'social_post', label: 'Social Post' },
  { id: 'ad_banner', label: 'Ad Banner' },
  { id: 'hero_image', label: 'Hero Image' },
  { id: 'product_shot', label: 'Product Shot' },
  { id: 'mood_board', label: 'Mood Board' },
  { id: 'photo_realistic', label: 'Photo Realistic' },
];

export default function NanoBananaWidget({ cardId, attachments, onCoverSet }: NanoBananaWidgetProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('edit');

  // Edit tab state
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string>(
    attachments.length > 0 ? attachments[0].id : ''
  );
  const [editInstruction, setEditInstruction] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editResultId, setEditResultId] = useState<string | null>(null);

  // Generate tab state
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [provider, setProvider] = useState<ImageProvider>('gemini');
  const [stylePreset, setStylePreset] = useState<string | null>(null);
  const [enhancePrompt, setEnhancePrompt] = useState(true);
  const [generateSubmitting, setGenerateSubmitting] = useState(false);
  const [generateResultId, setGenerateResultId] = useState<string | null>(null);
  const [enhancedPromptText, setEnhancedPromptText] = useState<string | null>(null);
  const [showEnhancedPrompt, setShowEnhancedPrompt] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [settingCover, setSettingCover] = useState(false);

  // Shared
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const imageAttachments = attachments.filter((a) =>
    a.mime_type.startsWith('image/')
  );

  // Fetch preview URL when a result is generated
  useEffect(() => {
    if (!generateResultId) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;

    async function fetchPreview() {
      try {
        const res = await fetch(`/api/cards/${cardId}/attachments/${generateResultId}/signed-url`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.data?.url) {
          setPreviewUrl(json.data.url);
        }
      } catch {
        // Preview is optional, ignore errors
      }
    }

    fetchPreview();
    return () => { cancelled = true; };
  }, [generateResultId, cardId]);

  // -------------------------------------------------------------------------
  // Edit handler
  // -------------------------------------------------------------------------
  const handleEdit = async () => {
    if (!selectedAttachmentId) {
      showToast('error', 'Please select an attachment to edit.');
      return;
    }
    if (!editInstruction.trim()) {
      showToast('error', 'Please enter an edit instruction.');
      return;
    }

    setEditSubmitting(true);
    setEditResultId(null);

    try {
      const res = await fetch(`/api/cards/${cardId}/nano-banana/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachmentId: selectedAttachmentId,
          editInstruction: editInstruction.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Image edit failed');
      }

      const json = await res.json();
      const newAttachmentId = json.data?.attachmentId;
      setEditResultId(newAttachmentId);
      showToast('success', 'Image edited successfully.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Image edit failed.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Generate handler
  // -------------------------------------------------------------------------
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast('error', 'Please enter a prompt.');
      return;
    }

    setGenerateSubmitting(true);
    setGenerateResultId(null);
    setEnhancedPromptText(null);
    setPreviewUrl(null);

    try {
      const res = await fetch(`/api/cards/${cardId}/nano-banana/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspectRatio,
          provider,
          stylePreset: stylePreset ?? undefined,
          enhancePrompt,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Image generation failed');
      }

      const json = await res.json();
      const newAttachmentId = json.data?.attachmentId;
      setGenerateResultId(newAttachmentId);
      if (json.data?.enhancedPrompt) {
        setEnhancedPromptText(json.data.enhancedPrompt);
      }
      showToast('success', 'Image generated successfully.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Image generation failed.');
    } finally {
      setGenerateSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Set as cover handler
  // -------------------------------------------------------------------------
  const handleSetAsCover = async () => {
    if (!previewUrl) return;
    setSettingCover(true);
    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_image_url: previewUrl }),
      });
      if (!res.ok) throw new Error('Failed to set cover');
      onCoverSet?.(previewUrl);
      showToast('success', 'Cover image updated.');
    } catch {
      showToast('error', 'Failed to set as cover image.');
    } finally {
      setSettingCover(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
            animate-in fade-in slide-in-from-top-2 duration-200
            ${toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300'
              : 'bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300'
            }
          `}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Nano Banana</h3>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-cream-dark dark:bg-slate-800 p-1">
        <button
          onClick={() => setActiveTab('edit')}
          className={`
            flex-1 py-1.5 text-sm font-medium rounded-lg transition-all duration-200
            ${activeTab === 'edit'
              ? 'bg-white dark:bg-dark-surface text-navy dark:text-slate-100 shadow-sm'
              : 'text-navy/50 dark:text-slate-400 hover:text-navy/70 dark:hover:text-slate-300'
            }
          `}
        >
          Edit
        </button>
        <button
          onClick={() => setActiveTab('generate')}
          className={`
            flex-1 py-1.5 text-sm font-medium rounded-lg transition-all duration-200
            ${activeTab === 'generate'
              ? 'bg-white dark:bg-dark-surface text-navy dark:text-slate-100 shadow-sm'
              : 'text-navy/50 dark:text-slate-400 hover:text-navy/70 dark:hover:text-slate-300'
            }
          `}
        >
          Generate
        </button>
      </div>

      {/* Edit Tab */}
      {activeTab === 'edit' && (
        <div className="space-y-3">
          {imageAttachments.length === 0 ? (
            <div className="p-4 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-center">
              <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
                No image attachments available. Upload an image first or use the Generate tab.
              </p>
            </div>
          ) : (
            <>
              {/* Attachment selector */}
              <div>
                <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
                  Source Image
                </label>
                <select
                  value={selectedAttachmentId}
                  onChange={(e) => setSelectedAttachmentId(e.target.value)}
                  className="
                    w-full px-3 py-2.5 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
                    focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body
                    appearance-none cursor-pointer
                  "
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%230f172a' stroke-opacity='0.3'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '1rem',
                  }}
                >
                  {imageAttachments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.file_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Edit instruction */}
              <div>
                <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
                  Edit Instruction
                </label>
                <input
                  type="text"
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  placeholder="e.g. Make the background blue, remove the text..."
                  className="
                    w-full px-3 py-2.5 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
                    placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
                    focus:border-electric font-body
                  "
                />
              </div>

              {/* Submit */}
              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={handleEdit}
                  disabled={!selectedAttachmentId || !editInstruction.trim()}
                  loading={editSubmitting}
                >
                  {editSubmitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Editing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit Image
                    </span>
                  )}
                </Button>
              </div>

              {/* Edit result */}
              {editResultId && (
                <div className="p-3 rounded-xl bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800">
                  <p className="text-sm text-green-800 dark:text-green-300 font-body">
                    Edited image saved as new attachment.
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 font-body mt-1">
                    Attachment ID: {editResultId}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Generate Tab */}
      {activeTab === 'generate' && (
        <div className="space-y-3">
          {/* Provider toggle */}
          <div>
            <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
              Provider
            </label>
            <div className="flex rounded-lg bg-cream-dark dark:bg-slate-800 p-0.5">
              <button
                onClick={() => setProvider('gemini')}
                className={`
                  flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-200
                  ${provider === 'gemini'
                    ? 'bg-white dark:bg-dark-surface text-navy dark:text-slate-100 shadow-sm'
                    : 'text-navy/50 dark:text-slate-400 hover:text-navy/70 dark:hover:text-slate-300'
                  }
                `}
              >
                Gemini
              </button>
              <button
                onClick={() => setProvider('replicate')}
                className={`
                  flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-200
                  ${provider === 'replicate'
                    ? 'bg-white dark:bg-dark-surface text-navy dark:text-slate-100 shadow-sm'
                    : 'text-navy/50 dark:text-slate-400 hover:text-navy/70 dark:hover:text-slate-300'
                  }
                `}
              >
                FLUX (Replicate)
              </button>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              rows={3}
              className="
                w-full px-3 py-2.5 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
                placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
                focus:border-electric font-body resize-none
              "
            />
          </div>

          {/* Enhance prompt toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enhancePrompt}
              onChange={(e) => setEnhancePrompt(e.target.checked)}
              className="rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30 h-4 w-4"
            />
            <span className="text-xs font-medium text-navy/70 dark:text-slate-300 font-body">
              Let AI improve your prompt
            </span>
          </label>

          {/* Style Presets */}
          <div>
            <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
              Style Preset
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setStylePreset(stylePreset === preset.id ? null : preset.id)}
                  className={`
                    px-2.5 py-1 text-xs font-medium rounded-lg border transition-all duration-200
                    ${stylePreset === preset.id
                      ? 'bg-electric text-white border-electric shadow-sm'
                      : 'bg-cream dark:bg-dark-bg border-cream-dark dark:border-slate-700 text-navy/60 dark:text-slate-400 hover:border-navy/20 dark:hover:border-slate-600 hover:text-navy dark:hover:text-slate-200'
                    }
                  `}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
              Aspect Ratio
            </label>
            <div className="flex flex-wrap gap-2">
              {ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar.value}
                  onClick={() => setAspectRatio(ar.value)}
                  className={`
                    px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200
                    ${aspectRatio === ar.value
                      ? 'bg-electric text-white border-electric shadow-sm'
                      : 'bg-cream dark:bg-dark-bg border-cream-dark dark:border-slate-700 text-navy/60 dark:text-slate-400 hover:border-navy/20 dark:hover:border-slate-600 hover:text-navy dark:hover:text-slate-200'
                    }
                  `}
                >
                  {ar.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-1">
            {generateResultId && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setGenerateResultId(null);
                  setPreviewUrl(null);
                  setEnhancedPromptText(null);
                  handleGenerate();
                }}
                disabled={generateSubmitting}
              >
                Generate Another
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              loading={generateSubmitting}
            >
              {generateSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Generate Image
                </span>
              )}
            </Button>
          </div>

          {/* Loading placeholder */}
          {generateSubmitting && (
            <div className="rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden">
              <div className="h-48 bg-cream dark:bg-dark-bg animate-pulse flex items-center justify-center">
                <span className="text-sm text-navy/40 dark:text-slate-500 font-body">
                  Generating with {provider === 'replicate' ? 'FLUX' : 'Gemini'}...
                </span>
              </div>
            </div>
          )}

          {/* Image preview */}
          {!generateSubmitting && previewUrl && (
            <div className="space-y-2">
              <div className="rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Generated image"
                  className="w-full h-auto max-h-64 object-contain bg-cream dark:bg-dark-bg"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleSetAsCover}
                  loading={settingCover}
                  disabled={settingCover}
                >
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                    </svg>
                    Set as Cover
                  </span>
                </Button>
              </div>
            </div>
          )}

          {/* Enhanced prompt display */}
          {!generateSubmitting && enhancedPromptText && (
            <div>
              <button
                onClick={() => setShowEnhancedPrompt(!showEnhancedPrompt)}
                className="text-xs text-electric hover:text-electric/80 font-medium font-body flex items-center gap-1"
              >
                <svg
                  className={`w-3 h-3 transition-transform ${showEnhancedPrompt ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Enhanced prompt
              </button>
              {showEnhancedPrompt && (
                <div className="mt-1.5 p-2.5 rounded-lg bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700">
                  <p className="text-xs text-navy/70 dark:text-slate-400 font-body leading-relaxed">
                    {enhancedPromptText}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Generate result (text fallback when no preview) */}
          {!generateSubmitting && generateResultId && !previewUrl && (
            <div className="p-3 rounded-xl bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800">
              <p className="text-sm text-green-800 dark:text-green-300 font-body">
                Image generated and saved as new attachment.
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 font-body mt-1">
                Attachment ID: {generateResultId}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
