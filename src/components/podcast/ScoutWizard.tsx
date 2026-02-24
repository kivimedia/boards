'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  LinkedInSuggestion,
  EnrichedProfile,
  FullCandidateProfile,
  ScoutConfig,
} from '@/lib/types';

// ============================================================================
// SCOUT WIZARD - 4-step LinkedIn-first interactive pipeline
// ============================================================================

interface ScoutWizardProps {
  onComplete?: () => void;
}

type WizardStep = 0 | 1 | 2 | 3 | 4;

const STEPS = [
  { label: 'Configure', icon: '⚙️' },
  { label: 'LinkedIn Search', icon: '🔍' },
  { label: 'Enrich', icon: '📧' },
  { label: 'Deep Research', icon: '🧠' },
  { label: 'Save', icon: '✅' },
];

export default function ScoutWizard({ onComplete }: ScoutWizardProps) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(0);
  const [runId, setRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Config (step 0)
  const [config, setConfig] = useState<ScoutConfig>({
    default_query: 'vibe coding freelancer agency AI tools',
    default_location: 'US',
    custom_location: '',
    tool_focus: 'Cursor, Lovable, Bolt, Replit, v0, Windsurf',
    max_results: 10,
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Step 1 data
  const [suggestions, setSuggestions] = useState<LinkedInSuggestion[]>([]);
  const [selectedStep1, setSelectedStep1] = useState<Set<number>>(new Set());

  // Step 2 data
  const [enrichedProfiles, setEnrichedProfiles] = useState<EnrichedProfile[]>([]);
  const [selectedStep2, setSelectedStep2] = useState<Set<number>>(new Set());

  // Step 3 data
  const [fullProfiles, setFullProfiles] = useState<FullCandidateProfile[]>([]);
  const [selectedStep3, setSelectedStep3] = useState<Set<number>>(new Set());

  // Step 4 result
  const [saveResult, setSaveResult] = useState<{ saved: number; duplicates: number; total: number; candidate_ids?: string[] } | null>(null);
  const [scoringBatch, setScoringBatch] = useState(false);
  const [scoringDone, setScoringDone] = useState(false);

  // Progress & streaming
  const [progress, setProgress] = useState<string[]>([]);
  const [streamOutput, setStreamOutput] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  // Auto-scroll progress
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [progress]);

  // Load saved config & check for resumable run
  useEffect(() => {
    loadConfig();
    checkExistingRun();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/podcast/scout/config');
      const json = await res.json();
      if (json.data?.config) {
        setConfig(json.data.config);
      }
    } catch {
      // Use defaults
    }
    setConfigLoaded(true);
  };

  const checkExistingRun = async () => {
    try {
      const res = await fetch('/api/podcast/scout');
      const json = await res.json();
      const run = json.data?.run;

      if (run && (run.status === 'awaiting_input' || run.status === 'running')) {
        // Resume existing run
        setRunId(run.id);
        const outputJson = run.output_json as Record<string, unknown> || {};

        if (run.current_step >= 1 && outputJson.step1_suggestions) {
          const s1 = outputJson.step1_suggestions as LinkedInSuggestion[];
          setSuggestions(s1);
          setSelectedStep1(new Set(s1.map((s) => s.index)));
        }
        if (run.current_step >= 2 && outputJson.step2_enriched) {
          const s2 = outputJson.step2_enriched as EnrichedProfile[];
          setEnrichedProfiles(s2);
          setSelectedStep2(new Set(s2.map((p) => p.index)));
        }
        if (run.current_step >= 3 && outputJson.step3_profiles) {
          const s3 = outputJson.step3_profiles as FullCandidateProfile[];
          setFullProfiles(s3);
          setSelectedStep3(new Set(s3.map((p) => p.index)));
        }

        setCurrentStep(run.current_step as WizardStep);
        setProgress((prev) => [...prev, `Resumed run from step ${run.current_step}`]);
      }
    } catch {
      // No existing run, start fresh
    }
  };

  // SSE helper
  const executeStep = useCallback(
    async (step: number, body: Record<string, unknown>) => {
      setIsRunning(true);
      setError(null);
      setProgress([]);
      setStreamOutput('');

      let activeRunId = runId;

      // Create run if needed
      if (!activeRunId) {
        try {
          const createRes = await fetch('/api/podcast/scout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const createJson = await createRes.json();
          if (!createRes.ok) {
            setError(createJson.error || 'Failed to create scout run');
            setIsRunning(false);
            return;
          }
          activeRunId = createJson.data.run.id;
          setRunId(activeRunId);

          if (createJson.data.resumed) {
            setProgress((prev) => [...prev, 'Resuming existing run...']);
          }
        } catch (err: any) {
          setError(err.message);
          setIsRunning(false);
          return;
        }
      }

      try {
        const res = await fetch(`/api/podcast/scout/${activeRunId}/step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step, ...body }),
        });

        if (!res.ok || !res.body) {
          setError('Failed to start step execution');
          setIsRunning(false);
          return;
        }

        const reader = res.body.getReader();
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
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const payload = JSON.parse(line.slice(6));
                handleSSEEvent(step, currentEvent, payload);
              } catch {
                // Skip malformed
              }
              currentEvent = '';
            }
          }
        }
      } catch (err: any) {
        setError(err.message || 'Connection error');
      } finally {
        setIsRunning(false);
      }
    },
    [runId]
  );

  const handleSSEEvent = (step: number, event: string, payload: any) => {
    switch (event) {
      case 'progress':
        setProgress((prev) => [...prev, payload.message]);
        break;
      case 'token':
        setStreamOutput((prev) => prev + payload.text);
        break;
      case 'step_data':
        if (step === 1 && Array.isArray(payload)) {
          setSuggestions(payload);
          setSelectedStep1(new Set(payload.map((s: LinkedInSuggestion) => s.index)));
        } else if (step === 2 && Array.isArray(payload)) {
          setEnrichedProfiles(payload);
          setSelectedStep2(new Set(payload.map((p: EnrichedProfile) => p.index)));
        } else if (step === 3 && payload?.type === 'candidate_researched') {
          setFullProfiles((prev) => [...prev, payload.profile]);
          setSelectedStep3((prev) => { const next = new Set(prev); next.add(payload.profile.index); return next; });
        } else if (step === 4 && payload?.type === 'candidate_saved') {
          // Individual save notification
        }
        break;
      case 'complete':
        if (step === 1) {
          setCurrentStep(1);
          setProgress((prev) => [...prev, '✅ Step 1 complete - review results and select profiles']);
        } else if (step === 2) {
          setCurrentStep(2);
          setProgress((prev) => [...prev, '✅ Step 2 complete - review enriched profiles']);
        } else if (step === 3) {
          setCurrentStep(3);
          setProgress((prev) => [...prev, '✅ Step 3 complete - review research and select candidates']);
        } else if (step === 4) {
          setCurrentStep(4);
          setSaveResult(payload.data);
          setProgress((prev) => [...prev, `✅ Done! ${payload.data.saved} candidates saved.`]);
        }
        break;
      case 'error':
        setError(payload.error);
        setProgress((prev) => [...prev, `❌ Error: ${payload.error}`]);
        break;
    }
  };

  // Step actions
  const startStep1 = () => {
    executeStep(1, { config });
  };

  const startStep2 = () => {
    executeStep(2, { selected_indices: Array.from(selectedStep1) });
  };

  const startStep3 = () => {
    setFullProfiles([]);
    executeStep(3, { selected_indices: Array.from(selectedStep2) });
  };

  const startStep4 = () => {
    executeStep(4, { selected_indices: Array.from(selectedStep3) });
  };

  const startNewRun = () => {
    setRunId(null);
    setCurrentStep(0);
    setSuggestions([]);
    setEnrichedProfiles([]);
    setFullProfiles([]);
    setSaveResult(null);
    setSelectedStep1(new Set());
    setSelectedStep2(new Set());
    setSelectedStep3(new Set());
    setProgress([]);
    setStreamOutput('');
    setError(null);
  };

  // Toggle selection helpers
  const toggleSelection = (set: Set<number>, setFn: React.Dispatch<React.SetStateAction<Set<number>>>, index: number) => {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = (items: { index: number }[], setFn: React.Dispatch<React.SetStateAction<Set<number>>>) => {
    setFn(new Set(items.map((i) => i.index)));
  };

  const selectNone = (setFn: React.Dispatch<React.SetStateAction<Set<number>>>) => {
    setFn(new Set());
  };

  if (!configLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, idx) => (
          <div key={idx} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                idx === currentStep && !isRunning
                  ? 'bg-electric text-white'
                  : idx < currentStep || (idx === currentStep && isRunning)
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
              }`}
            >
              <span>{step.icon}</span>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-4 h-0.5 mx-0.5 ${idx < currentStep ? 'bg-green-400' : 'bg-slate-200 dark:bg-slate-600'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Progress panel */}
      {(isRunning || progress.length > 0) && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-electric/5 dark:bg-electric/10 border-b border-electric/10">
            <div className="flex items-center gap-2">
              {isRunning && <div className="w-2 h-2 rounded-full bg-electric animate-pulse" />}
              <span className="text-xs font-semibold text-navy dark:text-slate-100">
                {isRunning ? 'Processing...' : 'Log'}
              </span>
            </div>
            <div className="flex gap-2">
              {streamOutput && (
                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="text-[10px] px-2 py-0.5 rounded bg-navy/5 dark:bg-slate-700 text-navy/60 dark:text-slate-400 hover:bg-navy/10 dark:hover:bg-slate-600"
                >
                  {showRaw ? 'Hide Raw' : 'Show Raw'}
                </button>
              )}
            </div>
          </div>
          <div ref={progressRef} className="max-h-32 overflow-y-auto px-4 py-2 space-y-0.5">
            {progress.map((msg, i) => (
              <div key={i} className="text-[11px] text-navy/60 dark:text-slate-400 font-mono">{msg}</div>
            ))}
            {progress.length === 0 && isRunning && (
              <div className="text-[11px] text-navy/40 dark:text-slate-500">Initializing...</div>
            )}
          </div>
          {showRaw && streamOutput && (
            <div className="border-t border-navy/5 dark:border-slate-700 px-4 py-2">
              <pre className="text-[10px] text-navy/50 dark:text-slate-500 font-mono max-h-40 overflow-auto whitespace-pre-wrap">
                {streamOutput}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Step 0: Configure */}
      {currentStep === 0 && !isRunning && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 mb-4 font-heading">
            Scout Configuration
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1">
                Search Query
              </label>
              <input
                type="text"
                value={config.default_query}
                onChange={(e) => setConfig({ ...config, default_query: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream/50 dark:bg-slate-700 text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30"
                placeholder="vibe coding freelancer agency AI tools"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1">
                Location
              </label>
              <div className="flex gap-2">
                <select
                  value={config.default_location}
                  onChange={(e) => setConfig({ ...config, default_location: e.target.value })}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream/50 dark:bg-slate-700 text-navy dark:text-slate-100"
                >
                  <option value="US">United States</option>
                  <option value="UK">United Kingdom</option>
                  <option value="EU">Europe</option>
                  <option value="APAC">Asia Pacific</option>
                  <option value="Global">Global</option>
                  <option value="custom">Custom...</option>
                </select>
                {config.default_location === 'custom' && (
                  <input
                    type="text"
                    value={config.custom_location}
                    onChange={(e) => setConfig({ ...config, custom_location: e.target.value })}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream/50 dark:bg-slate-700 text-navy dark:text-slate-100"
                    placeholder="e.g. San Francisco, CA"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1">
                Tool Focus
              </label>
              <input
                type="text"
                value={config.tool_focus}
                onChange={(e) => setConfig({ ...config, tool_focus: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream/50 dark:bg-slate-700 text-navy dark:text-slate-100"
                placeholder="Cursor, Lovable, Bolt, Replit, v0, Windsurf"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1">
                Max Results
              </label>
              <input
                type="number"
                min={3}
                max={20}
                value={config.max_results}
                onChange={(e) => setConfig({ ...config, max_results: parseInt(e.target.value) || 10 })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream/50 dark:bg-slate-700 text-navy dark:text-slate-100"
              />
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <button
              onClick={startStep1}
              disabled={isRunning}
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
            >
              Start LinkedIn Search
            </button>
            <button
              onClick={async () => {
                await fetch('/api/podcast/scout/config', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ config }),
                });
                setProgress((prev) => [...prev, 'Config saved.']);
              }}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-navy/5 dark:bg-slate-700 text-navy dark:text-slate-200 hover:bg-navy/10 dark:hover:bg-slate-600 transition-colors"
            >
              Save Config
            </button>
          </div>
        </div>
      )}

      {/* Step 1 Results: LinkedIn Suggestions */}
      {currentStep >= 1 && suggestions.length > 0 && !isRunning && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
              Step 1: LinkedIn Profiles ({suggestions.length})
            </h3>
            {currentStep === 1 && (
              <div className="flex gap-2 text-[11px]">
                <button onClick={() => selectAll(suggestions, setSelectedStep1)} className="text-electric hover:underline">
                  Select All
                </button>
                <button onClick={() => selectNone(setSelectedStep1)} className="text-navy/40 dark:text-slate-500 hover:underline">
                  None
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {suggestions.map((s) => (
              <div
                key={s.index}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  selectedStep1.has(s.index)
                    ? 'border-electric/30 bg-electric/5 dark:bg-electric/10'
                    : 'border-navy/5 dark:border-slate-600 hover:bg-cream/50 dark:hover:bg-slate-700/50'
                }`}
                onClick={() => currentStep === 1 && toggleSelection(selectedStep1, setSelectedStep1, s.index)}
              >
                {currentStep === 1 && (
                  <input
                    type="checkbox"
                    checked={selectedStep1.has(s.index)}
                    onChange={() => toggleSelection(selectedStep1, setSelectedStep1, s.index)}
                    className="mt-1 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-navy dark:text-slate-100">{s.name}</span>
                    <span className="text-[10px] text-navy/40 dark:text-slate-500">{s.location}</span>
                  </div>
                  <div className="text-xs text-navy/60 dark:text-slate-400 mt-0.5">{s.title}</div>
                  <div className="text-[11px] text-navy/40 dark:text-slate-500 mt-1">{s.summary}</div>
                  <a
                    href={s.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-electric hover:underline mt-1 block"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {s.linkedin_url}
                  </a>
                </div>
              </div>
            ))}
          </div>
          {currentStep === 1 && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={startStep2}
                disabled={selectedStep1.size === 0 || isRunning}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
              >
                Enrich {selectedStep1.size} Profile{selectedStep1.size !== 1 ? 's' : ''}
              </button>
              <button
                onClick={startNewRun}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-navy/5 dark:bg-slate-700 text-navy dark:text-slate-200 hover:bg-navy/10 dark:hover:bg-slate-600 transition-colors"
              >
                Start Over
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2 Results: Enriched Profiles */}
      {currentStep >= 2 && enrichedProfiles.length > 0 && !isRunning && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
              Step 2: Enriched Profiles ({enrichedProfiles.length})
            </h3>
            {currentStep === 2 && (
              <div className="flex gap-2 text-[11px]">
                <button onClick={() => selectAll(enrichedProfiles, setSelectedStep2)} className="text-electric hover:underline">
                  Select All
                </button>
                <button onClick={() => selectNone(setSelectedStep2)} className="text-navy/40 dark:text-slate-500 hover:underline">
                  None
                </button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy/5 dark:border-slate-700 text-left">
                  {currentStep === 2 && <th className="py-2 pr-2 w-8" />}
                  <th className="py-2 text-navy/40 dark:text-slate-500 font-semibold">Name</th>
                  <th className="py-2 text-navy/40 dark:text-slate-500 font-semibold">Title</th>
                  <th className="py-2 text-navy/40 dark:text-slate-500 font-semibold">Company</th>
                  <th className="py-2 text-navy/40 dark:text-slate-500 font-semibold">Email</th>
                  <th className="py-2 text-navy/40 dark:text-slate-500 font-semibold">Location</th>
                </tr>
              </thead>
              <tbody>
                {enrichedProfiles.map((p) => (
                  <tr
                    key={p.index}
                    className={`border-b border-navy/5 dark:border-slate-700 last:border-0 cursor-pointer transition-colors ${
                      selectedStep2.has(p.index) ? 'bg-electric/5 dark:bg-electric/10' : 'hover:bg-cream/50 dark:hover:bg-slate-700/50'
                    }`}
                    onClick={() => currentStep === 2 && toggleSelection(selectedStep2, setSelectedStep2, p.index)}
                  >
                    {currentStep === 2 && (
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedStep2.has(p.index)}
                          onChange={() => toggleSelection(selectedStep2, setSelectedStep2, p.index)}
                        />
                      </td>
                    )}
                    <td className="py-2 text-navy dark:text-slate-200 font-semibold">{p.name}</td>
                    <td className="py-2 text-navy/60 dark:text-slate-400">{p.title || '-'}</td>
                    <td className="py-2 text-navy/60 dark:text-slate-400">{p.company || '-'}</td>
                    <td className="py-2">
                      {p.email ? (
                        <span className="text-green-600 dark:text-green-400">{p.email}</span>
                      ) : (
                        <span className="text-navy/30 dark:text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-2 text-navy/60 dark:text-slate-400">{p.location || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {currentStep === 2 && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={startStep3}
                disabled={selectedStep2.size === 0 || isRunning}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
              >
                Deep Research {selectedStep2.size} Candidate{selectedStep2.size !== 1 ? 's' : ''}
              </button>
              <span className="text-[11px] text-navy/40 dark:text-slate-500 self-center">
                Uses Claude web search per candidate
              </span>
            </div>
          )}
        </div>
      )}

      {/* Step 3 Results: Full Profiles */}
      {currentStep >= 3 && fullProfiles.length > 0 && !isRunning && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
              Step 3: Researched Candidates ({fullProfiles.length})
            </h3>
            {currentStep === 3 && (
              <div className="flex gap-2 text-[11px]">
                <button onClick={() => selectAll(fullProfiles, setSelectedStep3)} className="text-electric hover:underline">
                  Select All
                </button>
                <button onClick={() => selectNone(setSelectedStep3)} className="text-navy/40 dark:text-slate-500 hover:underline">
                  None
                </button>
              </div>
            )}
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {fullProfiles.map((p) => (
              <div
                key={p.index}
                className={`p-4 rounded-lg border transition-colors ${
                  selectedStep3.has(p.index)
                    ? 'border-electric/30 bg-electric/5 dark:bg-electric/10'
                    : 'border-navy/5 dark:border-slate-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  {currentStep === 3 && (
                    <input
                      type="checkbox"
                      checked={selectedStep3.has(p.index)}
                      onChange={() => toggleSelection(selectedStep3, setSelectedStep3, p.index)}
                      className="mt-1 shrink-0"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-navy dark:text-slate-100">{p.name}</span>
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                        p.scout_confidence === 'high'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : p.scout_confidence === 'medium'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                      }`}>
                        {p.scout_confidence}
                      </span>
                      {p.email && (
                        <span className="text-[10px] text-green-600 dark:text-green-400">
                          {p.email}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-navy/60 dark:text-slate-400 mt-1">{p.one_liner}</div>

                    {/* Tools */}
                    {p.tools_used.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {p.tools_used.map((tool) => (
                          <span
                            key={tool}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Evidence */}
                    {p.evidence_of_paid_work.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
                          Evidence of Paid Work
                        </div>
                        {p.evidence_of_paid_work.slice(0, 3).map((e, i) => (
                          <div key={i} className="text-[11px] text-navy/60 dark:text-slate-400">
                            {e.project}: {e.description}
                            {e.url && (
                              <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-electric ml-1 hover:underline">
                                link
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Platform links */}
                    <div className="flex gap-3 mt-2 flex-wrap">
                      {Object.entries(p.platform_presence).map(([platform, url]) =>
                        url ? (
                          <a
                            key={platform}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-electric hover:underline"
                          >
                            {platform}
                          </a>
                        ) : null
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {currentStep === 3 && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={startStep4}
                disabled={selectedStep3.size === 0 || isRunning}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Save {selectedStep3.size} Candidate{selectedStep3.size !== 1 ? 's' : ''}
              </button>
              <button
                onClick={startNewRun}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-navy/5 dark:bg-slate-700 text-navy dark:text-slate-200 hover:bg-navy/10 dark:hover:bg-slate-600 transition-colors"
              >
                Discard & Start Over
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Done */}
      {currentStep === 4 && saveResult && !isRunning && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-green-200 dark:border-green-800 shadow-sm p-5">
          <div className="text-center py-6">
            <div className="text-4xl mb-3">🎉</div>
            <h3 className="text-lg font-semibold text-navy dark:text-slate-100 font-heading mb-2">
              Scout Pipeline Complete
            </h3>
            <div className="flex gap-6 justify-center text-sm">
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{saveResult.saved}</div>
                <div className="text-navy/40 dark:text-slate-500">Saved</div>
              </div>
              {saveResult.duplicates > 0 && (
                <div>
                  <div className="text-2xl font-bold text-amber-500">{saveResult.duplicates}</div>
                  <div className="text-navy/40 dark:text-slate-500">Duplicates Skipped</div>
                </div>
              )}
              <div>
                <div className="text-2xl font-bold text-navy dark:text-slate-200">{saveResult.total}</div>
                <div className="text-navy/40 dark:text-slate-500">Total Selected</div>
              </div>
            </div>

            {/* Score saved candidates */}
            {saveResult.saved > 0 && !scoringDone && (
              <div className="mt-4 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/40">
                <p className="text-xs text-purple-700 dark:text-purple-300 mb-2">
                  Score these candidates to assign Hot/Warm/Cold tiers
                </p>
                <button
                  onClick={async () => {
                    setScoringBatch(true);
                    try {
                      await fetch('/api/podcast/candidates/score-batch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          candidate_ids: saveResult.candidate_ids,
                        }),
                      });
                      setScoringDone(true);
                    } catch (err) {
                      console.error('Batch scoring failed:', err);
                    } finally {
                      setScoringBatch(false);
                    }
                  }}
                  disabled={scoringBatch}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {scoringBatch ? 'Scoring...' : `Score ${saveResult.saved} Candidates`}
                </button>
              </div>
            )}
            {scoringDone && (
              <div className="mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40">
                <p className="text-xs text-green-700 dark:text-green-300">
                  All candidates scored! View their tiers in the Approval Queue.
                </p>
              </div>
            )}

            <div className="mt-6 flex gap-3 justify-center flex-wrap">
              <button
                onClick={startNewRun}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 transition-colors"
              >
                Run Another Scout
              </button>
              <a
                href="/podcast/approval"
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-navy/5 dark:bg-slate-700 text-navy dark:text-slate-200 hover:bg-navy/10 dark:hover:bg-slate-600 transition-colors"
              >
                Open Approval Queue
              </a>
              <a
                href="/podcast/costs"
                className="px-4 py-2 text-sm font-medium rounded-lg text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
              >
                View Costs
              </a>
              {onComplete && (
                <button
                  onClick={onComplete}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-navy/5 dark:bg-slate-700 text-navy dark:text-slate-200 hover:bg-navy/10 dark:hover:bg-slate-600 transition-colors"
                >
                  Back to Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
