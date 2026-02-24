'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface QAScheduleToggleProps {
  cardId: string;
  url: string;
}

export default function QAScheduleToggle({ cardId, url }: QAScheduleToggleProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'biweekly'>('daily');
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cardId || !url) return;

    supabase
      .from('qa_schedules')
      .select('*')
      .eq('card_id', cardId)
      .eq('url', url)
      .single()
      .then(({ data }) => {
        if (data) {
          setEnabled(data.enabled);
          setFrequency(data.frequency);
          setLastRun(data.last_run_at);
          setNextRun(data.next_run_at);
        }
      });
  }, [cardId, url]);

  const handleToggle = async () => {
    if (!user) return;
    setLoading(true);

    const newEnabled = !enabled;
    const nextRunAt = newEnabled
      ? new Date(Date.now() + (frequency === 'daily' ? 86400000 : frequency === 'weekly' ? 604800000 : 1209600000)).toISOString()
      : null;

    await supabase.from('qa_schedules').upsert(
      {
        card_id: cardId,
        url,
        frequency,
        enabled: newEnabled,
        next_run_at: nextRunAt,
        notify_user_id: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'card_id,url' }
    );

    setEnabled(newEnabled);
    setNextRun(nextRunAt);
    setLoading(false);
  };

  const handleFrequencyChange = async (newFreq: 'daily' | 'weekly' | 'biweekly') => {
    if (!user || !enabled) {
      setFrequency(newFreq);
      return;
    }

    setFrequency(newFreq);
    const nextRunAt = new Date(Date.now() + (newFreq === 'daily' ? 86400000 : newFreq === 'weekly' ? 604800000 : 1209600000)).toISOString();

    await supabase.from('qa_schedules').upsert(
      {
        card_id: cardId,
        url,
        frequency: newFreq,
        enabled: true,
        next_run_at: nextRunAt,
        notify_user_id: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'card_id,url' }
    );
    setNextRun(nextRunAt);
  };

  if (!url) return null;

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-navy dark:text-white">Scheduled Monitoring</span>
          <p className="text-xs text-slate-500 dark:text-slate-400">Auto-run QA checks on this URL</p>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          role="switch"
          aria-checked={enabled}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            enabled ? 'bg-electric' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {enabled && (
        <>
          <div className="flex gap-1">
            {(['daily', 'weekly', 'biweekly'] as const).map((f) => (
              <button
                key={f}
                onClick={() => handleFrequencyChange(f)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  frequency === f
                    ? 'bg-electric text-white'
                    : 'bg-slate-100 dark:bg-dark-bg text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-navy-light'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
            {lastRun && <p>Last run: {new Date(lastRun).toLocaleDateString()}</p>}
            {nextRun && <p>Next run: {new Date(nextRun).toLocaleDateString()}</p>}
          </div>
        </>
      )}
    </div>
  );
}
