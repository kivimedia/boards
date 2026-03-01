'use client';

import { useState, useCallback } from 'react';
import type { PageForgeNamingIssue } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DesignerSuggestion {
  id: string;
  category: 'naming' | 'structure' | 'images' | 'accessibility' | 'general';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string; // human-readable, non-technical
  nodeId?: string;
  nodeName?: string;
  aiSuggestedName?: string; // AI vision-based auto-name
}

interface SearchResult {
  id: string;
  title: string;
  board_name?: string;
}

interface PageForgeDesignerSuggestionsProps {
  buildId: string;
  buildTitle: string;
  namingIssues: PageForgeNamingIssue[];
  figmaWarnings: string[];
  figmaFileKey?: string;
}

// ---------------------------------------------------------------------------
// Category styling
// ---------------------------------------------------------------------------
const CATEGORY_CONFIG: Record<string, { label: string; icon: string; bg: string; text: string }> = {
  naming: {
    label: 'Layer Naming',
    icon: 'Aa',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-purple-700 dark:text-purple-400',
  },
  structure: {
    label: 'File Structure',
    icon: '#',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-400',
  },
  images: {
    label: 'Image Quality',
    icon: 'IMG',
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-400',
  },
  accessibility: {
    label: 'Accessibility',
    icon: 'A11y',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-700 dark:text-orange-400',
  },
  general: {
    label: 'General',
    icon: 'i',
    bg: 'bg-slate-50 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-400',
  },
};

const SEVERITY_BADGE: Record<string, string> = {
  high: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  low: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
};

