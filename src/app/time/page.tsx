'use client';

import TimeReportView from '@/components/time/TimeReportView';

export default function TimePage() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <div className="border-b border-cream-dark bg-white">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-navy font-heading">Time Tracking</h1>
              <p className="text-sm text-navy/50 font-body mt-0.5">
                Track, report, and export time across all cards and projects
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-electric/10 text-electric">
                P3.1
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <TimeReportView />
      </div>
    </div>
  );
}
