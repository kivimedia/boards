'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { LI_PIPELINE_STAGES, type LIPipelineStage, type LIPipelineEvent, type LIOutreachMessage, type LIQualificationOverride } from '@/lib/types';
import LeadScoreGauge from './LeadScoreGauge';

interface LeadDetailData {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  linkedin_url: string | null;
  email: string | null;
  email_source: string | null;
  email_verified: boolean;
  company_name: string | null;
  job_position: string | null;
  company_url: string | null;
  website: string | null;
  website_source: string | null;
  website_confidence: string | null;
  website_copyright_year: number | null;
  website_validated: boolean;
  country: string | null;
  city: string | null;
  state: string | null;
  connection_degree: number | null;
  connections_count: number | null;
  qualification_status: string;
  disqualification_reason: string | null;
  growth_stage: string | null;
  lead_score: number;
  score_breakdown: Record<string, number>;
  is_competitor: boolean;
  competitor_type: string | null;
  pipeline_stage: LIPipelineStage;
  enrichment_tier: number;
  enrichment_data: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
  batch_id: string | null;
  followup_count_at_stage: number;
  re_engagement_count: number;
  previously_engaged: boolean;
}

interface LeadDetailProps {
  leadId: string;
}

const QUAL_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  qualified: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  disqualified: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  needs_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

