const growthFeatures = [
  'Unlimited boards',
  'Unlimited team members',
  'Unlimited clients',
  'All AI features (tokens on us)',
  'Client portal included',
  'PageForge (Figma → WordPress)',
  'AI Design Review',
  'AI Dev QA (Lighthouse + WCAG)',
  'Client Brain per client',
  'WhatsApp board digests',
  'Time tracking + analytics',
  'Email support',
];

const eliteFeatures = [
  'Everything in Growth',
  'Weekly live group calls with Ziv Raviv',
  'Agency SOP reviews',
  'Priority support',
  'Early access to new features',
  'Strategy sessions for agency owners',
];

export default function Pricing() {
  return (
    <section className="bg-[#080e1a] py-24 px-6" id="pricing">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-4">Pricing</p>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Simple pricing.
            <br />
            <span className="text-slate-400">No per-seat tax. No AI credit limits.</span>
          </h2>
          <p className="text-slate-400 text-lg">Both plans include a 2-week free trial. No credit card required.</p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Growth */}
          <div className="bg-[#0f172a] border border-slate-700/50 rounded-2xl p-8">
            <div className="mb-6">
              <div className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-2">Growth</div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-white">$97</span>
                <span className="text-slate-400">/ month</span>
              </div>
              <p className="text-slate-500 text-sm mt-2">Everything your agency needs to run client work with AI.</p>
            </div>

            <a
              href="/signup"
              className="block w-full text-center bg-blue-500 hover:bg-blue-400 text-white px-6 py-3.5 rounded-xl font-semibold transition-colors mb-8"
            >
              Start Free - 2 Weeks
            </a>

            <ul className="space-y-3">
              {growthFeatures.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-slate-300">
                  <svg className="flex-none w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Elite */}
          <div className="relative bg-gradient-to-b from-blue-950/60 to-[#0f172a] border border-blue-500/30 rounded-2xl p-8 overflow-hidden">
            {/* Glow */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-blue-500/20 blur-2xl rounded-full" />

            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="text-blue-300 text-sm font-medium uppercase tracking-wider">Elite</div>
                <span className="bg-blue-500/20 text-blue-300 text-xs px-2.5 py-1 rounded-full font-medium border border-blue-500/20">
                  Most Popular
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-5xl font-bold text-white">$1,997</span>
                <span className="text-slate-400">/ year</span>
              </div>
              <p className="text-slate-500 text-sm mb-6">Save $167 vs monthly. Includes weekly calls with Ziv.</p>

              <a
                href="/signup?plan=elite"
                className="block w-full text-center bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-400 hover:to-violet-400 text-white px-6 py-3.5 rounded-xl font-semibold transition-all mb-8 shadow-[0_0_30px_rgba(59,130,246,0.3)]"
              >
                Start Free - 2 Weeks
              </a>

              <ul className="space-y-3">
                {eliteFeatures.map((f, i) => (
                  <li key={f} className={`flex items-center gap-3 text-sm ${i === 0 ? 'text-slate-500' : 'text-slate-300'}`}>
                    <svg className="flex-none w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {f === 'Everything in Growth' ? <span className="italic">{f}</span> : f}
                  </li>
                ))}
              </ul>

              {/* Ziv callout */}
              <div className="mt-6 pt-6 border-t border-slate-700/50">
                <div className="flex items-start gap-3">
                  <div className="flex-none w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">
                    ZR
                  </div>
                  <div>
                    <p className="text-white text-xs font-semibold mb-1">Weekly calls with Ziv Raviv</p>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Ziv built KM Boards for his own agency. Elite members get direct access to group strategy sessions - positioning, pricing, delivery, and team ops.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Guarantee */}
        <div className="mt-10 text-center">
          <p className="text-slate-500 text-sm">
            No per-seat pricing. No AI credit limits. No gotchas.{' '}
            <span className="text-slate-400">If it&apos;s not for you, your data is exportable and your account closes cleanly.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
