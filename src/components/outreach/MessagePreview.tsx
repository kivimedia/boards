'use client';

import { useState, useEffect } from 'react';
import { checkMessageQuality } from '@/lib/outreach/message-quality';

interface MessagePreviewProps {
  message: {
    id: string;
    lead_id: string;
    template_number: number | null;
    message_text: string;
    quality_passed: boolean;
    quality_check: {
      passed: boolean;
      hardBlocks: string[];
      warnings: string[];
      scores: { voice_compliance: number; personalization: number; length_compliance: number; overall: number };
    };
    lead: {
      full_name: string;
      job_position: string | null;
      company_name: string | null;
      website: string | null;
      linkedin_url: string | null;
    } | null;
  };
  onClose: () => void;
  onSave: (updatedText: string) => void;
}

export default function MessagePreview({ message, onClose, onSave }: MessagePreviewProps) {
  const [editMode, setEditMode] = useState(false);
  const [text, setText] = useState(message.message_text);
  const [liveCheck, setLiveCheck] = useState(message.quality_check);

  // Live quality check as user edits
  useEffect(() => {
    if (editMode) {
      const check = checkMessageQuality(text, {
        templateNumber: message.template_number || undefined,
        leadName: message.lead?.full_name,
      });
      setLiveCheck(check);
    }
  }, [text, editMode, message.template_number, message.lead?.full_name]);

  const scores = editMode ? liveCheck.scores : message.quality_check.scores;
  const blocks = editMode ? liveCheck.hardBlocks : message.quality_check.hardBlocks;
  const warnings = editMode ? liveCheck.warnings : message.quality_check.warnings;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[2vh] sm:pt-[5vh] px-2 sm:px-4">
      <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm dark:bg-black/70" onClick={onClose} />
      <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-modal w-full max-w-xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-dark-surface px-6 pt-5 pb-4 border-b border-cream-dark dark:border-slate-700 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">Message Preview</h2>
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
                {message.lead?.full_name || 'Unknown Lead'}
                {message.template_number ? ` - Template ${message.template_number}` : ''}
              </p>
            </div>
            <button onClick={onClose} className="text-navy/30 hover:text-navy/60 dark:text-slate-600 dark:hover:text-slate-400 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Lead info */}
          {message.lead && (
            <div className="flex items-center gap-3 p-3 bg-cream dark:bg-dark-card rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy dark:text-white font-heading">{message.lead.full_name}</p>
                <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
                  {[message.lead.job_position, message.lead.company_name].filter(Boolean).join(' at ')}
                </p>
              </div>
              {message.lead.linkedin_url && (
                <a href={message.lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-electric font-semibold">
                  LinkedIn
                </a>
              )}
              {message.lead.website && (
                <a href={message.lead.website.startsWith('http') ? message.lead.website : `https://${message.lead.website}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-electric font-semibold">
                  Website
                </a>
              )}
            </div>
          )}

          {/* Quality scores */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Overall', value: scores.overall, color: scores.overall >= 70 ? 'text-green-600' : scores.overall >= 40 ? 'text-amber-500' : 'text-red-500' },
              { label: 'Voice', value: scores.voice_compliance, color: scores.voice_compliance >= 70 ? 'text-green-600' : 'text-red-500' },
              { label: 'Personal', value: scores.personalization, color: scores.personalization >= 70 ? 'text-green-600' : 'text-amber-500' },
              { label: 'Length', value: scores.length_compliance, color: scores.length_compliance >= 70 ? 'text-green-600' : 'text-red-500' },
            ].map(s => (
              <div key={s.label} className="text-center p-2 bg-cream dark:bg-dark-card rounded-lg">
                <p className="text-[9px] text-navy/40 dark:text-slate-500 uppercase font-heading">{s.label}</p>
                <p className={`text-lg font-bold font-heading ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Issues */}
          {(blocks.length > 0 || warnings.length > 0) && (
            <div className="space-y-1">
              {blocks.map((b, i) => (
                <div key={i} className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <span className="text-red-500 text-xs shrink-0 mt-0.5">BLOCK</span>
                  <p className="text-xs text-red-700 dark:text-red-300 font-body">{b}</p>
                </div>
              ))}
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <span className="text-amber-500 text-xs shrink-0 mt-0.5">WARN</span>
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-body">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Message text */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading">Message</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-navy/30 dark:text-slate-600 font-body">{text.length} chars</span>
                {!editMode ? (
                  <button
                    onClick={() => setEditMode(true)}
                    className="text-[10px] text-electric hover:text-electric-bright font-semibold transition-colors"
                  >
                    Edit
                  </button>
                ) : (
                  <button
                    onClick={() => { setEditMode(false); setText(message.message_text); }}
                    className="text-[10px] text-navy/40 dark:text-slate-500 font-semibold"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
            {editMode ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-card border-2 border-navy/10 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all resize-none"
              />
            ) : (
              <div className="p-4 bg-cream dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700">
                <p className="text-sm text-navy/70 dark:text-slate-300 font-body whitespace-pre-wrap leading-relaxed">
                  {message.message_text}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-dark-surface px-6 py-4 border-t border-cream-dark dark:border-slate-700 rounded-b-2xl">
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-navy/60 dark:text-slate-400">
              Close
            </button>
            {editMode && (
              <button
                onClick={() => onSave(text)}
                disabled={!liveCheck.passed}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg disabled:opacity-50 transition-colors"
              >
                Save Changes
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
