'use client';

import { useState } from 'react';
import { Door, DoorKey, DoorStatus } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface DoorsRoadmapProps {
  clientId: string;
  doors: Door[];
  onRefresh: () => void;
}

const STATUS_STYLES: Record<DoorStatus, { border: string; bg: string; text: string; icon: string }> = {
  locked: {
    border: 'border-navy/10',
    bg: 'bg-gray-50',
    text: 'text-navy/40',
    icon: 'text-navy/30',
  },
  in_progress: {
    border: 'border-electric/30',
    bg: 'bg-electric/5',
    text: 'text-electric',
    icon: 'text-electric',
  },
  completed: {
    border: 'border-green-300',
    bg: 'bg-green-50',
    text: 'text-green-600',
    icon: 'text-green-500',
  },
};

export default function DoorsRoadmap({ clientId, doors, onRefresh }: DoorsRoadmapProps) {
  const [expandedDoor, setExpandedDoor] = useState<string | null>(null);
  const [showAddDoor, setShowAddDoor] = useState(false);
  const [addingKeyToDoor, setAddingKeyToDoor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [doorForm, setDoorForm] = useState({ title: '', description: '' });
  const [keyForm, setKeyForm] = useState({ title: '', description: '' });

  const handleCreateDoor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doorForm.title.trim()) return;

    setCreating(true);
    try {
      const nextNumber = doors.length > 0 ? Math.max(...doors.map((d) => d.door_number)) + 1 : 1;
      const res = await fetch(`/api/clients/${clientId}/doors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          door_number: nextNumber,
          title: doorForm.title.trim(),
          description: doorForm.description.trim() || undefined,
        }),
      });
      if (res.ok) {
        setShowAddDoor(false);
        setDoorForm({ title: '', description: '' });
        onRefresh();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCreateKey = async (doorId: string) => {
    if (!keyForm.title.trim()) return;

    setCreating(true);
    try {
      const door = doors.find((d) => d.id === doorId);
      const existingKeys = door?.keys || [];
      const nextKeyNumber = existingKeys.length > 0
        ? Math.max(...existingKeys.map((k) => k.key_number)) + 1
        : 1;

      const res = await fetch(`/api/clients/${clientId}/doors/${doorId}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key_number: nextKeyNumber,
          title: keyForm.title.trim(),
          description: keyForm.description.trim() || undefined,
        }),
      });
      if (res.ok) {
        setAddingKeyToDoor(null);
        setKeyForm({ title: '', description: '' });
        onRefresh();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggleKey = async (doorId: string, key: DoorKey) => {
    await fetch(`/api/clients/${clientId}/doors/${doorId}/keys/${key.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_completed: !key.is_completed }),
    });
    onRefresh();
  };

  const handleUpdateDoorStatus = async (doorId: string, status: DoorStatus) => {
    await fetch(`/api/clients/${clientId}/doors/${doorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    onRefresh();
  };

  const handleDeleteDoor = async (doorId: string) => {
    if (!confirm('Delete this door and all its keys?')) return;
    await fetch(`/api/clients/${clientId}/doors/${doorId}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleDeleteKey = async (doorId: string, keyId: string) => {
    await fetch(`/api/clients/${clientId}/doors/${doorId}/keys/${keyId}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/50 dark:text-slate-400">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
          </svg>
          <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">Doors Roadmap</h3>
          <span className="text-xs text-navy/40 dark:text-slate-500 font-body ml-1">({doors.length} doors)</span>
        </div>
        <Button size="sm" onClick={() => setShowAddDoor(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Door
        </Button>
      </div>

      {/* Doors List */}
      {doors.length === 0 ? (
        <p className="text-navy/40 dark:text-slate-500 font-body text-sm py-4">No doors in the roadmap yet. Add the first door to get started.</p>
      ) : (
        <div className="space-y-3">
          {doors.map((door) => {
            const styles = STATUS_STYLES[door.status];
            const keys = door.keys || [];
            const completedKeys = keys.filter((k) => k.is_completed).length;
            const totalKeys = keys.length;
            const progress = totalKeys > 0 ? (completedKeys / totalKeys) * 100 : 0;
            const isExpanded = expandedDoor === door.id;

            return (
              <div
                key={door.id}
                className={`rounded-xl border-2 ${styles.border} ${styles.bg} overflow-hidden transition-all duration-200`}
              >
                {/* Door Header */}
                <button
                  onClick={() => setExpandedDoor(isExpanded ? null : door.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-heading font-bold text-sm ${
                    door.status === 'completed' ? 'bg-green-100 text-green-600' :
                    door.status === 'in_progress' ? 'bg-electric/10 text-electric' :
                    'bg-navy/5 dark:bg-slate-800 text-navy/30 dark:text-slate-500'
                  }`}>
                    {door.door_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className={`text-sm font-medium font-body ${
                        door.status === 'locked' ? 'text-navy/40 dark:text-slate-500' : 'text-navy dark:text-slate-100'
                      }`}>
                        {door.title}
                      </h4>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${styles.text} ${
                        door.status === 'completed' ? 'bg-green-100' :
                        door.status === 'in_progress' ? 'bg-electric/10' :
                        'bg-navy/5'
                      }`}>
                        {door.status.replace('_', ' ')}
                      </span>
                    </div>
                    {totalKeys > 0 && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 bg-navy/5 dark:bg-slate-700 rounded-full overflow-hidden max-w-[200px]">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              door.status === 'completed' ? 'bg-green-400' : 'bg-electric'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
                          {completedKeys}/{totalKeys} keys
                        </span>
                      </div>
                    )}
                  </div>
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
                    className={`text-navy/20 dark:text-slate-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded Door Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-navy/5 dark:border-slate-700">
                    {door.description && (
                      <p className="text-xs text-navy/50 dark:text-slate-400 font-body mb-3">{door.description}</p>
                    )}

                    {/* Status controls */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-navy/40 dark:text-slate-500 font-body">Status:</span>
                      {(['locked', 'in_progress', 'completed'] as DoorStatus[]).map((status) => (
                        <button
                          key={status}
                          onClick={() => handleUpdateDoorStatus(door.id, status)}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                            door.status === status
                              ? STATUS_STYLES[status].text + ' ' + (
                                  status === 'completed' ? 'bg-green-100' :
                                  status === 'in_progress' ? 'bg-electric/10' :
                                  'bg-navy/5'
                                )
                              : 'text-navy/30 dark:text-slate-500 hover:text-navy/50 dark:hover:text-slate-300 bg-navy/5 dark:bg-slate-800 hover:bg-navy/10 dark:hover:bg-slate-700'
                          }`}
                        >
                          {status.replace('_', ' ')}
                        </button>
                      ))}
                      <button
                        onClick={() => handleDeleteDoor(door.id)}
                        className="ml-auto text-navy/30 dark:text-slate-600 hover:text-red-500 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>

                    {/* Keys */}
                    <div className="space-y-1.5">
                      {keys
                        .sort((a, b) => a.key_number - b.key_number)
                        .map((key) => (
                        <div key={key.id} className="flex items-center gap-2 bg-white dark:bg-dark-surface rounded-lg px-3 py-2">
                          <button
                            onClick={() => handleToggleKey(door.id, key)}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
                              key.is_completed
                                ? 'bg-green-500 border-green-500'
                                : 'border-navy/20 dark:border-slate-600 hover:border-electric'
                            }`}
                          >
                            {key.is_completed && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                          <span className="text-xs font-medium text-navy/40 dark:text-slate-500 font-body w-5 shrink-0">
                            {key.key_number}.
                          </span>
                          <span className={`text-sm font-body flex-1 ${
                            key.is_completed ? 'text-navy/40 dark:text-slate-500 line-through' : 'text-navy dark:text-slate-100'
                          }`}>
                            {key.title}
                          </span>
                          <button
                            onClick={() => handleDeleteKey(door.id, key.id)}
                            className="text-navy/20 dark:text-slate-600 hover:text-red-400 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add Key */}
                    {addingKeyToDoor === door.id ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Key title"
                          value={keyForm.title}
                          onChange={(e) => setKeyForm({ ...keyForm, title: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateKey(door.id);
                            if (e.key === 'Escape') setAddingKeyToDoor(null);
                          }}
                          autoFocus
                          className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all"
                        />
                        <Button size="sm" onClick={() => handleCreateKey(door.id)} loading={creating} disabled={!keyForm.title.trim()}>
                          Add
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAddingKeyToDoor(null); setKeyForm({ title: '', description: '' }); }}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingKeyToDoor(door.id)}
                        className="mt-2 flex items-center gap-1.5 text-xs text-navy/40 dark:text-slate-500 hover:text-electric font-body transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Key
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Door Modal */}
      <Modal isOpen={showAddDoor} onClose={() => setShowAddDoor(false)}>
        <form onSubmit={handleCreateDoor} className="p-6">
          <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-4">Add Door</h2>
          <div className="space-y-4">
            <Input
              label="Door Title"
              placeholder="e.g., Brand Foundation"
              value={doorForm.title}
              onChange={(e) => setDoorForm({ ...doorForm, title: e.target.value })}
              required
            />
            <div className="w-full">
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Description</label>
              <textarea
                placeholder="What does this milestone involve?"
                value={doorForm.description}
                onChange={(e) => setDoorForm({ ...doorForm, description: e.target.value })}
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="secondary" onClick={() => setShowAddDoor(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating} disabled={!doorForm.title.trim()}>
              Add Door
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
