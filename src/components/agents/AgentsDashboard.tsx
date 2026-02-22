'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { AgentSkill } from '@/lib/types';
import AgentTabBar, { type AgentTab } from './AgentTabBar';
import AgentSessionPanel from './AgentSessionPanel';
import AgentLauncher from './AgentLauncher';
import SkillDetailsPanel from './SkillDetailsPanel';

const MAX_TABS = 20;

export default function AgentsDashboard() {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<AgentSkill | null>(null);
  const [tabs, setTabs] = useState<AgentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState('launcher');
  const [launching, setLaunching] = useState(false);

  // Load skills, boards, and restore sessions on mount
  useEffect(() => {
    Promise.all([fetchSkills(), fetchBoards(), restoreSessions()]).finally(() => setLoading(false));
  }, []);

  const fetchSkills = async () => {
    try {
      const res = await fetch('/api/agents/skills?is_active=true');
      const json = await res.json();
      setSkills(json.data ?? []);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    }
  };

  const fetchBoards = async () => {
    try {
      const res = await fetch('/api/boards');
      const json = await res.json();
      setBoards((json.data ?? []).map((b: any) => ({ id: b.id, name: b.name })));
    } catch {}
  };

  const restoreSessions = async () => {
    try {
      const res = await fetch('/api/agents/sessions');
      if (!res.ok) return;
      const { data } = await res.json();
      if (!data?.length) return;
      const restored: AgentTab[] = data.map((s: any) => {
        const skill = skills.find((sk) => sk.id === s.skill_id);
        return {
          sessionId: s.id,
          title: s.title || 'Untitled',
          skillIcon: skill?.icon ?? null,
          skillName: skill?.name ?? s.skill_id,
          status: s.status === 'running' ? 'idle' : s.status,
        } as AgentTab;
      });
      setTabs(restored);
    } catch {}
  };

  const handleLaunch = useCallback(async (skillId: string, prompt: string, boardId?: string) => {
    if (tabs.length >= MAX_TABS) {
      alert(`Maximum ${MAX_TABS} tabs. Close one first.`);
      return;
    }

    setLaunching(true);
    try {
      const res = await fetch('/api/agents/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId, input_message: prompt, board_id: boardId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // Read just enough of the SSE stream to get the session event
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let sessionId = '';
      let currentEvent = '';

      // Read until we get the session event, then we can add the tab
      // The AgentSessionPanel will handle the rest of the stream via its own SSE
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'session' && data.session_id) {
                sessionId = data.session_id;
              }
            } catch {}
          }
        }

        if (sessionId) {
          // Cancel the reader — the panel will start its own conversation
          await reader.cancel();
          break;
        }
      }

      if (!sessionId) throw new Error('No session ID received');

      const skill = skills.find((s) => s.id === skillId);
      const newTab: AgentTab = {
        sessionId,
        title: prompt.slice(0, 40) + (prompt.length > 40 ? '...' : ''),
        skillIcon: skill?.icon ?? null,
        skillName: skill?.name ?? skillId,
        status: 'running',
      };

      setTabs(prev => [...prev, newTab]);
      setActiveTabId(sessionId);
    } catch (err: any) {
      alert(`Failed to launch agent: ${err.message}`);
    } finally {
      setLaunching(false);
    }
  }, [tabs.length, skills]);

  const handleTabClose = useCallback(async (id: string) => {
    try {
      await fetch(`/api/agents/sessions/${id}`, { method: 'DELETE' });
    } catch {}
    setTabs(prev => prev.filter(t => t.sessionId !== id));
    setActiveTabId(prev => prev === id ? 'launcher' : prev);
  }, []);

  const handleTabRename = useCallback(async (id: string, newTitle: string) => {
    try {
      await fetch(`/api/agents/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch {}
    setTabs(prev => prev.map(t => t.sessionId === id ? { ...t, title: newTitle } : t));
  }, []);

  const handleStatusChange = useCallback((sessionId: string, status: 'idle' | 'running' | 'cancelled' | 'error') => {
    setTabs(prev => prev.map(t => t.sessionId === sessionId ? { ...t, status } : t));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  const activeSession = tabs.find(t => t.sessionId === activeTabId);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Navigation */}
      <div className="flex items-center gap-4 mb-6">
        <span className="text-sm font-semibold text-navy dark:text-slate-100">Agents</span>
        <Link
          href="/podcast/dashboard"
          className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
        >
          Podcast Dashboard
        </Link>
        <Link
          href="/podcast/approval"
          className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
        >
          Guest Approval
        </Link>
        <Link
          href="/settings/agents"
          className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors ml-auto"
        >
          Skill Quality Dashboard
        </Link>
      </div>

      {/* Tab bar */}
      <AgentTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTabId}
        onTabClose={handleTabClose}
        onTabRename={handleTabRename}
        onNewTab={() => setActiveTabId('launcher')}
      />

      {/* Content area */}
      {activeTabId === 'launcher' || !activeSession ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <AgentLauncher
              skills={skills}
              boards={boards}
              selectedSkill={selectedSkill}
              onSkillSelect={setSelectedSkill}
              onLaunch={handleLaunch}
              launching={launching}
            />
          </div>
          <div className="lg:col-span-1">
            <SkillDetailsPanel skill={selectedSkill} />
          </div>
        </div>
      ) : (
        <AgentSessionPanel
          key={activeSession.sessionId}
          sessionId={activeSession.sessionId}
          onStatusChange={(status) => handleStatusChange(activeSession.sessionId, status)}
        />
      )}
    </div>
  );
}
