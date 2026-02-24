'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SlackBoardMapping } from '@/lib/types';

interface SlackConfigProps {
  integrationId: string;
}

interface BoardOption {
  id: string;
  name: string;
}

export default function SlackConfig({ integrationId }: SlackConfigProps) {
  const [mappings, setMappings] = useState<SlackBoardMapping[]>([]);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [channelName, setChannelName] = useState('');
  const [notifyCreated, setNotifyCreated] = useState(true);
  const [notifyMoved, setNotifyMoved] = useState(true);
  const [notifyCompleted, setNotifyCompleted] = useState(true);
  const [notifyComments, setNotifyComments] = useState(false);

  const fetchMappings = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/slack/mappings');
      const json = await res.json();
      if (json.data) setMappings(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBoards = useCallback(async () => {
    const res = await fetch('/api/boards');
    const json = await res.json();
    if (json.data) setBoards(json.data);
  }, []);

  useEffect(() => {
    fetchMappings();
    fetchBoards();
  }, [fetchMappings, fetchBoards]);

  const handleCreate = async () => {
    if (!selectedBoardId || !channelId.trim() || !channelName.trim()) return;

    const res = await fetch('/api/integrations/slack/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integration_id: integrationId,
        board_id: selectedBoardId,
        channel_id: channelId.trim(),
        channel_name: channelName.trim(),
        notify_card_created: notifyCreated,
        notify_card_moved: notifyMoved,
        notify_card_completed: notifyCompleted,
        notify_comments: notifyComments,
      }),
    });

    const json = await res.json();
    if (json.data) {
      setMappings((prev) => [json.data, ...prev]);
      resetForm();
    }
  };

  const handleDelete = async (mappingId: string) => {
    await fetch(`/api/integrations/slack/mappings/${mappingId}`, { method: 'DELETE' });
    setMappings((prev) => prev.filter((m) => m.id !== mappingId));
  };

  const resetForm = () => {
    setShowForm(false);
    setSelectedBoardId('');
    setChannelId('');
    setChannelName('');
    setNotifyCreated(true);
    setNotifyMoved(true);
    setNotifyCompleted(true);
    setNotifyComments(false);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-cream-dark/40 dark:bg-slate-800/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Board-Channel Mappings</h4>
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors"
        >
          + Add Mapping
        </button>
      </div>

      {/* Add mapping form */}
      {showForm && (
        <div className="rounded-lg border border-electric/20 bg-electric/5 dark:bg-electric/10 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Board</label>
              <select
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              >
                <option value="">Select board...</option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Slack Channel ID
              </label>
              <input
                type="text"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                placeholder="C01234567"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
              Channel Name
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              placeholder="#project-updates"
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs font-body text-navy/70 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyCreated}
                onChange={(e) => setNotifyCreated(e.target.checked)}
                className="rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30"
              />
              Card Created
            </label>
            <label className="flex items-center gap-2 text-xs font-body text-navy/70 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyMoved}
                onChange={(e) => setNotifyMoved(e.target.checked)}
                className="rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30"
              />
              Card Moved
            </label>
            <label className="flex items-center gap-2 text-xs font-body text-navy/70 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyCompleted}
                onChange={(e) => setNotifyCompleted(e.target.checked)}
                className="rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30"
              />
              Card Completed
            </label>
            <label className="flex items-center gap-2 text-xs font-body text-navy/70 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyComments}
                onChange={(e) => setNotifyComments(e.target.checked)}
                className="rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30"
              />
              Comments
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="px-4 py-2 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors"
            >
              Save Mapping
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-lg text-xs font-medium font-body bg-cream-dark dark:bg-slate-800 text-navy/60 dark:text-slate-400 hover:bg-cream-dark/80 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing mappings */}
      {mappings.length === 0 && !showForm ? (
        <p className="text-sm text-navy/40 dark:text-slate-500 font-body text-center py-6">
          No board-channel mappings configured yet.
        </p>
      ) : (
        <div className="space-y-2">
          {mappings.map((mapping) => {
            const boardName = boards.find((b) => b.id === mapping.board_id)?.name ?? 'Unknown Board';
            return (
              <div
                key={mapping.id}
                className="rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-3 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">{boardName}</span>
                    <span className="text-navy/30 dark:text-slate-600 font-body text-xs">-&gt;</span>
                    <span className="text-sm text-electric font-body font-medium">
                      #{mapping.channel_name}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    {mapping.notify_card_created && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-700 font-body">
                        created
                      </span>
                    )}
                    {mapping.notify_card_moved && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-body">
                        moved
                      </span>
                    )}
                    {mapping.notify_card_completed && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 font-body">
                        completed
                      </span>
                    )}
                    {mapping.notify_comments && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-700 font-body">
                        comments
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(mapping.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
