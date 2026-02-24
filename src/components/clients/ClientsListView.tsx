'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Client } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import TrelloCardPicker from '@/components/trello/TrelloCardPicker';

export default function ClientsListView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    contract_type: '',
    notes: '',
  });
  const router = useRouter();

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/clients');
      const json = await res.json();
      if (json.data) setClients(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          company: formData.company.trim() || undefined,
          contract_type: formData.contract_type.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.data?.id) {
        setCreatedClientId(json.data.id);
        fetchClients();
      }
    } finally {
      setCreating(false);
    }
  };

  const closeCreateModal = () => {
    setShowCreate(false);
    setCreatedClientId(null);
    setFormData({ name: '', company: '', contract_type: '', notes: '' });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cream dark:bg-dark-bg">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-body">Loading clients...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-navy/60 dark:text-slate-400 font-body text-sm">
            {clients.length} client{clients.length !== 1 ? 's' : ''} total
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Client
          </Button>
        </div>

        {/* Client Grid */}
        {clients.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-cream-dark dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="text-navy/40 dark:text-slate-500 font-body text-sm mb-4">No clients yet. Create your first client to get started.</p>
            <Button onClick={() => setShowCreate(true)} size="sm">
              Create Client
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => (
              <button
                key={client.id}
                onClick={() => router.push(`/client/${client.id}/map`)}
                className="group text-left bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-electric/30 p-5 transition-all duration-200 hover:shadow-lg"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-electric/10 flex items-center justify-center shrink-0 group-hover:bg-electric/20 transition-colors">
                    <span className="text-electric font-heading font-bold text-sm">
                      {client.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  {client.contract_type && (
                    <span className="text-[10px] font-semibold text-electric bg-electric/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                      {client.contract_type}
                    </span>
                  )}
                </div>
                <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-1 group-hover:text-electric transition-colors">
                  {client.name}
                </h3>
                {client.company && (
                  <p className="text-navy/50 dark:text-slate-400 font-body text-sm mb-2">{client.company}</p>
                )}
                <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 text-xs font-body">

                  {client.contacts && client.contacts.length > 0 && (
                    <span className="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                      </svg>
                      {client.contacts.length} contact{client.contacts.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {client.client_tag && (
                    <span className="bg-cream-dark dark:bg-slate-800 px-1.5 py-0.5 rounded text-navy/50 dark:text-slate-400">
                      {client.client_tag}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create Client Modal */}
      <Modal isOpen={showCreate} onClose={closeCreateModal}>
        {!createdClientId ? (
          // Step 1: Basic client info
          <form onSubmit={handleCreate} className="p-6">
            <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-4">Create Client</h2>
            <div className="space-y-4">
              <Input
                label="Client Name"
                placeholder="Enter client name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <Input
                label="Company"
                placeholder="Company name (optional)"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
              <div className="w-full">
                <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
                  Contract Type
                </label>
                <select
                  value={formData.contract_type}
                  onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm"
                >
                  <option value="">Select type (optional)</option>
                  <option value="retainer">Retainer</option>
                  <option value="project">Project</option>
                  <option value="hourly">Hourly</option>
                  <option value="consultation">Consultation</option>
                </select>
              </div>
              <div className="w-full">
                <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
                  Notes
                </label>
                <textarea
                  placeholder="Additional notes (optional)"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="secondary" onClick={closeCreateModal}>
                Cancel
              </Button>
              <Button type="submit" loading={creating} disabled={!formData.name.trim()}>
                Create Client
              </Button>
            </div>
          </form>
        ) : (
          // Step 2: Track a Trello ticket
          <div className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100">Client Created</h2>
            </div>
            <p className="text-sm text-navy/50 dark:text-slate-400 font-body mb-5">
              What ticket should we track for <span className="font-medium text-navy dark:text-slate-200">{formData.name}</span>?
            </p>

            <TrelloCardPicker clientId={createdClientId} />

            <div className="flex justify-between items-center gap-3 mt-6 pt-4 border-t border-cream-dark dark:border-slate-700">
              <button
                type="button"
                onClick={() => router.push(`/client/${createdClientId}/map`)}
                className="text-xs text-electric hover:text-electric/80 font-body font-medium"
              >
                Go to client map &rarr;
              </button>
              <Button type="button" onClick={closeCreateModal}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
