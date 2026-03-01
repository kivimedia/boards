'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const MeetingsContent = dynamic(() => import('./MeetingsContent'), { ssr: false });
const IdentityManager = dynamic(() => import('./IdentityManager'), { ssr: false });

type Tab = 'meetings' | 'participants';

export default function MeetingsPageTabs() {
  const [tab, setTab] = useState<Tab>('meetings');

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6">
        <nav className="flex gap-6 -mb-px">
          <button
            onClick={() => setTab('meetings')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'meetings'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Meetings
            </span>
          </button>
          <button
            onClick={() => setTab('participants')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'participants'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Participants
            </span>
          </button>
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'meetings' ? <MeetingsContent /> : <IdentityManager />}
    </div>
  );
}
