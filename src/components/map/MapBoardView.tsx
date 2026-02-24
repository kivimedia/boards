'use client';

import { useState, useEffect, useCallback } from 'react';
import { Client, Door, TrainingAssignment, MapSection, MapSectionType } from '@/lib/types';
import DoorsRoadmap from './DoorsRoadmap';
import TrainingTracker from './TrainingTracker';
import CredentialsVault from './CredentialsVault';
import MapSectionCard from './MapSectionCard';
import Button from '@/components/ui/Button';
import ClientBrainPanel from '@/components/client/ClientBrainPanel';
import TrelloCardPicker from '@/components/trello/TrelloCardPicker';
import MeetingConfigPanel from '@/components/client-updates/MeetingConfigPanel';
import UpdateHistoryList from '@/components/client-updates/UpdateHistoryList';

interface MapBoardViewProps {
  clientId: string;
}

const SECTION_TYPE_LABELS: Record<MapSectionType, string> = {
  visual_brief: 'Visual Brief',
  outreach_planner: 'Outreach Planner',
  resources: 'Resources',
  whiteboard: 'Whiteboard',
  notes: 'Notes',
};

export default function MapBoardView({ clientId }: MapBoardViewProps) {
  const [client, setClient] = useState<Client | null>(null);
  const [doors, setDoors] = useState<Door[]>([]);
  const [training, setTraining] = useState<TrainingAssignment[]>([]);
  const [sections, setSections] = useState<MapSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSectionMenu, setShowSectionMenu] = useState(false);
  const [addingSectionType, setAddingSectionType] = useState<MapSectionType | null>(null);
  const [showBrainPanel, setShowBrainPanel] = useState(false);
  const [showTrelloPanel, setShowTrelloPanel] = useState(false);
  const [showMeetingsPanel, setShowMeetingsPanel] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/map-export`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${client?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Map'}_Strategy_Map.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert('Failed to generate PDF');
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const fetchAll = useCallback(async () => {
    try {
      const [clientRes, doorsRes, trainingRes, sectionsRes] = await Promise.all([
        fetch(`/api/clients/${clientId}`),
        fetch(`/api/clients/${clientId}/doors`),
        fetch(`/api/clients/${clientId}/training`),
        fetch(`/api/clients/${clientId}/map-sections`),
      ]);

      const [clientJson, doorsJson, trainingJson, sectionsJson] = await Promise.all([
        clientRes.json(),
        doorsRes.json(),
        trainingRes.json(),
        sectionsRes.json(),
      ]);

      if (clientJson.data) setClient(clientJson.data);
      if (doorsJson.data) setDoors(doorsJson.data);
      if (trainingJson.data) setTraining(trainingJson.data);
      if (sectionsJson.data) setSections(sectionsJson.data);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const refreshDoors = async () => {
    const res = await fetch(`/api/clients/${clientId}/doors`);
    const json = await res.json();
    if (json.data) setDoors(json.data);
  };

  const refreshTraining = async () => {
    const res = await fetch(`/api/clients/${clientId}/training`);
    const json = await res.json();
    if (json.data) setTraining(json.data);
  };

  const refreshSections = async () => {
    const res = await fetch(`/api/clients/${clientId}/map-sections`);
    const json = await res.json();
    if (json.data) setSections(json.data);
  };

  const handleAddSection = async (sectionType: MapSectionType) => {
    setAddingSectionType(sectionType);
    setShowSectionMenu(false);
    try {
      const res = await fetch(`/api/clients/${clientId}/map-sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_type: sectionType,
          title: SECTION_TYPE_LABELS[sectionType],
          position: sections.length,
        }),
      });
      if (res.ok) {
        await refreshSections();
      }
    } finally {
      setAddingSectionType(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cream dark:bg-dark-bg">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-body">Loading strategy map...</span>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cream dark:bg-dark-bg">
        <p className="text-navy/40 dark:text-slate-500 font-body">Client not found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Client Header */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl bg-electric/10 flex items-center justify-center">
                  <span className="text-electric font-heading font-bold text-lg">
                    {client.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-heading font-semibold text-navy dark:text-slate-100">{client.name}</h2>
                  {client.company && (
                    <p className="text-navy/50 dark:text-slate-400 font-body text-sm">{client.company}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {client.contract_type && (
                <span className="text-xs font-semibold text-electric bg-electric/10 px-3 py-1 rounded-full uppercase tracking-wide">
                  {client.contract_type}
                </span>
              )}
              {client.client_tag && (
                <span className="text-xs font-medium text-navy/50 dark:text-slate-400 bg-cream-dark dark:bg-slate-800 px-3 py-1 rounded-full">
                  {client.client_tag}
                </span>
              )}
              <button
                onClick={() => setShowTrelloPanel(!showTrelloPanel)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium font-body transition-all duration-200 ${
                  showTrelloPanel
                    ? 'bg-[#0079BF]/10 text-[#0079BF] ring-2 ring-[#0079BF]/20'
                    : 'text-navy/60 dark:text-slate-400 hover:text-[#0079BF] hover:bg-[#0079BF]/5'
                }`}
                title="Tracked Trello tickets"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
                  <rect x="2" y="2" width="20" height="20" rx="3" fill="currentColor" />
                  <rect x="5" y="5" width="5" height="12" rx="1" fill="white" />
                  <rect x="13" y="5" width="5" height="8" rx="1" fill="white" />
                </svg>
                Tickets
              </button>
              <a
                href={`/client/${clientId}/weekly-gantt`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium font-body text-navy/60 dark:text-slate-400 hover:text-electric hover:bg-electric/5 transition-all duration-200"
                title="Weekly Plan — Gantt chart"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Weekly Plan
              </a>
              <button
                onClick={() => setShowMeetingsPanel(!showMeetingsPanel)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium font-body transition-all duration-200 ${
                  showMeetingsPanel
                    ? 'bg-electric/10 text-electric ring-2 ring-electric/20'
                    : 'text-navy/60 dark:text-slate-400 hover:text-electric hover:bg-electric/5'
                }`}
                title="Meeting config & weekly updates"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
                  <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round" />
                  <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round" />
                  <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                </svg>
                Meetings
              </button>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="p-2 rounded-xl text-navy/40 dark:text-slate-400 hover:text-electric hover:bg-electric/5 transition-all duration-200 disabled:opacity-50"
                title="Export as PDF"
              >
                {exporting ? (
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setShowBrainPanel(!showBrainPanel)}
                className={`
                  p-2 rounded-xl transition-all duration-200
                  ${showBrainPanel
                    ? 'bg-electric/10 text-electric ring-2 ring-electric/20'
                    : 'text-navy/40 dark:text-slate-400 hover:text-electric hover:bg-electric/5'
                  }
                `}
                title="Client Brain — AI knowledge base"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </button>
            </div>
          </div>
          {client.notes && (
            <p className="text-navy/60 dark:text-slate-400 font-body text-sm mt-3 pl-15">{client.notes}</p>
          )}
          {client.contacts && client.contacts.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {client.contacts.map((contact, i) => (
                <div key={i} className="flex items-center gap-2 bg-cream dark:bg-dark-bg rounded-lg px-3 py-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/40 dark:text-slate-500">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="text-xs font-body text-navy/70 dark:text-slate-300">
                    {contact.name}
                    {contact.role && <span className="text-navy/40 dark:text-slate-500"> ({contact.role})</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trello Tracked Tickets Panel */}
        {showTrelloPanel && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-[#0079BF]/20 dark:border-[#0079BF]/30 p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#0079BF]">
                  <rect x="2" y="2" width="20" height="20" rx="3" fill="currentColor" />
                  <rect x="5" y="5" width="5" height="12" rx="1" fill="white" />
                  <rect x="13" y="5" width="5" height="8" rx="1" fill="white" />
                </svg>
                Tracked Trello Tickets
              </h3>
              <button
                onClick={() => setShowTrelloPanel(false)}
                className="p-1 rounded-lg text-navy/30 dark:text-slate-500 hover:text-navy/50 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <TrelloCardPicker clientId={clientId} />
          </div>
        )}

        {/* Meetings Panel */}
        {showMeetingsPanel && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-electric/20 dark:border-electric/30 p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading flex items-center gap-2">
                <svg className="w-4 h-4 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
                  <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round" />
                  <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round" />
                  <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                </svg>
                Meeting Config & Updates
              </h3>
              <button
                onClick={() => setShowMeetingsPanel(false)}
                className="p-1 rounded-lg text-navy/30 dark:text-slate-500 hover:text-navy/50 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <MeetingConfigPanel clientId={clientId} />
            <div className="mt-4 pt-4 border-t border-cream-dark dark:border-slate-700">
              <UpdateHistoryList clientId={clientId} />
            </div>
          </div>
        )}

        {/* Brain Panel (slide-open) */}
        {showBrainPanel && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-electric/20 dark:border-electric/30 p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading flex items-center gap-2">
                <span>🧠</span> Client Brain
              </h3>
              <button
                onClick={() => setShowBrainPanel(false)}
                className="p-1 rounded-lg text-navy/30 dark:text-slate-500 hover:text-navy/50 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ClientBrainPanel clientId={clientId} />
          </div>
        )}

        {/* Doors Roadmap */}
        <DoorsRoadmap clientId={clientId} doors={doors} onRefresh={refreshDoors} />

        {/* Training Tracker */}
        <TrainingTracker clientId={clientId} assignments={training} onRefresh={refreshTraining} />

        {/* Credentials Vault */}
        <CredentialsVault clientId={clientId} />

        {/* Dynamic Map Sections */}
        {sections.map((section) => (
          <MapSectionCard
            key={section.id}
            section={section}
            clientId={clientId}
            onRefresh={refreshSections}
          />
        ))}

        {/* Add Section Button */}
        <div className="relative">
          <Button
            variant="secondary"
            onClick={() => setShowSectionMenu(!showSectionMenu)}
            loading={addingSectionType !== null}
            className="w-full border-dashed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Section
          </Button>

          {showSectionMenu && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-dark-surface rounded-xl border-2 border-cream-dark dark:border-slate-700 shadow-lg p-2 z-10">
              {(Object.keys(SECTION_TYPE_LABELS) as MapSectionType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => handleAddSection(type)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-body text-navy dark:text-slate-100 hover:bg-cream dark:hover:bg-slate-800 transition-colors"
                >
                  {SECTION_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
