'use client';

import { ASSET_TYPE_ICONS } from '@/lib/asset-library';
import type { Asset } from '@/lib/types';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

interface AssetGridProps {
  assets: Asset[];
  onAssetClick?: (asset: Asset) => void;
}

export default function AssetGrid({ assets, onAssetClick }: AssetGridProps) {
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {assets.map((asset) => (
        <button
          key={asset.id}
          onClick={() => onAssetClick?.(asset)}
          className="group text-left bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-electric/30 overflow-hidden transition-all duration-200 hover:shadow-lg"
        >
          {/* Thumbnail area */}
          <div className="h-36 bg-cream-dark dark:bg-slate-800 flex items-center justify-center relative">
            {asset.asset_type === 'image' && asset.storage_path ? (
              <div className="absolute inset-0 bg-cream-dark dark:bg-slate-800 flex items-center justify-center">
                <span className="text-4xl">{ASSET_TYPE_ICONS[asset.asset_type]}</span>
              </div>
            ) : (
              <span className="text-4xl">{ASSET_TYPE_ICONS[asset.asset_type]}</span>
            )}
            {/* Type badge */}
            <span className="absolute top-2 right-2 px-2 py-0.5 bg-navy/70 text-white text-[10px] font-semibold uppercase rounded-full tracking-wide">
              {asset.asset_type}
            </span>
          </div>

          {/* Info area */}
          <div className="p-4">
            <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-sm mb-1 truncate group-hover:text-electric transition-colors">
              {asset.name}
            </h3>
            <div className="flex items-center gap-2 text-navy/40 dark:text-slate-500 text-xs font-body mb-2">
              <span>{formatFileSize(asset.file_size)}</span>
              {asset.mime_type && (
                <>
                  <span className="w-1 h-1 rounded-full bg-navy/20 dark:bg-slate-600" />
                  <span className="truncate">{asset.mime_type}</span>
                </>
              )}
            </div>
            {/* Tags */}
            {asset.tags && asset.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {asset.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 bg-electric/10 text-electric rounded text-[10px] font-body"
                  >
                    {tag}
                  </span>
                ))}
                {asset.tags.length > 3 && (
                  <span className="px-1.5 py-0.5 text-navy/40 dark:text-slate-500 text-[10px] font-body">
                    +{asset.tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
