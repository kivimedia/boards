'use client';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0b1221]">
      {/* Background gradient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[300px] bg-indigo-500/8 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-[300px] h-[200px] bg-violet-500/6 rounded-full blur-3xl" />
      </div>

      {/* Grid lines overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-32 pb-20 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-8">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-blue-300 text-sm font-medium">Built for marketing agencies, not adapted for them</span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-bold text-white leading-[1.08] tracking-tight mb-6">
          The project board your
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
            agency actually deserves.
          </span>
        </h1>

        {/* Sub-headline */}
        <p className="text-xl md:text-2xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Design, dev, copy, and video teams working in one place - with AI baked into every workflow. Not adapted from generic task software.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <a
            href="#pricing"
            className="group bg-blue-500 hover:bg-blue-400 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all duration-200 shadow-[0_0_40px_rgba(59,130,246,0.3)] hover:shadow-[0_0_60px_rgba(59,130,246,0.5)] flex items-center gap-2"
          >
            Start Free - 2 Weeks, No Card
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
          <a
            href="#features"
            className="text-slate-300 hover:text-white px-8 py-4 rounded-xl text-lg font-medium transition-colors border border-slate-700 hover:border-slate-500"
          >
            See the features
          </a>
        </div>

        {/* Mock board preview */}
        <div className="relative mx-auto max-w-4xl">
          <div className="bg-[#0f172a] border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
            {/* Fake browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#1e293b] border-b border-slate-700">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <div className="w-3 h-3 rounded-full bg-green-500/70" />
              <div className="flex-1 ml-4 bg-slate-700 rounded-md h-5 max-w-[200px] flex items-center px-3">
                <span className="text-slate-400 text-xs">kmboards.co/board/design</span>
              </div>
            </div>

            {/* Kanban preview */}
            <div className="p-4 flex gap-3 overflow-hidden" style={{ height: '280px' }}>
              {/* Column 1 */}
              <div className="flex-none w-52">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-slate-300 text-xs font-semibold uppercase tracking-wider">In Review</span>
                  <span className="bg-slate-700 text-slate-400 text-xs rounded-full px-2 py-0.5">3</span>
                </div>
                <div className="space-y-2">
                  {/* Card with AI badge */}
                  <div className="bg-[#1e293b] rounded-lg p-3 border border-slate-700 cursor-pointer hover:border-blue-500/40 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-white text-xs font-medium leading-snug">Homepage hero redesign v3</span>
                      <span className="ml-2 flex-none bg-green-500/20 text-green-400 text-[10px] px-1.5 py-0.5 rounded font-medium">AI: PASS</span>
                    </div>
                    <div className="text-slate-500 text-[11px]">Round 1 of 1</div>
                    <div className="flex items-center gap-1 mt-2">
                      <div className="w-5 h-5 rounded-full bg-violet-500 text-white text-[9px] flex items-center justify-center font-bold">SR</div>
                      <div className="flex-1 h-1 bg-slate-700 rounded-full">
                        <div className="h-1 bg-blue-500 rounded-full w-full" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1e293b] rounded-lg p-3 border border-slate-700">
                    <div className="text-white text-xs font-medium leading-snug mb-1">Product page copy - Q2</div>
                    <div className="flex items-center gap-1 mt-2">
                      <div className="w-5 h-5 rounded-full bg-orange-500 text-white text-[9px] flex items-center justify-center font-bold">AM</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 2 */}
              <div className="flex-none w-52">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Dev QA</span>
                  <span className="bg-slate-700 text-slate-400 text-xs rounded-full px-2 py-0.5">2</span>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1e293b] rounded-lg p-3 border border-blue-500/30">
                    <div className="text-white text-xs font-medium leading-snug mb-2">Landing page - Acme Corp</div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Lighthouse 94</span>
                      <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">WCAG AA</span>
                    </div>
                    <div className="text-slate-500 text-[11px]">Auto-verified ✓</div>
                  </div>
                  <div className="bg-[#1e293b] rounded-lg p-3 border border-slate-700">
                    <div className="text-white text-xs font-medium leading-snug mb-1">Mobile nav fix</div>
                    <div className="h-1 bg-slate-700 rounded-full mt-2">
                      <div className="h-1 bg-yellow-500 rounded-full w-2/3" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 3 */}
              <div className="flex-none w-52">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Done</span>
                  <span className="bg-slate-700 text-slate-400 text-xs rounded-full px-2 py-0.5">12</span>
                </div>
                <div className="space-y-2">
                  <div className="bg-[#1e293b] rounded-lg p-3 border border-slate-700 opacity-70">
                    <div className="text-slate-400 text-xs font-medium leading-snug line-through">Social media kit - March</div>
                  </div>
                  <div className="bg-[#1e293b] rounded-lg p-3 border border-slate-700 opacity-70">
                    <div className="text-slate-400 text-xs font-medium leading-snug line-through">Email sequence v2</div>
                  </div>
                </div>
              </div>

              {/* AI Chat panel peek */}
              <div className="flex-none w-52 bg-[#1a2540] rounded-xl border border-blue-500/20 p-3">
                <div className="text-blue-400 text-[10px] font-semibold uppercase tracking-wider mb-3">Board AI</div>
                <div className="space-y-2">
                  <div className="bg-[#0f172a] rounded-lg p-2.5 text-slate-300 text-[11px] leading-relaxed">
                    &quot;Who&apos;s overloaded this week?&quot;
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5 text-blue-200 text-[11px] leading-relaxed">
                    Sara has 8 open cards - 3 overdue. Consider reassigning the landing page brief.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Glow under the board */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-blue-500/20 blur-3xl rounded-full" />
        </div>

        {/* Social proof numbers */}
        <div className="flex flex-wrap items-center justify-center gap-8 mt-16 text-sm text-slate-500">
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-white">50+</span>
            <span>AI features built-in</span>
          </div>
          <div className="w-px h-8 bg-slate-700 hidden sm:block" />
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-white">9</span>
            <span>Department board types</span>
          </div>
          <div className="w-px h-8 bg-slate-700 hidden sm:block" />
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-white">$0</span>
            <span>Extra AI token cost</span>
          </div>
          <div className="w-px h-8 bg-slate-700 hidden sm:block" />
          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-white">2 weeks</span>
            <span>Free, no card needed</span>
          </div>
        </div>
      </div>
    </section>
  );
}
