'use client';

import { useState } from 'react';
import type { Board } from '@/lib/types';
import RevisionDashboard from '@/components/revision/RevisionDashboard';
import RevisionDrillDown from '@/components/revision/RevisionDrillDown';
import ExportManager from '@/components/revision/ExportManager';

interface RevisionPageContentProps {
  boards: Pick<Board, 'id' | 'name' | 'type'>[];
}

type Tab = 'dashboard' | 'exports';

export default function RevisionPageContent({ boards }: RevisionPageContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [drillDownCardId, setDrillDownCardId] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Tab Switcher */}
      <div className="px-6 pt-4">
        <div className="flex gap-1 bg-cream/50 rounded-xl p-1 border border-cream-dark w-fit">
          <button
            onClick={() => { setActiveTab('dashboard'); setDrillDownCardId(null); }}
            className={`
              px-4 py-2 rounded-lg text-xs font-semibold font-body transition-all duration-200
              ${activeTab === 'dashboard' ? 'bg-white text-navy shadow-sm' : 'text-navy/50 hover:text-navy'}
            `}
          >
            Dashboard
          </button>
          <button
            onClick={() => { setActiveTab('exports'); setDrillDownCardId(null); }}
            className={`
              px-4 py-2 rounded-lg text-xs font-semibold font-body transition-all duration-200
              ${activeTab === 'exports' ? 'bg-white text-navy shadow-sm' : 'text-navy/50 hover:text-navy'}
            `}
          >
            Exports
          </button>
        </div>
      </div>

      {/* Drill-down overlay */}
      {drillDownCardId && (
        <div className="px-6 pt-4">
          <RevisionDrillDown
            cardId={drillDownCardId}
            onClose={() => setDrillDownCardId(null)}
          />
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'dashboard' && !drillDownCardId && (
        <RevisionDashboard boards={boards} />
      )}

      {activeTab === 'exports' && (
        <div className="p-6">
          <ExportManager />
        </div>
      )}
    </div>
  );
}