// ---------------------------------------------------------------------------
// Transform raw issues into human-friendly suggestions
// ---------------------------------------------------------------------------
function buildSuggestions(
  namingIssues: PageForgeNamingIssue[],
  figmaWarnings: string[],
): DesignerSuggestion[] {
  const suggestions: DesignerSuggestion[] = [];

  // Group naming issues by pattern for more readable output
  const genericNames = namingIssues.filter((i) => /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Text|Image)\s*\d*$/i.test(i.nodeName));
  const duplicateNames = namingIssues.filter((i) => i.issue.toLowerCase().includes('duplicate'));
  const otherNaming = namingIssues.filter(
    (i) =>
      !genericNames.includes(i) &&
      !duplicateNames.includes(i),
  );

  // Batch generic names into one suggestion per type
  const genericGroups = new Map<string, PageForgeNamingIssue[]>();
  for (const issue of genericNames) {
    const base = issue.nodeName.replace(/\s*\d+$/, '');
    const group = genericGroups.get(base) || [];
    group.push(issue);
    genericGroups.set(base, group);
  }

  Array.from(genericGroups.entries()).forEach(([base, issues]) => {
    suggestions.push({
      id: `naming-generic-${base}`,
      category: 'naming',
      severity: issues.length > 10 ? 'high' : issues.length > 3 ? 'medium' : 'low',
      title: `${issues.length} layers still named "${base}"`,
      description: `There are ${issues.length} layers with default names like "${issues[0].nodeName}". Please give each layer a descriptive name that reflects what it contains (e.g., "HeroBanner", "PricingCard", "FooterLinks"). This helps the development team understand the design structure.`,
    });
  });

  // Duplicate names
  if (duplicateNames.length > 0) {
    suggestions.push({
      id: 'naming-duplicates',
      category: 'naming',
      severity: duplicateNames.length > 5 ? 'medium' : 'low',
      title: `${duplicateNames.length} duplicate layer names found`,
      description: `Some layers share the same name, which can cause confusion during development. Please make each layer name unique so the build system can correctly map each element.`,
    });
  }

  // Other naming issues
  for (const issue of otherNaming.slice(0, 5)) {
    suggestions.push({
      id: `naming-${issue.nodeId}`,
      category: 'naming',
      severity: 'low',
      title: `"${issue.nodeName}" - ${issue.issue}`,
      description: issue.suggested
        ? `Consider renaming this to something like "${issue.suggested}". Clear names help the automated build process generate better code.`
        : `This layer name could be improved. Use a descriptive name that reflects the content or purpose of this element.`,
      nodeId: issue.nodeId,
      nodeName: issue.nodeName,
      aiSuggestedName: issue.suggested || undefined,
    });
  }
  if (otherNaming.length > 5) {
    suggestions.push({
      id: 'naming-other-overflow',
      category: 'naming',
      severity: 'low',
      title: `${otherNaming.length - 5} more naming suggestions`,
      description: `There are ${otherNaming.length - 5} additional naming improvements available. Open the full naming issues list for details.`,
    });
  }

  // Figma warnings -> human-friendly
  for (let i = 0; i < figmaWarnings.length; i++) {
    const w = figmaWarnings[i];
    let category: DesignerSuggestion['category'] = 'general';
    let severity: DesignerSuggestion['severity'] = 'medium';
    let title = w;
    let description = w;

    if (/naming/i.test(w)) {
      // Skip - already handled above
      continue;
    } else if (/image|export|render/i.test(w)) {
      category = 'images';
      title = 'Image export issues detected';
      description = `The build system had trouble exporting some images from the design. Please ensure all images are properly embedded (not linked) and are at a reasonable resolution. Very large images (over 4000px) may cause timeouts.`;
    } else if (/font|text|typography/i.test(w)) {
      category = 'structure';
      title = 'Typography considerations';
      description = w.replace(/\b(warn(?:ing)?|issue|error|found)\b/gi, '').trim() || w;
    } else if (/color|contrast/i.test(w)) {
      category = 'accessibility';
      title = 'Color contrast review needed';
      description = `Some color combinations may not meet accessibility standards. Please review text-over-background contrast ratios to ensure readability for all users.`;
    } else if (/component|variant|instance/i.test(w)) {
      category = 'structure';
      severity = 'low';
      title = 'Component structure note';
      description = `The design uses components that may need special handling during the build. ${w}`;
    }

    suggestions.push({
      id: `warning-${i}`,
      category,
      severity,
      title,
      description,
    });
  }

  // Sort: high first, then medium, then low
  const order = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => order[a.severity] - order[b.severity]);

  return suggestions;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PageForgeDesignerSuggestions({
  buildId,
  buildTitle,
  namingIssues,
  figmaWarnings,
}: PageForgeDesignerSuggestionsProps) {
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());

  // Actions state
  const [actionMode, setActionMode] = useState<'none' | 'ticket' | 'comment' | 'email'>('none');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Ticket creation
  const [ticketListId, setTicketListId] = useState('');
  const [ticketTitle, setTicketTitle] = useState('');

  // Comment on existing card
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [cardSearchResults, setCardSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  // Email
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // Generate suggestions
  const suggestions = buildSuggestions(namingIssues, figmaWarnings);
  const grouped = new Map<string, DesignerSuggestion[]>();
  for (const s of suggestions) {
    const g = grouped.get(s.category) || [];
    g.push(s);
    grouped.set(s.category, g);
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------
  const toggleSuggestion = (id: string) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedSuggestions.size === suggestions.length) {
      setSelectedSuggestions(new Set());
    } else {
      setSelectedSuggestions(new Set(suggestions.map((s) => s.id)));
    }
  };

  // Build markdown report from selected suggestions
  const buildReport = useCallback(() => {
    const selected = suggestions.filter((s) => selectedSuggestions.has(s.id));
    if (selected.length === 0) return '';

    const lines: string[] = [
      `Design Feedback - ${buildTitle}`,
      `${'='.repeat(40)}`,
      '',
      `Hi! Here are some suggestions to improve the Figma design before we finalize the build:`,
      '',
    ];

    const cats = new Map<string, DesignerSuggestion[]>();
    for (const s of selected) {
      const g = cats.get(s.category) || [];
      g.push(s);
      cats.set(s.category, g);
    }

    Array.from(cats.entries()).forEach(([cat, items]) => {
      const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.general;
      lines.push(`${config.label}`);
      lines.push('-'.repeat(config.label.length));
      for (const item of items) {
        lines.push(`  * ${item.title}`);
        lines.push(`    ${item.description}`);
        lines.push('');
      }
    });

    lines.push('---');
    lines.push(`Generated by KM PageForge Build System`);
    return lines.join('\n');
  }, [suggestions, selectedSuggestions, buildTitle]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const resetAction = () => {
    setActionMode('none');
    setActionError(null);
    setActionSuccess(null);
  };

  const openAction = (mode: 'ticket' | 'comment' | 'email') => {
    setActionMode(mode);
    setActionError(null);
    setActionSuccess(null);

    const report = buildReport();
    if (mode === 'ticket') {
      setTicketTitle(`Design Feedback: ${buildTitle}`);
    } else if (mode === 'email') {
      setEmailSubject(`Design Feedback: ${buildTitle}`);
      setEmailBody(report);
    } else if (mode === 'comment') {
      setCommentText(report);
    }
  };

  // Search cards
  const searchCards = async (query: string) => {
    setCardSearchQuery(query);
    if (query.length < 2) {
      setCardSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/pageforge/designer-suggestions/search-cards?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const json = await res.json();
        setCardSearchResults(json.cards || []);
      }
    } catch {
      // silent
    } finally {
      setSearching(false);
    }
  };

  // Create ticket
  const handleCreateTicket = async () => {
    if (!ticketTitle.trim() || !ticketListId.trim()) {
      setActionError('Please provide a title and select a list');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const report = buildReport();
      const res = await fetch('/api/pageforge/designer-suggestions/create-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          build_id: buildId,
          title: ticketTitle,
          description: report,
          list_id: ticketListId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create ticket');
      setActionSuccess(`Ticket created: ${json.data?.title || ticketTitle}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Comment on card
  const handleAddComment = async () => {
    if (!selectedCardId || !commentText.trim()) {
      setActionError('Please select a card and add a comment');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/cards/${selectedCardId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add comment');
      setActionSuccess('Comment added successfully');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Send email
  const handleSendEmail = async () => {
    if (!emailTo.trim() || !emailSubject.trim() || !emailBody.trim()) {
      setActionError('Please fill in all email fields');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/pageforge/designer-suggestions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          build_id: buildId,
          to: emailTo,
          subject: emailSubject,
          body: emailBody,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send email');
      setActionSuccess('Email sent successfully');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  if (suggestions.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-6">
        <div className="text-center py-8">
          <div className="text-3xl mb-3">&#10003;</div>
          <p className="text-sm font-semibold text-navy dark:text-slate-200">No suggestions</p>
          <p className="text-xs text-navy/40 dark:text-slate-500 mt-1">
            The design looks clean - no naming issues or warnings found.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-navy dark:text-slate-200 font-heading">
            Designer Suggestions
          </h2>
          <p className="text-xs text-navy/40 dark:text-slate-500 mt-0.5">
            {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} for the graphic designer
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={selectAll}
            className="text-[10px] font-semibold text-electric hover:text-electric-bright transition-colors"
          >
            {selectedSuggestions.size === suggestions.length ? 'Deselect All' : 'Select All'}
          </button>
          <span className="text-[10px] text-navy/30 dark:text-slate-600">
            {selectedSuggestions.size} selected
          </span>
        </div>
      </div>

      {/* Suggestions by category */}
      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([category, items]) => {
          const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.general;
          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${config.bg} ${config.text}`}>
                  {config.icon}
                </span>
                <span className="text-xs font-semibold text-navy/60 dark:text-slate-400">
                  {config.label}
                </span>
                <span className="text-[10px] text-navy/30 dark:text-slate-600">
                  ({items.length})
                </span>
              </div>
              <div className="space-y-2 ml-6">
                {items.map((s) => (
                  <div
                    key={s.id}
                    className={`rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      selectedSuggestions.has(s.id)
                        ? 'border-electric/40 bg-electric/5 dark:bg-electric/10'
                        : 'border-navy/5 dark:border-slate-700 hover:border-navy/15 dark:hover:border-slate-600'
                    }`}
                    onClick={() => toggleSuggestion(s.id)}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedSuggestions.has(s.id)}
                        onChange={() => toggleSuggestion(s.id)}
                        className="mt-0.5 rounded border-navy/20 dark:border-slate-600 text-electric focus:ring-electric/40"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-navy dark:text-slate-200">
                            {s.title}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${SEVERITY_BADGE[s.severity]}`}>
                            {s.severity}
                          </span>
                        </div>
                        <p className="text-xs text-navy/50 dark:text-slate-400 leading-relaxed">
                          {s.description}
                        </p>
                        {s.aiSuggestedName && (
                          <p className="text-[10px] text-electric mt-1">
                            Suggested name: <span className="font-mono font-semibold">{s.aiSuggestedName}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      {selectedSuggestions.size > 0 && actionMode === 'none' && (
        <div className="border-t border-navy/5 dark:border-slate-700 pt-4 space-y-2">
          <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
            Send {selectedSuggestions.size} selected suggestion{selectedSuggestions.size !== 1 ? 's' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => openAction('ticket')}
              className="px-3 py-2 text-xs font-semibold border border-electric/30 text-electric hover:bg-electric/10 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Create Ticket
            </button>
            <button
              onClick={() => openAction('comment')}
              className="px-3 py-2 text-xs font-semibold border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              Comment on Ticket
            </button>
            <button
              onClick={() => openAction('email')}
              className="px-3 py-2 text-xs font-semibold border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Designer
            </button>
          </div>
        </div>
      )}

      {/* Success message */}
      {actionSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-green-700 dark:text-green-300">{actionSuccess}</p>
          <button
            onClick={resetAction}
            className="text-xs text-green-600 dark:text-green-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error message */}
      {actionError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-300">{actionError}</p>
        </div>
      )}

      {/* Create Ticket form */}
      {actionMode === 'ticket' && !actionSuccess && (
        <div className="border-t border-navy/5 dark:border-slate-700 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-navy dark:text-slate-200">Create Ticket</h3>
            <button onClick={resetAction} className="text-[10px] text-navy/40 hover:text-navy dark:text-slate-500 dark:hover:text-slate-200">
              Cancel
            </button>
          </div>
          <input
            type="text"
            value={ticketTitle}
            onChange={(e) => setTicketTitle(e.target.value)}
            placeholder="Ticket title..."
            className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
          />
          <input
            type="text"
            value={ticketListId}
            onChange={(e) => setTicketListId(e.target.value)}
            placeholder="Paste list ID (from the board where you want the ticket)..."
            className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40 font-mono text-xs"
          />
          <p className="text-[10px] text-navy/30 dark:text-slate-600">
            The selected suggestions will be added as the ticket description.
          </p>
          <button
            onClick={handleCreateTicket}
            disabled={actionLoading || !ticketTitle.trim() || !ticketListId.trim()}
            className="px-4 py-2 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              'Create Ticket'
            )}
          </button>
        </div>
      )}

      {/* Comment on existing card */}
      {actionMode === 'comment' && !actionSuccess && (
        <div className="border-t border-navy/5 dark:border-slate-700 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-navy dark:text-slate-200">Comment on Existing Ticket</h3>
            <button onClick={resetAction} className="text-[10px] text-navy/40 hover:text-navy dark:text-slate-500 dark:hover:text-slate-200">
              Cancel
            </button>
          </div>

          {/* Card search */}
          <div className="relative">
            <input
              type="text"
              value={cardSearchQuery}
              onChange={(e) => searchCards(e.target.value)}
              placeholder="Search for a card by title..."
              className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-navy/20 border-t-electric rounded-full animate-spin" />
              </div>
            )}
            {cardSearchResults.length > 0 && (
              <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-navy/10 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {cardSearchResults.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => {
                      setSelectedCardId(card.id);
                      setCardSearchQuery(card.title);
                      setCardSearchResults([]);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-navy/5 dark:hover:bg-slate-700 transition-colors ${
                      selectedCardId === card.id ? 'bg-electric/10' : ''
                    }`}
                  >
                    <span className="text-navy dark:text-slate-200">{card.title}</span>
                    {card.board_name && (
                      <span className="text-[10px] text-navy/30 dark:text-slate-600 ml-2">
                        {card.board_name}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedCardId && (
            <div className="px-2 py-1 bg-electric/10 rounded text-xs text-electric">
              Selected card: {cardSearchQuery}
            </div>
          )}

          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Comment text..."
            rows={6}
            className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400/40 resize-none font-mono text-xs"
          />
          <button
            onClick={handleAddComment}
            disabled={actionLoading || !selectedCardId || !commentText.trim()}
            className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Adding...
              </>
            ) : (
              'Add Comment'
            )}
          </button>
        </div>
      )}

      {/* Email form */}
      {actionMode === 'email' && !actionSuccess && (
        <div className="border-t border-navy/5 dark:border-slate-700 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-navy dark:text-slate-200">Email Designer</h3>
            <button onClick={resetAction} className="text-[10px] text-navy/40 hover:text-navy dark:text-slate-500 dark:hover:text-slate-200">
              Cancel
            </button>
          </div>
          <input
            type="email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="Designer email address..."
            className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400/40"
          />
          <input
            type="text"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Email subject..."
            className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400/40"
          />
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            placeholder="Email body..."
            rows={8}
            className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400/40 resize-none font-mono text-xs"
          />
          <button
            onClick={handleSendEmail}
            disabled={actionLoading || !emailTo.trim() || !emailSubject.trim() || !emailBody.trim()}
            className="px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              'Send Email'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
