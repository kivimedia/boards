'use client';

import { useState, useEffect, useRef } from 'react';

interface PersonalizationElement {
  fact: string;
  source_url: string;
  source_type: string;
  screenshot_or_quote: string;
  date_found: string;
  confidence: 'high' | 'medium' | 'low';
  verification_status: 'verified' | 'unverified' | 'stale' | 'risky';
  validation_details?: {
    status: string;
    issues: Array<{ check: string; passed: boolean; detail: string }>;
    checks_passed: number;
    checks_total: number;
  };
}

interface ToneProfile {
  communication_style: string;
  favorite_topics: string[];
  pet_peeves: string[];
  humor_level: string;
  formality: string;
  preferred_platforms: string[];
}

interface Dossier {
  id: string;
  candidate_id: string;
  personalization_elements: PersonalizationElement[];
  tone_profile: ToneProfile;
  story_angle: string;
  potential_hooks: string[];
  red_flags: string[];
  sources_checked: number;
  sources_found: number;
  research_duration_ms: number;
  tokens_used: number;
  cost_usd: number;
  validation_summary?: {
    total_elements: number;
    verified: number;
    unverified: number;
    stale: number;
    risky: number;
    usable_for_copy: number;
  };
  created_at: string;
}

const CONFIDENCE_DOT: Record<string, string> = {
  high: 'bg-green-500',
  medium: 'bg-yellow-500',
  low: 'bg-red-400',
};

const VERIFICATION_BADGE: Record<string, { classes: string; label: string }> = {
  verified: {
    classes: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    label: 'Verified',
  },
  unverified: {
    classes: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
    label: 'Unverified',
  },
  stale: {
    classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    label: 'Stale',
  },
  risky: {
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    label: 'Risky',
  },
};

interface DossierViewerProps {
  candidateId: string;
  candidateName: string;
  onClose?: () => void;
}

