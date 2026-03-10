'use client';

import { useState, useMemo } from 'react';
import {
  ALL_DIVI5_MODULES,
  type Divi5Module,
  type Divi5ModuleCategory,
} from '@/lib/ai/pageforge/divi5-module-reference';

interface Divi5ModulePickerProps {
  selectedSlugs: string[];
  onChange: (slugs: string[]) => void;
  compact?: boolean;
}

const CATEGORY_LABELS: Record<Divi5ModuleCategory, string> = {
  structure: 'Structure',
  text: 'Text',
  media: 'Media',
  interactive: 'Interactive',
  layout: 'Layout',
  forms: 'Forms',
  navigation: 'Navigation',
  blog: 'Blog & Posts',
  counters: 'Counters',
  social: 'Social',
  utility: 'Utility',
  woocommerce: 'WooCommerce',
};

const CATEGORY_ORDER: Divi5ModuleCategory[] = [
  'structure', 'text', 'media', 'interactive', 'layout',
  'counters', 'forms', 'blog', 'navigation', 'utility',
  'social', 'woocommerce',
];

function groupByCategory(modules: Divi5Module[]): Map<Divi5ModuleCategory, Divi5Module[]> {
  const map = new Map<Divi5ModuleCategory, Divi5Module[]>();
  for (const cat of CATEGORY_ORDER) map.set(cat, []);
  for (const m of modules) {
    const list = map.get(m.category);
    if (list) list.push(m);
  }
  return map;
}

export default function Divi5ModulePicker({ selectedSlugs, onChange, compact }: Divi5ModulePickerProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(!compact);

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_DIVI5_MODULES;
    const q = search.toLowerCase();
    return ALL_DIVI5_MODULES.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.slug.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.useCases.some(u => u.toLowerCase().includes(q))
    );
  }, [search]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

  const toggle = (slug: string) => {
    if (selectedSlugs.includes(slug)) {
      onChange(selectedSlugs.filter(s => s !== slug));
    } else {
      onChange([...selectedSlugs, slug]);
    }
  };

  const selectedModules = selectedSlugs
    .map(slug => ALL_DIVI5_MODULES.find(m => m.slug === slug))
    .filter(Boolean) as Divi5Module[];

  // Compact mode: collapsible dropdown
  if (compact && !expanded) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[11px] px-2 py-1 rounded bg-electric/10 text-electric font-medium hover:bg-electric/20 transition-colors"
        >
          Pick Divi 5 Modules ({selectedSlugs.length} selected)
        </button>
      </div>
    );
  }

  return (
    <div className={`${compact ? 'mt-2 border border-navy/10 dark:border-slate-600 rounded-lg p-3 bg-white dark:bg-slate-800' : ''}`}>
      {/* Selected modules as chips */}
      {selectedModules.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {selectedModules.map(m => (
            <span
              key={m.slug}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-electric/10 text-electric text-[11px] font-medium"
            >
              {m.name}
              <button
                type="button"
                onClick={() => toggle(m.slug)}
                className="ml-0.5 hover:text-red-500 transition-colors"
                title={`Remove ${m.name}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search modules..."
          className="w-full text-xs px-3 py-1.5 rounded-lg border border-navy/15 dark:border-slate-600 bg-white dark:bg-slate-700 text-navy dark:text-slate-200 focus:ring-1 focus:ring-electric focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500"
        />
      </div>

      {/* Category grid */}
      <div className={`grid gap-2 ${compact ? 'grid-cols-2 max-h-64 overflow-y-auto' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
        {CATEGORY_ORDER.map(cat => {
          const modules = grouped.get(cat);
          if (!modules || modules.length === 0) return null;
          return (
            <div key={cat} className="rounded-lg border border-navy/8 dark:border-slate-700 overflow-hidden">
              <div className="px-2 py-1 bg-navy/5 dark:bg-slate-700/60 border-b border-navy/8 dark:border-slate-700">
                <span className="text-[10px] font-bold text-navy/60 dark:text-slate-400 uppercase tracking-wide">
                  {CATEGORY_LABELS[cat]}
                </span>
              </div>
              <div className="p-1">
                {modules.map(m => {
                  const isSelected = selectedSlugs.includes(m.slug);
                  return (
                    <button
                      key={m.slug}
                      type="button"
                      onClick={() => toggle(m.slug)}
                      title={m.description}
                      className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${
                        isSelected
                          ? 'bg-electric/15 text-electric font-semibold'
                          : 'text-navy/70 dark:text-slate-300 hover:bg-navy/5 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="block truncate">{m.name}</span>
                      {!compact && (
                        <span className="block text-[9px] text-navy/40 dark:text-slate-500 truncate">
                          {m.slug}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Collapse button in compact mode */}
      {compact && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[10px] text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300"
          >
            Collapse picker
          </button>
        </div>
      )}
    </div>
  );
}
