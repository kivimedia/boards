export default function ShockFeatures() {
  const shocks = [
    {
      icon: (
        <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      label: 'AI Design Review',
      headline: 'Never argue about revisions again.',
      body: 'AI reads the feedback, checks the new version, and tells you exactly which changes were made and which weren\'t. Every round. Automatically.',
      color: 'blue',
    },
    {
      icon: (
        <svg className="w-7 h-7 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      label: 'PageForge',
      headline: 'Figma to live WordPress page in 4 minutes.',
      body: 'Point PageForge at a Figma frame. Walk away. Come back to a published draft page with images, fonts, and layout already in place.',
      color: 'violet',
    },
    {
      icon: (
        <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      label: 'Client Brain',
      headline: 'Your AI that actually knows each client.',
      body: 'Every client gets their own AI brain trained on past approved work. Ask it to write copy and it writes in their voice - not a generic one.',
      color: 'emerald',
    },
  ];

  const colorMap: Record<string, { border: string; glow: string; badge: string }> = {
    blue: {
      border: 'hover:border-blue-500/40 group-hover:border-blue-500/40',
      glow: 'from-blue-500/10',
      badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    },
    violet: {
      border: 'hover:border-violet-500/40',
      glow: 'from-violet-500/10',
      badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    },
    emerald: {
      border: 'hover:border-emerald-500/40',
      glow: 'from-emerald-500/10',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
  };

  return (
    <section className="bg-[#0b1221] py-24 px-6" id="shock">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-4">You probably didn&apos;t know software could do this</p>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Most tools manage your work.
            <br />
            <span className="text-slate-400">KM Boards thinks about it.</span>
          </h2>
        </div>

        {/* Three shock cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {shocks.map((item) => {
            const colors = colorMap[item.color];
            return (
              <div
                key={item.label}
                className={`group relative bg-[#0f172a] border border-slate-800 ${colors.border} rounded-2xl p-8 transition-all duration-300 overflow-hidden`}
              >
                {/* Gradient on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${colors.glow} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                <div className="relative">
                  {/* Icon */}
                  <div className="mb-5">
                    {item.icon}
                  </div>

                  {/* Badge */}
                  <span className={`inline-block border text-xs font-medium px-3 py-1 rounded-full mb-4 ${colors.badge}`}>
                    {item.label}
                  </span>

                  {/* Headline */}
                  <h3 className="text-white text-xl font-bold mb-3 leading-snug">
                    {item.headline}
                  </h3>

                  {/* Body */}
                  <p className="text-slate-400 leading-relaxed text-sm">
                    {item.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