export default function DossierViewer({ candidateId, candidateName, onClose }: DossierViewerProps) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'elements' | 'tone' | 'hooks'>('elements');
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDossier();
  }, [candidateId]);

  const loadDossier = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/podcast/candidates/${candidateId}/dossier`);
      const json = await res.json();
      if (json.data?.dossier) {
        setDossier(json.data.dossier);
      }
    } catch (err) {
      console.error('Failed to load dossier:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateDossier = async () => {
    setGenerating(true);
    setProgress([]);
    setError(null);

    try {
      const res = await fetch(`/api/podcast/candidates/${candidateId}/dossier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Request failed' }));
        setError(errJson.error || `HTTP ${res.status}`);
        setGenerating(false);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        setError('No stream available');
        setGenerating(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'progress') {
                setProgress((prev) => [...prev, data.message]);
                if (progressRef.current) {
                  progressRef.current.scrollTop = progressRef.current.scrollHeight;
                }
              } else if (currentEvent === 'error') {
                setError(data.error);
              } else if (currentEvent === 'complete' && data.dossier_id) {
                // Reload the dossier from DB
                await loadDossier();
              }
            } catch {
              // ignore parse errors
            }
            currentEvent = '';
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  // Generating state
  if (generating) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
          <span className="text-sm font-semibold text-navy dark:text-slate-100">
            Researching {candidateName}...
          </span>
        </div>
        <div
          ref={progressRef}
          className="max-h-40 overflow-y-auto rounded-lg bg-slate-50 dark:bg-slate-900 p-3 space-y-1"
        >
          {progress.map((msg, i) => (
            <p key={i} className="text-xs text-navy/60 dark:text-slate-400 font-mono">
              {msg}
            </p>
          ))}
          {progress.length === 0 && (
            <p className="text-xs text-navy/40 dark:text-slate-500 italic">Starting research...</p>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }

  // No dossier yet
  if (!dossier) {
    return (
      <div className="space-y-3">
        <div className="text-center py-6 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-navy/10 dark:border-slate-700">
          <svg className="w-8 h-8 mx-auto text-navy/20 dark:text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-navy/50 dark:text-slate-400 mb-3">
            No research dossier yet
          </p>
          <button
            onClick={generateDossier}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 transition-colors"
          >
            Generate Research Dossier
          </button>
          <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-2">
            AI will research this candidate across 7 sources. Takes 1-2 min.
          </p>
        </div>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }

  // Dossier exists - show it
  const vs = dossier.validation_summary;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase">
          Research Dossier
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-navy/30 dark:text-slate-600">
            {new Date(dossier.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <span className="text-[10px] text-navy/30 dark:text-slate-600">
            ${dossier.cost_usd?.toFixed(3) || '0.000'}
          </span>
          <button
            onClick={generateDossier}
            className="text-[10px] text-electric hover:underline"
          >
            Regenerate
          </button>
        </div>
      </div>

      {/* Validation summary bar */}
      {vs && (
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-green-600 dark:text-green-400 font-semibold">{vs.verified} verified</span>
          <span className="text-navy/20 dark:text-slate-700">|</span>
          <span className="text-navy/40 dark:text-slate-500">{vs.unverified} unverified</span>
          {vs.stale > 0 && (
            <>
              <span className="text-navy/20 dark:text-slate-700">|</span>
              <span className="text-amber-600 dark:text-amber-400">{vs.stale} stale</span>
            </>
          )}
          {vs.risky > 0 && (
            <>
              <span className="text-navy/20 dark:text-slate-700">|</span>
              <span className="text-red-600 dark:text-red-400">{vs.risky} risky</span>
            </>
          )}
          <span className="text-navy/20 dark:text-slate-700">|</span>
          <span className="text-electric font-semibold">{vs.usable_for_copy} usable for copy</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-navy/5 dark:border-slate-700">
        {(['elements', 'tone', 'hooks'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors border-b-2 ${
              activeTab === tab
                ? 'text-electric border-electric'
                : 'text-navy/40 dark:text-slate-500 border-transparent hover:text-navy/60 dark:hover:text-slate-300'
            }`}
          >
            {tab === 'elements' ? `Elements (${dossier.personalization_elements.length})` : tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'elements' && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {dossier.personalization_elements.map((el, idx) => {
            const badge = VERIFICATION_BADGE[el.verification_status] || VERIFICATION_BADGE.unverified;
            return (
              <div
                key={idx}
                className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-navy/5 dark:border-slate-700"
              >
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${CONFIDENCE_DOT[el.confidence] || CONFIDENCE_DOT.low}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-navy dark:text-slate-200 font-body">
                      {el.fact}
                    </p>
                    {el.screenshot_or_quote && (
                      <p className="text-xs text-navy/40 dark:text-slate-500 mt-1 italic">
                        &ldquo;{el.screenshot_or_quote}&rdquo;
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.classes}`}>
                        {badge.label}
                      </span>
                      <span className="text-[10px] text-navy/30 dark:text-slate-600">
                        {el.source_type}
                      </span>
                      {el.source_url && el.source_url !== 'n/a' && (
                        <a
                          href={el.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-electric hover:underline truncate max-w-[200px]"
                        >
                          Source
                        </a>
                      )}
                      <span className="text-[10px] text-navy/20 dark:text-slate-700">
                        {el.date_found}
                      </span>
                    </div>
                    {/* Validation details */}
                    {el.validation_details && (
                      <div className="mt-1.5 text-[10px]">
                        <span className={`font-semibold ${el.validation_details.checks_passed === el.validation_details.checks_total ? 'text-green-600' : 'text-amber-600'}`}>
                          {el.validation_details.checks_passed}/{el.validation_details.checks_total} checks passed
                        </span>
                        {el.validation_details.issues.filter((i) => !i.passed).map((issue, iIdx) => (
                          <span key={iIdx} className="ml-2 text-red-500">{issue.check}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {dossier.personalization_elements.length === 0 && (
            <p className="text-xs text-navy/40 dark:text-slate-500 text-center py-4">
              No personalization elements found
            </p>
          )}
        </div>
      )}

      {activeTab === 'tone' && dossier.tone_profile && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-navy/5 dark:border-slate-700">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">Style</span>
                <p className="text-sm text-navy dark:text-slate-200">{dossier.tone_profile.communication_style}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">Humor</span>
                <p className="text-sm text-navy dark:text-slate-200">{dossier.tone_profile.humor_level}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">Formality</span>
                <p className="text-sm text-navy dark:text-slate-200">{dossier.tone_profile.formality}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">Platforms</span>
                <p className="text-sm text-navy dark:text-slate-200">
                  {dossier.tone_profile.preferred_platforms?.join(', ') || 'N/A'}
                </p>
              </div>
            </div>
          </div>
          {dossier.tone_profile.favorite_topics?.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">Favorite Topics</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {dossier.tone_profile.favorite_topics.map((topic, idx) => (
                  <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-electric/10 text-electric dark:bg-electric/20">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
          {dossier.tone_profile.pet_peeves?.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">Pet Peeves (avoid)</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {dossier.tone_profile.pet_peeves.map((peeve, idx) => (
                  <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
                    {peeve}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'hooks' && (
        <div className="space-y-3">
          {/* Story angle */}
          {dossier.story_angle && (
            <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-navy/5 dark:border-slate-700">
              <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">Story Angle</span>
              <p className="text-sm text-navy dark:text-slate-200 mt-1">{dossier.story_angle}</p>
            </div>
          )}

          {/* Hooks */}
          {dossier.potential_hooks?.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">Potential Hooks</span>
              <div className="space-y-1.5 mt-1">
                {dossier.potential_hooks.map((hook, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-navy/70 dark:text-slate-300">
                    <span className="text-electric shrink-0 mt-0.5">&#8226;</span>
                    <span>{hook}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Red flags */}
          {dossier.red_flags?.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase">Red Flags</span>
              <div className="space-y-1 mt-1">
                {dossier.red_flags.map((flag, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                    <span className="shrink-0 mt-0.5">&#9888;</span>
                    <span>{flag}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Research stats */}
          <div className="flex gap-4 text-[10px] text-navy/30 dark:text-slate-600 pt-2 border-t border-navy/5 dark:border-slate-700">
            <span>{dossier.sources_checked} sources checked</span>
            <span>{dossier.sources_found} found</span>
            <span>{(dossier.research_duration_ms / 1000).toFixed(0)}s research time</span>
            <span>{dossier.tokens_used?.toLocaleString()} tokens</span>
          </div>
        </div>
      )}
    </div>
  );
}
