'use client';

import { ASSET_TYPE_ICONS } from '@/lib/asset-library';
import type { Asset } from '@/lib/types';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface AssetListViewProps {
  assets: Asset[];
  onAssetClick?: (asset: Asset) => void;
}

export default function AssetListView({ assets, onAssetClick }: AssetListViewProps) {
  if (assets.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-cream-dark dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30 dark:text-slate-600">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <p className="text-navy/40 dark:text-slate-500 font-body text-sm">No assets found. Upload or adjust your filters.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden overflow-x-auto">
      <table className="w-full min-w-[300px]">
        <thead>
          <tr className="border-b-2 border-cream-dark dark:border-slate-700">
            <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider">Name</th>
            <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider">Type</th>
            <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Client</th>
            <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Size</th>
            <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Date</th>
            <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider hidden xl:table-cell">Tags</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr
              key={asset.id}
              onClick={() => onAssetClick?.(asset)}
              className="border-b border-cream-dark dark:border-slate-700 last:border-b-0 hover:bg-cream/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="text-lg shrink-0">{ASSET_TYPE_ICONS[asset.asset_type]}</span>
                  <span className="text-sm font-body font-medium text-navy dark:text-slate-100 truncate max-w-[200px]">
                    {asset.name}
                  </span>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <span className="inline-block px-2 py-0.5 bg-cream-dark dark:bg-slate-800 text-navy/60 dark:text-slate-400 text-[10px] font-semibold uppercase rounded-full tracking-wide">
                  {asset.asset_type}
                </span>
              </td>
              <td className="px-5 py-3.5 hidden md:table-cell">
                <span className="text-sm font-body text-navy/50 dark:text-slate-400">
                  {asset.client_id ? asset.client_id.slice(0, 8) + '...' : '--'}
                </span>
              </td>
              <td className="px-5 py-3.5 hidden sm:table-cell">
                <span className="text-sm font-body text-navy/50 dark:text-slate-400">
                  {formatFileSize(asset.file_size)}
                </span>
              </td>
              <td className="px-5 py-3.5 hidden lg:table-cell">
                <span className="text-sm font-body text-navy/50 dark:text-slate-400">
                  {formatDate(asset.created_at)}
                </span>
              </td>
              <td className="px-5 py-3.5 hidden xl:table-cell">
                <div className="flex flex-wrap gap-1">
                  {asset.tags && asset.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 bg-electric/10 text-electric rounded text-[10px] font-body"
                    >
                      {tag}
                    </span>
                  ))}
                  {asset.tags && asset.tags.length > 2 && (
                    <span className="text-navy/40 dark:text-slate-500 text-[10px] font-body">
                      +{asset.tags.length - 2}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
