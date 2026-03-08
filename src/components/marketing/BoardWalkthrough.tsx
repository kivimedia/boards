'use client';

import { useState } from 'react';

const tabs = [
  {
    id: 'design',
    label: 'Design',
    icon: '🎨',
    headline: 'Design reviews that close themselves.',
    bullets: [
      'Fields built for design: deliverable type, asset link, revision round',
      'AI Design Review button on every card — pass/fail per change request',
      'Nano Banana image generation inside the card',
      'Cover images auto-set from the latest attachment',
      'Video frame extraction for motion design reviews',
    ],
    visual: {
      columns: ['Briefing', 'In Progress', 'In Review', 'Approved'],
      cards: [
        { col: 2, title: 'Social banner — Spring campaign', badge: 'AI: PASS ✓', badgeColor: 'emerald', round: 'Round 1 of 1' },
        { col: 1, title: 'Brand guide update v2', badge: null, round: 'Round 3 of 3' },
        { col: 3, title: 'Email template — newsletter', badge: null, round: null },
      ],
    },
  },
  {
    id: 'dev',
    label: 'Dev',
    icon: '⚡',
    headline: '"Done" means the website actually passes.',
    bullets: [
      'Automated Lighthouse / WCAG / visual regression before tickets close',
      'Broken link scanning included',
      'Performance score trends tracked over time',
      'Visual diff — see exactly which pixels changed',
      'QA runs on schedule, not just when you remember to check',
    ],
    visual: {
      columns: ['Backlog', 'In Dev', 'Dev QA', 'Shipped'],
      cards: [
        { col: 2, title: 'Landing page — Acme Corp', badge: 'Lighthouse 94', badgeColor: 'blue', round: 'WCAG AA ✓' },
        { col: 1, title: 'Mobile nav fix', badge: null, round: null },
        { col: 3, title: 'Checkout flow redesign', badge: 'QA Running', badgeColor: 'yellow', round: null },
      ],
    },
  },
  {
    id: 'copy',
    label: 'Copy',
    icon: '✍️',
    headline: 'First drafts in the client\'s voice.',
    bullets: [
      'Fields built for copy: topic, persona, keyword, word count',
      'Client Brain generates first drafts from their past approved work',
      'Comment threads with revision tracking',
      'Version history for every deliverable',
      'AI-powered briefing templates per deliverable type',
    ],
    visual: {
      columns: ['Briefed', 'Drafting', 'Review', 'Live'],
      cards: [
        { col: 1, title: 'Q2 email sequence — 5 emails', badge: 'Brain Draft Ready', badgeColor: 'violet', round: null },
        { col: 2, title: 'About page rewrite', badge: null, round: '847 words' },
        { col: 3, title: 'Google Ads copy — 12 variants', badge: null, round: null },
      ],
    },
  },
  {
    id: 'client',
    label: 'Client Portal',
    icon: '🔗',
    headline: 'Clients who feel informed don\'t micromanage.',
    bullets: [
      'Private portal — clients see only their projects',
      'Submit requests, approve work, track progress',
      'Magic link login — no password, no training needed',
      'Gantt view so clients understand timelines',
      'Built-in satisfaction surveys',
    ],
    visual: {
      columns: ['Your Team Sees', '', 'Client Portal Sees', ''],
      cards: [
        { col: 0, title: 'Internal: Margin analysis for Q2', badge: 'Hidden from client', badgeColor: 'red', round: null },
        { col: 0, title: 'Internal: Competitor teardown', badge: 'Hidden from client', badgeColor: 'red', round: null },
        { col: 2, title: 'Homepage refresh — Spring', badge: 'In Review', badgeColor: 'blue', round: null },
        { col: 2, title: 'Google Ads copy v2', badge: 'Awaiting Approval', badgeColor: 'yellow', round: null },
      ],
    },
  },
];

const badgeColors: Record<string, string> = {
  emerald: 'bg-emerald-500/20 text-emerald-400',
  blue: 'bg-blue-500/20 text-blue-400',
  violet: 'bg-violet-500/20 text-violet-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  red: 'bg-red-500/20 text-red-400',
};

export default function BoardWalkthrough() {
  const [activeTab, setActiveTab] = useState('design');
  const tab = tabs.find((t) => t.id === activeTab)!;

  return (
    <section className="bg-[#080e1a] py-24 px-6" id="features">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-4">Department-specific boards</p>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Built for how your agency
            <br />
            <span className="text-slate-400">actually works.</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Most tools are built for one kind of work. KM Boards is built for all of yours.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                activeTab === t.id
                  ? 'bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.4)]'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left: bullets */}
          <div>
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-6">{tab.headline}</h3>
            <ul className="space-y-4">
              {tab.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="flex-none w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
                    <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-slate-300 leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: mini board visual */}
          <div className="bg-[#0f172a] border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl">
            {/* Columns header */}
            <div className="grid grid-cols-4 border-b border-slate-700/50">
              {tab.visual.columns.map((col, i) => (
                <div key={i} className="px-3 py-2.5 text-slate-500 text-xs font-semibold uppercase tracking-wider text-center border-r border-slate-700/30 last:border-0">
                  {col}
                </div>
              ))}
            </div>

            {/* Cards */}
            <div className="grid grid-cols-4 gap-0 p-3 min-h-[200px]">
              {[0, 1, 2, 3].map((colIdx) => (
                <div key={colIdx} className="px-1.5 space-y-2">
                  {tab.visual.cards
                    .filter((c) => c.col === colIdx)
                    .map((card, i) => (
                      <div key={i} className="bg-[#1e293b] rounded-lg p-2.5 border border-slate-700/60">
                        <div className="text-white text-[11px] font-medium leading-snug mb-1.5">{card.title}</div>
                        {card.badge && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeColors[card.badgeColor || 'blue']}`}>
                            {card.badge}
                          </span>
                        )}
                        {card.round && (
                          <div className="text-slate-500 text-[10px] mt-1">{card.round}</div>
                        )}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
