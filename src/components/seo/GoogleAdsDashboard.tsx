'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import GoogleAdsTour from './GoogleAdsTour';

interface CampaignData {
  name: string;
  status: string;
  spend_30d: number;
  impressions_30d: number;
  clicks_30d: number;
  conversions_30d: number;
  ctr: number;
  cpc: number;
}

interface SearchTermData {
  search_term: string;
  impressions: number;
  clicks: number;
  cost: number;
  has_organic_content: boolean | null;
}

interface CompetitorAdData {
  advertiser_name: string;
  headline: string;
  description: string;
  first_shown: string;
  regions: string[];
}

interface EfficiencyReport {
  report_data: {
    organic_replacing_paid: number;
    monthly_savings: number;
    total_keywords: number;
    transition_candidates: number;
  };
  created_at: string;
}

type ActivePanel = 'campaigns' | 'keywords' | 'competitors' | 'efficiency';

export default function GoogleAdsDashboard() {
  const [activePanel, setActivePanel] = useState<ActivePanel>('campaigns');
  const [teamConfigId, setTeamConfigId] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [searchTerms, setSearchTerms] = useState<SearchTermData[]>([]);
  const [competitorAds, setCompetitorAds] = useState<CompetitorAdData[]>([]);
  const [efficiencyReports, setEfficiencyReports] = useState<EfficiencyReport[]>([]);
  const [visitCount, setVisitCount] = useState(0);

  useEffect(() => {
    loadData();
    trackVisit();
  }, []);

  async function trackVisit() {
    const key = 'gads_visit_count';
    const count = parseInt(localStorage.getItem(key) || '0') + 1;
    localStorage.setItem(key, String(count));
    setVisitCount(count);
  }

  async function loadData() {
    const supabase = createClient();

    // Find active team config with Google Ads credentials
    const { data: configs } = await supabase
      .from('seo_team_configs')
      .select('id, google_credentials, scrape_creators_api_key')
      .eq('is_active', true)
      .limit(1);

    if (configs?.length) {
      const config = configs[0];
      setTeamConfigId(config.id);
      const hasGads = config.google_credentials?.google_ads?.customer_id;
      setIsConfigured(!!hasGads);

      if (hasGads) {
        await loadGadsData(config.id);
      }
    }

    // Load efficiency reports regardless
    const { data: reports } = await supabase
      .from('seo_ads_reports')
      .select('report_data, created_at')
      .order('created_at', { ascending: false })
      .limit(12);

    if (reports) setEfficiencyReports(reports as EfficiencyReport[]);

    setLoading(false);
  }

  async function loadGadsData(configId: string) {
    try {
      const res = await fetch(`/api/seo/google-ads?teamConfigId=${configId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.campaigns) setCampaigns(data.campaigns);
        if (data.searchTerms) setSearchTerms(data.searchTerms);
        if (data.competitorAds) setCompetitorAds(data.competitorAds);
      }
    } catch {
      // API not yet deployed - expected during setup
    }
  }

  // Progressive disclosure: Level determines what's visible
  const accessLevel = visitCount >= 10 ? 3 : visitCount >= 5 ? 2 : 1;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-gray-400">Loading Google Ads data...</div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
          <div className="text-4xl mb-4">📊</div>
          <h2 className="text-xl font-semibold text-white mb-2">Connect Google Ads</h2>
          <p className="text-gray-400 mb-6">
            Connect your Google Ads account to unlock paid search intelligence, competitor analysis, and SEO-vs-Ads efficiency tracking.
          </p>
          <a
            href="/settings/seo"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Configure in Settings
          </a>
        </div>
      </div>
    );
  }

  const panels: { key: ActivePanel; label: string; icon: string }[] = [
    { key: 'campaigns', label: 'Campaigns', icon: '📊' },
    { key: 'keywords', label: 'Keyword Intel', icon: '🔑' },
    { key: 'competitors', label: 'Competitor Ads', icon: '🔍' },
    { key: 'efficiency', label: 'SEO vs Ads', icon: '📈' },
  ];

  return (
    <div className="p-6 space-y-6" id="gads-dashboard">
      <GoogleAdsTour visitCount={visitCount} />

      {/* Panel Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2" id="gads-tabs">
        {panels.map((p) => (
          <button
            key={p.key}
            onClick={() => setActivePanel(p.key)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activePanel === p.key
                ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      {/* Campaign Overview Panel */}
      {activePanel === 'campaigns' && (
        <div id="gads-campaigns" className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Campaign Performance (30 days)</h3>
          {campaigns.length === 0 ? (
            <div className="text-gray-400 text-sm">No campaign data loaded yet. VPS service may need to be deployed.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="pb-2 pr-4">Campaign</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4 text-right">Spend</th>
                    <th className="pb-2 pr-4 text-right">Impr.</th>
                    <th className="pb-2 pr-4 text-right">Clicks</th>
                    <th className="pb-2 pr-4 text-right">Conv.</th>
                    <th className="pb-2 pr-4 text-right">CTR</th>
                    <th className="pb-2 text-right">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c, i) => (
                    <tr key={i} className="border-b border-gray-800 text-gray-300">
                      <td className="py-2 pr-4 font-medium text-white">{c.name}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          c.status === 'ENABLED' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
                        }`}>{c.status}</span>
                      </td>
                      <td className="py-2 pr-4 text-right">${c.spend_30d.toFixed(2)}</td>
                      <td className="py-2 pr-4 text-right">{c.impressions_30d.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">{c.clicks_30d.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">{c.conversions_30d}</td>
                      <td className="py-2 pr-4 text-right">{(c.ctr * 100).toFixed(1)}%</td>
                      <td className="py-2 text-right">${c.cpc.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Keyword Intelligence Panel */}
      {activePanel === 'keywords' && (
        <div id="gads-keywords" className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Search Terms Intelligence</h3>
          <p className="text-gray-400 text-sm">Real user queries that triggered your ads. Terms without organic content are content opportunities.</p>
          {searchTerms.length === 0 ? (
            <div className="text-gray-400 text-sm">No search term data loaded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="pb-2 pr-4">Search Term</th>
                    <th className="pb-2 pr-4 text-right">Impr.</th>
                    <th className="pb-2 pr-4 text-right">Clicks</th>
                    <th className="pb-2 pr-4 text-right">Cost</th>
                    <th className="pb-2 pr-4">Organic?</th>
                    {accessLevel >= 2 && <th className="pb-2">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {searchTerms.map((t, i) => (
                    <tr key={i} className="border-b border-gray-800 text-gray-300">
                      <td className="py-2 pr-4 font-medium text-white">{t.search_term}</td>
                      <td className="py-2 pr-4 text-right">{t.impressions.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">{t.clicks.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">${t.cost.toFixed(2)}</td>
                      <td className="py-2 pr-4">
                        {t.has_organic_content === true && <span className="text-green-400">Yes</span>}
                        {t.has_organic_content === false && <span className="text-red-400">No</span>}
                        {t.has_organic_content === null && <span className="text-gray-500">Unknown</span>}
                      </td>
                      {accessLevel >= 2 && (
                        <td className="py-2">
                          {t.has_organic_content === false && (
                            <button className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                              Write Blog Post
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Competitor Ads Panel */}
      {activePanel === 'competitors' && (
        <div id="gads-competitors" className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Competitor Ad Feed</h3>
          <p className="text-gray-400 text-sm">Active competitor ads from Google Ads Transparency Library.</p>
          {competitorAds.length === 0 ? (
            <div className="text-gray-400 text-sm">No competitor ad data loaded yet. Configure competitor domains in Settings.</div>
          ) : (
            <div className="space-y-3">
              {competitorAds.map((ad, i) => (
                <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-medium text-blue-400">{ad.advertiser_name}</span>
                    <span className="text-xs text-gray-500">Since {ad.first_shown}</span>
                  </div>
                  <h4 className="text-white font-medium mb-1">{ad.headline}</h4>
                  <p className="text-gray-400 text-sm">{ad.description}</p>
                  <div className="flex gap-2 mt-2">
                    {ad.regions.slice(0, 3).map((r, j) => (
                      <span key={j} className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">{r}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SEO vs Ads Efficiency Panel */}
      {activePanel === 'efficiency' && (
        <div id="gads-efficiency" className="space-y-4">
          <h3 className="text-lg font-semibold text-white">SEO vs Ads Efficiency</h3>
          <p className="text-gray-400 text-sm">Tracking organic content replacing paid ads over time.</p>

          {efficiencyReports.length === 0 ? (
            <div className="text-gray-400 text-sm">No efficiency reports yet. The monthly sync cron will generate these automatically.</div>
          ) : (
            <>
              {/* Summary cards */}
              {efficiencyReports[0] && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="text-2xl font-bold text-green-400">
                      {efficiencyReports[0].report_data.organic_replacing_paid}
                    </div>
                    <div className="text-sm text-gray-400">Keywords Transitioned</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="text-2xl font-bold text-green-400">
                      ${efficiencyReports[0].report_data.monthly_savings.toFixed(0)}
                    </div>
                    <div className="text-sm text-gray-400">Monthly Savings</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="text-2xl font-bold text-white">
                      {efficiencyReports[0].report_data.total_keywords}
                    </div>
                    <div className="text-sm text-gray-400">Total Keywords</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="text-2xl font-bold text-yellow-400">
                      {efficiencyReports[0].report_data.transition_candidates}
                    </div>
                    <div className="text-sm text-gray-400">Transition Candidates</div>
                  </div>
                </div>
              )}

              {/* Historical reports */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-300">Monthly Reports</h4>
                {efficiencyReports.map((r, i) => (
                  <div key={i} className="flex justify-between items-center bg-gray-800 rounded px-4 py-2 text-sm">
                    <span className="text-gray-300">{new Date(r.created_at).toLocaleDateString()}</span>
                    <span className="text-green-400">{r.report_data.organic_replacing_paid} transitioned</span>
                    <span className="text-green-400">${r.report_data.monthly_savings.toFixed(0)} saved</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Admin-only: Security audit access */}
      {accessLevel >= 3 && (
        <div className="border-t border-gray-700 pt-4 mt-6">
          <a href="/settings/seo" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            Admin: Security Audit Log & Direct Tool Access
          </a>
        </div>
      )}
    </div>
  );
}
