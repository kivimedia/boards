'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Checklist, ChecklistItem } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';

interface CardChecklistsProps {
  cardId: string;
  onRefresh: () => void;
}

export default function CardChecklists({ cardId, onRefresh }: CardChecklistsProps) {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemContent, setEditingItemContent] = useState('');
  const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({});
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const supabase = createClient();

  useEffect(() => {
    fetchChecklists();

    const checklistChannel = supabase
      .channel(`checklists-${cardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checklists', filter: `card_id=eq.${cardId}` },
        () => fetchChecklists()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checklist_items' },
        () => fetchChecklists()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(checklistChannel);
    };
  }, [cardId]);

  const fetchChecklists = async () => {
    const { data: checklistsData } = await supabase
      .from('checklists')
      .select('*, items:checklist_items(*)')
      .eq('card_id', cardId)
      .order('position', { ascending: true });

    if (checklistsData) {
      const sorted = checklistsData.map((cl: Checklist) => ({
        ...cl,
        items: (cl.items || []).sort(
          (a: ChecklistItem, b: ChecklistItem) => a.position - b.position
        ),
      }));
      setChecklists(sorted);
    }
  };

  const handleAddChecklist = async () => {
    setLoading(true);
    const position = checklists.length;

    await supabase.from('checklists').insert({
      card_id: cardId,
      title: 'New Checklist',
      position,
    });

    await fetchChecklists();
    setLoading(false);
    onRefresh();
  };

  const handleDeleteChecklist = async (checklistId: string) => {
    await supabase.from('checklist_items').delete().eq('checklist_id', checklistId);
    await supabase.from('checklists').delete().eq('id', checklistId);
    await fetchChecklists();
    onRefresh();
  };

  const handleTitleSave = async (checklistId: string) => {
    if (editingTitle.trim()) {
      await supabase
        .from('checklists')
        .update({ title: editingTitle.trim() })
        .eq('id', checklistId);
      await fetchChecklists();
      onRefresh();
    }
    setEditingTitleId(null);
  };

  const handleToggleItem = async (item: ChecklistItem) => {
    const updates: Partial<ChecklistItem> = {
      is_completed: !item.is_completed,
      completed_by: !item.is_completed ? user?.id || null : null,
      completed_at: !item.is_completed ? new Date().toISOString() : null,
    };

    await supabase
      .from('checklist_items')
      .update(updates)
      .eq('id', item.id);
    await fetchChecklists();
    onRefresh();
  };

  const handleItemContentSave = async (itemId: string) => {
    if (editingItemContent.trim()) {
      await supabase
        .from('checklist_items')
        .update({ content: editingItemContent.trim() })
        .eq('id', itemId);
      await fetchChecklists();
      onRefresh();
    }
    setEditingItemId(null);
  };

  const handleDeleteItem = async (itemId: string) => {
    await supabase.from('checklist_items').delete().eq('id', itemId);
    await fetchChecklists();
    onRefresh();
  };

  const handleAddItem = async (checklistId: string) => {
    const content = newItemInputs[checklistId]?.trim();
    if (!content) return;

    const checklist = checklists.find((cl) => cl.id === checklistId);
    const position = checklist?.items?.length || 0;

    await supabase.from('checklist_items').insert({
      checklist_id: checklistId,
      content,
      is_completed: false,
      position,
    });

    setNewItemInputs((prev) => ({ ...prev, [checklistId]: '' }));
    await fetchChecklists();
    onRefresh();
  };

  const getProgress = (items: ChecklistItem[]) => {
    if (!items || items.length === 0) return { completed: 0, total: 0, percent: 0 };
    const completed = items.filter((i) => i.is_completed).length;
    return { completed, total: items.length, percent: Math.round((completed / items.length) * 100) };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 font-heading">
          Checklists ({checklists.length})
        </h3>
        <Button size="sm" variant="ghost" onClick={handleAddChecklist} loading={loading}>
          + Add checklist
        </Button>
      </div>

      <div className="space-y-4">
        {checklists.map((checklist) => {
          const progress = getProgress(checklist.items || []);

          return (
            <div
              key={checklist.id}
              className="rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 p-4"
            >
              {/* Checklist header */}
              <div className="flex items-center justify-between mb-3">
                {editingTitleId === checklist.id ? (
                  <input
                    ref={titleInputRef}
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => handleTitleSave(checklist.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTitleSave(checklist.id);
                      if (e.key === 'Escape') setEditingTitleId(null);
                    }}
                    className="text-sm font-semibold text-navy dark:text-slate-100 bg-transparent border-b-2 border-electric outline-none font-heading flex-1 mr-2"
                    autoFocus
                  />
                ) : (
                  <h4
                    onClick={() => {
                      setEditingTitleId(checklist.id);
                      setEditingTitle(checklist.title);
                    }}
                    className="text-sm font-semibold text-navy dark:text-slate-100 font-heading cursor-pointer hover:text-electric transition-colors"
                  >
                    {checklist.title}
                  </h4>
                )}
                <button
                  onClick={() => handleDeleteChecklist(checklist.id)}
                  className="text-navy/30 dark:text-slate-500 hover:text-danger text-xs transition-all shrink-0 px-2 py-1 rounded-lg hover:bg-danger/10"
                >
                  Delete
                </button>
              </div>

              {/* Progress bar */}
              {(checklist.items?.length || 0) > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[11px] text-navy/40 dark:text-slate-400 font-body mb-1">
                    <span>{progress.percent}%</span>
                    <span>{progress.completed}/{progress.total}</span>
                  </div>
                  <div className="h-1.5 bg-cream-dark dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-electric rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Items */}
              <div className="space-y-1">
                {(checklist.items || []).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 group py-1 px-1 rounded-lg hover:bg-cream-dark/50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <button
                      onClick={() => handleToggleItem(item)}
                      className={`
                        w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-all p-0.5
                        ${item.is_completed
                          ? 'bg-electric border-electric'
                          : 'border-navy/20 dark:border-slate-600 hover:border-electric'
                        }
                      `}
                    >
                      {item.is_completed && (
                        <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>

                    {editingItemId === item.id ? (
                      <input
                        value={editingItemContent}
                        onChange={(e) => setEditingItemContent(e.target.value)}
                        onBlur={() => handleItemContentSave(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleItemContentSave(item.id);
                          if (e.key === 'Escape') setEditingItemId(null);
                        }}
                        className="flex-1 text-sm text-navy dark:text-slate-100 bg-transparent border-b border-electric outline-none font-body"
                        autoFocus
                      />
                    ) : (
                      <span
                        onClick={() => {
                          setEditingItemId(item.id);
                          setEditingItemContent(item.content);
                        }}
                        className={`
                          flex-1 text-sm font-body cursor-pointer transition-colors
                          ${item.is_completed
                            ? 'text-navy/30 dark:text-slate-500 line-through'
                            : 'text-navy/70 dark:text-slate-300 hover:text-navy dark:hover:text-white'
                          }
                        `}
                      >
                        {item.content}
                      </span>
                    )}

                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-navy/30 dark:text-slate-500 hover:text-danger text-xs transition-all shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Add item */}
              <div className="flex gap-2 mt-2">
                <input
                  value={newItemInputs[checklist.id] || ''}
                  onChange={(e) =>
                    setNewItemInputs((prev) => ({ ...prev, [checklist.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddItem(checklist.id);
                  }}
                  placeholder="Add an item..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
                />
                {(newItemInputs[checklist.id] || '').trim() && (
                  <Button size="sm" onClick={() => handleAddItem(checklist.id)}>
                    Add
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
