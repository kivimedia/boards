'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Card, Label, Profile, Comment, CardPriority, CardSize, AIReviewResult, AIQAResult, BoardType, CustomFieldValue } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { useProfilingStore } from '@/stores/profiling-store';
import Modal from '@/components/ui/Modal';
import CardComments from './CardComments';
import CardLabels from './CardLabels';
import CardActions from './CardActions';
import CardChecklists from './CardChecklists';
import CardAttachments from './CardAttachments';
import CardActivityLog from './CardActivityLog';
import CardDependencies from './CardDependencies';
import CardCustomFields from './CardCustomFields';
import BriefEditor from './BriefEditor';
import Avatar from '@/components/ui/Avatar';
import AIReviewToggle from './AIReviewToggle';
import AIReviewSubmit from './AIReviewSubmit';
import AIReviewResults from './AIReviewResults';
import AIReviewOverride from './AIReviewOverride';
import AIReviewHistory from './AIReviewHistory';
import AIQASubmit from './AIQASubmit';
import AIQAResults from './AIQAResults';
import AIQAHistory from './AIQAHistory';
import CardWatchButton from './CardWatchButton';
import CardPresenceBar from './CardPresenceBar';
import ClientBrainPanel from '@/components/client/ClientBrainPanel';
import CardAgentTasksPanel from '@/components/agents/CardAgentTasksPanel';
import CardApprovalPanel from './CardApprovalPanel';
import VideoFrameComparison from './VideoFrameComparison';
import CardAIChat from './CardAIChat';
import type { FrameVerdict } from '@/lib/ai/design-review';
import ReactMarkdown from 'react-markdown';

interface CardModalProps {
  cardId: string;
  boardId: string;
  onClose: () => void;
  onRefresh: () => void;
  allCardIds?: string[];
  onNavigate?: (cardId: string) => void;
}

type Tab = 'details' | 'brief' | 'checklists' | 'attachments' | 'dependencies' | 'activity' | 'approval' | 'ai-review' | 'ai-qa' | 'brain' | 'agents';

const BASE_TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'details', label: 'Details', icon: '📝' },
  { key: 'brief', label: 'Brief', icon: '📋' },
  { key: 'checklists', label: 'Checklists', icon: '☑️' },
  { key: 'attachments', label: 'Attachments', icon: '📎' },
  { key: 'dependencies', label: 'Dependencies', icon: '🔗' },
  { key: 'activity', label: 'Activity', icon: '📊' },
];

const AI_REVIEW_TAB: { key: Tab; label: string; icon: string } = {
  key: 'ai-review', label: 'AI Review', icon: '🤖',
};

const AI_REVIEW_BOARD_TYPES: BoardType[] = ['graphic_designer', 'video_editor'];

const AI_QA_TAB: { key: Tab; label: string; icon: string } = {
  key: 'ai-qa', label: 'AI QA', icon: '🧪',
};

const AI_QA_BOARD_TYPES: BoardType[] = ['dev'];

const BRAIN_TAB: { key: Tab; label: string; icon: string } = {
  key: 'brain', label: 'Brain', icon: '🧠',
};

const APPROVAL_TAB: { key: Tab; label: string; icon: string } = {
  key: 'approval', label: 'Approval', icon: '✅',
};

const AGENTS_TAB: { key: Tab; label: string; icon: string } = {
  key: 'agents', label: 'Agents', icon: '🤖',
};

const PRIMARY_TAB_KEYS: Tab[] = ['details', 'brief', 'checklists', 'attachments', 'activity'];

const PRIORITY_OPTIONS: { value: CardPriority; label: string; color: string }[] = [
  { value: 'urgent', label: 'Urgent', color: '#ef4444' },
  { value: 'high', label: 'High', color: '#f59e0b' },
  { value: 'medium', label: 'Medium', color: '#3b82f6' },
  { value: 'low', label: 'Low', color: '#10b981' },
  { value: 'none', label: 'None', color: '#94a3b8' },
];

