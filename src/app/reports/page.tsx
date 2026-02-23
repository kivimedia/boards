'use client';

import { useState } from 'react';
import ReportConfigManager from '@/components/productivity/ReportConfigManager';
import ReportFileList from '@/components/productivity/ReportFileList';

type TabKey = 'configs' | 'files';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'configs', label: 'Report Configurations' },
  { key: 'files', label: 'Generated Reports' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('configs');

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <div className="border-b border-cream-dark bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-navy font-heading">Reports Dashboard</h1>
              <p className="text-sm text-navy/50 font-body mt-0.5">
                Configure, generate, and download productivity reports
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-electric/10 text-electric">
                P5.4
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-cream-dark bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-4 sm:gap-6 overflow-x-auto scrollbar-thin">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  py-3 text-sm font-medium font-body border-b-2 transition-colors whitespace-nowrap
                  ${activeTab === tab.key
                    ? 'border-electric text-electric'
                    : 'border-transparent text-navy/50 hover:text-navy/70'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {activeTab === 'configs' && <ReportConfigManager />}
        {activeTab === 'files' && <ReportFileList />}
      </div>
    </div>
  );
}
