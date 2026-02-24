'use client';

import { useState } from 'react';
import SSOConfigManager from './SSOConfigManager';
import IPWhitelistManager from './IPWhitelistManager';
import AuditLogViewer from './AuditLogViewer';
import AIAccuracyDashboard from './AIAccuracyDashboard';
import SecurityOverview from './SecurityOverview';

type Tab = 'overview' | 'sso' | 'ip_whitelist' | 'audit_log' | 'ai_accuracy';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'sso', label: 'SSO' },
  { key: 'ip_whitelist', label: 'IP Whitelist' },
  { key: 'audit_log', label: 'Audit Log' },
  { key: 'ai_accuracy', label: 'AI Accuracy' },
];

export default function EnterpriseSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex border-b border-cream-dark dark:border-slate-700">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-body transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-electric text-electric font-medium'
                : 'border-transparent text-navy/50 dark:text-slate-400 hover:text-navy/80 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && <SecurityOverview />}
        {activeTab === 'sso' && <SSOConfigManager />}
        {activeTab === 'ip_whitelist' && <IPWhitelistManager />}
        {activeTab === 'audit_log' && <AuditLogViewer />}
        {activeTab === 'ai_accuracy' && <AIAccuracyDashboard />}
      </div>
    </div>
  );
}
