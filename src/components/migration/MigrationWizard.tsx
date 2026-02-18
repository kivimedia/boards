'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import type {
  BoardType,
  TrelloBoard,
  TrelloMember,
  Profile,
  MigrationJob,
  MigrationJobConfig,
  MigrationProgress as MigrationProgressType,
  MigrationReport as MigrationReportType,
} from '@/lib/types';
import MigrationReport from './MigrationReport';
import MigrationHistory from './MigrationHistory';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_LABELS = [
  'Connect',
  'Select Boards',
  'Select Lists',
  'Map Users',
  'Review',
  'Progress',
];

const BOARD_TYPES = Object.entries(BOARD_TYPE_CONFIG).map(([key, config]) => ({
  value: key as BoardType,
  label: config.label,
  icon: config.icon,
}));

export default function MigrationWizard() {
  // Step state
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1: Trello credentials
  const [apiKey, setApiKey] = useState('');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [hasClickedAuthorize, setHasClickedAuthorize] = useState(false);

  // Step 2: Board selection and type mapping
  const [trelloBoards, setTrelloBoards] = useState<TrelloBoard[]>([]);
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(new Set());
  const [boardTypeMapping, setBoardTypeMapping] = useState<Record<string, BoardType>>({});
  const [savedBoardSelections, setSavedBoardSelections] = useState<{ board_name: string; board_id: string; board_type: BoardType }[] | null>(null);

  // Step 3: List selection & board matching
  const [trelloLists, setTrelloLists] = useState<Record<string, { id: string; name: string }[]>>({});
  const [selectedListIds, setSelectedListIds] = useState<Record<string, Set<string>>>({});
  const [loadingLists, setLoadingLists] = useState(false);
  const [boardMatches, setBoardMatches] = useState<Record<string, { id: string; name: string } | null>>({});
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Step 4: User mapping
  const [profiles, setProfiles] = useState<(Profile & { email?: string | null })[]>([]);
  const [userMapping, setUserMapping] = useState<Record<string, string>>({});
  const [savedUserMapping, setSavedUserMapping] = useState<Record<string, string> | null>(null);
  const [trelloMembers, setTrelloMembers] = useState<TrelloMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [invitingMemberId, setInvitingMemberId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Step 5: Sync mode
  const [syncMode, setSyncMode] = useState<'fresh' | 'merge'>('fresh');

  // Step 4/5: Job state
  const [creatingJob, setCreatingJob] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<MigrationProgressType>({
    current: 0,
    total: 0,
    phase: 'initialized',
  });
  const [jobStatus, setJobStatus] = useState<string>('pending');
  const [report, setReport] = useState<MigrationReportType | null>(null);

  const supabase = createClient();

  // Resumable job detected on mount
  const [resumableJob, setResumableJob] = useState<MigrationJob | null>(null);
  const [resuming, setResuming] = useState(false);
  const [loadingSavedCreds, setLoadingSavedCreds] = useState(true);

  // On mount: load saved Trello credentials + user_mapping from pga_integration_configs via API
  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const res = await fetch('/api/podcast/integrations');
        if (res.ok) {
          const json = await res.json();
          const trelloConfig = (json.data || []).find((c: any) => c.service === 'trello');
          if (trelloConfig?.config) {
            const config = trelloConfig.config as { api_key?: string; token?: string; user_mapping?: Record<string, string>; board_selections?: { board_name: string; board_id: string; board_type: BoardType }[] };
            if (config.api_key) {
              setApiKey(config.api_key);
              sessionStorage.setItem('trello_api_key', config.api_key);
            }
            if (config.token) {
              setToken(config.token);
              setHasClickedAuthorize(true);
              sessionStorage.setItem('trello_token', config.token);
            }
            if (config.user_mapping && Object.keys(config.user_mapping).length > 0) {
              setSavedUserMapping(config.user_mapping);
            }
            if (config.board_selections && config.board_selections.length > 0) {
              setSavedBoardSelections(config.board_selections);
            }
          }
        }
      } catch {
        // Fall back to sessionStorage (handled by the next useEffect)
      } finally {
        setLoadingSavedCreds(false);
      }
    };
    loadSavedCredentials();
  }, []);

  // On mount: check for active (running) or resumable (pending) migration jobs
  useEffect(() => {
    const checkActiveJob = async () => {
      try {
        const res = await fetch('/api/migration/jobs');
        const json = await res.json();
        if (json.data) {
          const jobs = json.data as MigrationJob[];
          const running = jobs.find((j) => j.status === 'running');
          if (running) {
            setJobId(running.id);
            setProgress(running.progress);
            setJobStatus(running.status);
            setStep(6);
            return;
          }
          // Check for a pending job that was previously started (can be resumed)
          const pending = jobs.find((j) => j.status === 'pending' && j.started_at);
          if (pending) {
            setResumableJob(pending);
          }
        }
      } catch {
        // silently fail — just show step 1
      }
    };
    checkActiveJob();
  }, []);

  const handleResumeJob = async (job: MigrationJob) => {
    setResuming(true);
    try {
      // Fire the streaming run endpoint (don't await — it stays open for the whole migration)
      fetch(`/api/migration/jobs/${job.id}/run`, { method: 'POST' }).catch(() => {
        // Connection may close, that's fine
      });

      setJobId(job.id);
      setProgress({ current: 0, total: 0, phase: 'initialized' });
      setJobStatus('running');
      setResumableJob(null);
      setStep(6);
    } catch {
      // silently fail
    } finally {
      setResuming(false);
    }
  };

  // Restore Trello credentials from sessionStorage as fallback (only if DB load found nothing)
  useEffect(() => {
    if (loadingSavedCreds) return; // Wait for DB load to finish first
    if (apiKey || token) return; // DB already provided credentials
    const savedKey = sessionStorage.getItem('trello_api_key');
    const savedToken = sessionStorage.getItem('trello_token');
    if (savedKey) setApiKey(savedKey);
    if (savedToken) {
      setToken(savedToken);
      setHasClickedAuthorize(true);
    }
  }, [loadingSavedCreds]);

  // Persist Trello credentials to sessionStorage when they change (cache layer)
  useEffect(() => {
    if (apiKey.trim()) sessionStorage.setItem('trello_api_key', apiKey.trim());
  }, [apiKey]);
  useEffect(() => {
    if (token.trim()) sessionStorage.setItem('trello_token', token.trim());
  }, [token]);

  // Fetch profiles with emails for user mapping (step 3)
  useEffect(() => {
    const fetchProfiles = async () => {
      setLoadingProfiles(true);
      try {
        const res = await fetch('/api/team/profiles');
        if (res.ok) {
          const json = await res.json();
          if (json.data) setProfiles(json.data);
        } else {
          // Fallback: direct supabase query without email
          const { data } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, role')
            .order('display_name');
          if (data) setProfiles(data);
        }
      } catch {
        // Fallback: direct supabase query without email
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, role')
          .order('display_name');
        if (data) setProfiles(data);
      } finally {
        setLoadingProfiles(false);
      }
    };
    fetchProfiles();
  }, []);

  // Step 1: Connect to Trello
  const handleConnect = async () => {
    setConnecting(true);
    setConnectError('');

    try {
      const res = await fetch('/api/migration/trello/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trello_api_key: apiKey.trim(),
          trello_token: token.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setConnectError(json.error || 'Failed to connect to Trello');
        return;
      }

      const boards = json.data as TrelloBoard[];
      setTrelloBoards(boards);

      // Initialize board type mapping with 'dev' as default, then apply saved selections
      const mapping: Record<string, BoardType> = {};
      const preSelectedIds = new Set<string>();
      boards.forEach((b) => {
        mapping[b.id] = 'dev';
      });

      // Apply saved board selections - match by board name (stable across sessions) or ID
      if (savedBoardSelections && savedBoardSelections.length > 0) {
        for (const saved of savedBoardSelections) {
          const matchedBoard = boards.find(
            (b) => b.id === saved.board_id || b.name.toLowerCase() === saved.board_name.toLowerCase()
          );
          if (matchedBoard) {
            mapping[matchedBoard.id] = saved.board_type;
            preSelectedIds.add(matchedBoard.id);
          }
        }
      }

      setBoardTypeMapping(mapping);
      if (preSelectedIds.size > 0) {
        setSelectedBoardIds(preSelectedIds);
      }

      // Save validated credentials to pga_integration_configs via API for persistence
      try {
        await fetch('/api/podcast/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service: 'trello',
            config: { api_key: apiKey.trim(), token: token.trim() },
            is_active: true,
          }),
        });
      } catch {
        // Non-critical — credentials still work via sessionStorage
        console.warn('[MigrationWizard] Failed to persist Trello credentials to DB');
      }

      setStep(2);
    } catch {
      setConnectError('Network error. Please check your connection and try again.');
    } finally {
      setConnecting(false);
    }
  };

  // Step 2: Toggle board selection
  const toggleBoard = (boardId: string) => {
    setSelectedBoardIds((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) {
        next.delete(boardId);
      } else {
        next.add(boardId);
      }
      return next;
    });
  };

  const updateBoardType = (boardId: string, type: BoardType) => {
    setBoardTypeMapping((prev) => ({ ...prev, [boardId]: type }));
  };

  // Step 2->3: Fetch lists and board matches in parallel
  const fetchListsAndMatches = async () => {
    setLoadingLists(true);
    setLoadingMatches(true);

    // Fetch lists from Trello
    try {
      const res = await fetch('/api/migration/trello/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trello_api_key: apiKey.trim(),
          trello_token: token.trim(),
          board_ids: Array.from(selectedBoardIds),
        }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        const listsData = json.data as Record<string, { id: string; name: string }[]>;
        setTrelloLists(listsData);
        // Default: select all lists
        const defaultSelection: Record<string, Set<string>> = {};
        for (const [boardId, lists] of Object.entries(listsData)) {
          defaultSelection[boardId] = new Set(lists.map((l) => l.id));
        }
        setSelectedListIds(defaultSelection);
      }
    } catch {
      // Lists will be empty - user can still proceed
    } finally {
      setLoadingLists(false);
    }

    // Match boards to existing Agency Board boards
    try {
      const trelloBoardNames: Record<string, string> = {};
      for (const id of Array.from(selectedBoardIds)) {
        const board = trelloBoards.find((b) => b.id === id);
        if (board) trelloBoardNames[id] = board.name;
      }

      const res = await fetch('/api/migration/match-boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trello_board_names: trelloBoardNames }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        const matches: Record<string, { id: string; name: string } | null> = {};
        for (const m of json.data as { trello_board_id: string; matched_board_id: string | null; matched_board_name: string | null }[]) {
          matches[m.trello_board_id] = m.matched_board_id ? { id: m.matched_board_id, name: m.matched_board_name! } : null;
        }
        setBoardMatches(matches);
      }
    } catch {
      // Matches will be empty - all boards will be created new
    } finally {
      setLoadingMatches(false);
    }
  };

  // Step 3->4: Fetch members when transitioning from step 3
  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const res = await fetch('/api/migration/trello/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trello_api_key: apiKey.trim(),
          trello_token: token.trim(),
          board_ids: Array.from(selectedBoardIds),
        }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setTrelloMembers(json.data as TrelloMember[]);
      }
    } catch {
      // Members will just be empty — user can still proceed
    } finally {
      setLoadingMembers(false);
    }
  };

  // Pre-populate user mapping from saved config OR auto-detect by name/email matching
  useEffect(() => {
    if (trelloMembers.length === 0 || profiles.length === 0) return;

    const newMapping: Record<string, string> = {};

    for (const member of trelloMembers) {
      // 1. First priority: saved mapping from previous session
      if (savedUserMapping) {
        const savedUserId = savedUserMapping[member.username];
        if (savedUserId) {
          if (savedUserId === '__skip__' || profiles.some((p) => p.id === savedUserId)) {
            newMapping[member.id] = savedUserId;
            continue;
          }
        }
      }

      // 2. Auto-detect: match by name or username
      const trelloName = member.fullName?.toLowerCase().trim() || '';
      const trelloUsername = member.username?.toLowerCase().trim() || '';

      const match = profiles.find((p) => {
        const profileName = (p.display_name || '').toLowerCase().trim();
        const profileEmail = ((p as any).email || '').toLowerCase().trim();
        const profileEmailPrefix = profileEmail.split('@')[0] || '';

        // Exact name match
        if (profileName && trelloName && profileName === trelloName) return true;
        // First name match (both sides)
        const trelloFirst = trelloName.split(/\s+/)[0];
        const profileFirst = profileName.split(/\s+/)[0];
        if (trelloFirst && profileFirst && trelloFirst.length >= 3 && trelloFirst === profileFirst) return true;
        // Username matches email prefix
        if (trelloUsername && profileEmailPrefix && trelloUsername === profileEmailPrefix) return true;
        // Username matches profile name (no spaces)
        if (trelloUsername && profileName.replace(/\s+/g, '').toLowerCase() === trelloUsername) return true;

        return false;
      });

      if (match) {
        newMapping[member.id] = match.id;
      }
    }

    if (Object.keys(newMapping).length > 0) {
      setUserMapping((prev) => ({ ...newMapping, ...prev }));
    }
  }, [savedUserMapping, trelloMembers, profiles]);

  const updateUserMapping = (trelloMemberId: string, userId: string) => {
    setUserMapping((prev) => {
      const next = { ...prev };
      if (userId) {
        next[trelloMemberId] = userId;
      } else {
        delete next[trelloMemberId];
      }
      return next;
    });
  };

  const handleInviteUser = async (trelloMemberId: string, displayName: string) => {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteError('');

    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          display_name: displayName,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setInviteError(json.error || 'Failed to invite user');
        return;
      }

      const newProfile = json.data as Profile;

      // Add to profiles list if not already there
      setProfiles((prev) =>
        prev.some((p) => p.id === newProfile.id)
          ? prev
          : [...prev, newProfile]
      );

      // Auto-map this Trello member to the new profile
      updateUserMapping(trelloMemberId, newProfile.id);

      // Reset invite UI
      setInvitingMemberId(null);
      setInviteEmail('');
    } catch {
      setInviteError('Network error. Please try again.');
    } finally {
      setInviteLoading(false);
    }
  };

  // Save board selections early (when leaving step 2) so they persist for next time
  const saveBoardSelectionsToConfig = async () => {
    try {
      const boardSelections = Array.from(selectedBoardIds).map((boardId) => {
        const board = trelloBoards.find((b) => b.id === boardId);
        return {
          board_name: board?.name || '',
          board_id: boardId,
          board_type: boardTypeMapping[boardId] || 'dev',
        };
      }).filter((s) => s.board_name);

      await fetch('/api/podcast/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'trello',
          config: {
            api_key: apiKey.trim(),
            token: token.trim(),
            board_selections: boardSelections,
          },
          is_active: true,
        }),
      });
    } catch {
      // Non-critical
    }
  };

  // Save user mapping + board selections to pga_integration_configs alongside Trello credentials
  const saveUserMappingToConfig = async () => {
    try {
      // Build mapping keyed by trello username (stable across sessions) -> agencyBoardUserId
      const mappingByUsername: Record<string, string> = {};
      for (const [trelloMemberId, userId] of Object.entries(userMapping)) {
        const member = trelloMembers.find((m) => m.id === trelloMemberId);
        if (member) {
          mappingByUsername[member.username] = userId;
        }
      }

      // Build board selections keyed by name (stable across sessions)
      const boardSelections = Array.from(selectedBoardIds).map((boardId) => {
        const board = trelloBoards.find((b) => b.id === boardId);
        return {
          board_name: board?.name || '',
          board_id: boardId,
          board_type: boardTypeMapping[boardId] || 'dev',
        };
      }).filter((s) => s.board_name);

      await fetch('/api/podcast/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'trello',
          config: {
            api_key: apiKey.trim(),
            token: token.trim(),
            user_mapping: mappingByUsername,
            board_selections: boardSelections,
          },
          is_active: true,
        }),
      });
    } catch {
      console.warn('[MigrationWizard] Failed to save user mapping to DB');
    }
  };

  // Step 4: Create and start migration
  const handleStartMigration = async () => {
    setCreatingJob(true);

    try {
      // Build list filter (only include boards that have a subset selected)
      const listFilter: Record<string, string[]> = {};
      for (const boardId of Array.from(selectedBoardIds)) {
        const allLists = trelloLists[boardId] || [];
        const selected = selectedListIds[boardId];
        if (selected && selected.size > 0 && selected.size < allLists.length) {
          listFilter[boardId] = Array.from(selected);
        }
      }

      // Build merge targets from board matches
      const boardMergeTargets: Record<string, string> = {};
      for (const boardId of Array.from(selectedBoardIds)) {
        const match = boardMatches[boardId];
        if (match) {
          boardMergeTargets[boardId] = match.id;
        }
      }

      const config: MigrationJobConfig = {
        trello_api_key: apiKey.trim(),
        trello_token: token.trim(),
        board_ids: Array.from(selectedBoardIds),
        board_type_mapping: boardTypeMapping,
        user_mapping: userMapping,
        list_filter: Object.keys(listFilter).length > 0 ? listFilter : undefined,
        board_merge_targets: Object.keys(boardMergeTargets).length > 0 ? boardMergeTargets : undefined,
        sync_mode: syncMode,
      };

      // Create the job
      const createRes = await fetch('/api/migration/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      const createJson = await createRes.json();
      if (!createRes.ok) {
        setConnectError(createJson.error || 'Failed to create migration job');
        return;
      }

      const job = createJson.data as MigrationJob;
      setJobId(job.id);

      // Start the job (streaming — don't await, just fire)
      fetch(`/api/migration/jobs/${job.id}/run`, { method: 'POST' }).catch(() => {
        // Connection may close, that's fine — migration runs server-side
      });

      setStep(6);
    } catch {
      setConnectError('Network error. Please try again.');
    } finally {
      setCreatingJob(false);
    }
  };

  // Step 5: Poll for progress
  const pollProgress = useCallback(async () => {
    if (!jobId) return;

    try {
      const res = await fetch(`/api/migration/jobs/${jobId}`);
      const json = await res.json();

      if (json.data) {
        const job = json.data as MigrationJob;
        setProgress(job.progress);
        setJobStatus(job.status);
        if (job.report) setReport(job.report);
      }
    } catch {
      // silently fail, will retry
    }
  }, [jobId]);

  useEffect(() => {
    if (step !== 6 || !jobId) return;

    // Poll immediately
    pollProgress();

    const interval = setInterval(pollProgress, 2000);
    return () => clearInterval(interval);
  }, [step, jobId, pollProgress]);

  // Phase display text
  const phaseText = (phase: string) => {
    const map: Record<string, string> = {
      initialized: 'Initializing...',
      importing_boards: 'Importing boards...',
      importing_labels: 'Importing labels...',
      importing_lists: 'Importing lists...',
      importing_cards: 'Importing cards...',
      importing_comments: 'Importing comments...',
      importing_attachments: 'Importing attachments...',
      importing_checklists: 'Importing checklists...',
      completed: 'Migration complete!',
    };
    return map[phase] || phase;
  };

  const progressPercent =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Resume banner for interrupted migrations */}
        {resumableJob && step === 1 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <h3 className="text-sm font-heading font-semibold text-amber-800 dark:text-amber-200">
                  Interrupted migration found
                </h3>
                <p className="text-xs font-body text-amber-700 dark:text-amber-300 mt-1">
                  A migration from {new Date(resumableJob.created_at).toLocaleString()} was interrupted.
                  {' '}It&apos;s safe to resume &mdash; already-imported items will be skipped automatically.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pl-8">
              <button
                onClick={() => handleResumeJob(resumableJob)}
                disabled={resuming}
                className="px-5 py-2.5 bg-electric text-white rounded-xl font-heading font-semibold text-sm hover:bg-electric/90 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {resuming && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {resuming ? 'Resuming...' : 'Resume Migration'}
              </button>
              <button
                onClick={() => setResumableJob(null)}
                className="px-5 py-2.5 text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300 rounded-xl font-body text-sm transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Step Indicator */}
        {step < 6 && (
          <div className="flex items-center gap-2 mb-8">
            {STEP_LABELS.slice(0, 5).map((label, i) => {
              const stepNum = (i + 1) as WizardStep;
              const isActive = step === stepNum;
              const isCompleted = step > stepNum;

              return (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <div
                    className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors
                      ${isCompleted ? 'bg-electric text-white' : isActive ? 'bg-electric text-white' : 'bg-cream-dark dark:bg-slate-700 text-navy/40 dark:text-slate-500'}
                    `}
                  >
                    {isCompleted ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      stepNum
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium hidden sm:inline ${
                      isActive || isCompleted ? 'text-navy dark:text-slate-100' : 'text-navy/40 dark:text-slate-500'
                    }`}
                  >
                    {label}
                  </span>
                  {i < 4 && (
                    <div
                      className={`flex-1 h-0.5 rounded ${
                        isCompleted ? 'bg-electric' : 'bg-cream-dark dark:bg-slate-700'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Step 1: Connect to Trello */}
        {step === 1 && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6 space-y-5">
            <div>
              <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-1">
                Connect to Trello
              </h2>
              <p className="text-sm font-body text-navy/50 dark:text-slate-400">
                Follow the steps below to connect your Trello account.
              </p>
            </div>

            <div className="space-y-4">
              {/* Part A: API Key */}
              <div>
                <label className="block text-sm font-medium text-navy/70 dark:text-slate-300 font-body mb-1.5">
                  1. Trello API Key
                </label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setHasClickedAuthorize(false);
                    setToken('');
                  }}
                  placeholder="Paste your Trello API key"
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/30 text-navy dark:text-slate-100 font-body text-sm placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:border-electric/50 transition-colors"
                />
                <div className="bg-cream dark:bg-navy rounded-xl p-4 mt-2">
                  <p className="text-xs font-body text-navy/50 dark:text-slate-400 leading-relaxed">
                    Get your API key from the{' '}
                    <a
                      href="https://trello.com/power-ups/admin"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-electric hover:underline font-medium"
                    >
                      Power-Up Admin Portal
                    </a>
                    . Create a Power-Up (any name), then copy the API key from the &quot;API key&quot; tab.
                  </p>
                </div>
              </div>

              {/* Part B: Authorize (appears after key is entered) */}
              {apiKey.trim() && (
                <div>
                  <label className="block text-sm font-medium text-navy/70 dark:text-slate-300 font-body mb-1.5">
                    2. Authorize Access
                  </label>
                  <p className="text-xs font-body text-navy/50 dark:text-slate-400 mb-2">
                    Click the button below to open Trello in a new tab. Approve the access, then copy the token shown on the page.
                  </p>
                  <button
                    onClick={() => {
                      window.open(
                        `https://trello.com/1/authorize?expiration=30days&name=Agency+Board&scope=read&response_type=token&key=${encodeURIComponent(apiKey.trim())}`,
                        '_blank',
                        'noopener,noreferrer'
                      );
                      setHasClickedAuthorize(true);
                    }}
                    className="px-5 py-2.5 bg-electric/10 text-electric rounded-xl font-heading font-semibold text-sm hover:bg-electric/20 transition-colors"
                  >
                    Authorize with Trello
                  </button>
                </div>
              )}

              {/* Part C: Paste Token (appears after Authorize is clicked) */}
              {hasClickedAuthorize && (
                <div>
                  <label className="block text-sm font-medium text-navy/70 dark:text-slate-300 font-body mb-1.5">
                    3. Paste Token
                  </label>
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste the token from Trello"
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/30 text-navy dark:text-slate-100 font-body text-sm placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:border-electric/50 transition-colors"
                  />
                </div>
              )}
            </div>

            {connectError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                <p className="text-sm text-red-600 dark:text-red-400 font-body">{connectError}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleConnect}
                disabled={!apiKey.trim() || !token.trim() || connecting}
                className="px-6 py-2.5 bg-electric text-white rounded-xl font-heading font-semibold text-sm hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {connecting && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select Boards & Map Types */}
        {step === 2 && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6 space-y-5">
            <div>
              <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-1">
                Select Boards
              </h2>
              <p className="text-sm font-body text-navy/50 dark:text-slate-400">
                Choose which Trello boards to import and map them to board types.
              </p>
            </div>

            {trelloBoards.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No open boards found in your Trello account.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {trelloBoards.map((board) => {
                  const isSelected = selectedBoardIds.has(board.id);
                  return (
                    <div
                      key={board.id}
                      className={`
                        flex items-center gap-4 p-4 rounded-xl border-2 transition-colors cursor-pointer
                        ${isSelected ? 'border-electric/30 bg-electric/5' : 'border-cream-dark dark:border-slate-700 hover:border-cream-dark/80 dark:hover:border-slate-600'}
                      `}
                      onClick={() => toggleBoard(board.id)}
                    >
                      {/* Checkbox */}
                      <div
                        className={`
                          w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors
                          ${isSelected ? 'bg-electric border-electric' : 'border-cream-dark dark:border-slate-700'}
                        `}
                      >
                        {isSelected && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>

                      {/* Board info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                          {board.name}
                        </p>
                        {board.desc && (
                          <p className="text-xs text-navy/40 dark:text-slate-500 font-body truncate mt-0.5">
                            {board.desc}
                          </p>
                        )}
                      </div>

                      {/* Board type dropdown */}
                      {isSelected && (
                        <select
                          value={boardTypeMapping[board.id] || 'dev'}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateBoardType(board.id, e.target.value as BoardType);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-1.5 rounded-lg border-2 border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/30 text-navy dark:text-slate-100 font-body text-xs focus:outline-none focus:border-electric/50 transition-colors"
                        >
                          {BOARD_TYPES.map((bt) => (
                            <option key={bt.value} value={bt.value}>
                              {bt.icon} {bt.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-5 py-2.5 text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 rounded-xl font-heading font-semibold text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => {
                  saveBoardSelectionsToConfig();
                  fetchListsAndMatches();
                  setStep(3);
                }}
                disabled={selectedBoardIds.size === 0}
                className="px-6 py-2.5 bg-electric text-white rounded-xl font-heading font-semibold text-sm hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Select Lists */}
        {step === 3 && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6 space-y-5">
            <div>
              <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-1">
                Select Lists
              </h2>
              <p className="text-sm font-body text-navy/50 dark:text-slate-400">
                Choose which lists to import from each board. Uncheck lists you don&apos;t need.
              </p>
            </div>

            {/* Board match info */}
            {!loadingMatches && Object.keys(boardMatches).length > 0 && (
              <div className="space-y-2">
                {Array.from(selectedBoardIds).map((boardId) => {
                  const match = boardMatches[boardId];
                  const board = trelloBoards.find((b) => b.id === boardId);
                  if (!match) return null;
                  return (
                    <div key={boardId} className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-2.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400 shrink-0">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      <p className="text-sm font-body text-green-800 dark:text-green-200">
                        <span className="font-medium">{board?.name}</span> will merge into existing board <span className="font-medium">&ldquo;{match.name}&rdquo;</span>
                      </p>
                    </div>
                  );
                })}
                {Array.from(selectedBoardIds).map((boardId) => {
                  const match = boardMatches[boardId];
                  const board = trelloBoards.find((b) => b.id === boardId);
                  if (match) return null;
                  return (
                    <div key={boardId} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400 shrink-0">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <p className="text-sm font-body text-amber-800 dark:text-amber-200">
                        <span className="font-medium">{board?.name}</span> - no matching board found, will create a new one
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {(loadingLists || loadingMatches) ? (
              <div className="flex flex-col items-center py-8 gap-3">
                <svg className="animate-spin h-8 w-8 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-sm text-navy/40 dark:text-slate-500 font-body">Loading lists...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Array.from(selectedBoardIds).map((boardId) => {
                  const board = trelloBoards.find((b) => b.id === boardId);
                  const lists = trelloLists[boardId] || [];
                  const selected = selectedListIds[boardId] || new Set<string>();
                  const allSelected = lists.length > 0 && selected.size === lists.length;

                  return (
                    <div key={boardId} className="border-2 border-cream-dark dark:border-slate-700 rounded-xl overflow-hidden">
                      <div className="bg-cream dark:bg-navy px-4 py-3 flex items-center justify-between">
                        <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">
                          {board?.name || boardId}
                          <span className="text-navy/40 dark:text-slate-500 ml-2 font-normal">
                            {selected.size}/{lists.length} lists
                          </span>
                        </p>
                        <button
                          onClick={() => {
                            setSelectedListIds((prev) => ({
                              ...prev,
                              [boardId]: allSelected ? new Set<string>() : new Set(lists.map((l) => l.id)),
                            }));
                          }}
                          className="text-xs text-electric hover:text-electric/80 font-medium font-body transition-colors"
                        >
                          {allSelected ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>
                      <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
                        {lists.map((list) => {
                          const isSelected = selected.has(list.id);
                          return (
                            <div
                              key={list.id}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                isSelected ? 'bg-electric/5' : 'hover:bg-cream/50 dark:hover:bg-slate-800'
                              }`}
                              onClick={() => {
                                setSelectedListIds((prev) => {
                                  const current = new Set(prev[boardId] || []);
                                  if (current.has(list.id)) {
                                    current.delete(list.id);
                                  } else {
                                    current.add(list.id);
                                  }
                                  return { ...prev, [boardId]: current };
                                });
                              }}
                            >
                              <div
                                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected ? 'bg-electric border-electric' : 'border-cream-dark dark:border-slate-600'
                                }`}
                              >
                                {isSelected && (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </div>
                              <span className={`text-sm font-body ${isSelected ? 'text-navy dark:text-slate-100' : 'text-navy/50 dark:text-slate-400'}`}>
                                {list.name}
                              </span>
                            </div>
                          );
                        })}
                        {lists.length === 0 && (
                          <p className="text-xs text-navy/30 dark:text-slate-600 font-body px-3 py-2">No open lists found</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-5 py-2.5 text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 rounded-xl font-heading font-semibold text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => {
                  fetchMembers();
                  setStep(4);
                }}
                disabled={loadingLists || loadingMatches}
                className="px-6 py-2.5 bg-electric text-white rounded-xl font-heading font-semibold text-sm hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Map Users */}
        {step === 4 && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6 space-y-5">
            <div>
              <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-1">
                Map Users
              </h2>
              <p className="text-sm font-body text-navy/50 dark:text-slate-400">
                Match Trello members to existing users, or invite them by email. Anyone left on &ldquo;Skip&rdquo; will have their cards assigned to you.
              </p>
            </div>

            {(loadingMembers || loadingProfiles) ? (
              <div className="flex flex-col items-center py-8 gap-3">
                <svg className="animate-spin h-8 w-8 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-sm text-navy/40 dark:text-slate-500 font-body">{loadingProfiles ? 'Loading team members...' : 'Loading board members...'}</p>
              </div>
            ) : trelloMembers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No members found on the selected boards.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {trelloMembers.map((member) => {
                  const isMapped = !!userMapping[member.id];
                  const mappedProfile = isMapped ? profiles.find((p) => p.id === userMapping[member.id]) : null;
                  const isInviting = invitingMemberId === member.id;

                  return (
                    <div
                      key={member.id}
                      className={`rounded-xl border-2 p-4 transition-colors ${
                        isMapped
                          ? 'border-electric/20 bg-electric/[0.02]'
                          : 'border-cream-dark dark:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        {/* Trello member info */}
                        <div className="min-w-0 sm:flex-1">
                          <p className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                            {member.fullName}
                          </p>
                          <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                            @{member.username}
                          </p>
                        </div>

                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/20 dark:text-slate-600 shrink-0 hidden sm:block">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>

                        {/* Mapping controls */}
                        <div className="min-w-0 sm:flex-1 flex gap-2">
                          <select
                            value={userMapping[member.id] || ''}
                            onChange={(e) => {
                              if (e.target.value === '__invite__') {
                                setInvitingMemberId(member.id);
                                setInviteEmail('');
                                setInviteError('');
                              } else {
                                updateUserMapping(member.id, e.target.value);
                                if (invitingMemberId === member.id) setInvitingMemberId(null);
                              }
                            }}
                            className="flex-1 min-w-0 px-3 py-2 rounded-xl border-2 border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/30 text-navy dark:text-slate-100 font-body text-sm focus:outline-none focus:border-electric/50 transition-colors"
                          >
                            <option value="">Skip -- assign to me</option>
                            <option value="__skip__">Ignore -- don&apos;t assign cards</option>
                            <option disabled>────────────</option>
                            {profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.display_name}{p.email ? ` (${p.email})` : ''}
                              </option>
                            ))}
                            <option disabled>────────────</option>
                            <option value="__invite__">+ Invite new user...</option>
                          </select>
                        </div>
                      </div>

                      {/* Mapped confirmation */}
                      {isMapped && !isInviting && userMapping[member.id] === '__skip__' && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-navy/40 dark:text-slate-500 font-body">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          Ignored — cards won&apos;t be assigned
                        </div>
                      )}
                      {isMapped && mappedProfile && !isInviting && userMapping[member.id] !== '__skip__' && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-electric font-body">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Mapped to {mappedProfile.display_name}{mappedProfile.email ? ` (${mappedProfile.email})` : ''}
                        </div>
                      )}

                      {/* Inline invite form */}
                      {isInviting && (
                        <div className="mt-3 pt-3 border-t border-cream-dark dark:border-slate-700 space-y-2">
                          <p className="text-xs font-medium text-navy/60 dark:text-slate-400 font-body">
                            Invite {member.fullName} by email
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="email"
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleInviteUser(member.id, member.fullName);
                                if (e.key === 'Escape') setInvitingMemberId(null);
                              }}
                              placeholder="name@company.com"
                              className="flex-1 min-w-0 px-3 py-2 rounded-xl border-2 border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/30 text-navy dark:text-slate-100 font-body text-sm placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:border-electric/50 transition-colors"
                              autoFocus
                            />
                            <button
                              onClick={() => handleInviteUser(member.id, member.fullName)}
                              disabled={!inviteEmail.trim() || inviteLoading}
                              className="px-4 py-2 bg-electric text-white rounded-xl font-heading font-semibold text-sm hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-1.5"
                            >
                              {inviteLoading && (
                                <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              )}
                              {inviteLoading ? 'Inviting...' : 'Invite'}
                            </button>
                            <button
                              onClick={() => {
                                setInvitingMemberId(null);
                                setInviteError('');
                              }}
                              className="px-3 py-2 text-navy/40 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 rounded-xl text-sm transition-colors shrink-0"
                            >
                              Cancel
                            </button>
                          </div>
                          {inviteError && (
                            <p className="text-xs text-red-500 font-body">{inviteError}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between items-center">
              <button
                onClick={() => setStep(3)}
                className="px-5 py-2.5 text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 rounded-xl font-heading font-semibold text-sm transition-colors"
              >
                Back
              </button>
              <div className="flex items-center gap-3">
                {trelloMembers.length > 0 && Object.keys(userMapping).length === 0 && (
                  <button
                    onClick={() => { saveUserMappingToConfig(); setStep(5); }}
                    className="px-5 py-2.5 text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300 rounded-xl font-body text-sm transition-colors"
                  >
                    Skip — assign all to me
                  </button>
                )}
                <button
                  onClick={() => { saveUserMappingToConfig(); setStep(5); }}
                  disabled={loadingMembers || loadingProfiles}
                  className="px-6 py-2.5 bg-electric text-white rounded-xl font-heading font-semibold text-sm hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Review & Start */}
        {step === 5 && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6 space-y-5">
            <div>
              <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-1">
                Review & Start
              </h2>
              <p className="text-sm font-body text-navy/50 dark:text-slate-400">
                Review your migration configuration before starting.
              </p>
            </div>

            {/* Summary */}
            <div className="space-y-3">
              <div className="bg-cream dark:bg-navy rounded-xl p-4">
                <p className="text-xs font-medium text-navy/40 dark:text-slate-500 font-body mb-2 uppercase tracking-wide">
                  Boards to Import
                </p>
                <div className="space-y-2">
                  {Array.from(selectedBoardIds).map((id) => {
                    const board = trelloBoards.find((b) => b.id === id);
                    const boardType = boardTypeMapping[id] || 'dev';
                    const typeConfig = BOARD_TYPE_CONFIG[boardType];
                    const match = boardMatches[id];
                    const listsForBoard = trelloLists[id] || [];
                    const selectedLists = selectedListIds[id] || new Set<string>();
                    const listCount = selectedLists.size || listsForBoard.length;
                    return (
                      <div key={id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{typeConfig?.icon}</span>
                          <span className="text-sm font-body text-navy dark:text-slate-100 font-medium">
                            {board?.name || id}
                          </span>
                          <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                            as {typeConfig?.label || boardType}
                          </span>
                          <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                            - {listCount} list{listCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {match ? (
                          <div className="flex items-center gap-1.5 ml-7">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                            <span className="text-xs font-body text-green-700 dark:text-green-300">
                              Merging into existing board &ldquo;{match.name}&rdquo;
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 ml-7">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            <span className="text-xs font-body text-electric">
                              Creating new board
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-cream dark:bg-navy rounded-xl p-4 text-center">
                  <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">
                    {selectedBoardIds.size}
                  </p>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-1">
                    Board{selectedBoardIds.size !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="bg-cream dark:bg-navy rounded-xl p-4 text-center">
                  <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">
                    {Array.from(selectedBoardIds).reduce((sum, id) => sum + (selectedListIds[id]?.size || trelloLists[id]?.length || 0), 0)}
                  </p>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-1">
                    Lists
                  </p>
                </div>
                <div className="bg-cream dark:bg-navy rounded-xl p-4 text-center">
                  <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">
                    {Object.keys(userMapping).length}
                  </p>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-1">
                    User mapping{Object.keys(userMapping).length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {Object.keys(userMapping).length > 0 && (
                <div className="bg-cream dark:bg-navy rounded-xl p-4">
                  <p className="text-xs font-medium text-navy/40 dark:text-slate-500 font-body mb-2 uppercase tracking-wide">
                    User Mappings
                  </p>
                  <div className="space-y-1">
                    {Object.entries(userMapping).map(([trelloId, mappedId]) => {
                      const member = trelloMembers.find((m) => m.id === trelloId);
                      const isIgnored = mappedId === '__skip__';
                      const profile = !isIgnored ? profiles.find((p) => p.id === mappedId) : null;
                      return (
                        <p key={trelloId} className="text-sm font-body text-navy dark:text-slate-100">
                          <span className="text-navy/50 dark:text-slate-400">
                            {member ? `${member.fullName} (@${member.username})` : trelloId}
                          </span>
                          {' '}&rarr;{' '}
                          <span className={`font-medium ${isIgnored ? 'text-navy/30 dark:text-slate-600' : ''}`}>
                            {isIgnored ? 'Ignored' : (profile?.display_name || mappedId)}
                          </span>
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Sync Mode Toggle */}
            <div className="bg-cream dark:bg-navy rounded-xl p-4">
              <p className="text-xs font-medium text-navy/40 dark:text-slate-500 font-body mb-3 uppercase tracking-wide">
                Sync Mode
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSyncMode('fresh')}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-heading font-semibold transition-colors ${
                    syncMode === 'fresh'
                      ? 'bg-electric text-white'
                      : 'bg-white dark:bg-slate-800 text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 border border-cream-dark dark:border-slate-600'
                  }`}
                >
                  Fresh Import
                </button>
                <button
                  onClick={() => setSyncMode('merge')}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-heading font-semibold transition-colors ${
                    syncMode === 'merge'
                      ? 'bg-electric text-white'
                      : 'bg-white dark:bg-slate-800 text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 border border-cream-dark dark:border-slate-600'
                  }`}
                >
                  Merge Updates
                </button>
              </div>
              <p className="text-xs text-navy/40 dark:text-slate-400 font-body mt-2">
                {syncMode === 'fresh'
                  ? 'Skips already-imported entities. Best for first-time imports.'
                  : 'Updates existing cards, adds new comments/attachments, syncs checklist completion. Best for re-syncing from Trello.'}
              </p>
            </div>

            {connectError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-600 font-body">{connectError}</p>
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStep(4)}
                className="px-5 py-2.5 text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 rounded-xl font-heading font-semibold text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleStartMigration}
                disabled={creatingJob}
                className="px-6 py-2.5 bg-electric text-white rounded-xl font-heading font-semibold text-sm hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {creatingJob && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {creatingJob ? 'Starting...' : 'Start Migration'}
              </button>
            </div>
          </div>
        )}

        {/* Step 6: Progress */}
        {step === 6 && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6 space-y-5">
            {(jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'cancelled') && report ? (
              <>
                {jobStatus === 'failed' && (
                  <div className="text-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-1">
                      Migration Failed
                    </h3>
                    <p className="text-sm text-navy/50 font-body">
                      The migration encountered an error. Some data may have been partially imported.
                    </p>
                  </div>
                )}
                {jobStatus === 'cancelled' && (
                  <div className="text-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-1">
                      Migration Cancelled
                    </h3>
                  </div>
                )}
                <MigrationReport report={report} />
              </>
            ) : (
              <>
                <div className="text-center">
                  <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-1">
                    Migration in Progress
                  </h2>
                  <p className="text-sm font-body text-navy/50 dark:text-slate-400">
                    Migration runs on the server &mdash; safe to refresh or close this page.
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm font-body">
                    <span className="text-navy/60 dark:text-slate-400">{phaseText(progress.phase)}</span>
                    <span className="text-navy dark:text-slate-100 font-medium">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-cream-dark dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-electric h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body text-center">
                    {progress.current} / {progress.total} steps
                  </p>
                </div>

                {/* Live detail */}
                {progress.detail && (
                  <div className="bg-cream dark:bg-navy rounded-xl px-4 py-3">
                    <p className="text-xs text-navy/60 dark:text-slate-400 font-body font-mono truncate">
                      {progress.detail}
                    </p>
                  </div>
                )}

                {/* Live counters */}
                {report && (
                  <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                    {[
                      { label: 'Boards', value: report.boards_created },
                      { label: 'Lists', value: report.lists_created },
                      { label: 'Cards', value: report.cards_created },
                      { label: 'Comments', value: report.comments_created },
                      { label: 'Files', value: report.attachments_created },
                      { label: 'Labels', value: report.labels_created },
                      { label: 'Checklists', value: report.checklists_created },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-cream dark:bg-navy rounded-lg p-2 text-center">
                        <p className="text-lg font-heading font-bold text-navy dark:text-slate-100">{stat.value ?? 0}</p>
                        <p className="text-[10px] font-body text-navy/40 dark:text-slate-500">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Animated Spinner */}
                <div className="flex justify-center py-4">
                  <svg className="animate-spin h-8 w-8 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              </>
            )}
          </div>
        )}

        {/* Migration History (always visible below wizard) */}
        {step === 1 && <MigrationHistory />}
      </div>
    </div>
  );
}
