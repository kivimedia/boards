const features = [
  {
    label: 'AI Design Review',
    headline: 'Stop being the QA for your designers.',
    body: 'Every card has a Review button. When a designer submits a revision, AI reads the original feedback, compares it against the new file, and delivers a pass/fail verdict with a line-by-line explanation. Revision rounds drop from 4 to 1.',
    impact: 'You stop being the bottleneck. Designers get faster feedback. Clients stop complaining about turnaround.',
    color: 'blue',
    visual: (
      <div className="bg-[#0f172a] rounded-2xl border border-slate-700/50 p-5 font-mono text-sm space-y-3">
        <div className="text-slate-400 text-xs uppercase tracking-wider mb-4 font-sans">AI Review - Homepage Hero v3</div>
        {[
          { text: 'Move CTA button above the fold', status: 'pass' },
          { text: 'Increase heading font size to 64px', status: 'pass' },
          { text: 'Replace stock photo with brand illustration', status: 'pass' },
          { text: 'Add social proof numbers below hero', status: 'fail' },
          { text: 'Update CTA copy to "Start Free"', status: 'pass' },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className={`flex-none w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              item.status === 'pass' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {item.status === 'pass' ? '✓' : '✗'}
            </span>
            <span className={`text-xs ${item.status === 'fail' ? 'text-red-300' : 'text-slate-300'}`}>{item.text}</span>
          </div>
        ))}
        <div className="pt-3 border-t border-slate-700 flex items-center justify-between">
          <span className="text-xs text-slate-500">4 of 5 changes verified</span>
          <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded font-medium">1 item needs fix</span>
        </div>
      </div>
    ),
  },
  {
    label: 'PageForge',
    headline: 'A Figma file walks in. A live WordPress page walks out.',
    body: 'Connect your WordPress site once. Feed PageForge a Figma frame. It extracts layout, images, fonts, and colors - generates Divi 5 or Gutenberg blocks - uploads to your Media Library - and publishes a draft. Your dev reviews and hits Publish.',
    impact: 'Campaign pages that used to take 2 days now take 20 minutes. Clients stop waiting. You stop losing money on implementation.',
    color: 'violet',
    visual: (
      <div className="bg-[#0f172a] rounded-2xl border border-slate-700/50 p-5 space-y-3">
        <div className="text-slate-400 text-xs uppercase tracking-wider mb-4">PageForge - Spring Campaign Landing</div>
        {[
          { phase: 'Analyze Figma design', status: 'done', time: '0:12' },
          { phase: 'Classify sections (Hero, Features, CTA)', status: 'done', time: '0:34' },
          { phase: 'Generate Divi 5 blocks', status: 'done', time: '1:18' },
          { phase: 'Extract & upload 7 images', status: 'done', time: '2:01' },
          { phase: 'Publish draft to WordPress', status: 'done', time: '2:47' },
          { phase: 'Run Lighthouse QA (Score: 91)', status: 'done', time: '3:52' },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="flex-none w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-[10px] font-bold">✓</span>
            <span className="text-slate-300 text-xs flex-1">{item.phase}</span>
            <span className="text-slate-500 text-[10px] font-mono">{item.time}</span>
          </div>
        ))}
        <div className="pt-3 border-t border-slate-700">
          <span className="text-violet-400 text-xs font-semibold">Draft live → wordpress.acmecorp.com/spring-2026/?preview=true</span>
        </div>
      </div>
    ),
  },
  {
    label: 'Client Brain',
    headline: 'An AI that actually sounds like your client.',
    body: "Every client has a private knowledge base you populate with approved work, brand guidelines, reference emails. When you need new copy, blog posts, or emails, the AI generates content in the client's established voice and style.",
    impact: "Onboarding new copywriters is faster. Revisions drop. Clients stop saying \"this doesn't sound like us.\"",
    color: 'emerald',
    visual: (
      <div className="bg-[#0f172a] rounded-2xl border border-slate-700/50 p-5 space-y-4">
        <div className="text-slate-400 text-xs uppercase tracking-wider">Client Brain - Acme Corp</div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>28 documents indexed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span>Voice model trained</span>
          </div>
        </div>
        <div className="bg-slate-800/60 rounded-xl p-3 text-xs text-slate-300 leading-relaxed border border-slate-700/50">
          <span className="text-slate-500">You: </span>Write a 3-line intro for our April newsletter
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-xs text-slate-200 leading-relaxed">
          <span className="text-emerald-400 font-medium">Brain: </span>
          Spring is here, and so is your next growth opportunity. At Acme, we&apos;ve been heads-down building something we think you&apos;ll love - more on that below. But first, let&apos;s talk about what&apos;s working right now.
        </div>
        <div className="text-[10px] text-slate-500">Generated in client&apos;s voice • Based on 6 approved newsletters</div>
      </div>
    ),
  },
  {
    label: 'Client Portal',
    headline: 'Clients who feel informed don\'t micromanage.',
    body: "Every client gets a private portal showing exactly their tickets and nothing else. They can submit requests, approve work, and see project status - without seeing your internal team, costs, or other clients.",
    impact: "You look more professional. Clients trust the process. Your team stops fielding \"what's the status?\" messages.",
    color: 'blue',
    visual: (
      <div className="bg-[#0f172a] rounded-2xl border border-slate-700/50 overflow-hidden">
        {/* Portal header */}
        <div className="bg-[#1e293b] border-b border-slate-700 px-5 py-3 flex items-center justify-between">
          <span className="text-white text-sm font-semibold">Acme Corp - Project Portal</span>
          <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-1 rounded font-medium">2 need your review</span>
        </div>
        <div className="p-4 space-y-3">
          {[
            { title: 'Homepage hero redesign', status: 'Awaiting Approval', action: true },
            { title: 'April email campaign - 5 emails', status: 'In Progress', action: false },
            { title: 'Google Ads refresh', status: 'Live ✓', action: false },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-slate-800/40 rounded-lg border border-slate-700/40">
              <div>
                <div className="text-white text-xs font-medium">{item.title}</div>
                <div className={`text-[10px] mt-0.5 ${item.action ? 'text-yellow-400' : 'text-slate-500'}`}>{item.status}</div>
              </div>
              {item.action && (
                <button className="text-[10px] bg-blue-500 text-white px-2.5 py-1 rounded-md font-medium">Review</button>
              )}
            </div>
          ))}
          <div className="text-center pt-2">
            <button className="text-xs text-blue-400 hover:text-blue-300">+ Submit a new request</button>
          </div>
        </div>
      </div>
    ),
  },
  {
    label: 'WhatsApp Daily Digest',
    headline: 'Your team\'s standup, delivered to the group chat.',
    body: "Every morning, KM Boards sends a WhatsApp message to your team's group: here's what moved yesterday, what's overdue, what needs attention. No one has to log in just to check status.",
    impact: "Fewer meetings. Faster response to blockers. Team stays aligned without another daily call.",
    color: 'emerald',
    visual: (
      <div className="bg-[#0f172a] rounded-2xl border border-slate-700/50 p-5">
        <div className="text-slate-400 text-xs uppercase tracking-wider mb-4">WhatsApp - Agency Team</div>
        <div className="bg-[#075e54] rounded-2xl p-4 space-y-3 max-w-xs mx-auto">
          <div className="bg-[#128c7e]/30 rounded-xl p-3 text-white text-xs leading-relaxed border border-[#128c7e]/40">
            <div className="font-semibold text-emerald-300 mb-2">🌅 Good morning - Daily Board Digest</div>
            <div className="space-y-1.5 text-[11px]">
              <div>✅ <span className="text-slate-200">6 cards moved to Done</span></div>
              <div>⚠️ <span className="text-yellow-300">3 cards overdue</span></div>
              <div>🔴 <span className="text-red-300">Blocker: Email copy waiting on client approval (3 days)</span></div>
              <div>📌 <span className="text-slate-200">2 cards due today</span></div>
            </div>
            <div className="text-[10px] text-slate-400 mt-3">KM Boards • 7:30 AM</div>
          </div>
        </div>
      </div>
    ),
  },
];

const colorAccents: Record<string, string> = {
  blue: 'text-blue-400',
  violet: 'text-violet-400',
  emerald: 'text-emerald-400',
};

export default function FeatureRows() {
  return (
    <section className="bg-[#0b1221] py-24 px-6">
      <div className="max-w-7xl mx-auto space-y-32">
        {features.map((feature, i) => (
          <div
            key={feature.label}
            className={`grid md:grid-cols-2 gap-12 md:gap-20 items-center ${i % 2 === 1 ? 'md:[direction:rtl]' : ''}`}
          >
            {/* Text */}
            <div className={i % 2 === 1 ? 'md:[direction:ltr]' : ''}>
              <span className={`text-sm font-semibold uppercase tracking-widest ${colorAccents[feature.color]} mb-3 block`}>
                {feature.label}
              </span>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-5 leading-tight">
                {feature.headline}
              </h3>
              <p className="text-slate-400 leading-relaxed mb-6 text-lg">
                {feature.body}
              </p>
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
                <p className="text-slate-300 text-sm leading-relaxed">
                  <span className="font-semibold text-white">What this means: </span>
                  {feature.impact}
                </p>
              </div>
            </div>

            {/* Visual */}
            <div className={i % 2 === 1 ? 'md:[direction:ltr]' : ''}>
              {feature.visual}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
