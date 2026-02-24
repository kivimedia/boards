'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Asset, AssetType } from '@/lib/types';
import AssetGrid from './AssetGrid';
import AssetListView from './AssetListView';
import AssetDetail from './AssetDetail';
import AssetFilters, { type AssetFilterValues } from './AssetFilters';
import Input from '@/components/ui/Input';

type ViewMode = 'grid' | 'list';

export default function AssetLibraryContent() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<AssetFilterValues>({
    assetTypes: [],
    clientId: '',
    tags: [],
  });
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filters.clientId) params.set('clientId', filters.clientId);
      if (filters.assetTypes.length === 1) params.set('assetType', filters.assetTypes[0]);
      if (filters.tags.length > 0) params.set('tags', filters.tags.join(','));

      const res = await fetch(`/api/assets?${params.toString()}`);
      const json = await res.json();
      if (json.data) {
        let data = json.data as Asset[];
        // Client-side filter for multiple types
        if (filters.assetTypes.length > 1) {
          data = data.filter((a) => filters.assetTypes.includes(a.asset_type));
        }
        setAssets(data);
      }
    } finally {
      setLoading(false);
    }
  }, [search, filters]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchAssets();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchAssets]);

  const handleFilterChange = useCallback((newFilters: AssetFilterValues) => {
    setFilters(newFilters);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Toolbar */}
        <div className="flex items-center gap-4 mb-6">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <Input
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-white dark:bg-dark-surface rounded-xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-electric text-white'
                  : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-800'
              }`}
              title="Grid view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 transition-colors ${
                viewMode === 'list'
                  ? 'bg-electric text-white'
                  : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-800'
              }`}
              title="List view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>

          {/* Asset count */}
          <p className="text-navy/60 dark:text-slate-400 font-body text-sm shrink-0">
            {assets.length} asset{assets.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Main Content */}
        <div className="flex gap-6">
          {/* Filter sidebar */}
          <AssetFilters onFilterChange={handleFilterChange} />

          {/* Asset display */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="font-body">Loading assets...</span>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <AssetGrid assets={assets} onAssetClick={setSelectedAsset} />
            ) : (
              <AssetListView assets={assets} onAssetClick={setSelectedAsset} />
            )}
          </div>
        </div>
      </div>

      {/* Asset Detail Modal */}
      {selectedAsset && (
        <AssetDetail
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
        />
      )}
    </div>
  );
}
