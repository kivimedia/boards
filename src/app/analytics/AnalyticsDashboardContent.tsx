'use client';

import { useState } from 'react';
import BurndownChart from '@/components/analytics/BurndownChart';
import VelocityChart from '@/components/analytics/VelocityChart';
import SatisfactionTrends from '@/components/analytics/SatisfactionTrends';
import ReportBuilder from '@/components/analytics/ReportBuilder';
import BrandingEditor from '@/components/branding/BrandingEditor';

interface Board {
  id: string;
  name: string;
  type: string;
}

interface AnalyticsDashboardContentProps {
  boards: Board[];
}

type Tab = 'burndown' | 'velocity' | 'satisfaction' | 'reports' | 'branding';

export default function AnalyticsDashboardContent({ boards }: AnalyticsDashboardContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('burndown');
  const [selectedBoardId, setSelectedBoardId] = useState(boards[0]?.id ?? '');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'burndown', label: 'Burndown' },
    { id: 'velocity', label: 'Velocity' },
    { id: 'satisfaction', label: 'Satisfaction' },
    { id: 'reports', label: 'Reports' },
    { id: 'branding', label: 'White-Label' },
  ];

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Tab navigation */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-cream-dark/40">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium font-body transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-navy shadow-sm'
                  : 'text-navy/50 hover:text-navy/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Burndown tab */}
        {activeTab === 'burndown' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-navy/60 font-body">Board:</label>
              <select
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-cream-dark bg-white text-sm text-navy font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedBoardId ? (
              <BurndownChart boardId={selectedBoardId} />
            ) : (
              <div className="text-center py-12 text-sm text-navy/40 font-body">
                Select a board to view the burndown chart.
              </div>
            )}
          </div>
        )}

        {/* Velocity tab */}
        {activeTab === 'velocity' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-navy/60 dark:text-slate-400 font-body">Board:</label>
              <select
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedBoardId ? (
              <VelocityChart boardId={selectedBoardId} />
            ) : (
              <div className="text-center py-12 text-sm text-navy/40 dark:text-slate-400 font-body">
                Select a board to view velocity metrics.
              </div>
            )}
          </div>
        )}

        {/* Satisfaction tab */}
        {activeTab === 'satisfaction' && <SatisfactionTrends />}

        {/* Reports tab */}
        {activeTab === 'reports' && <ReportBuilder />}

        {/* Branding tab */}
        {activeTab === 'branding' && <BrandingEditor />}
      </div>
    </div>
  );
}
