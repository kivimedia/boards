'use client';

interface SearchResultItem {
  id: string;
  title: string;
  type?: string;
  list_name?: string;
  subtitle?: string;
  display_name?: string;
  avatar_url?: string;
  content?: string;
}

interface SearchResultsProps {
  results: {
    cards?: SearchResultItem[];
    boards?: SearchResultItem[];
    people?: SearchResultItem[];
    comments?: SearchResultItem[];
  };
  loading: boolean;
  onCardClick: (cardId: string) => void;
  onClose: () => void;
}

const SECTION_ICONS: Record<string, JSX.Element> = {
  cards: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  boards: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
    </svg>
  ),
  people: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  comments: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    </svg>
  ),
};

export default function SearchResults({ results, loading, onCardClick, onClose }: SearchResultsProps) {
  const sections = [
    { key: 'cards', label: 'Cards', items: results.cards || [] },
    { key: 'boards', label: 'Boards', items: results.boards || [] },
    { key: 'people', label: 'People', items: results.people || [] },
    { key: 'comments', label: 'Comments', items: results.comments || [] },
  ].filter((s) => s.items.length > 0);

  const totalResults = sections.reduce((sum, s) => sum + s.items.length, 0);

  if (loading) {
    return (
      <div className="px-4 py-6 text-center">
        <svg className="animate-spin h-5 w-5 text-electric mx-auto mb-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-xs text-navy/40 dark:text-slate-500 font-body">Searching...</p>
      </div>
    );
  }

  if (totalResults === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No results found</p>
      </div>
    );
  }

  return (
    <div className="py-2 max-h-[350px] overflow-y-auto">
      {sections.map((section) => (
        <div key={section.key} className="mb-2">
          <div className="px-3 py-1.5 flex items-center gap-2 text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider font-body">
            {SECTION_ICONS[section.key]}
            {section.label}
            <span className="text-navy/20 dark:text-slate-600">({section.items.length})</span>
          </div>
          {section.items.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (section.key === 'cards') onCardClick(item.id);
                onClose();
              }}
              className="w-full text-left px-4 py-2 hover:bg-cream-dark/50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <p className="text-sm font-medium text-navy dark:text-white truncate font-body">
                {item.title || item.display_name || 'Untitled'}
              </p>
              {(item.list_name || item.subtitle || item.content) && (
                <p className="text-xs text-navy/40 dark:text-slate-500 truncate font-body mt-0.5">
                  {item.list_name ? `in ${item.list_name}` : item.subtitle || item.content}
                </p>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
