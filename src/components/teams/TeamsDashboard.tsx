'use client';

import TeamsPanel from './TeamsPanel';

export default function TeamsDashboard() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-navy dark:text-white font-heading mb-4">Agent Teams</h1>
      <TeamsPanel />
    </div>
  );
}
