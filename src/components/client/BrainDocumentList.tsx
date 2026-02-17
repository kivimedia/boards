'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ClientBrainDocument, BrainDocSourceType } from '@/lib/types';
import Button from '@/components/ui/Button';

interface BrainDocumentListProps {
  clientId: string;
}

const SOURCE_TYPE_LABELS: Record<BrainDocSourceType, string> = {
  card: 'Cards',
  comment: 'Comments',
  brief: 'Briefs',
  attachment: 'Attachments',
  manual: 'Manual',
  map_board: 'Map Board',
  wiki: 'Wiki',
  asset: 'Assets',
  email: 'Emails',
};

const SOURCE_TYPE_ICONS: Record<BrainDocSourceType, string> = {
  card: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  comment: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  brief: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  attachment: 'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13',
  manual: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  map_board: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
  wiki: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  asset: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  email: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
};

export default function BrainDocumentList({ clientId }: BrainDocumentListProps) {
  const [documents, setDocuments] = useState<ClientBrainDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/brain/documents`);
      if (!res.ok) throw new Error('Failed to load documents');
      const json = await res.json();
      setDocuments(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleDeactivate = async (documentId: string) => {
    setDeactivating(documentId);
    try {
      const res = await fetch(`/api/clients/${clientId}/brain/documents/${documentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to deactivate document');
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    } catch {
      setError('Failed to deactivate document');
    } finally {
      setDeactivating(null);
    }
  };

  // Group documents by source type
  const grouped: Partial<Record<BrainDocSourceType, ClientBrainDocument[]>> = {};
  for (const doc of documents) {
    if (!grouped[doc.source_type]) {
      grouped[doc.source_type] = [];
    }
    grouped[doc.source_type]!.push(doc);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <svg
          className="animate-spin h-5 w-5 text-electric"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 font-body">
        {error}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-center">
        <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
          No documents indexed yet. Documents will appear here as cards are processed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(Object.keys(grouped) as BrainDocSourceType[]).map((sourceType) => {
        const docs = grouped[sourceType]!;
        const label = SOURCE_TYPE_LABELS[sourceType] || sourceType;
        const iconPath = SOURCE_TYPE_ICONS[sourceType];

        return (
          <div key={sourceType}>
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-navy/50 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
              </svg>
              <h4 className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
                {label} ({docs.length})
              </h4>
            </div>

            <div className="space-y-1.5">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 group hover:border-navy/10 dark:hover:border-slate-600 transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-navy dark:text-slate-100 font-body truncate">{doc.title}</p>
                    <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                      Chunk {doc.chunk_index + 1} &middot;{' '}
                      {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeactivate(doc.id)}
                    disabled={deactivating === doc.id}
                    loading={deactivating === doc.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    {deactivating === doc.id ? '' : 'Remove'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
