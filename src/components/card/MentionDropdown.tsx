'use client';

import { Profile } from '@/lib/types';
import Avatar from '@/components/ui/Avatar';

interface MentionDropdownProps {
  profiles: Profile[];
  selectedIndex: number;
  onSelect: (profile: Profile) => void;
  onHover: (index: number) => void;
  filter: string;
}

export default function MentionDropdown({
  profiles,
  selectedIndex,
  onSelect,
  onHover,
  filter,
}: MentionDropdownProps) {
  if (profiles.length === 0) {
    if (filter.length === 0) return null;
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 shadow-lg dark:shadow-none z-[60] p-3 text-sm text-navy/40 dark:text-slate-400 text-center font-body">
        No users found
      </div>
    );
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 shadow-lg dark:shadow-none z-[60] max-h-48 overflow-y-auto">
      {profiles.map((profile, index) => (
        <button
          key={profile.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onSelect(profile); }}
          onMouseEnter={() => onHover(index)}
          className={`
            w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors
            first:rounded-t-xl last:rounded-b-xl
            ${index === selectedIndex
              ? 'bg-electric/10 text-navy dark:text-slate-100'
              : 'text-navy/70 dark:text-slate-300 hover:bg-cream dark:hover:bg-slate-800'
            }
          `}
        >
          <Avatar name={profile.display_name} src={profile.avatar_url} size="sm" />
          <div className="flex-1 text-left">
            <span className="font-medium font-heading text-sm">{profile.display_name}</span>
            {profile.role && (
              <span className="text-navy/30 dark:text-slate-500 text-xs ml-2 font-body">{profile.role}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