export default function CardModal({ cardId, boardId, onClose, onRefresh, allCardIds, onNavigate }: CardModalProps) {
  const [card, setCard] = useState<Card | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [boardLabels, setBoardLabels] = useState<Label[]>([]);
  const [assignees, setAssignees] = useState<Profile[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [listName, setListName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [cardSize, setCardSize] = useState<CardSize>('medium');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [boardType, setBoardType] = useState<BoardType | null>(null);
  const [latestReview, setLatestReview] = useState<AIReviewResult | null>(null);
  const [showReviewSubmit, setShowReviewSubmit] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const [latestQA, setLatestQA] = useState<AIQAResult | null>(null);
  const [showQASubmit, setShowQASubmit] = useState(false);
  const [qaRefreshKey, setQARefreshKey] = useState(0);
  const [stagingUrl, setStagingUrl] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [moreMenuPos, setMoreMenuPos] = useState({ top: 0, left: 0 });
  // Profiling refs
  const openTimeRef = useRef(performance.now());
  const timingsRef = useRef<Record<string, number>>({});
  const completedRef = useRef<Set<string>>(new Set());
  const supabase = createClient();
  const { profile } = useAuth();

  const canOverride = profile?.role === 'admin' || profile?.role === 'department_lead';
  const showAIReviewTab = boardType ? AI_REVIEW_BOARD_TYPES.includes(boardType) : false;
  const showAIQATab = boardType ? AI_QA_BOARD_TYPES.includes(boardType) : false;
  const showBrainTab = !!card?.client_id;
  const TABS = [
    ...BASE_TABS,
    APPROVAL_TAB,
    ...(showAIReviewTab ? [AI_REVIEW_TAB] : []),
    ...(showAIQATab ? [AI_QA_TAB] : []),
    ...(showBrainTab ? [BRAIN_TAB] : []),
    AGENTS_TAB,
  ];

  const primaryTabs = TABS.filter(t => PRIMARY_TAB_KEYS.includes(t.key));
  const overflowTabs = TABS.filter(t => !PRIMARY_TAB_KEYS.includes(t.key));
  const activeOverflowTab = overflowTabs.find(t => t.key === activeTab);

  // Fall back to 'details' if current tab is no longer available
  useEffect(() => {
    if (!TABS.some(t => t.key === activeTab)) {
      setActiveTab('details');
    }
  }, [TABS.length, activeTab]);

  // Close More menu on click-outside (portal-aware)
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        moreMenuRef.current && !moreMenuRef.current.contains(target) &&
        moreBtnRef.current && !moreBtnRef.current.contains(target)
      ) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [moreMenuOpen]);

  // Reset profiling refs when card changes
  useEffect(() => {
    openTimeRef.current = performance.now();
    timingsRef.current = {};
    completedRef.current = new Set();
  }, [cardId]);


  useEffect(() => {
    fetchAllCardData();
  }, [cardId, boardId]);

  useEffect(() => {
    if (showAIReviewTab) {
      fetchLatestReview();
    }
  }, [cardId, showAIReviewTab, reviewRefreshKey]);

  useEffect(() => {
    if (showAIQATab) {
      fetchLatestQA();
      fetchStagingUrl();
    }
  }, [cardId, showAIQATab, qaRefreshKey]);

  // fetchAllCardData: single API call to get ALL card data (server-side auth)
  const fetchAllCardData = async () => {
    const t0 = performance.now();
    setCardLoading(true);
    setFetchError(null);

    try {
      const res = await fetch(`/api/cards/${cardId}/details?boardId=${boardId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || `HTTP ${res.status}`;
        console.error('[CardModal] API error:', msg);
        setFetchError(msg);
        setCardLoading(false);
        return;
      }

      const { data } = await res.json();
      const tNetwork = performance.now() - t0;
      timingsRef.current['API fetch (details)'] = tNetwork;

      const cardData = data.card;
      if (!cardData) {
        setFetchError('Card not found');
        setCardLoading(false);
        return;
      }

      setCard(cardData);
      setCurrentUserId(data.userId || null);
      setTitle(cardData.title);
      setDescription(cardData.description || '');
      setDueDate(cardData.due_date ? cardData.due_date.split('T')[0] : '');
      setStartDate(cardData.start_date ? cardData.start_date.split('T')[0] : '');
      setCardSize(cardData.size || 'medium');
      setCoverImageUrl(data.signedCoverUrl || cardData.cover_image_url || null);

      setBoardType(data.boardType || null);
      setBoardName(data.boardName || '');
      setListName(data.listName || '');

      setLabels(data.labels || []);
      setBoardLabels(data.boardLabels || []);
      setAssignees(data.assignees || []);
      setAllProfiles(data.profiles || []);
      setComments(data.comments || []);

      // Report profiling
      const totalMs = performance.now() - t0;
      completedRef.current.add('details');
      completedRef.current.add('boardType');

      const phases = Object.entries(timingsRef.current).map(([name, ms]) => ({ name, ms }));
      console.log(`[CardModal] ${cardData?.title || cardId} - ${totalMs.toFixed(0)}ms total`);

      useProfilingStore.getState().setCardProfiling({
        phases,
        totalMs,
        cardTitle: cardData?.title || cardId,
      });
    } catch (err) {
      console.error('[CardModal] Fetch error:', err);
      setFetchError(err instanceof Error ? err.message : 'Failed to load card data');
    } finally {
      setCardLoading(false);
    }
  };

  const fetchLatestReview = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/review`);
      if (!res.ok) return;
      const json = await res.json();
      const reviews: AIReviewResult[] = json.data || [];
      if (reviews.length > 0) {
        reviews.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setLatestReview(reviews[0]);
      } else {
        setLatestReview(null);
      }
    } catch {
      // Silently fail
    }
  }, [cardId]);

  const handleReviewComplete = () => {
    setShowReviewSubmit(false);
    setReviewRefreshKey((k) => k + 1);
  };

  const handleOverrideComplete = () => {
    setShowOverrideModal(false);
    setReviewRefreshKey((k) => k + 1);
  };

  const fetchLatestQA = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/qa`);
      if (!res.ok) return;
      const json = await res.json();
      const qaResults: AIQAResult[] = json.data || [];
      if (qaResults.length > 0) {
        qaResults.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setLatestQA(qaResults[0]);
      } else {
        setLatestQA(null);
      }
    } catch {
      // Silently fail
    }
  }, [cardId]);

  const fetchStagingUrl = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('custom_field_values')
        .select('*, definition:custom_field_definitions(*)')
        .eq('card_id', cardId);
      const values: CustomFieldValue[] = data || [];
      const stagingField = values.find(
        (v) => v.definition && v.definition.name.toLowerCase().includes('staging') && v.definition.field_type === 'url'
      );
      if (stagingField && typeof stagingField.value === 'string') {
        setStagingUrl(stagingField.value);
      }
    } catch {
      // Silently fail
    }
  }, [cardId]);

  const handleQAComplete = () => {
    setShowQASubmit(false);
    setQARefreshKey((k) => k + 1);
  };

  // Refresh: re-fetches card + related data (used after edits)
  const fetchCardDetails = async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/details?boardId=${boardId}`);
      if (!res.ok) return;

      const { data } = await res.json();
      const cardData = data.card;
      if (cardData) {
        setCard(cardData);
        setTitle(cardData.title);
        setDescription(cardData.description || '');
        setDueDate(cardData.due_date ? cardData.due_date.split('T')[0] : '');
        setStartDate(cardData.start_date ? cardData.start_date.split('T')[0] : '');
        setCardSize(cardData.size || 'medium');
        setCoverImageUrl(data.signedCoverUrl || cardData.cover_image_url || null);
      }
      setListName(data.listName || '');
      setLabels(data.labels || []);
      setBoardLabels(data.boardLabels || []);
      setAssignees(data.assignees || []);
      setAllProfiles(data.profiles || []);
      setComments(data.comments || []);
    } catch (err) {
      console.error('[CardModal] Refresh error:', err);
    }
  };

  const updateCard = async (updates: Partial<Card>) => {
    await fetch(`/api/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    fetchCardDetails();
    onRefresh();
  };

  const handleTitleSave = () => {
    if (title.trim() && title !== card?.title) {
      updateCard({ title: title.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleDescriptionSave = () => {
    if (description !== card?.description) {
      updateCard({ description });
    }
    setIsEditingDescription(false);
  };

  const handleStartDateChange = (date: string) => {
    setStartDate(date);
    updateCard({ start_date: date ? new Date(date).toISOString() : null } as any);
  };

  const handleDueDateChange = (date: string) => {
    setDueDate(date);
    updateCard({ due_date: date ? new Date(date).toISOString() : null } as any);
  };

  const handlePriorityChange = (priority: CardPriority) => {
    updateCard({ priority } as any);
  };

  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const storagePath = `covers/${cardId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('card-attachments')
        .upload(storagePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('card-attachments')
        .getPublicUrl(storagePath);
      const url = urlData.publicUrl;
      setCoverImageUrl(url);
      await updateCard({ cover_image_url: url } as any);
    } catch (err) {
      console.error('Cover upload failed:', err);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleRemoveCover = async () => {
    setCoverImageUrl(null);
    await updateCard({ cover_image_url: null } as any);
  };

  const handleCardSizeChange = (size: CardSize) => {
    setCardSize(size);
    updateCard({ size } as any);
  };

  const toggleLabel = async (labelId: string) => {
    await fetch(`/api/cards/${cardId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label_id: labelId }),
    });
    fetchCardDetails();
    onRefresh();
  };

  const toggleAssignee = async (userId: string) => {
    await fetch(`/api/cards/${cardId}/assignees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    fetchCardDetails();
    onRefresh();
  };

  // Arrow key navigation between cards
  const handleModalKeyDown = useCallback((e: KeyboardEvent) => {
    if (!allCardIds || !onNavigate) return;
    // Don't navigate if user is typing in an input
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    const currentIndex = allCardIds.indexOf(cardId);
    if (currentIndex === -1) return;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : allCardIds.length - 1;
      onNavigate(allCardIds[prevIndex]);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < allCardIds.length - 1 ? currentIndex + 1 : 0;
      onNavigate(allCardIds[nextIndex]);
    }
  }, [allCardIds, onNavigate, cardId]);

  if (!card) {
    return (
      <Modal isOpen={true} onClose={onClose} size="xl">
        <div className="p-8 flex flex-col items-center justify-center min-h-[200px]">
          {fetchError ? (
            <>
              <svg className="w-10 h-10 text-danger/60 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-sm text-navy/60 dark:text-slate-400 font-body mb-3 text-center">{fetchError}</p>
              <button
                onClick={fetchAllCardData}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-electric text-white hover:bg-electric-bright transition-colors"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <svg className="animate-spin h-6 w-6 text-electric mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm text-navy/40 dark:text-slate-400 font-body">Loading card...</p>
            </>
          )}
        </div>
      </Modal>
    );
  }

  const currentPriority = PRIORITY_OPTIONS.find((p) => p.value === card.priority) || PRIORITY_OPTIONS[4];
  const currentIndex = allCardIds ? allCardIds.indexOf(cardId) : -1;
  const totalCards = allCardIds?.length ?? 0;

  return (
    <Modal isOpen={true} onClose={onClose} size="xl" onKeyDown={handleModalKeyDown}>
      {/* Cover Image */}
      {coverImageUrl && (
        <div className="relative w-full h-40 bg-cream dark:bg-navy overflow-hidden rounded-t-2xl">
          {coverImageUrl.includes('supabase.co') || coverImageUrl.startsWith('/') ? (
            <Image src={coverImageUrl} alt="" fill sizes="(max-width: 1024px) 90vw, 896px" className="object-cover" quality={90} />
          ) : (
            <img src={coverImageUrl} alt="" className="w-full h-full object-cover" loading="eager" />
          )}
          <div className="absolute bottom-2 right-2 flex gap-1.5">
            <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/90 dark:bg-dark-surface/90 text-navy dark:text-slate-200 hover:bg-white dark:hover:bg-dark-surface transition-colors shadow-sm backdrop-blur-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              Change
              <input type="file" accept="image/*" className="hidden" onChange={handleCoverImageUpload} />
            </label>
            <button
              onClick={handleRemoveCover}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/90 dark:bg-dark-surface/90 text-danger hover:bg-white dark:hover:bg-dark-surface transition-colors shadow-sm backdrop-blur-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Remove
            </button>
          </div>
        </div>
      )}

      <div className="p-5 pb-6">
        {/* Board > List breadcrumb */}
        {(boardName || listName) && (
          <div className="flex items-center gap-1.5 text-xs text-navy/40 dark:text-slate-500 font-medium font-body mb-1 pr-8">
            {boardName && <span>{boardName}</span>}
            {boardName && listName && (
              <svg className="w-3 h-3 text-navy/25 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            )}
            {listName && <span>{listName}</span>}
          </div>
        )}

        {/* Title row with metadata hints + properties toggle */}
        <div className="flex items-center gap-2 mb-2 pr-8">
          {isEditingTitle ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
              className="text-xl font-bold text-navy dark:text-slate-100 w-full bg-transparent border-b-2 border-electric outline-none font-heading pb-1"
              autoFocus
            />
          ) : (
            <>
              <h2
                onClick={() => setIsEditingTitle(true)}
                className="text-xl font-bold text-navy dark:text-slate-100 font-heading cursor-pointer hover:text-electric transition-colors flex-1 min-w-0 truncate"
              >
                {card.title}
              </h2>

              {/* Inline metadata hints */}
              <div className="flex items-center gap-2 shrink-0">
                {card.priority !== 'none' && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: currentPriority.color }}
                    title={`Priority: ${currentPriority.label}`}
                  />
                )}
                {assignees.length > 0 && (
                  <div className="flex -space-x-1.5" title={assignees.map(a => a.display_name).join(', ')}>
                    {assignees.slice(0, 3).map(a => (
                      <Avatar key={a.id} name={a.display_name} src={a.avatar_url} size="sm" />
                    ))}
                    {assignees.length > 3 && (
                      <span className="w-5 h-5 rounded-full bg-cream-dark dark:bg-slate-700 text-[9px] font-bold text-navy/50 dark:text-slate-400 flex items-center justify-center border-2 border-white dark:border-dark-surface">
                        +{assignees.length - 3}
                      </span>
                    )}
                  </div>
                )}
                {dueDate && (
                  <span
                    className="text-[10px] font-medium text-navy/40 dark:text-slate-500 bg-cream dark:bg-navy px-1.5 py-0.5 rounded"
                    title={`Due: ${dueDate}`}
                  >
                    {new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                {labels.length > 0 && (
                  <div className="flex gap-0.5">
                    {labels.slice(0, 3).map(l => (
                      <span key={l.id} className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} title={l.name} />
                    ))}
                    {labels.length > 3 && (
                      <span className="text-[9px] text-navy/30 dark:text-slate-500">+{labels.length - 3}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Properties toggle */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0 ${
                  sidebarOpen
                    ? 'bg-electric/10 text-electric border border-electric/30'
                    : 'bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-navy/50 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800 hover:text-navy dark:hover:text-slate-200'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                <span className="hidden sm:inline">Properties</span>
              </button>

              <CardWatchButton cardId={cardId} />
            </>
          )}
        </div>

        {/* Presence */}
        <CardPresenceBar cardId={cardId} />

        {/* Tab navigation */}
        <div className="flex flex-wrap gap-0.5 mb-3 border-b border-cream-dark dark:border-slate-700">
          {primaryTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors rounded-t-lg shrink-0
                ${activeTab === tab.key
                  ? 'text-electric border-b-2 border-electric bg-electric/5'
                  : 'text-navy/40 dark:text-slate-400 hover:text-navy/60 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800'
                }
              `}
            >
              <span className="text-[11px]">{tab.icon}</span>
              <span className="font-body">{tab.label}</span>
            </button>
          ))}
          {/* More overflow dropdown (portal to escape modal overflow) */}
          {overflowTabs.length > 0 && (
            <div className="shrink-0">
              <button
                ref={moreBtnRef}
                onClick={() => {
                  if (!moreMenuOpen && moreBtnRef.current) {
                    const rect = moreBtnRef.current.getBoundingClientRect();
                    setMoreMenuPos({ top: rect.bottom + 4, left: rect.left });
                  }
                  setMoreMenuOpen(!moreMenuOpen);
                }}
                className={`
                  flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors rounded-t-lg
                  ${activeOverflowTab
                    ? 'text-electric border-b-2 border-electric bg-electric/5'
                    : 'text-navy/40 dark:text-slate-400 hover:text-navy/60 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800'
                  }
                `}
              >
                <span className="text-[11px]">{activeOverflowTab ? activeOverflowTab.icon : '...'}</span>
                <span className="font-body">{activeOverflowTab ? activeOverflowTab.label : 'More'}</span>
                <svg className={`w-3 h-3 transition-transform ${moreMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {moreMenuOpen && createPortal(
                <div
                  ref={moreMenuRef}
                  style={{ position: 'fixed', top: moreMenuPos.top, left: moreMenuPos.left, zIndex: 9999 }}
                  className="w-44 bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 shadow-lg py-1 animate-in fade-in slide-in-from-top-1 duration-150"
                >
                  {overflowTabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => {
                        setActiveTab(tab.key);
                        setMoreMenuOpen(false);
                      }}
                      className={`
                        w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors
                        ${activeTab === tab.key
                          ? 'text-electric bg-electric/5'
                          : 'text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800'
                        }
                      `}
                    >
                      <span className="text-[11px]">{tab.icon}</span>
                      <span className="font-body">{tab.label}</span>
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          )}
        </div>

        {/* Card AI Chat */}
        <CardAIChat cardId={cardId} boardId={boardId} />

        <div className="relative">
          {/* Main content */}
          <div className="space-y-5">
            {activeTab === 'details' && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr,minmax(280px,1fr)] gap-5">
                {/* Left column — card content */}
                <div className="space-y-6 min-w-0">
                  {/* Labels */}
                  {labels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {labels.map((label) => (
                        <span
                          key={label.id}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
                          style={{ backgroundColor: label.color }}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 font-heading">
                        Description
                      </h3>
                      {!isEditingDescription && (
                        <button
                          onClick={() => setIsEditingDescription(true)}
                          className="text-xs font-medium text-navy/40 dark:text-slate-500 hover:text-electric px-2 py-1 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {isEditingDescription ? (
                      <div>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="w-full p-3 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric resize-none font-body min-h-[120px]"
                          placeholder="Add a description..."
                          autoFocus
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={handleDescriptionSave}
                            className="px-3 py-1.5 bg-electric text-white text-sm rounded-lg hover:bg-electric-bright transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setDescription(card.description || '');
                              setIsEditingDescription(false);
                            }}
                            className="px-3 py-1.5 text-navy/50 dark:text-slate-400 text-sm rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <div
                          onClick={() => setIsEditingDescription(true)}
                          className={`p-3 rounded-xl bg-cream dark:bg-navy hover:bg-cream-dark dark:hover:bg-slate-800 cursor-pointer transition-colors min-h-[60px] text-sm text-navy dark:text-slate-200 font-body ${description && !descriptionExpanded && description.length > 300 ? 'max-h-[200px] overflow-hidden' : ''}`}
                        >
                          {description ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-heading prose-p:font-body prose-p:text-navy dark:prose-p:text-slate-200 prose-a:text-electric prose-code:text-electric prose-code:bg-electric/10 prose-code:px-1 prose-code:rounded">
                              <ReactMarkdown>{description}</ReactMarkdown>
                            </div>
                          ) : (
                            <span className="text-navy/30 dark:text-slate-500">Click to add a description...</span>
                          )}
                        </div>
                        {description && description.length > 300 && !descriptionExpanded && (
                          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-cream dark:from-navy to-transparent rounded-b-xl pointer-events-none" />
                        )}
                        {description && description.length > 300 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDescriptionExpanded(!descriptionExpanded);
                            }}
                            className="mt-1 text-xs font-medium text-electric hover:text-electric-bright transition-colors"
                          >
                            {descriptionExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Custom Fields */}
                  <CardCustomFields
                    cardId={cardId}
                    boardId={boardId}
                    onRefresh={onRefresh}
                  />
                </div>

                {/* Right column — comments */}
                <div className="min-w-0 lg:border-l lg:border-cream-dark lg:dark:border-slate-700 lg:pl-6">
                  <CardComments
                    cardId={cardId}
                    comments={comments}
                    onRefresh={fetchCardDetails}
                    onCommentAdded={(comment) => {
                      setComments((prev) => {
                        // Avoid duplicates if refresh already added it
                        if (prev.some((c) => c.id === comment.id)) return prev;
                        return [comment, ...prev];
                      });
                    }}
                    currentUserId={currentUserId}
                  />
                </div>
              </div>
            )}

            {activeTab === 'brief' && (
              <BriefEditor cardId={cardId} boardId={boardId} onRefresh={onRefresh} />
            )}

            {activeTab === 'checklists' && (
              <CardChecklists cardId={cardId} onRefresh={onRefresh} />
            )}

            {activeTab === 'attachments' && (
              <CardAttachments
                cardId={cardId}
                coverImageUrl={coverImageUrl}
                onCoverChange={(url) => setCoverImageUrl(url)}
                onRefresh={onRefresh}
              />
            )}

            {activeTab === 'dependencies' && (
              <CardDependencies cardId={cardId} boardId={boardId} onRefresh={onRefresh} />
            )}

            {activeTab === 'activity' && (
              <CardActivityLog cardId={cardId} />
            )}

            {activeTab === 'ai-review' && (
              <div className="space-y-6">
                {/* Toggle / status */}
                <AIReviewToggle
                  currentVerdict={latestReview?.overall_verdict || null}
                  onStartReview={() => setShowReviewSubmit(true)}
                  isActive={showReviewSubmit}
                />

                {/* Submit form or results */}
                {showReviewSubmit ? (
                  <AIReviewSubmit
                    cardId={cardId}
                    onReviewComplete={handleReviewComplete}
                    onCancel={() => setShowReviewSubmit(false)}
                  />
                ) : latestReview ? (
                  <AIReviewResults
                    review={latestReview}
                    onOverride={() => setShowOverrideModal(true)}
                    onNewReview={() => setShowReviewSubmit(true)}
                    canOverride={canOverride}
                  />
                ) : (
                  <div className="p-6 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-center">
                    <svg className="w-10 h-10 text-navy/15 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-navy/40 dark:text-slate-400 font-body mb-3">
                      No AI review has been run for this card yet.
                    </p>
                    <button
                      onClick={() => setShowReviewSubmit(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-electric text-white hover:bg-electric-bright transition-all shadow-sm"
                    >
                      Start First Review
                    </button>
                  </div>
                )}

                {/* Video frame comparison (P9.3) */}
                {latestReview?.review_type === 'video' && latestReview.frame_verdicts && (latestReview.frame_verdicts as FrameVerdict[]).length > 0 && (
                  <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-4">
                    <h4 className="text-sm font-semibold text-navy dark:text-white font-heading mb-3">
                      Video Frame Analysis
                    </h4>
                    <VideoFrameComparison
                      frameVerdicts={latestReview.frame_verdicts as FrameVerdict[]}
                      thumbnailSuggestion={latestReview.thumbnail_suggestion ?? undefined}
                      videoDuration={latestReview.video_duration_seconds ?? undefined}
                    />
                  </div>
                )}

                {/* History */}
                <AIReviewHistory
                  cardId={cardId}
                  currentReviewId={latestReview?.id}
                  refreshKey={reviewRefreshKey}
                />

                {/* Override modal */}
                {showOverrideModal && latestReview && (
                  <AIReviewOverride
                    review={latestReview}
                    cardId={cardId}
                    onClose={() => setShowOverrideModal(false)}
                    onOverrideComplete={handleOverrideComplete}
                  />
                )}
              </div>
            )}

            {activeTab === 'ai-qa' && (
              <div className="space-y-6">
                {/* Submit form or results */}
                {showQASubmit ? (
                  <AIQASubmit
                    cardId={cardId}
                    initialUrl={stagingUrl}
                    onQAComplete={handleQAComplete}
                    onCancel={() => setShowQASubmit(false)}
                  />
                ) : latestQA ? (
                  <AIQAResults
                    qa={latestQA}
                    onNewQA={() => setShowQASubmit(true)}
                  />
                ) : (
                  <div className="p-6 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-center">
                    <svg className="w-10 h-10 text-navy/15 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-navy/40 dark:text-slate-400 font-body mb-3">
                      No AI QA analysis has been run for this card yet.
                    </p>
                    <button
                      onClick={() => setShowQASubmit(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-electric text-white hover:bg-electric-bright transition-all shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Run First QA Analysis
                    </button>
                  </div>
                )}

                {/* History */}
                <AIQAHistory
                  cardId={cardId}
                  currentQAId={latestQA?.id}
                  refreshKey={qaRefreshKey}
                />
              </div>
            )}

            {activeTab === 'brain' && card?.client_id && (
              <ClientBrainPanel clientId={card.client_id} />
            )}

            {activeTab === 'approval' && (
              <CardApprovalPanel
                cardId={cardId}
                currentStatus={card.approval_status}
                onStatusChange={() => {
                  fetchCardDetails();
                  onRefresh();
                }}
              />
            )}

            {activeTab === 'agents' && (
              <CardAgentTasksPanel cardId={cardId} />
            )}
          </div>

          {/* Properties sidebar overlay panel */}
          {sidebarOpen && (
            <>
              {/* Mobile backdrop */}
              <div
                className="fixed inset-0 bg-black/20 z-10 sm:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <div className="absolute top-0 right-0 bottom-0 w-64 bg-white dark:bg-dark-surface border-l border-cream-dark dark:border-slate-700 shadow-lg overflow-y-auto z-10 animate-in slide-in-from-right duration-200 rounded-r-xl">
                <div className="p-4 space-y-4">
                  {/* Panel header */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Properties</h3>
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="p-1 rounded-lg text-navy/30 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Card Size */}
                  <div>
                    <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
                      Card Size
                    </h4>
                    <div className="flex gap-1">
                      {(['small', 'medium', 'large'] as CardSize[]).map((size) => (
                        <button
                          key={size}
                          onClick={() => handleCardSizeChange(size)}
                          className={`
                            flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all capitalize
                            ${cardSize === size
                              ? 'bg-electric/10 text-electric border border-electric/30'
                              : 'bg-cream dark:bg-navy text-navy/50 dark:text-slate-400 border border-cream-dark dark:border-slate-700 hover:bg-cream-dark dark:hover:bg-slate-800'
                            }
                          `}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
                      Priority
                    </h4>
                    <div className="space-y-0.5">
                      {PRIORITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => handlePriorityChange(option.value)}
                          className={`
                            w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all font-body
                            ${card.priority === option.value
                              ? 'bg-electric/10 text-navy dark:text-slate-100 font-semibold'
                              : 'text-navy/50 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800'
                            }
                          `}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: option.color }}
                          />
                          {option.label}
                          {card.priority === option.value && (
                            <svg className="w-3.5 h-3.5 ml-auto text-electric shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dates */}
                  <div>
                    <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
                      Start Date
                    </h4>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
                    />
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
                      Due Date
                    </h4>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => handleDueDateChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
                    />
                  </div>

                  {/* Assignees */}
                  <div>
                    <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
                      Assignees
                    </h4>
                    <div className="space-y-1">
                      {assignees.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-electric/5 dark:bg-electric/10 group"
                        >
                          <Avatar name={p.display_name} src={p.avatar_url} size="sm" />
                          <span className="truncate font-body text-xs text-navy dark:text-slate-100">{p.display_name}</span>
                          <button
                            onClick={() => toggleAssignee(p.id)}
                            className="ml-auto opacity-0 group-hover:opacity-100 text-navy/30 dark:text-slate-500 hover:text-danger transition-all"
                            title="Remove"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                      {assignees.length === 0 && !showAssigneePicker && (
                        <p className="text-[11px] text-navy/25 dark:text-slate-600 font-body px-1">No assignees</p>
                      )}
                    </div>
                    {!showAssigneePicker ? (
                      <button
                        onClick={() => setShowAssigneePicker(true)}
                        className="mt-1.5 w-full flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-navy/40 dark:text-slate-500 border border-dashed border-cream-dark dark:border-slate-700 hover:border-electric/40 hover:text-electric transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Add member
                      </button>
                    ) : (
                      <div className="mt-1.5 p-2 rounded-lg bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-medium text-navy/40 dark:text-slate-500">Select member</span>
                          <button
                            onClick={() => setShowAssigneePicker(false)}
                            className="text-navy/30 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        <div className="space-y-0.5 max-h-40 overflow-y-auto">
                          {allProfiles
                            .filter((pr) => !assignees.some((a) => a.id === pr.id))
                            .map((pr) => (
                              <button
                                key={pr.id}
                                onClick={() => {
                                  toggleAssignee(pr.id);
                                  setShowAssigneePicker(false);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
                              >
                                <Avatar name={pr.display_name} src={pr.avatar_url} size="sm" />
                                <span className="truncate font-body">{pr.display_name}</span>
                              </button>
                            ))}
                          {allProfiles.filter((pr) => !assignees.some((a) => a.id === pr.id)).length === 0 && (
                            <p className="text-[11px] text-navy/25 dark:text-slate-600 font-body px-1 py-1">All members assigned</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Labels */}
                  <CardLabels
                    labels={labels}
                    boardLabels={boardLabels}
                    onToggle={toggleLabel}
                  />

                  {/* Cover image upload (when no cover) */}
                  {!coverImageUrl && (
                    <div>
                      <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
                        Cover Image
                      </h4>
                      <label className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-navy/40 dark:text-slate-500 border border-dashed border-cream-dark dark:border-slate-700 hover:border-electric/40 hover:text-electric transition-colors cursor-pointer">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        {uploadingCover ? 'Uploading...' : 'Add cover image'}
                        <input type="file" accept="image/*" className="hidden" onChange={handleCoverImageUpload} disabled={uploadingCover} />
                      </label>
                    </div>
                  )}

                  {/* Actions */}
                  <CardActions
                    cardId={cardId}
                    boardId={boardId}
                    onClose={onClose}
                    onRefresh={() => {
                      fetchCardDetails();
                      onRefresh();
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-cream-dark dark:border-slate-700 flex items-center justify-between text-xs text-navy/30 dark:text-slate-500 font-body">
          <span>Created {new Date(card.created_at).toLocaleDateString()}</span>

          {/* Card navigation */}
          {allCardIds && allCardIds.length > 1 && onNavigate && currentIndex >= 0 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onNavigate(allCardIds[currentIndex > 0 ? currentIndex - 1 : allCardIds.length - 1])}
                className="p-1 rounded hover:bg-cream-dark dark:hover:bg-slate-700 text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 transition-colors"
                title="Previous card (Left arrow)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="text-navy/40 dark:text-slate-500 tabular-nums">{currentIndex + 1}/{totalCards}</span>
              <button
                onClick={() => onNavigate(allCardIds[currentIndex < allCardIds.length - 1 ? currentIndex + 1 : 0])}
                className="p-1 rounded hover:bg-cream-dark dark:hover:bg-slate-700 text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 transition-colors"
                title="Next card (Right arrow)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}

          <button
            onClick={() => {
              const url = `${window.location.origin}/card/${cardId}`;
              navigator.clipboard.writeText(url);
            }}
            className="text-navy/30 dark:text-slate-500 hover:text-electric transition-colors flex items-center gap-1"
            title="Copy card link"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            Copy link
          </button>
          <span>Updated {new Date(card.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
    </Modal>
  );
}
