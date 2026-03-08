export default function ObjHandling() {
  return (
    <section className="bg-[#080e1a] py-24 px-6">
      <div className="max-w-4xl mx-auto text-center">
        {/* Objection */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl px-8 py-10 mb-12">
          <p className="text-slate-400 text-lg mb-2 italic">&ldquo;Okay but we already use [insert tool here].&rdquo;</p>
          <p className="text-slate-600 text-sm">So does everyone.</p>
        </div>

        {/* Reframe */}
        <div className="space-y-6 text-left max-w-2xl mx-auto mb-12">
          <div className="flex items-start gap-4">
            <div className="flex-none w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mt-0.5">
              <span className="text-red-400 text-sm">✗</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Does your current tool know that your designer submitted 4 revisions on the same card without fixing the same comment?
            </p>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex-none w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mt-0.5">
              <span className="text-red-400 text-sm">✗</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Does it generate a live WordPress page from a Figma frame?
            </p>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex-none w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mt-0.5">
              <span className="text-red-400 text-sm">✗</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Does it know how to write copy in your client&apos;s voice — because it actually learned it from past approved work?
            </p>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex-none w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mt-0.5">
              <span className="text-red-400 text-sm">✗</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Does it verify Lighthouse performance scores before a dev ticket can close?
            </p>
          </div>
        </div>

        {/* Resolution */}
        <div className="bg-[#0f172a] border border-blue-500/20 rounded-2xl px-8 py-10 mb-10">
          <p className="text-white text-xl font-medium mb-3">
            You don&apos;t have to migrate everything.
          </p>
          <p className="text-slate-400 leading-relaxed text-lg">
            Start with one board — say, your design review board. Run it for 2 weeks. See what happens to your revision rounds.
          </p>
        </div>

        <a
          href="#pricing"
          className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all duration-200 shadow-[0_0_40px_rgba(59,130,246,0.3)]"
        >
          Start with One Board — Free for 2 Weeks
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </a>
      </div>
    </section>
  );
}