export default function LeadDetail({ leadId }: LeadDetailProps) {
  const [lead, setLead] = useState<LeadDetailData | null>(null);
  const [events, setEvents] = useState<LIPipelineEvent[]>([]);
  const [messages, setMessages] = useState<LIOutreachMessage[]>([]);
  const [overrides, setOverrides] = useState<LIQualificationOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'timeline' | 'messages' | 'enrichment'>('timeline');

  useEffect(() => {
    async function fetchLead() {
      setLoading(true);
      try {
        const res = await fetch(`/api/outreach/leads/${leadId}`);
        const data = await res.json();
        if (res.ok) {
          setLead(data.data.lead);
          setEvents(data.data.pipeline_events || []);
          setMessages(data.data.outreach_messages || []);
          setOverrides(data.data.overrides || []);
          setNotes(data.data.lead.notes || '');
        }
      } finally {
        setLoading(false);
      }
    }
    fetchLead();
  }, [leadId]);

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await fetch(`/api/outreach/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (lead) setLead({ ...lead, notes });
      setEditNotes(false);
    } finally {
      setSaving(false);
    }
  };

  const handleStageChange = async (newStage: LIPipelineStage) => {
    if (!lead) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/outreach/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage: newStage }),
      });
      if (res.ok) {
        const data = await res.json();
        setLead(data.data);
        // Re-fetch events
        const r2 = await fetch(`/api/outreach/leads/${leadId}`);
        const d2 = await r2.json();
        setEvents(d2.data.pipeline_events || []);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-navy/40 dark:text-slate-500 font-body">Lead not found</p>
      </div>
    );
  }

  const stageConfig = LI_PIPELINE_STAGES[lead.pipeline_stage];

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/outreach/leads" className="text-navy/40 dark:text-slate-500 hover:text-electric font-body transition-colors">
          Leads
        </Link>
        <span className="text-navy/20 dark:text-slate-700">/</span>
        <span className="text-navy dark:text-white font-semibold font-heading">{lead.full_name}</span>
      </div>

      {/* Header card */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-navy dark:text-white font-heading">{lead.full_name}</h1>
              <span
                className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: stageConfig?.color || '#94a3b8' }}
              >
                {stageConfig?.label || lead.pipeline_stage}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${QUAL_BADGE[lead.qualification_status] || QUAL_BADGE.pending}`}>
                {lead.qualification_status.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="mt-2 space-y-1">
              {lead.job_position && (
                <p className="text-sm text-navy/60 dark:text-slate-400 font-body">
                  {lead.job_position}
                  {lead.company_name && <span className="text-navy/40 dark:text-slate-500"> at {lead.company_name}</span>}
                </p>
              )}
              {(lead.city || lead.state || lead.country) && (
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                  {[lead.city, lead.state, lead.country].filter(Boolean).join(', ')}
                </p>
              )}
            </div>

            {/* Quick info grid */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {lead.email && (
                <div>
                  <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Email</p>
                  <p className="text-xs text-navy dark:text-white font-body truncate">{lead.email}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {lead.email_verified && (
                      <span className="text-[9px] text-green-600 dark:text-green-400 font-semibold">Verified</span>
                    )}
                    {lead.email_source && (
                      <span className="text-[9px] text-navy/30 dark:text-slate-600">via {lead.email_source}</span>
                    )}
                  </div>
                </div>
              )}
              {lead.website && (
                <div>
                  <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Website</p>
                  <a
                    href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-electric hover:text-electric-bright font-body truncate block"
                  >
                    {lead.website.replace(/^https?:\/\//, '')}
                  </a>
                  <div className="flex items-center gap-1 mt-0.5">
                    {lead.website_confidence && (
                      <span className={`text-[9px] font-semibold ${
                        lead.website_confidence === 'HIGH' ? 'text-green-600 dark:text-green-400' :
                        lead.website_confidence === 'MEDIUM' ? 'text-amber-600 dark:text-amber-400' :
                        'text-red-500 dark:text-red-400'
                      }`}>{lead.website_confidence}</span>
                    )}
                    {lead.website_copyright_year && (
                      <span className="text-[9px] text-navy/30 dark:text-slate-600">{lead.website_copyright_year}</span>
                    )}
                  </div>
                </div>
              )}
              {lead.linkedin_url && (
                <div>
                  <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">LinkedIn</p>
                  <a
                    href={lead.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-electric hover:text-electric-bright font-body truncate block"
                  >
                    Profile
                  </a>
                  {lead.connection_degree && (
                    <span className="text-[9px] text-navy/30 dark:text-slate-600">
                      {lead.connection_degree === 1 ? '1st' : lead.connection_degree === 2 ? '2nd' : '3rd+'} degree
                      {lead.connections_count ? ` - ${lead.connections_count} connections` : ''}
                    </span>
                  )}
                </div>
              )}
              {lead.growth_stage && (
                <div>
                  <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Growth Stage</p>
                  <span className={`text-xs font-semibold capitalize ${
                    lead.growth_stage === 'growing' ? 'text-green-600 dark:text-green-400' :
                    lead.growth_stage === 'established' ? 'text-blue-600 dark:text-blue-400' :
                    'text-amber-600 dark:text-amber-400'
                  }`}>
                    {lead.growth_stage}
                  </span>
                </div>
              )}
            </div>

            {/* Competitor warning */}
            {lead.is_competitor && (
              <div className="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-700 dark:text-red-300 font-semibold font-heading">
                  Competitor detected: {lead.competitor_type?.replace(/_/g, ' ')}
                </p>
              </div>
            )}

            {lead.disqualification_reason && (
              <div className="mt-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-300 font-body">
                  {lead.disqualification_reason}
                </p>
              </div>
            )}
          </div>

          {/* Score */}
          <div className="bg-cream dark:bg-dark-surface rounded-xl p-4 w-full md:w-48 shrink-0">
            <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading mb-2">Lead Score</p>
            <LeadScoreGauge
              score={lead.lead_score}
              breakdown={lead.score_breakdown}
              size="lg"
              showBreakdown
            />
          </div>
        </div>

        {/* Stage transition buttons */}
        <div className="mt-4 pt-4 border-t border-cream-dark dark:border-slate-700">
          <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading mb-2">Move to Stage</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(LI_PIPELINE_STAGES)
              .filter(([key]) => key !== lead.pipeline_stage)
              .sort((a, b) => a[1].order - b[1].order)
              .map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => handleStageChange(key as LIPipelineStage)}
                  disabled={saving}
                  className="px-2 py-1 text-[10px] font-semibold rounded-lg border border-cream-dark dark:border-slate-600 text-navy/60 dark:text-slate-400 hover:border-electric hover:text-electric dark:hover:border-electric transition-colors disabled:opacity-30"
                >
                  {config.label}
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading">Notes</p>
          {!editNotes ? (
            <button
              onClick={() => setEditNotes(true)}
              className="text-[10px] text-electric hover:text-electric-bright font-semibold transition-colors"
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditNotes(false); setNotes(lead.notes || ''); }}
                className="text-[10px] text-navy/40 dark:text-slate-500 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={saving}
                className="text-[10px] text-electric hover:text-electric-bright font-semibold"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
        {editNotes ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-slate-100 font-body resize-none focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
          />
        ) : (
          <p className="text-sm text-navy/60 dark:text-slate-400 font-body whitespace-pre-wrap">
            {lead.notes || 'No notes yet'}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-cream dark:bg-dark-card rounded-lg p-1 border border-cream-dark dark:border-slate-700">
        {(['timeline', 'messages', 'enrichment'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
              tab === t
                ? 'bg-white dark:bg-dark-surface text-navy dark:text-white shadow-sm'
                : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white'
            }`}
          >
            {t === 'timeline' ? `Timeline (${events.length})` : t === 'messages' ? `Messages (${messages.length})` : 'Enrichment'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'timeline' && (
        <div className="space-y-2">
          {events.length === 0 ? (
            <p className="text-sm text-navy/40 dark:text-slate-500 font-body text-center py-8">No timeline events</p>
          ) : (
            events.map((evt) => (
              <div key={evt.id} className="flex items-start gap-3 p-3 bg-white dark:bg-dark-card rounded-lg border border-cream-dark dark:border-slate-700">
                <div className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: LI_PIPELINE_STAGES[evt.to_stage]?.color || '#94a3b8' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-navy dark:text-white font-semibold font-heading">
                    {evt.from_stage ? (
                      <>
                        <span className="text-navy/40 dark:text-slate-500">{LI_PIPELINE_STAGES[evt.from_stage]?.label || evt.from_stage}</span>
                        <span className="mx-1.5 text-navy/20 dark:text-slate-700">&rarr;</span>
                        {LI_PIPELINE_STAGES[evt.to_stage]?.label || evt.to_stage}
                      </>
                    ) : (
                      LI_PIPELINE_STAGES[evt.to_stage]?.label || evt.to_stage
                    )}
                  </p>
                  {evt.notes && <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body mt-0.5">{evt.notes}</p>}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-navy/30 dark:text-slate-600 font-body">
                    {new Date(evt.created_at).toLocaleString()}
                  </span>
                  <p className="text-[9px] text-navy/25 dark:text-slate-700 font-body">{evt.triggered_by}</p>
                </div>
              </div>
            ))
          )}
          {overrides.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading mb-2">Manual Overrides</p>
              {overrides.map((ov) => (
                <div key={ov.id} className="p-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800 mb-1">
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-body">
                    {ov.original_decision} &rarr; {ov.new_decision}
                    {ov.reason && <span className="text-amber-600 dark:text-amber-400"> - {ov.reason}</span>}
                  </p>
                  <p className="text-[9px] text-amber-500 dark:text-amber-500">{new Date(ov.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'messages' && (
        <div className="space-y-2">
          {messages.length === 0 ? (
            <p className="text-sm text-navy/40 dark:text-slate-500 font-body text-center py-8">No messages yet</p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="p-3 bg-white dark:bg-dark-card rounded-lg border border-cream-dark dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {msg.template_number && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-electric/10 text-electric rounded">
                        T{msg.template_number}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${
                      msg.status === 'sent' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                      msg.status === 'approved' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                      msg.status === 'draft' ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' :
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {msg.status}
                    </span>
                  </div>
                  <span className="text-[10px] text-navy/30 dark:text-slate-600 font-body">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-navy/70 dark:text-slate-300 font-body whitespace-pre-wrap">
                  {msg.message_text}
                </p>
                {msg.status === 'sent' && (msg as any).sent_at && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold">
                      Sent via LinkedIn Browser
                    </span>
                    <span className="text-[9px] text-navy/30 dark:text-slate-600">
                      {new Date((msg as any).sent_at).toLocaleString()}
                    </span>
                    {(msg as any).browser_action_id && (
                      <Link
                        href={`/outreach/browser-actions`}
                        className="text-[9px] text-electric hover:text-electric-bright transition-colors"
                      >
                        View log
                      </Link>
                    )}
                  </div>
                )}
                {(msg as any).send_error && (
                  <div className="mt-2 p-1.5 bg-red-50 dark:bg-red-900/10 rounded border border-red-200 dark:border-red-800">
                    <p className="text-[10px] text-red-600 dark:text-red-400 font-body">
                      Send error: {(msg as any).send_error}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'enrichment' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Enrichment Tier</p>
              <p className="text-sm font-semibold text-navy dark:text-white font-heading">{lead.enrichment_tier}/4</p>
            </div>
            <div>
              <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Website Validated</p>
              <p className="text-sm font-semibold text-navy dark:text-white font-heading">{lead.website_validated ? 'Yes' : 'No'}</p>
            </div>
          </div>
          {Object.keys(lead.enrichment_data).length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading mb-2">Raw Data</p>
              <pre className="text-[10px] text-navy/60 dark:text-slate-400 font-mono bg-cream dark:bg-dark-surface rounded-lg p-3 overflow-x-auto max-h-60">
                {JSON.stringify(lead.enrichment_data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
