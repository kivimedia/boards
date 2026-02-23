'use client';

import { useState } from 'react';
import Link from 'next/link';
import AIKeyManager from './AIKeyManager';
import AIModelConfigTable from './AIModelConfigTable';
import AICostDashboard from './AICostDashboard';
import AIBudgetManager from './AIBudgetManager';

type Tab = 'keys' | 'models' | 'usage' | 'budgets';

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: 'keys', label: 'API Keys', description: 'Manage provider API keys' },
  { id: 'models', label: 'Model Config', description: 'Configure models per activity' },
  { id: 'usage', label: 'Usage & Costs', description: 'View spending and token usage' },
  { id: 'budgets', label: 'Budget Controls', description: 'Set spending limits and alerts' },
];

export default function AISettingsDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('keys');

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Back link */}
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-navy/50 dark:text-slate-400 hover:text-electric font-body text-sm mb-6 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Settings
        </Link>

        <p className="text-navy/60 dark:text-slate-400 font-body text-sm mb-6">
          Configure AI providers, model assignments, monitor usage costs, and set budget limits.
        </p>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-white dark:bg-dark-surface rounded-xl border-2 border-cream-dark dark:border-slate-700 p-1 mb-8">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 px-4 py-2.5 rounded-lg text-sm font-body font-medium transition-all duration-200
                ${activeTab === tab.id
                  ? 'bg-electric text-white shadow-sm'
                  : 'text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-cream/50 dark:hover:bg-slate-800'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'keys' && <AIKeyManager />}
          {activeTab === 'models' && <AIModelConfigTable />}
          {activeTab === 'usage' && <AICostDashboard />}
          {activeTab === 'budgets' && <AIBudgetManager />}
        </div>
      </div>
    </div>
  );
}
