'use client';

import type { UpcomingMeeting } from '@/lib/types';

interface TodaysAgendaProps {
  meetings: UpcomingMeeting[];
}

function formatMeetingTime(isoString: string): { label: string; isToday: boolean } {
  const date = new Date(isoString);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();

  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const prefix = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' });

  return { label: `${prefix} ${time}`, isToday };
}

export default function TodaysAgenda({ meetings }: TodaysAgendaProps) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 dark:text-blue-400">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
          Upcoming Meetings
        </h3>
      </div>

      {meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
            No meetings in the next 48h
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => {
            const { label: timeLabel, isToday } = formatMeetingTime(meeting.start_time);
            return (
              <div
                key={meeting.id}
                className="flex items-start gap-3 group"
              >
                <div
                  className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold font-body mt-0.5 ${
                    isToday
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-cream-dark text-navy/50 dark:bg-slate-700 dark:text-slate-400'
                  }`}
                >
                  {timeLabel}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-navy dark:text-slate-200 font-body truncate">
                    {meeting.title}
                  </p>
                  {meeting.client_name && (
                    <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body truncate">
                      {meeting.client_name}
                    </p>
                  )}
                </div>
                {meeting.has_prep && (
                  <span className="shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded font-body">
                    Prep
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
