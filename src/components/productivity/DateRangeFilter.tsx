'use client';

import { useState, useCallback } from 'react';

interface DateRange {
  startDate: string;
  endDate: string;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  comparisonMode?: boolean;
  onComparisonToggle?: (enabled: boolean) => void;
}

type PresetKey = '7d' | '14d' | '30d' | '90d' | 'custom';

const PRESETS: { key: PresetKey; label: string; days: number }[] = [
  { key: '7d', label: '7d', days: 7 },
  { key: '14d', label: '14d', days: 14 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
];

function getDateRange(days: number): DateRange {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function getActivePreset(range: DateRange): PresetKey {
  const today = new Date().toISOString().split('T')[0];
  if (range.endDate !== today) return 'custom';

  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  for (const preset of PRESETS) {
    if (diffDays === preset.days) return preset.key;
  }
  return 'custom';
}

export default function DateRangeFilter({
  value,
  onChange,
  comparisonMode = false,
  onComparisonToggle,
}: DateRangeFilterProps) {
  const [showCustom, setShowCustom] = useState(false);
  const activePreset = getActivePreset(value);

  const handlePreset = useCallback(
    (days: number) => {
      setShowCustom(false);
      onChange(getDateRange(days));
    },
    [onChange]
  );

  const handleCustomClick = useCallback(() => {
    setShowCustom(true);
  }, []);

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex flex-wrap items-center gap-3">
        {/* Preset buttons */}
        <div className="flex items-center gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => handlePreset(preset.days)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-semibold font-body transition-all duration-200
                ${
                  activePreset === preset.key && !showCustom
                    ? 'bg-electric text-white shadow-sm'
                    : 'bg-cream/50 dark:bg-navy/30 text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800 hover:text-navy dark:hover:text-slate-100'
                }
              `}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={handleCustomClick}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-semibold font-body transition-all duration-200
              ${
                showCustom || activePreset === 'custom'
                  ? 'bg-electric text-white shadow-sm'
                  : 'bg-cream/50 text-navy/60 hover:bg-cream-dark hover:text-navy'
              }
            `}
          >
            Custom
          </button>
        </div>

        {/* Custom date inputs */}
        {(showCustom || activePreset === 'custom') && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={value.startDate}
              onChange={(e) => onChange({ ...value, startDate: e.target.value })}
              className="px-2.5 py-1.5 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 text-xs text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
            />
            <span className="text-xs text-navy/40 dark:text-slate-500 font-body">to</span>
            <input
              type="date"
              value={value.endDate}
              onChange={(e) => onChange({ ...value, endDate: e.target.value })}
              className="px-2.5 py-1.5 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 text-xs text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
            />
          </div>
        )}

        {/* Comparison mode toggle */}
        {onComparisonToggle && (
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-navy/50 dark:text-slate-400 font-body">Compare</label>
            <button
              onClick={() => onComparisonToggle(!comparisonMode)}
              className={`
                relative w-9 h-5 rounded-full transition-colors duration-200
                ${comparisonMode ? 'bg-electric' : 'bg-cream-dark dark:bg-slate-700'}
              `}
            >
              <span
                className={`
                  absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200
                  ${comparisonMode ? 'translate-x-4' : 'translate-x-0.5'}
                `}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
