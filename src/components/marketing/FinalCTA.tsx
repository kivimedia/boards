export default function FinalCTA() {
  return (
    <section className="relative bg-[#080e1a] py-32 px-6 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-500/15 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto text-center">
        <h2 className="text-5xl md:text-6xl font-bold text-white mb-4 leading-tight">
          Two weeks.
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
            One board. No card.
          </span>
        </h2>

        <p className="text-slate-400 text-xl mb-10 leading-relaxed">
          If it doesn&apos;t change how your team works, you owe us nothing.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
          <a
            href="/signup"
            className="group bg-blue-500 hover:bg-blue-400 text-white px-10 py-4 rounded-xl text-lg font-semibold transition-all duration-200 shadow-[0_0_40px_rgba(59,130,246,0.35)] hover:shadow-[0_0_60px_rgba(59,130,246,0.5)] flex items-center gap-2"
          >
            Get Started Free
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
          <a
            href="mailto:ziv@dailycookie.co?subject=KM Boards Demo"
            className="text-slate-300 hover:text-white px-8 py-4 rounded-xl text-base font-medium transition-colors border border-slate-700 hover:border-slate-500"
          >
            Book a 15-min demo instead →
          </a>
        </div>

        <p className="text-slate-600 text-sm">
          No credit card. No contract. Cancel anytime.
        </p>
      </div>
    </section>
  );
}
