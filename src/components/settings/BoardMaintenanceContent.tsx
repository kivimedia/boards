'use client';

import { useState, useCallback } from 'react';

interface Board {
  id: string;
  name: string;
  is_archived: boolean;
}

interface DupGroup {
  title: string;
  keep: {
    card_id: string;
    list_name: string;
    comment_count: number;
    attachment_count: number;
  };
  remove: {
    card_id: string;
    list_name: string;
    comment_count: number;
    attachment_count: number;
  }[];
}

interface BoardResult {
  board_id: string;
  board_name: string;
  total_cards: number;
  duplicate_groups: number;
  duplicate_cards: number;
  groups: DupGroup[];
}

interface ScanSummary {
  total_boards: number;
  boards_with_duplicates: number;
  total_duplicates: number;
  total_groups: number;
}

interface BoardMaintenanceProps {
  boards: Board[];
}

export default function BoardMaintenanceContent({ boards }: BoardMaintenanceProps) {
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [results, setResults] = useState<BoardResult[] | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [cleanupReport, setCleanupReport] = useState<{ board_id: string; deleted: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedBoards, setExpandedBoards] = useState<Set<string>>(new Set());

  const activeBoards = boards.filter((b) => !b.is_archived);

  const handleToggleAll = () => {
    if (selectAll) {
      setSelectedBoardIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedBoardIds(new Set(activeBoards.map((b) => b.id)));
      setSelectAll(true);
    }
  };

  const handleToggleBoard = (id: string) => {
    const next = new Set(selectedBoardIds);
    if (next.has(id)) {
      next.delete(id);
      setSelectAll(false);
    } else {
      next.add(id);
      if (next.size === activeBoards.length) setSelectAll(true);
    }
    setSelectedBoardIds(next);
  };

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setResults(null);
    setSummary(null);
    setCleanupReport(null);
    setExpandedBoards(new Set());

    try {
      const boardIds = selectAll ? '' : Array.from(selectedBoardIds).join(',');
      const url = boardIds
        ? `/api/dedup/workspace?board_ids=${boardIds}`
        : '/api/dedup/workspace';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to scan boards');
      const json = await res.json();
      const data = json.data || json;
      setResults(data.results || []);
      setSummary(data.summary || null);

      // Auto-expand boards with duplicates
      const withDups = new Set<string>(
        (data.results || [])
          .filter((r: BoardResult) => r.duplicate_cards > 0)
          .map((r: BoardResult) => r.board_id)
      );
      setExpandedBoards(withDups);
    } catch (err: any) {
      setError(err.message);
    }
    setScanning(false);
  }, [selectedBoardIds, selectAll]);

  const handleCleanAll = useCallback(async () => {
    if (!results || cleaning) return;
    setCleaning(true);
    setError(null);

    try {
      const actions = results
        .filter((r) => r.duplicate_cards > 0)
        .map((r) => ({
          board_id: r.board_id,
          card_ids: r.groups.flatMap((g) => g.remove.map((rem) => rem.card_id)),
        }));

      if (actions.length === 0) return;

      const res = await fetch('/api/dedup/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      });

      if (!res.ok) throw new Error('Cleanup failed');
      const json = await res.json();
      const data = json.data || json;
      setCleanupReport(data.report || []);

      // Re-scan to show updated state
      const rescan = selectAll ? '' : Array.from(selectedBoardIds).join(',');
      const rescanUrl = rescan
        ? `/api/dedup/workspace?board_ids=${rescan}`
        : '/api/dedup/workspace';
      const rescanRes = await fetch(rescanUrl);
      if (rescanRes.ok) {
        const rescanJson = await rescanRes.json();
        const rescanData = rescanJson.data || rescanJson;
        setResults(rescanData.results || []);
        setSummary(rescanData.summary || null);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setCleaning(false);
  }, [results, cleaning, selectedBoardIds, selectAll]);

  const handleCleanBoard = useCallback(async (boardResult: BoardResult) => {
    setCleaning(true);
    setError(null);

    try {
      const cardIds = boardResult.groups.flatMap((g) => g.remove.map((r) => r.card_id));
      const res = await fetch(`/api/boards/${boardResult.board_id}/dedup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_ids: cardIds }),
      });

      if (!res.ok) throw new Error('Cleanup failed');
      const json = await res.json();
      const data = json.data || json;

      // Update local state
      setResults((prev) =>
        prev?.map((r) =>
          r.board_id === boardResult.board_id
            ? { ...r, duplicate_groups: 0, duplicate_cards: 0, groups: [] }
            : r
        ) || null
      );

      setSummary((prev) =>
        prev
          ? {
              ...prev,
              boards_with_duplicates: prev.boards_with_duplicates - 1,
              total_duplicates: prev.total_duplicates - boardResult.duplicate_cards,
              total_groups: prev.total_groups - boardResult.duplicate_groups,
            }
          : null
      );

      setCleanupReport((prev) => [
        ...(prev || []),
        { board_id: boardResult.board_id, deleted: data.deleted || 0 },
      ]);
    } catch (err: any) {
      setError(err.message);
    }
    setCleaning(false);
  }, []);

  const toggleExpand = (boardId: string) => {
    setExpandedBoards((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) next.delete(boardId);
      else next.add(boardId);
      return next;
    });
  };

  const hasSelection = selectedBoardIds.size > 0 || selectAll;
  const totalDupsFound = summary?.total_duplicates || 0;

  return (
    <div className="space-y-6">
      {/* Board Selector */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-dark/50 dark:border-slate-700/50 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">
              Select Boards to Scan
            </h3>
            <p className="text-sm text-navy/50 dark:text-slate-400 font-body mt-0.5">
              {activeBoards.length} active board{activeBoards.length !== 1 ? 's' : ''} available
            </p>
          </div>
          <button
            onClick={handleToggleAll}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-cream-dark dark:border-slate-600 text-navy/70 dark:text-slate-300 hover:bg-cream-dark/50 dark:hover:bg-slate-800 transition-colors font-body"
          >
            {selectAll ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="max-h-60 overflow-y-auto px-6 py-3 scrollbar-thin">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {activeBoards.map((board) => (
              <label
                key={board.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  selectedBoardIds.has(board.id)
                    ? 'bg-electric/10 dark:bg-electric/20 border border-electric/30'
                    : 'hover:bg-cream-dark/30 dark:hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedBoardIds.has(board.id)}
                  onChange={() => handleToggleBoard(board.id)}
                  className="w-4 h-4 rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30"
                />
                <span className="text-sm text-navy dark:text-slate-200 font-body truncate">
                  {board.name}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-cream-dark/50 dark:border-slate-700/50 flex items-center justify-between">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
            {selectedBoardIds.size} board{selectedBoardIds.size !== 1 ? 's' : ''} selected
          </p>
          <button
            onClick={handleScan}
            disabled={!hasSelection || scanning}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-electric text-white hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-body flex items-center gap-2"
          >
            {scanning && (
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {scanning ? 'Scanning...' : 'Scan for Duplicates'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm font-body border border-red-200 dark:border-red-800/30">
          {error}
        </div>
      )}

      {/* Cleanup Report */}
      {cleanupReport && cleanupReport.length > 0 && (
        <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30">
          <div className="flex items-center gap-2 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <h4 className="text-sm font-semibold text-green-800 dark:text-green-300 font-heading">
              Cleanup Complete
            </h4>
          </div>
          <div className="space-y-1">
            {cleanupReport.map((r) => {
              const boardName = results?.find((br) => br.board_id === r.board_id)?.board_name || r.board_id;
              return (
                <p key={r.board_id} className="text-sm text-green-700 dark:text-green-400 font-body">
                  {boardName}: removed {r.deleted} duplicate{r.deleted !== 1 ? 's' : ''}
                </p>
              );
            })}
          </div>
          <p className="text-sm font-semibold text-green-800 dark:text-green-300 mt-2 font-body">
            Total removed: {cleanupReport.reduce((sum, r) => sum + r.deleted, 0)} cards
          </p>
        </div>
      )}

      {/* Summary */}
      {summary && results && (
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-cream-dark/50 dark:border-slate-700/50 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">
                Scan Results
              </h3>
              <p className="text-sm text-navy/50 dark:text-slate-400 font-body mt-0.5">
                Scanned {summary.total_boards} board{summary.total_boards !== 1 ? 's' : ''}
                {' - '}
                {totalDupsFound > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {totalDupsFound} duplicate{totalDupsFound !== 1 ? 's' : ''} found across{' '}
                    {summary.boards_with_duplicates} board{summary.boards_with_duplicates !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-green-600 dark:text-green-400 font-medium">No duplicates found</span>
                )}
              </p>
            </div>
            {totalDupsFound > 0 && (
              <button
                onClick={handleCleanAll}
                disabled={cleaning}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-danger text-white hover:bg-danger/90 disabled:opacity-50 transition-colors font-body flex items-center gap-2"
              >
                {cleaning && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {cleaning ? 'Cleaning...' : `Remove All ${totalDupsFound} Duplicates`}
              </button>
            )}
          </div>

          <div className="divide-y divide-cream-dark/30 dark:divide-slate-700/30">
            {results.map((boardResult) => (
              <div key={boardResult.board_id}>
                {/* Board row */}
                <div
                  className={`px-6 py-3 flex items-center gap-4 cursor-pointer hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors ${
                    boardResult.duplicate_cards > 0 ? '' : 'opacity-70'
                  }`}
                  onClick={() => boardResult.duplicate_cards > 0 && toggleExpand(boardResult.board_id)}
                >
                  {/* Expand arrow */}
                  {boardResult.duplicate_cards > 0 ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`text-navy/40 dark:text-slate-500 transition-transform shrink-0 ${
                        expandedBoards.has(boardResult.board_id) ? 'rotate-90' : ''
                      }`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  ) : (
                    <div className="w-4" />
                  )}

                  {/* Board name */}
                  <span className="text-sm font-medium text-navy dark:text-slate-100 font-body flex-1 truncate">
                    {boardResult.board_name}
                  </span>

                  {/* Card count */}
                  <span className="text-xs text-navy/40 dark:text-slate-500 font-body shrink-0">
                    {boardResult.total_cards} cards
                  </span>

                  {/* Duplicate badge */}
                  {boardResult.duplicate_cards > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                      {boardResult.duplicate_cards} dup{boardResult.duplicate_cards !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                      Clean
                    </span>
                  )}

                  {/* Per-board clean button */}
                  {boardResult.duplicate_cards > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCleanBoard(boardResult);
                      }}
                      disabled={cleaning}
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 dark:bg-danger/20 dark:text-red-400 dark:hover:bg-danger/30 disabled:opacity-50 transition-colors font-body shrink-0"
                    >
                      Clean
                    </button>
                  )}
                </div>

                {/* Expanded duplicate details */}
                {expandedBoards.has(boardResult.board_id) && boardResult.groups.length > 0 && (
                  <div className="px-6 pb-4 pl-16">
                    <div className="space-y-2">
                      {boardResult.groups.map((group, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-cream-dark/40 dark:border-slate-700/40 overflow-hidden text-xs"
                        >
                          <div className="px-3 py-1.5 bg-cream/40 dark:bg-slate-800/40 flex items-center gap-2">
                            <span className="font-medium text-navy dark:text-slate-200 font-body truncate flex-1">
                              &quot;{group.title}&quot;
                            </span>
                            <span className="text-navy/40 dark:text-slate-500 font-body shrink-0">
                              {group.remove.length + 1} copies
                            </span>
                          </div>
                          {/* Keep */}
                          <div className="px-3 py-1 flex items-center gap-2 bg-green-50/50 dark:bg-green-900/10 border-b border-cream-dark/20 dark:border-slate-700/20">
                            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 uppercase shrink-0">
                              Keep
                            </span>
                            <span className="text-navy/60 dark:text-slate-400 font-body truncate flex-1">
                              {group.keep.list_name}
                            </span>
                            {group.keep.comment_count > 0 && (
                              <span className="text-navy/30 dark:text-slate-600 font-body">{group.keep.comment_count} comments</span>
                            )}
                            {group.keep.attachment_count > 0 && (
                              <span className="text-navy/30 dark:text-slate-600 font-body">{group.keep.attachment_count} files</span>
                            )}
                          </div>
                          {/* Remove */}
                          {group.remove.map((r, j) => (
                            <div
                              key={j}
                              className="px-3 py-1 flex items-center gap-2 border-b last:border-b-0 border-cream-dark/10 dark:border-slate-700/10"
                            >
                              <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 uppercase shrink-0">
                                Remove
                              </span>
                              <span className="text-navy/40 dark:text-slate-500 font-body truncate flex-1 line-through">
                                {r.list_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
