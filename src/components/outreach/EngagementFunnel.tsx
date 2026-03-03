'use client';

import { useState, useEffect } from 'react';

interface FunnelData {
  funnel: {
    connections_sent: number;
    connected: number;
    messages_sent: number;
    replied: number;
    booked: number;
    accept_rate: string;
    reply_rate: string;
    booking_rate: string;
  };
  avg_days_between_stages: Record<string, number>;
  weekly_trend: { week: string; [key: string]: string | number }[];
  period_days: number;
}

const FUNNEL_STAGES = [
  { key: 'connections_sent', label: 'Connections Sent', color: 'bg-indigo-500' },
  { key: 'connected', label: 'Accepted', color: 'bg-blue-500' },
  { key: 'messages_sent', label: 'Messages Sent', color: 'bg-cyan-500' },
  { key: 'replied', label: 'Replied', color: 'bg-emerald-500' },
  { key: 'booked', label: 'Booked', color: 'bg-green-500' },
];

const AVG_DAYS_LABELS: Record<string, string> = {
  send_to_accept: 'Send to Accept',
  accept_to_message: 'Accept to Message',
  message_to_reply: 'Message to Reply',
  reply_to_booking: 'Reply to Booking',
};

export default function EngagementFunnel() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/outreach/engagement?days=${days}`)
      .then(r => r.json())
      .then(json => { if (json.data) setData(json.data); })
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const maxCount = Math.max(data.funnel.connections_sent, 1);

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy dark:text-white font-heading">Engagement Funnel</h2>
        <div className="flex gap-1">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                days === d
                  ? 'bg-electric text-white'
                  : 'bg-gray-100 text-navy/60 hover:bg-gray-200 dark:bg-navy-700 dark:text-slate-400'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Funnel Visualization */}
      <div className="bg-white dark:bg-navy-800 rounded-lg border border-gray-200 dark:border-navy-700 p-5">
        <div className="space-y-3">
          {FUNNEL_STAGES.map((stage, idx) => {
            const count = data.funnel[stage.key as keyof typeof data.funnel] as number;
            const width = Math.max((count / maxCount) * 100, 4);

            return (
              <div key={stage.key} className="flex items-center gap-3">
                <div className="w-28 text-right">
                  <span className="text-xs text-navy/50 dark:text-slate-400">{stage.label}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 dark:bg-navy-700 rounded-full h-7 overflow-hidden">
                      <div
                        className={`h-full ${stage.color} rounded-full flex items-center justify-end pr-2 transition-all duration-500`}
                        style={{ width: `${width}%` }}
                      >
                        <span className="text-xs font-semibold text-white">{count}</span>
                      </div>
                    </div>
                    {/* Conversion rate arrow */}
                    {idx > 0 && (
                      <span className="text-xs text-navy/40 dark:text-slate-500 w-12 text-right">
                        {idx === 1 && `${data.funnel.accept_rate}%`}
                        {idx === 3 && `${data.funnel.reply_rate}%`}
                        {idx === 4 && `${data.funnel.booking_rate}%`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conversion Rate Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-navy-800 rounded-lg border border-gray-200 dark:border-navy-700 p-4 text-center">
          <div className="text-2xl font-bold text-electric">{data.funnel.accept_rate}%</div>
          <div className="text-xs text-navy/40 dark:text-slate-500 mt-1">Accept Rate</div>
        </div>
        <div className="bg-white dark:bg-navy-800 rounded-lg border border-gray-200 dark:border-navy-700 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-500">{data.funnel.reply_rate}%</div>
          <div className="text-xs text-navy/40 dark:text-slate-500 mt-1">Reply Rate</div>
        </div>
        <div className="bg-white dark:bg-navy-800 rounded-lg border border-gray-200 dark:border-navy-700 p-4 text-center">
          <div className="text-2xl font-bold text-green-500">{data.funnel.booking_rate}%</div>
          <div className="text-xs text-navy/40 dark:text-slate-500 mt-1">Booking Rate</div>
        </div>
      </div>

      {/* Avg Days Between Stages */}
      {Object.keys(data.avg_days_between_stages).length > 0 && (
        <div className="bg-white dark:bg-navy-800 rounded-lg border border-gray-200 dark:border-navy-700 p-4">
          <h3 className="text-sm font-semibold text-navy dark:text-white mb-3">Avg Days Between Stages</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(data.avg_days_between_stages).map(([key, value]) => (
              <div key={key} className="text-center">
                <div className="text-lg font-bold text-navy dark:text-white">{value}d</div>
                <div className="text-[10px] text-navy/40 dark:text-slate-500">
                  {AVG_DAYS_LABELS[key] || key}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly Trend */}
      {data.weekly_trend.length > 0 && (
        <div className="bg-white dark:bg-navy-800 rounded-lg border border-gray-200 dark:border-navy-700 p-4">
          <h3 className="text-sm font-semibold text-navy dark:text-white mb-3">Weekly Activity</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-navy-700">
                  <th className="text-left py-1.5 px-2 font-medium text-navy/40 dark:text-slate-500">Week</th>
                  <th className="text-center py-1.5 px-2 font-medium text-navy/40 dark:text-slate-500">Sent</th>
                  <th className="text-center py-1.5 px-2 font-medium text-navy/40 dark:text-slate-500">Accepted</th>
                  <th className="text-center py-1.5 px-2 font-medium text-navy/40 dark:text-slate-500">Msgs</th>
                  <th className="text-center py-1.5 px-2 font-medium text-navy/40 dark:text-slate-500">Replied</th>
                  <th className="text-center py-1.5 px-2 font-medium text-navy/40 dark:text-slate-500">Booked</th>
                </tr>
              </thead>
              <tbody>
                {data.weekly_trend.map(week => (
                  <tr key={week.week} className="border-b border-gray-50 dark:border-navy-700/50">
                    <td className="py-1.5 px-2 text-navy/60 dark:text-slate-400">{week.week}</td>
                    <td className="py-1.5 px-2 text-center text-navy dark:text-white">{week.CONNECTION_SENT || 0}</td>
                    <td className="py-1.5 px-2 text-center text-navy dark:text-white">{week.CONNECTED || 0}</td>
                    <td className="py-1.5 px-2 text-center text-navy dark:text-white">{week.MESSAGE_SENT || 0}</td>
                    <td className="py-1.5 px-2 text-center text-navy dark:text-white">{week.REPLIED || 0}</td>
                    <td className="py-1.5 px-2 text-center text-navy dark:text-white font-semibold">{week.BOOKED || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
