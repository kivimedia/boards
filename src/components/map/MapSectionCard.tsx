'use client';

import { useState } from 'react';
import { MapSection, MapSectionType } from '@/lib/types';
import Button from '@/components/ui/Button';

interface MapSectionCardProps {
  section: MapSection;
  clientId: string;
  onRefresh: () => void;
}

const SECTION_ICONS: Record<MapSectionType, string> = {
  visual_brief: 'Visual Brief',
  outreach_planner: 'Outreach Planner',
  resources: 'Resources',
  whiteboard: 'Whiteboard',
  notes: 'Notes',
};

export default function MapSectionCard({ section, clientId, onRefresh }: MapSectionCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [contentStr, setContentStr] = useState(
    typeof section.content === 'object' && section.content !== null
      ? section.content.text as string || JSON.stringify(section.content, null, 2)
      : ''
  );
  const [isClientVisible, setIsClientVisible] = useState(section.is_client_visible);

  const handleSave = async () => {
    setSaving(true);
    try {
      let content: Record<string, unknown>;

      if (section.section_type === 'notes' || section.section_type === 'whiteboard') {
        content = { text: contentStr };
      } else if (section.section_type === 'visual_brief') {
        try {
          content = JSON.parse(contentStr);
        } catch {
          content = { text: contentStr };
        }
      } else if (section.section_type === 'resources') {
        try {
          content = JSON.parse(contentStr);
        } catch {
          // Parse as simple URL list
          const links = contentStr.split('\n').filter(Boolean).map((line) => {
            const parts = line.split(' - ');
            return { url: parts[0]?.trim(), label: parts[1]?.trim() || parts[0]?.trim() };
          });
          content = { links };
        }
      } else if (section.section_type === 'outreach_planner') {
        try {
          content = JSON.parse(contentStr);
        } catch {
          content = { text: contentStr };
        }
      } else {
        content = { text: contentStr };
      }

      const res = await fetch(`/api/clients/${clientId}/map-sections/${section.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          is_client_visible: isClientVisible,
        }),
      });
      if (res.ok) {
        setEditing(false);
        onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this section?')) return;
    await fetch(`/api/clients/${clientId}/map-sections/${section.id}`, { method: 'DELETE' });
    onRefresh();
  };

  const renderContent = () => {
    const content = section.content as Record<string, unknown>;

    switch (section.section_type) {
      case 'notes':
      case 'whiteboard':
        return (
          <div className="text-sm text-navy/70 dark:text-slate-300 font-body whitespace-pre-wrap">
            {(content.text as string) || <span className="text-navy/30 dark:text-slate-600 italic">No content yet. Click edit to add.</span>}
          </div>
        );

      case 'visual_brief': {
        const entries = Object.entries(content).filter(([key]) => key !== 'text');
        if (entries.length === 0 && content.text) {
          return <div className="text-sm text-navy/70 dark:text-slate-300 font-body whitespace-pre-wrap">{content.text as string}</div>;
        }
        return (
          <div className="space-y-2">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-start gap-3">
                <span className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wide min-w-[100px] pt-0.5 font-body">
                  {key.replace(/_/g, ' ')}
                </span>
                <span className="text-sm text-navy/70 dark:text-slate-300 font-body">{String(value)}</span>
              </div>
            ))}
            {entries.length === 0 && (
              <span className="text-navy/30 dark:text-slate-600 italic text-sm font-body">No content yet. Click edit to add key-value pairs.</span>
            )}
          </div>
        );
      }

      case 'resources': {
        const links = content.links as { url: string; label: string }[] | undefined;
        if (!links || links.length === 0) {
          return <span className="text-navy/30 dark:text-slate-600 italic text-sm font-body">No resources yet. Click edit to add links.</span>;
        }
        return (
          <div className="space-y-1.5">
            {links.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-electric hover:underline font-body"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                {link.label || link.url}
              </a>
            ))}
          </div>
        );
      }

      case 'outreach_planner': {
        if (content.text) {
          return <div className="text-sm text-navy/70 dark:text-slate-300 font-body whitespace-pre-wrap">{content.text as string}</div>;
        }
        const plan = content as Record<string, unknown>;
        const entries = Object.entries(plan);
        if (entries.length === 0) {
          return <span className="text-navy/30 dark:text-slate-600 italic text-sm font-body">No outreach plan yet. Click edit to add.</span>;
        }
        return (
          <div className="space-y-2">
            {entries.map(([key, value]) => (
              <div key={key} className="bg-cream dark:bg-dark-bg rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wide font-body">
                  {key.replace(/_/g, ' ')}
                </span>
                <p className="text-sm text-navy/70 dark:text-slate-300 font-body mt-0.5">{String(value)}</p>
              </div>
            ))}
          </div>
        );
      }

      default:
        return <span className="text-navy/30 dark:text-slate-600 italic text-sm font-body">Unknown section type.</span>;
    }
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-navy/30 dark:text-slate-600 uppercase tracking-wide font-body">
            {SECTION_ICONS[section.section_type]}
          </span>
          {editing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base font-heading font-semibold text-navy dark:text-slate-100 bg-transparent border-b-2 border-electric focus:outline-none px-1"
            />
          ) : (
            <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">
              {section.title || SECTION_ICONS[section.section_type]}
            </h3>
          )}
          {section.is_client_visible && (
            <span className="text-[10px] font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
              Client Visible
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <label className="flex items-center gap-1.5 text-xs text-navy/50 dark:text-slate-400 font-body mr-2">
                <input
                  type="checkbox"
                  checked={isClientVisible}
                  onChange={(e) => setIsClientVisible(e.target.checked)}
                  className="rounded border-navy/20 dark:border-slate-600 text-electric focus:ring-electric/30"
                />
                Client Visible
              </label>
              <Button size="sm" onClick={handleSave} loading={saving}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => {
                setEditing(false);
                setTitle(section.title);
                setContentStr(
                  typeof section.content === 'object' && section.content !== null
                    ? (section.content as Record<string, unknown>).text as string || JSON.stringify(section.content, null, 2)
                    : ''
                );
                setIsClientVisible(section.is_client_visible);
              }}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
              <button
                onClick={handleDelete}
                className="text-navy/30 dark:text-slate-600 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {editing ? (
        <textarea
          value={contentStr}
          onChange={(e) => setContentStr(e.target.value)}
          rows={8}
          placeholder={
            section.section_type === 'resources'
              ? 'Enter links, one per line:\nhttps://example.com - Example Site\nhttps://docs.example.com - Documentation'
              : section.section_type === 'visual_brief'
              ? 'Enter JSON key-value pairs:\n{\n  "target_audience": "...",\n  "brand_voice": "...",\n  "color_palette": "..."\n}'
              : 'Enter content here...'
          }
          className="w-full px-3.5 py-2.5 rounded-xl bg-cream dark:bg-dark-bg border-2 border-navy/10 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm resize-y"
        />
      ) : (
        renderContent()
      )}
    </div>
  );
}
