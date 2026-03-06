'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BoardType } from '@/lib/types';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import { slugify } from '@/lib/slugify';
import { getDefaultAutomationRules } from '@/lib/automation-engine';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface CreateBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateBoardModal({ isOpen, onClose }: CreateBoardModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<BoardType>('dev');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Use cached session (no network call) instead of getUser() which hits auth server
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setLoading(false);
        alert('Session expired. Please refresh and log in again.');
        return;
      }

      const { data: board, error } = await supabase
        .from('boards')
        .insert({ name, type, created_by: session.user.id })
        .select()
        .single();

      if (error || !board) {
        console.error('Board insert error:', error);
        setLoading(false);
        alert(`Failed to create board: ${error?.message || 'No data returned'}`);
        return;
      }

      // Create lists, labels, custom fields, and automation before navigating
      const config = BOARD_TYPE_CONFIG[type];
      const lists = config.defaultLists.map((listName, index) => ({
        board_id: board.id,
        name: listName,
        position: index,
      }));
      const defaultLabels = [
        { name: 'Urgent', color: '#ef4444', board_id: board.id },
        { name: 'Bug', color: '#f59e0b', board_id: board.id },
        { name: 'Feature', color: '#3b82f6', board_id: board.id },
        { name: 'Done', color: '#10b981', board_id: board.id },
      ];

      // Wait for lists + labels first (required for board to function)
      const [listsResult, labelsResult] = await Promise.all([
        supabase.from('lists').insert(lists),
        supabase.from('labels').insert(defaultLabels),
      ]);

      if (listsResult.error) {
        console.error('Failed to create lists:', listsResult.error);
      }
      if (labelsResult.error) {
        console.error('Failed to create labels:', labelsResult.error);
      }

      // Custom fields and automation can run in parallel (non-blocking)
      const bgTasks: PromiseLike<unknown>[] = [];

      const defaultCustomFields = config.defaultCustomFields;
      if (defaultCustomFields && defaultCustomFields.length > 0) {
        bgTasks.push(...defaultCustomFields.map((field, index) =>
          fetch(`/api/boards/${board.id}/custom-fields`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: field.name,
              field_type: field.field_type,
              options: field.options || [],
              is_required: field.is_required || false,
              position: index,
            }),
          })
        ));
      }
      const defaultRules = getDefaultAutomationRules(type);
      if (defaultRules.length > 0) {
        bgTasks.push(...defaultRules.map((rule, index) =>
          fetch(`/api/boards/${board.id}/automation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: rule.name,
              trigger_type: rule.trigger_type,
              trigger_config: rule.trigger_config,
              action_type: rule.action_type,
              action_config: rule.action_config,
              execution_order: index,
            }),
          })
        ));
      }

      // Wait for all background tasks too
      if (bgTasks.length > 0) {
        await Promise.all(bgTasks).catch(err => console.error('Board setup error:', err));
      }

      // Navigate only after everything is ready
      const boardSlug = slugify(board.name);
      setName('');
      setType('dev');
      onClose();
      router.push(`/board/${boardSlug}`);
    } catch (err: unknown) {
      console.error('Board creation error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Something went wrong creating the board: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleCreate} className="p-6">
        <h2 className="text-xl font-bold text-navy dark:text-slate-100 font-heading mb-6">
          Create New Board
        </h2>

        <div className="space-y-4">
          <Input
            label="Board Name"
            placeholder="e.g. Dev Board"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div>
            <label className="block text-sm font-medium text-navy/70 dark:text-slate-300 mb-2 font-body">
              Board Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.entries(BOARD_TYPE_CONFIG) as [BoardType, typeof BOARD_TYPE_CONFIG[BoardType]][]).map(
                ([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    className={`
                      flex items-center gap-2.5 p-3 rounded-xl text-left text-sm transition-all duration-200
                      ${type === key
                        ? 'bg-electric/10 border-2 border-electric text-navy dark:text-slate-100'
                        : 'bg-cream dark:bg-navy border-2 border-transparent text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800'
                      }
                    `}
                  >
                    <span className="text-lg">{config.icon}</span>
                    <span className="font-medium">{config.label}</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-cream-dark dark:border-slate-700">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Create Board
          </Button>
        </div>
      </form>
    </Modal>
  );
}
