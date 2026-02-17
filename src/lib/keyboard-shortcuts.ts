export interface ShortcutDefinition {
  key: string;
  modifiers?: ('ctrl' | 'meta' | 'shift' | 'alt')[];
  description: string;
  category: string;
}

export const SHORTCUTS: Record<string, ShortcutDefinition> = {
  'open-search': {
    key: 'k',
    modifiers: ['meta'],
    description: 'Open global search',
    category: 'Navigation',
  },
  'open-search-ctrl': {
    key: 'k',
    modifiers: ['ctrl'],
    description: 'Open global search',
    category: 'Navigation',
  },
  'show-help': {
    key: '?',
    modifiers: [],
    description: 'Show keyboard shortcuts',
    category: 'Help',
  },
  'go-home': {
    key: 'h',
    modifiers: ['meta', 'shift'],
    description: 'Go to dashboard',
    category: 'Navigation',
  },
  'go-settings': {
    key: ',',
    modifiers: ['meta'],
    description: 'Go to settings',
    category: 'Navigation',
  },
  'escape': {
    key: 'Escape',
    modifiers: [],
    description: 'Close modal/panel',
    category: 'General',
  },
  'new-card': {
    key: 'n',
    modifiers: ['meta', 'shift'],
    description: 'New card (on current board)',
    category: 'Cards',
  },
};

export function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutDefinition): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;

  const mods = shortcut.modifiers || [];
  if (mods.includes('ctrl') !== event.ctrlKey && !mods.includes('meta')) return false;
  if (mods.includes('meta') !== event.metaKey && !mods.includes('ctrl')) return false;
  if (mods.includes('shift') !== event.shiftKey) return false;
  if (mods.includes('alt') !== event.altKey) return false;

  // For Cmd+K / Ctrl+K: either meta or ctrl should work
  if ((mods.includes('meta') || mods.includes('ctrl')) && (event.metaKey || event.ctrlKey)) {
    return true;
  }

  return true;
}

export function formatShortcut(shortcut: ShortcutDefinition): string {
  const parts: string[] = [];
  const mods = shortcut.modifiers || [];
  if (mods.includes('ctrl') || mods.includes('meta')) parts.push('⌘');
  if (mods.includes('shift')) parts.push('⇧');
  if (mods.includes('alt')) parts.push('⌥');
  parts.push(shortcut.key.toUpperCase());
  return parts.join('');
}

export function getShortcutsByCategory(): Record<string, ShortcutDefinition[]> {
  const categories: Record<string, ShortcutDefinition[]> = {};
  for (const shortcut of Object.values(SHORTCUTS)) {
    if (!categories[shortcut.category]) {
      categories[shortcut.category] = [];
    }
    categories[shortcut.category].push(shortcut);
  }
  return categories;
}
