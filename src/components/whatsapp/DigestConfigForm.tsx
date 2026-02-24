'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WhatsAppDigestConfig, Board } from '@/lib/types';

export default function DigestConfigForm() {
  const [config, setConfig] = useState<WhatsAppDigestConfig | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local form state
  const [isEnabled, setIsEnabled] = useState(false);
  const [sendTime, setSendTime] = useState('08:00');
  const [includeOverdue, setIncludeOverdue] = useState(true);
  const [includeAssigned, setIncludeAssigned] = useState(true);
  const [includeMentions, setIncludeMentions] = useState(true);
  const [includeBoardSummary, setIncludeBoardSummary] = useState(false);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [digestRes, boardsRes] = await Promise.all([
        fetch('/api/whatsapp/digest'),
        fetch('/api/boards'),
      ]);

      const digestJson = await digestRes.json();
      const boardsJson = await boardsRes.json();

      if (digestJson.data) {
        const c = digestJson.data as WhatsAppDigestConfig;
        setConfig(c);
        setIsEnabled(c.is_enabled);
        setSendTime(c.send_time || '08:00');
        setIncludeOverdue(c.include_overdue);
        setIncludeAssigned(c.include_assigned);
        setIncludeMentions(c.include_mentions);
        setIncludeBoardSummary(c.include_board_summary);
        setSelectedBoardIds(c.board_ids || []);
      }

      if (boardsJson.data) {
        setBoards(boardsJson.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch('/api/whatsapp/digest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_enabled: isEnabled,
          send_time: sendTime,
          include_overdue: includeOverdue,
          include_assigned: includeAssigned,
          include_mentions: includeMentions,
          include_board_summary: includeBoardSummary,
          board_ids: selectedBoardIds,
        }),
      });

      const json = await res.json();

      if (json.error) {
        setError(json.error);
      } else if (json.data) {
        setConfig(json.data);
        setSuccess('Digest settings saved');
      }
    } catch {
      setError('Failed to save digest settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleBoard = (boardId: string) => {
    setSelectedBoardIds((prev) =>
      prev.includes(boardId) ? prev.filter((id) => id !== boardId) : [...prev, boardId]
    );
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-48 rounded-xl bg-cream-dark/40 dark:bg-slate-800/40" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
      <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-4">Daily Digest</h3>

      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200">
          <p className="text-xs text-red-600 font-body">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-3 p-2 rounded-lg bg-green-50 border border-green-200">
          <p className="text-xs text-green-600 font-body">{success}</p>
        </div>
      )}

      <div className="space-y-5">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">Enable Daily Digest</p>
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
              Receive a summary of your tasks each day
            </p>
          </div>
          <button
            onClick={() => setIsEnabled(!isEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isEnabled ? 'bg-electric' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {isEnabled && (
          <>
            {/* Send time */}
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Send Time
              </label>
              <input
                type="time"
                value={sendTime}
                onChange={(e) => setSendTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              />
            </div>

            {/* Include toggles */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-navy/60 dark:text-slate-400 font-body">Include in Digest</p>

              {[
                { label: 'Overdue tasks', value: includeOverdue, setter: setIncludeOverdue },
                { label: 'Assigned to me', value: includeAssigned, setter: setIncludeAssigned },
                { label: 'Mentions', value: includeMentions, setter: setIncludeMentions },
                { label: 'Board summary', value: includeBoardSummary, setter: setIncludeBoardSummary },
              ].map((item) => (
                <label key={item.label} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.value}
                    onChange={() => item.setter(!item.value)}
                    className="rounded border-cream-dark dark:border-slate-700 text-electric focus:ring-electric/30"
                  />
                  <span className="text-sm text-navy dark:text-slate-100 font-body">{item.label}</span>
                </label>
              ))}
            </div>

            {/* Board multi-select */}
            <div>
              <p className="text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-2">
                Boards ({selectedBoardIds.length} selected)
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-cream-dark dark:border-slate-700 p-2">
                {boards.length === 0 ? (
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body text-center py-2">No boards found</p>
                ) : (
                  boards.map((board) => (
                    <label
                      key={board.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-cream/50 dark:hover:bg-slate-800/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedBoardIds.includes(board.id)}
                        onChange={() => toggleBoard(board.id)}
                        className="rounded border-cream-dark dark:border-slate-700 text-electric focus:ring-electric/30"
                      />
                      <span className="text-xs text-navy dark:text-slate-100 font-body">{board.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Digest Settings'}
        </button>
      </div>
    </div>
  );
}
