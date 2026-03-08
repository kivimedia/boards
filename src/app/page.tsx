import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MarketingNav from '@/components/marketing/MarketingNav';
import Hero from '@/components/marketing/Hero';
import ShockFeatures from '@/components/marketing/ShockFeatures';
import BoardWalkthrough from '@/components/marketing/BoardWalkthrough';
import FeatureRows from '@/components/marketing/FeatureRows';
import ObjHandling from '@/components/marketing/ObjHandling';
import Pricing from '@/components/marketing/Pricing';
import FAQ from '@/components/marketing/FAQ';
import FinalCTA from '@/components/marketing/FinalCTA';

export const metadata = {
  title: 'KM Boards — Project Management Built for Marketing Agencies',
  description: 'The project board marketing agencies actually deserve. AI design review, Figma-to-WordPress page builder, client portal, and more. Try free for 2 weeks.',
};

export default async function LandingPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Authenticated users go straight to the dashboard
  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="bg-[#0b1221] min-h-screen">
      <MarketingNav />
      <Hero />
      <ShockFeatures />
      <BoardWalkthrough />
      <FeatureRows />
      <ObjHandling />
      <Pricing />
      <FAQ />
      <FinalCTA />

      {/* Footer */}
      <footer className="bg-[#080e1a] border-t border-slate-800 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-xs">KM</span>
            </div>
            <span className="text-slate-400 text-sm">KM Boards by Kivi Media</span>
          </div>
          <div className="flex items-center gap-6 text-slate-500 text-sm">
            <a href="/login" className="hover:text-slate-300 transition-colors">Sign In</a>
            <a href="/signup" className="hover:text-slate-300 transition-colors">Sign Up</a>
            <a href="mailto:ziv@dailycookie.co" className="hover:text-slate-300 transition-colors">Contact</a>
          </div>
          <p className="text-slate-600 text-xs">© 2026 Kivi Media. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
