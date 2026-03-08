'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[#0f172a]/95 backdrop-blur-md border-b border-slate-800' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">KM</span>
          </div>
          <span className="text-white font-semibold text-lg">KM Boards</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-slate-400 hover:text-white transition-colors text-sm">Features</a>
          <a href="#pricing" className="text-slate-400 hover:text-white transition-colors text-sm">Pricing</a>
          <a href="#faq" className="text-slate-400 hover:text-white transition-colors text-sm">FAQ</a>
          <Link href="/login" className="text-slate-400 hover:text-white transition-colors text-sm">Sign In</Link>
          <a
            href="#pricing"
            className="bg-blue-500 hover:bg-blue-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Start Free — 2 Weeks
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden text-slate-400 hover:text-white"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            }
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#0f172a] border-t border-slate-800 px-6 py-4 flex flex-col gap-4">
          <a href="#features" className="text-slate-300 text-sm" onClick={() => setMobileOpen(false)}>Features</a>
          <a href="#pricing" className="text-slate-300 text-sm" onClick={() => setMobileOpen(false)}>Pricing</a>
          <a href="#faq" className="text-slate-300 text-sm" onClick={() => setMobileOpen(false)}>FAQ</a>
          <Link href="/login" className="text-slate-300 text-sm">Sign In</Link>
          <a
            href="#pricing"
            className="bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium text-center"
            onClick={() => setMobileOpen(false)}
          >
            Start Free — 2 Weeks
          </a>
        </div>
      )}
    </nav>
  );
}
