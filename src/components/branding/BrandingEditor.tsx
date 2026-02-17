'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PortalBranding } from '@/lib/types';

interface BrandingEditorProps {
  clientId?: string;
}

export default function BrandingEditor({ clientId }: BrandingEditorProps) {
  const [branding, setBranding] = useState<PortalBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6366f1');
  const [secondaryColor, setSecondaryColor] = useState('#0f172a');
  const [accentColor, setAccentColor] = useState('#faf7f2');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [footerText, setFooterText] = useState('');
  const [isActive, setIsActive] = useState(false);

  const fetchBranding = useCallback(async () => {
    try {
      const query = clientId ? `?client_id=${clientId}` : '';
      const res = await fetch(`/api/branding${query}`);
      const json = await res.json();
      if (json.data) {
        const b = json.data as PortalBranding;
        setBranding(b);
        setLogoUrl(b.logo_url ?? '');
        setPrimaryColor(b.primary_color);
        setSecondaryColor(b.secondary_color);
        setAccentColor(b.accent_color);
        setFaviconUrl(b.favicon_url ?? '');
        setCustomDomain(b.custom_domain ?? '');
        setCompanyName(b.company_name ?? '');
        setFooterText(b.footer_text ?? '');
        setIsActive(b.is_active);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          logo_url: logoUrl.trim() || undefined,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          accent_color: accentColor,
          favicon_url: faviconUrl.trim() || undefined,
          custom_domain: customDomain.trim() || undefined,
          company_name: companyName.trim() || undefined,
          footer_text: footerText.trim() || undefined,
          is_active: isActive,
        }),
      });

      const json = await res.json();
      if (json.data) setBranding(json.data);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-cream-dark/40 dark:bg-slate-800/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">White-Label Branding</h3>
          <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-1">
            Customize the portal appearance for {clientId ? 'this client' : 'all clients'}.
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30"
          />
          <span className="text-xs font-body text-navy/70 dark:text-slate-300">Active</span>
        </label>
      </div>

      <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 space-y-5">
        {/* Logo */}
        <div>
          <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Logo URL</label>
          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              placeholder="https://example.com/logo.png"
            />
            {logoUrl && (
              <div className="shrink-0 w-10 h-10 rounded-lg border border-cream-dark dark:border-slate-700 overflow-hidden bg-cream/30 dark:bg-navy/30">
                <img src={logoUrl} alt="Logo preview" className="w-full h-full object-contain" />
              </div>
            )}
          </div>
        </div>

        {/* Colors */}
        <div>
          <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-2">Brand Colors</label>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] text-navy/40 dark:text-slate-500 font-body mb-1">Primary</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-8 h-8 rounded border border-cream-dark dark:border-slate-700 cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-xs text-navy dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-electric/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-navy/40 dark:text-slate-500 font-body mb-1">Secondary</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-8 h-8 rounded border border-cream-dark dark:border-slate-700 cursor-pointer"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-xs text-navy dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-electric/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-navy/40 dark:text-slate-500 font-body mb-1">Accent</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-8 h-8 rounded border border-cream-dark dark:border-slate-700 cursor-pointer"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-xs text-navy dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-electric/30"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div>
          <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-2">Preview</label>
          <div
            className="rounded-lg overflow-hidden border"
            style={{ borderColor: primaryColor + '33' }}
          >
            <div
              className="px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: secondaryColor }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-6 object-contain" />
              ) : (
                <div
                  className="text-sm font-bold"
                  style={{ color: accentColor }}
                >
                  {companyName || 'Agency Board'}
                </div>
              )}
            </div>
            <div className="px-4 py-3" style={{ backgroundColor: accentColor }}>
              <div
                className="text-xs font-semibold mb-1"
                style={{ color: secondaryColor }}
              >
                Sample Dashboard
              </div>
              <div
                className="w-full h-2 rounded-full"
                style={{ backgroundColor: primaryColor + '22' }}
              >
                <div
                  className="h-2 rounded-full"
                  style={{ backgroundColor: primaryColor, width: '65%' }}
                />
              </div>
            </div>
            {footerText && (
              <div
                className="px-4 py-2 text-[10px]"
                style={{ backgroundColor: secondaryColor + '0A', color: secondaryColor + '80' }}
              >
                {footerText}
              </div>
            )}
          </div>
        </div>

        {/* Additional settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
              Favicon URL
            </label>
            <input
              type="text"
              value={faviconUrl}
              onChange={(e) => setFaviconUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              placeholder="https://example.com/favicon.ico"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
              Custom Domain
            </label>
            <input
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              placeholder="portal.yourdomain.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              placeholder="Your Agency Name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
              Footer Text
            </label>
            <input
              type="text"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              placeholder="Powered by Your Agency"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg text-sm font-medium font-body bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Branding'}
        </button>
      </div>
    </div>
  );
}
