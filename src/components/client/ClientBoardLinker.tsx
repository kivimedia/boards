'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClientBoard, Board } from '@/lib/types';
import Button from '@/components/ui/Button';

interface ClientBoardLinkerProps {
  clientId: string;
}

interface LinkedBoardItem extends ClientBoard {
  board?: Board;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function ClientBoardLinker({ clientId }: ClientBoardLinkerProps) {
  const [linkedBoards, setLinkedBoards] = useState<LinkedBoardItem[]>([]);
  const [availableBoards, setAvailableBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [linking, setLinking] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchLinkedBoards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/boards`);
      if (!res.ok) throw new Error('Failed to load linked boards');
      const json = await res.json();
      setLinkedBoards(json.data || []);
    } catch {
      showToast('error', 'Failed to load linked boards.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const fetchAvailableBoards = useCallback(async () => {
    try {
      const res = await fetch('/api/boards');
      if (!res.ok) throw new Error('Failed to load boards');
      const json = await res.json();
      setAvailableBoards(json.data || []);
    } catch {
      showToast('error', 'Failed to load available boards.');
    }
  }, []);

  useEffect(() => {
    fetchLinkedBoards();
    fetchAvailableBoards();
  }, [fetchLinkedBoards, fetchAvailableBoards]);

  const linkedBoardIds = new Set(linkedBoards.map((lb) => lb.board_id));
  const unlinkableBoards = availableBoards.filter((b) => !linkedBoardIds.has(b.id));

  const handleLinkBoard = async () => {
    if (!selectedBoardId) {
      showToast('error', 'Please select a board to link.');
      return;
    }

    setLinking(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board_id: selectedBoardId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to link board');
      }

      showToast('success', 'Board linked to client portal.');
      setSelectedBoardId('');
      setShowAddPanel(false);
      fetchLinkedBoards();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to link board.');
    } finally {
      setLinking(false);
    }
  };

  const handleRemoveLink = async (clientBoardId: string) => {
    setRemovingId(clientBoardId);
    try {
      const res = await fetch(`/api/clients/${clientId}/boards/${clientBoardId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to remove board link');
      }

      showToast('success', 'Board unlinked from portal.');
      fetchLinkedBoards();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to remove board link.');
    } finally {
      setRemovingId(null);
    }
  };

  const BOARD_TYPE_ICONS: Record<string, string> = {
    dev: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    design: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    copy: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    video_editor: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-cream-dark dark:border-slate-700 shadow-card">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
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
      <div className="flex items-center justify-between p-5 border-b border-cream-dark dark:border-slate-700">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">Linked Boards</h3>
          <span className="ml-2 px-2 py-0.5 text-xs font-medium text-navy/50 dark:text-slate-400 bg-cream-dark dark:bg-slate-800 rounded-full font-body">
            {linkedBoards.length}
          </span>
        </div>
        <Button
          size="sm"
          variant={showAddPanel ? 'ghost' : 'primary'}
          onClick={() => setShowAddPanel(!showAddPanel)}
        >
          {showAddPanel ? 'Cancel' : '+ Link Board'}
        </Button>
      </div>

      {/* Add Board Panel */}
      {showAddPanel && (
        <div className="p-5 bg-cream/50 dark:bg-navy/50 border-b border-cream-dark dark:border-slate-700">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
                Select Board
              </label>
              <select
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="
                  w-full px-3 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
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
                <option value="">Choose a board...</option>
                {unlinkableBoards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name} ({board.type})
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="md"
              onClick={handleLinkBoard}
              loading={linking}
              disabled={!selectedBoardId}
            >
              Link
            </Button>
          </div>
          {unlinkableBoards.length === 0 && (
            <p className="mt-2 text-xs text-navy/40 dark:text-slate-500 font-body">
              All available boards are already linked to this client.
            </p>
          )}
        </div>
      )}

      {/* Linked Boards List */}
      <div className="divide-y divide-cream-dark dark:divide-slate-700">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-6 w-6 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : linkedBoards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-12 h-12 rounded-full bg-cream-dark dark:bg-slate-800 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-navy/30 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </div>
            <p className="text-sm text-navy/40 dark:text-slate-500 font-body text-center">
              No boards linked yet. Link a board to make its client-visible cards appear in the portal.
            </p>
          </div>
        ) : (
          linkedBoards.map((lb) => {
            const board = lb.board;
            const boardType = board?.type || 'dev';
            const iconPath = BOARD_TYPE_ICONS[boardType] || BOARD_TYPE_ICONS.dev;

            return (
              <div key={lb.id} className="flex items-center gap-4 p-4">
                {/* Board Icon */}
                <div className="w-10 h-10 rounded-xl bg-electric/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
                  </svg>
                </div>

                {/* Board Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                    {board?.name || 'Unknown Board'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-navy/40 dark:text-slate-500 font-body capitalize">
                      {board?.type?.replace(/_/g, ' ') || 'board'}
                    </span>
                    {!lb.is_active && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 bg-orange-50 rounded font-heading uppercase tracking-wider">
                        Paused
                      </span>
                    )}
                    <span className="text-[11px] text-navy/30 dark:text-slate-600 font-body">
                      Linked {new Date(lb.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Remove Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveLink(lb.id)}
                  loading={removingId === lb.id}
                  disabled={removingId === lb.id}
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                >
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Unlink
                  </span>
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
