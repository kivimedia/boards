'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import type { VideoProvider, VideoMode, VideoGenerationSettings, AIVideoGeneration } from '@/lib/types';

interface VideoGenerationWidgetProps {
  cardId: string;
  onGenerated?: (generation: AIVideoGeneration) => void;
}

type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
type Resolution = '480p' | '720p' | '1080p';

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const PROVIDERS: { value: VideoProvider; label: string; description: string }[] = [
  { value: 'sora', label: 'Sora (OpenAI)', description: 'High-quality cinematic video generation' },
  { value: 'veo', label: 'Veo (Google)', description: 'Fast, versatile video generation' },
];

const MODES: { value: VideoMode; label: string; description: string; needsSource: boolean; needsEnd: boolean }[] = [
  { value: 'text_to_video', label: 'Text to Video', description: 'Generate video from a text prompt', needsSource: false, needsEnd: false },
  { value: 'image_to_video', label: 'Image to Video', description: 'Animate a source image', needsSource: true, needsEnd: false },
  { value: 'start_end_frame', label: 'Start/End Frame', description: 'Generate video between two images', needsSource: true, needsEnd: true },
];

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9 (Landscape)' },
  { value: '9:16', label: '9:16 (Portrait)' },
  { value: '1:1', label: '1:1 (Square)' },
  { value: '4:3', label: '4:3 (Classic)' },
  { value: '3:4', label: '3:4 (Tall)' },
];

const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
];

const DURATIONS = [3, 5, 10, 15, 20];

export default function VideoGenerationWidget({ cardId, onGenerated }: VideoGenerationWidgetProps) {
  const [provider, setProvider] = useState<VideoProvider>('sora');
  const [mode, setMode] = useState<VideoMode>('text_to_video');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [endImageUrl, setEndImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedMode = MODES.find((m) => m.value === mode)!;

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast('error', 'Please enter a prompt.');
      return;
    }

    if (selectedMode.needsSource && !sourceImageUrl.trim()) {
      showToast('error', 'Source image URL is required for this mode.');
      return;
    }

    if (selectedMode.needsEnd && !endImageUrl.trim()) {
      showToast('error', 'End image URL is required for start/end frame mode.');
      return;
    }

    setSubmitting(true);

    try {
      const settings: VideoGenerationSettings = {
        duration,
        aspect_ratio: aspectRatio,
        resolution,
      };

      const res = await fetch(`/api/cards/${cardId}/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          mode,
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim() || undefined,
          settings,
          sourceImageUrl: sourceImageUrl.trim() || undefined,
          endImageUrl: endImageUrl.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Video generation failed');
      }

      const json = await res.json();
      showToast('success', 'Video generation started successfully.');
      onGenerated?.(json.data);

      // Reset form
      setPrompt('');
      setNegativePrompt('');
      setSourceImageUrl('');
      setEndImageUrl('');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Video generation failed.');
    } finally {
      setSubmitting(false);
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
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">AI Video Generation</h3>
      </div>

      {/* Provider Selector */}
      <div>
        <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
          Provider
        </label>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              onClick={() => setProvider(p.value)}
              className={`
                px-3 py-2.5 text-left rounded-xl border transition-all duration-200
                ${provider === p.value
                  ? 'bg-electric/5 border-electric text-navy dark:text-slate-100 shadow-sm'
                  : 'bg-cream dark:bg-dark-bg border-cream-dark dark:border-slate-700 text-navy/60 dark:text-slate-400 hover:border-navy/20 hover:text-navy dark:hover:text-slate-100'
                }
              `}
            >
              <span className="block text-sm font-medium">{p.label}</span>
              <span className="block text-xs text-navy/40 dark:text-slate-500 mt-0.5">{p.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mode Selector */}
      <div>
        <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
          Mode
        </label>
        <div className="flex rounded-xl bg-cream-dark dark:bg-slate-800 p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`
                flex-1 py-1.5 text-xs font-medium rounded-lg transition-all duration-200
                ${mode === m.value
                  ? 'bg-white dark:bg-dark-surface text-navy dark:text-slate-100 shadow-sm'
                  : 'text-navy/50 dark:text-slate-400 hover:text-navy/70 dark:hover:text-slate-200'
                }
              `}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-navy/40 dark:text-slate-500 font-body">{selectedMode.description}</p>
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
          Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the video you want to generate..."
          rows={3}
          className="
            w-full px-3 py-2.5 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
            placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
            focus:border-electric font-body resize-none
          "
        />
      </div>

      {/* Source Image URL (conditional) */}
      {selectedMode.needsSource && (
        <div>
          <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
            Source Image URL
          </label>
          <input
            type="url"
            value={sourceImageUrl}
            onChange={(e) => setSourceImageUrl(e.target.value)}
            placeholder="https://example.com/source-image.png"
            className="
              w-full px-3 py-2.5 rounded-xl bg-cream border border-cream-dark text-sm text-navy
              placeholder:text-navy/30 focus:outline-none focus:ring-2 focus:ring-electric/30
              focus:border-electric font-body
            "
          />
        </div>
      )}

      {/* End Image URL (conditional) */}
      {selectedMode.needsEnd && (
        <div>
          <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
            End Image URL
          </label>
          <input
            type="url"
            value={endImageUrl}
            onChange={(e) => setEndImageUrl(e.target.value)}
            placeholder="https://example.com/end-image.png"
            className="
              w-full px-3 py-2.5 rounded-xl bg-cream border border-cream-dark text-sm text-navy
              placeholder:text-navy/30 focus:outline-none focus:ring-2 focus:ring-electric/30
              focus:border-electric font-body
            "
          />
        </div>
      )}

      {/* Settings */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading hover:text-navy/70 dark:hover:text-slate-200 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${showAdvanced ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Settings
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 p-3 rounded-xl bg-cream/50 dark:bg-navy/30 border border-cream-dark dark:border-slate-700">
            {/* Duration */}
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 font-heading">
                Duration (seconds)
              </label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`
                      px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200
                      ${duration === d
                        ? 'bg-electric text-white border-electric shadow-sm'
                        : 'bg-white dark:bg-dark-surface border-cream-dark dark:border-slate-700 text-navy/60 dark:text-slate-400 hover:border-navy/20 hover:text-navy dark:hover:text-slate-100'
                      }
                    `}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 font-heading">
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
                        : 'bg-white dark:bg-dark-surface border-cream-dark dark:border-slate-700 text-navy/60 dark:text-slate-400 hover:border-navy/20 hover:text-navy dark:hover:text-slate-100'
                      }
                    `}
                  >
                    {ar.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resolution */}
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 font-heading">
                Resolution
              </label>
              <div className="flex flex-wrap gap-2">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setResolution(r.value)}
                    className={`
                      px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200
                      ${resolution === r.value
                        ? 'bg-electric text-white border-electric shadow-sm'
                        : 'bg-white dark:bg-dark-surface border-cream-dark dark:border-slate-700 text-navy/60 dark:text-slate-400 hover:border-navy/20 hover:text-navy dark:hover:text-slate-100'
                      }
                    `}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Negative Prompt */}
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 font-heading">
                Negative Prompt (optional)
              </label>
              <input
                type="text"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="Elements to avoid in the video..."
                className="
                  w-full px-3 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
                  placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
                  focus:border-electric font-body
                "
              />
            </div>
          </div>
        )}
      </div>

      {/* Generate Button */}
      <div className="flex justify-end pt-1">
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={!prompt.trim() || submitting}
          loading={submitting}
        >
          {submitting ? (
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Generate Video
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
