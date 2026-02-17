'use client';

import { useState } from 'react';
import { TrainingAssignment, TrainingStatus } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface TrainingTrackerProps {
  clientId: string;
  assignments: TrainingAssignment[];
  onRefresh: () => void;
}

const STATUS_CONFIG: Record<TrainingStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-gray-600', bg: 'bg-gray-100' },
  in_progress: { label: 'In Progress', color: 'text-blue-600', bg: 'bg-blue-100' },
  submitted: { label: 'Submitted', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  reviewed: { label: 'Reviewed', color: 'text-purple-600', bg: 'bg-purple-100' },
  completed: { label: 'Completed', color: 'text-green-600', bg: 'bg-green-100' },
};

export default function TrainingTracker({ clientId, assignments, onRefresh }: TrainingTrackerProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editForm, setEditForm] = useState({
    status: '' as TrainingStatus,
    submission: '',
    feedback: '',
  });
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    video_url: '',
    due_date: '',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setCreating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/training`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim() || undefined,
          video_url: formData.video_url.trim() || undefined,
          due_date: formData.due_date || undefined,
        }),
      });
      if (res.ok) {
        setShowAdd(false);
        setFormData({ title: '', description: '', video_url: '', due_date: '' });
        onRefresh();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (assignment: TrainingAssignment) => {
    setEditingId(assignment.id);
    setEditForm({
      status: assignment.status,
      submission: assignment.submission || '',
      feedback: assignment.feedback || '',
    });
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/training/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editForm.status,
          submission: editForm.submission.trim() || undefined,
          feedback: editForm.feedback.trim() || undefined,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        onRefresh();
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this training assignment?')) return;
    await fetch(`/api/clients/${clientId}/training/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/50 dark:text-slate-400">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">Training Tracker</h3>
          <span className="text-xs text-navy/40 dark:text-slate-500 font-body ml-1">({assignments.length})</span>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add
        </Button>
      </div>

      {/* Assignments List */}
      {assignments.length === 0 ? (
        <p className="text-navy/40 dark:text-slate-500 font-body text-sm py-4">No training assignments yet.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map((assignment) => {
            const statusConfig = STATUS_CONFIG[assignment.status];
            return (
              <div
                key={assignment.id}
                className="bg-cream dark:bg-dark-bg rounded-xl px-4 py-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                        {assignment.title}
                      </h4>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusConfig.color} ${statusConfig.bg}`}>
                        {statusConfig.label}
                      </span>
                    </div>
                    {assignment.description && (
                      <p className="text-xs text-navy/50 dark:text-slate-400 font-body line-clamp-1">{assignment.description}</p>
                    )}
                    {assignment.due_date && (
                      <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-1">
                        Due: {new Date(assignment.due_date).toLocaleDateString()}
                      </p>
                    )}
                    {assignment.video_url && (
                      <a
                        href={assignment.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-electric hover:underline font-body mt-1 inline-block"
                      >
                        View Video
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(assignment)}>
                      Edit
                    </Button>
                    <button
                      onClick={() => handleDelete(assignment.id)}
                      className="text-navy/30 dark:text-slate-600 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Assignment Modal */}
      <Modal isOpen={editingId !== null} onClose={() => setEditingId(null)}>
        <div className="p-6">
          <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-4">Update Assignment</h2>
          <div className="space-y-4">
            <div className="w-full">
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as TrainingStatus })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="submitted">Submitted</option>
                <option value="reviewed">Reviewed</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="w-full">
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Submission</label>
              <textarea
                placeholder="Submission content or link"
                value={editForm.submission}
                onChange={(e) => setEditForm({ ...editForm, submission: e.target.value })}
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm resize-none"
              />
            </div>
            <div className="w-full">
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Feedback</label>
              <textarea
                placeholder="Reviewer feedback"
                value={editForm.feedback}
                onChange={(e) => setEditForm({ ...editForm, feedback: e.target.value })}
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} loading={updating}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Training Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)}>
        <form onSubmit={handleCreate} className="p-6">
          <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-4">Add Training Assignment</h2>
          <div className="space-y-4">
            <Input
              label="Title"
              placeholder="Training assignment title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
            <div className="w-full">
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Description</label>
              <textarea
                placeholder="Describe the training assignment"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm resize-none"
              />
            </div>
            <Input
              label="Video URL"
              placeholder="https://..."
              value={formData.video_url}
              onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
            />
            <Input
              label="Due Date"
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating} disabled={!formData.title.trim()}>
              Add Assignment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
