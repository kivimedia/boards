'use client';

import { useState } from 'react';

const faqs = [
  {
    q: 'Do I have to migrate from my current tool?',
    a: 'No. Start with one board — onboarding takes 10 minutes. Migrate the rest on your own timeline. We also have Trello import built in if you want to move your existing cards over.',
  },
  {
    q: 'What AI models power this?',
    a: 'Primarily Claude (Anthropic) for all text and reasoning. We also integrate Google Gemini and Replicate FLUX for image generation. You don\'t pay API costs separately — they\'re bundled into your plan.',
  },
  {
    q: 'How does client portal access work?',
    a: 'Clients log in with a magic link sent to their email — no password, no app to download. They see only their projects. Nothing internal is visible to them.',
  },
  {
    q: 'What does "AI tokens on us" actually mean?',
    a: 'You don\'t pay separately for AI usage. All AI features — design review, dev QA, chatbot, image generation, Client Brain, outreach email writing — are included in your monthly fee.',
  },
  {
    q: 'What happens after the 2-week trial?',
    a: 'You choose a plan and continue. If it\'s not for you, your data is exportable as JSON/CSV and your account closes cleanly. We don\'t hold your data hostage.',
  },
  {
    q: 'Who are the weekly calls with on the Elite plan?',
    a: 'Ziv Raviv, who built KM Boards to run his own agency and now offers it as a product. Calls are group sessions where Elite members bring real agency challenges — positioning, team structure, delivery process, pricing.',
  },
  {
    q: 'Does it work for agencies that aren\'t in design/dev?',
    a: 'Yes. The board system is flexible — copy-only agencies, social media agencies, SEO agencies, and video production shops all use it. You pick which board types you need.',
  },
  {
    q: 'Can I give clients their own login?',
    a: 'Yes. Each client gets a magic-link portal that shows only their work. You can have unlimited clients on any plan.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="bg-[#0b1221] py-24 px-6" id="faq">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-bold text-white mb-3">Frequently asked</h2>
          <p className="text-slate-400">Everything you need to know before your first board.</p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className={`bg-[#0f172a] border rounded-xl overflow-hidden transition-colors ${
                open === i ? 'border-blue-500/30' : 'border-slate-700/50'
              }`}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left"
              >
                <span className="text-white font-medium text-sm pr-4">{faq.q}</span>
                <span className={`flex-none text-slate-400 transition-transform duration-200 ${open === i ? 'rotate-45' : ''}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </span>
              </button>
              {open === i && (
                <div className="px-6 pb-5">
                  <p className="text-slate-400 text-sm leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
