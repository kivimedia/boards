'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CardDependency, Card, DependencyType } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';

interface CardDependenciesProps {
  cardId: string;
  boardId: string;
  onRefresh: () => void;
}

const dependencyTypeConfig: Record<DependencyType, { label: string; color: string; bgColor: string }> = {
  blocked_by: { label: 'Blocked By', color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' },
  blocking: { label: 'Blocking', color: 'text-orange-600', bgColor: 'bg-orange-50 border-orange-200' },
  related: { label: 'Related', color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200' },
  spawned_from: { label: 'Spawned From', color: 'text-purple-600', bgColor: 'bg-purple-50 border-purple-200' },
};

const dependencyTypeBadge: Record<DependencyType, { bg: string; text: string }> = {
  blocked_by: { bg: 'bg-red-100', text: 'text-red-700' },
  blocking: { bg: 'bg-orange-100', text: 'text-orange-700' },
  related: { bg: 'bg-blue-100', text: 'text-blue-700' },
  spawned_from: { bg: 'bg-purple-100', text: 'text-purple-700' },
};

export default function CardDependencies({ cardId, boardId, onRefresh }: CardDependenciesProps) {
  const [dependencies, setDependencies] = useState<CardDependency[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedType, setSelectedType] = useState<DependencyType>('blocked_by');
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const supabase = createClient();

  useEffect(() => {
    fetchDependencies();
  }, [cardId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        searchCards(searchQuery.trim());
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchDependencies = async () => {
    const { data } = await supabase
      .from('card_dependencies')
      .select('*, target_card:cards!card_dependencies_target_card_id_fkey(*)')
      .eq('source_card_id', cardId);

    setDependencies(data || []);
  };

  const searchCards = async (query: string) => {
    setIsSearching(true);

    const { data } = await supabase
      .from('cards')
      .select('*')
      .neq('id', cardId)
      .ilike('title', `%${query}%`)
      .limit(10);

    setSearchResults(data || []);
    setShowDropdown(true);
    setIsSearching(false);
  };

  const handleSelectCard = (card: Card) => {
    setSelectedCard(card);
    setSearchQuery(card.title);
    setShowDropdown(false);
  };

  const handleAddDependency = async () => {
    if (!selectedCard || !user) return;
    setLoading(true);

    // Check if dependency already exists
    const existing = dependencies.find(
      (d) => d.target_card_id === selectedCard.id && d.dependency_type === selectedType
    );

    if (existing) {
      setLoading(false);
      return;
    }

    await supabase.from('card_dependencies').insert({
      source_card_id: cardId,
      target_card_id: selectedCard.id,
      dependency_type: selectedType,
      created_by: user.id,
    });

    setSelectedCard(null);
    setSearchQuery('');
    setSearchResults([]);
    await fetchDependencies();
    setLoading(false);
    onRefresh();
  };

  const handleRemoveDependency = async (dependencyId: string) => {
    await supabase.from('card_dependencies').delete().eq('id', dependencyId);
    await fetchDependencies();
    onRefresh();
  };

  const groupedDependencies: Record<DependencyType, CardDependency[]> = {
    blocked_by: dependencies.filter((d) => d.dependency_type === 'blocked_by'),
    blocking: dependencies.filter((d) => d.dependency_type === 'blocking'),
    related: dependencies.filter((d) => d.dependency_type === 'related'),
    spawned_from: dependencies.filter((d) => d.dependency_type === 'spawned_from'),
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 mb-3 font-heading">
        Dependencies ({dependencies.length})
      </h3>

      {/* Add dependency */}
      <div className="rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 p-4 mb-4">
        <div className="space-y-3">
          {/* Search input */}
          <div ref={searchRef} className="relative">
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedCard(null);
              }}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              placeholder="Search cards..."
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
            />

            {/* Search dropdown */}
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 shadow-lg dark:shadow-none z-20 max-h-48 overflow-y-auto">
                {isSearching ? (
                  <div className="p-3 text-sm text-navy/40 dark:text-slate-400 text-center font-body">
                    Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-3 text-sm text-navy/40 dark:text-slate-400 text-center font-body">
                    No cards found
                  </div>
                ) : (
                  searchResults.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => handleSelectCard(card)}
                      className="w-full text-left px-3 py-2 text-sm text-navy dark:text-slate-100 hover:bg-cream dark:hover:bg-slate-800 transition-colors font-body first:rounded-t-xl last:rounded-b-xl"
                    >
                      {card.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Type selector and add button */}
          <div className="flex gap-2">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as DependencyType)}
              className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 font-body"
            >
              <option value="blocked_by">Blocked By</option>
              <option value="blocking">Blocking</option>
              <option value="related">Related</option>
            </select>
            <Button
              size="sm"
              onClick={handleAddDependency}
              disabled={!selectedCard}
              loading={loading}
            >
              Add
            </Button>
          </div>
        </div>
      </div>

      {/* Dependencies grouped by type */}
      <div className="space-y-3">
        {(Object.keys(groupedDependencies) as DependencyType[]).map((type) => {
          const deps = groupedDependencies[type];
          if (deps.length === 0) return null;

          const config = dependencyTypeConfig[type];

          return (
            <div key={type}>
              <h4 className={`text-xs font-semibold mb-2 uppercase tracking-wider font-heading ${config.color}`}>
                {config.label} ({deps.length})
              </h4>
              <div className="space-y-1.5">
                {deps.map((dep) => (
                  <div
                    key={dep.id}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all group ${config.bgColor}`}
                  >
                    <span className="flex-1 text-sm text-navy dark:text-slate-100 font-body truncate">
                      {dep.target_card?.title || 'Unknown card'}
                    </span>
                    <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${dependencyTypeBadge[type].bg} ${dependencyTypeBadge[type].text}`}>
                      {type.replace('_', ' ')}
                    </span>
                    <button
                      onClick={() => handleRemoveDependency(dep.id)}
                      className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded-lg text-navy/30 hover:text-danger hover:bg-white/50 transition-all"
                      title="Remove dependency"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {dependencies.length === 0 && (
          <p className="text-sm text-navy/30 dark:text-slate-500 text-center py-4 font-body">
            No dependencies
          </p>
        )}
      </div>
    </div>
  );
}
