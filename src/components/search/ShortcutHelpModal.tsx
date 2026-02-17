'use client';

import Modal from '@/components/ui/Modal';
import { getShortcutsByCategory, formatShortcut } from '@/lib/keyboard-shortcuts';

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutHelpModal({ isOpen, onClose }: ShortcutHelpModalProps) {
  const categories = getShortcutsByCategory();

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-navy dark:text-white font-heading mb-4">
          Keyboard Shortcuts
        </h2>
        <div className="space-y-4">
          {Object.entries(categories).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-navy/40 dark:text-white/40 uppercase tracking-wider mb-2 font-heading">
                {category}
              </h3>
              <div className="space-y-1">
                {shortcuts.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-navy/70 dark:text-white/70 font-body">
                      {shortcut.description}
                    </span>
                    <kbd className="px-2 py-0.5 rounded text-xs font-mono bg-cream-dark dark:bg-white/10 text-navy/50 dark:text-white/50">
                      {formatShortcut(shortcut)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
