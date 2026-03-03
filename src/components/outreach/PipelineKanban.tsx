'use client';

import { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import type { LIPipelineStage, LILead } from '@/lib/types';

// ============================================================================
// PIPELINE STAGE GROUPS
// ============================================================================

const FUNNEL_SECTIONS: { label: string; stages: LIPipelineStage[] }[] = [
  {
    label: 'Scout',
    stages: ['TO_ENRICH', 'ENRICHING', 'TO_QUALIFY', 'QUALIFYING'],
  },
  {
    label: 'Outreach',
    stages: ['TO_SEND_CONNECTION', 'CONNECTION_SENT'],
  },
  {
    label: 'Engaged',
    stages: ['CONNECTED', 'MESSAGE_SENT', 'NUDGE_SENT', 'LOOM_PERMISSION', 'LOOM_SENT'],
  },
  {
    label: 'Won',
    stages: ['REPLIED', 'BOOKED'],
  },
  {
    label: 'Lost',
    stages: ['NOT_INTERESTED', 'COLD_CONNECTION', 'FROZEN', 'PERMANENTLY_COLD'],
  },
];

const STAGE_LABELS: Record<string, string> = {
  TO_ENRICH: 'To Enrich',
  ENRICHING: 'Enriching',
  TO_QUALIFY: 'To Qualify',
  QUALIFYING: 'Qualifying',
  TO_SEND_CONNECTION: 'To Connect',
  CONNECTION_SENT: 'Conn. Sent',
  CONNECTED: 'Connected',
  MESSAGE_SENT: 'Msg Sent',
  NUDGE_SENT: 'Nudge Sent',
  LOOM_PERMISSION: 'Loom Ask',
  LOOM_SENT: 'Loom Sent',
  REPLIED: 'Replied',
  BOOKED: 'Booked',
  NOT_INTERESTED: 'Not Interested',
  COLD_CONNECTION: 'Cold',
  FROZEN: 'Frozen',
  PERMANENTLY_COLD: 'Perm. Cold',
};

const STAGE_COLORS: Record<string, string> = {
  TO_ENRICH: 'bg-slate-100 dark:bg-slate-800',
  ENRICHING: 'bg-blue-50 dark:bg-blue-950',
  TO_QUALIFY: 'bg-slate-100 dark:bg-slate-800',
  QUALIFYING: 'bg-blue-50 dark:bg-blue-950',
  TO_SEND_CONNECTION: 'bg-indigo-50 dark:bg-indigo-950',
  CONNECTION_SENT: 'bg-violet-50 dark:bg-violet-950',
  CONNECTED: 'bg-emerald-50 dark:bg-emerald-950',
  MESSAGE_SENT: 'bg-cyan-50 dark:bg-cyan-950',
  NUDGE_SENT: 'bg-amber-50 dark:bg-amber-950',
  LOOM_PERMISSION: 'bg-purple-50 dark:bg-purple-950',
  LOOM_SENT: 'bg-purple-50 dark:bg-purple-950',
  REPLIED: 'bg-green-50 dark:bg-green-950',
  BOOKED: 'bg-green-100 dark:bg-green-900',
  NOT_INTERESTED: 'bg-red-50 dark:bg-red-950',
  COLD_CONNECTION: 'bg-gray-100 dark:bg-gray-800',
  FROZEN: 'bg-gray-200 dark:bg-gray-700',
  PERMANENTLY_COLD: 'bg-gray-300 dark:bg-gray-600',
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function PipelineKanban() {
  const [activeSection, setActiveSection] = useState(0);
  const [leadsByStage, setLeadsByStage] = useState<Record<string, LILead[]>>({});
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const visibleStages = FUNNEL_SECTIONS[activeSection].stages;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch stage counts first
      const pipelineRes = await fetch('/api/outreach/pipeline');
      const pipelineJson = await pipelineRes.json();
      if (pipelineRes.ok) {
        setStageCounts(pipelineJson.data?.stage_counts || {});
      }

      // Fetch leads for visible stages
      const promises = visibleStages.map(stage =>
        fetch(`/api/outreach/leads?pipeline_stage=${stage}&limit=50&sort=lead_score&order=desc`)
          .then(r => r.json())
          .then(json => ({ stage, leads: json.data?.leads || [] }))
      );

      const results = await Promise.all(promises);
      const newLeadsByStage: Record<string, LILead[]> = {};
      for (const { stage, leads } of results) {
        newLeadsByStage[stage] = leads;
      }
      setLeadsByStage(newLeadsByStage);
    } finally {
      setLoading(false);
    }
  }, [visibleStages]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const fromStage = result.source.droppableId as LIPipelineStage;
    const toStage = result.destination.droppableId as LIPipelineStage;
    if (fromStage === toStage) return;

    const leadId = result.draggableId;

    // Optimistic update
    const lead = leadsByStage[fromStage]?.find(l => l.id === leadId);
    if (!lead) return;

    setLeadsByStage(prev => ({
      ...prev,
      [fromStage]: (prev[fromStage] || []).filter(l => l.id !== leadId),
      [toStage]: [{ ...lead, pipeline_stage: toStage }, ...(prev[toStage] || [])],
    }));

    try {
      const res = await fetch(`/api/outreach/leads/${leadId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: toStage, triggered_by: 'manual' }),
      });

      if (!res.ok) {
        // Revert on error
        setLeadsByStage(prev => ({
          ...prev,
          [fromStage]: [lead, ...(prev[fromStage] || [])],
          [toStage]: (prev[toStage] || []).filter(l => l.id !== leadId),
        }));
      }
    } catch {
      // Revert on network error
      setLeadsByStage(prev => ({
        ...prev,
        [fromStage]: [lead, ...(prev[fromStage] || [])],
        [toStage]: (prev[toStage] || []).filter(l => l.id !== leadId),
      }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Section Tabs */}
      <div className="flex gap-1 bg-white dark:bg-navy-800 rounded-lg p-1 border border-gray-200 dark:border-navy-700">
        {FUNNEL_SECTIONS.map((section, idx) => {
          const count = section.stages.reduce((sum, s) => sum + (stageCounts[s] || 0), 0);
          return (
            <button
              key={section.label}
              onClick={() => setActiveSection(idx)}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeSection === idx
                  ? 'bg-electric text-white'
                  : 'text-navy/60 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700'
              }`}
            >
              {section.label}
              {count > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  activeSection === idx
                    ? 'bg-white/20'
                    : 'bg-gray-200 dark:bg-navy-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
            {visibleStages.map(stage => (
              <Droppable droppableId={stage} key={stage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-shrink-0 w-64 rounded-lg ${
                      snapshot.isDraggingOver ? 'ring-2 ring-electric/40' : ''
                    } ${STAGE_COLORS[stage] || 'bg-gray-50'}`}
                  >
                    {/* Column Header */}
                    <div className="px-3 py-2.5 border-b border-black/5 dark:border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-navy/70 dark:text-slate-300 uppercase tracking-wide">
                          {STAGE_LABELS[stage] || stage}
                        </span>
                        <span className="text-xs text-navy/40 dark:text-slate-500 bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded">
                          {(leadsByStage[stage] || []).length}
                        </span>
                      </div>
                    </div>

                    {/* Cards */}
                    <div className="p-2 space-y-2 min-h-[200px]">
                      {(leadsByStage[stage] || []).map((lead, index) => (
                        <Draggable key={lead.id} draggableId={lead.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className={`bg-white dark:bg-navy-800 rounded-md p-2.5 shadow-sm border border-gray-100 dark:border-navy-700 cursor-grab ${
                                dragSnapshot.isDragging ? 'shadow-lg ring-2 ring-electric/30' : ''
                              }`}
                              onClick={() => window.location.href = `/outreach/leads/${lead.id}`}
                            >
                              <div className="text-sm font-medium text-navy dark:text-white truncate">
                                {lead.full_name}
                              </div>
                              {lead.company_name && (
                                <div className="text-xs text-navy/50 dark:text-slate-400 truncate mt-0.5">
                                  {lead.company_name}
                                </div>
                              )}
                              <div className="flex items-center justify-between mt-1.5">
                                {lead.lead_score > 0 && (
                                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                    lead.lead_score >= 70
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                      : lead.lead_score >= 40
                                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                  }`}>
                                    {lead.lead_score}
                                  </span>
                                )}
                                {lead.job_position && (
                                  <span className="text-[10px] text-navy/40 dark:text-slate-500 truncate ml-1">
                                    {lead.job_position}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
