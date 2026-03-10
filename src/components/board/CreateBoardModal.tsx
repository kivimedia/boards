'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BoardType } from '@/lib/types';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import { slugify } from '@/lib/slugify';
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
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type }),
      });

      const json = await res.json();

      if (!res.ok || !json.data) {
        setError(json.error || 'Failed to create board');
        return;
      }

      const board = json.data;
      setName('');
      setType('dev');
      onClose();
      router.push(`/board/${slugify(board.name)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Something went wrong: ${msg}`);
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

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

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
