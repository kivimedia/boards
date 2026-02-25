'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSmartSearch } from '@/hooks/useSmartSearch';
import SearchResults from './SearchResults';
import AiBotResponse from './AiBotResponse';
import CreateMenu from './CreateMenu';
import CommandPreview from './CommandPreview';
import SavedCommandsList from './SavedCommandsList';

interface SearchBarProps {
  boardId: string;
  onCardClick: (cardId: string) => void;
  onOpenShareModal?: () => void;
  onCreateCard?: () => void;
  isDark?: boolean;
}

const PLACEHOLDERS = [
  'Search or ask anything about this board...',
  'Try: What tasks are overdue?',
  'Try: Show tasks assigned to Glen',
  'Try: move overdue cards to Urgent',
  'Search cards, people, or ask AI...',
];

export default function SearchBar({ boardId, onCardClick, onOpenShareModal, onCreateCard, isDark }: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    query,
    mode,
    modeOverride,
    searchResults,
    aiResponse,
    aiMeta,
    aiChartData,
    loading,
    aiLoading,
    aiStreaming,
    commandPlan,
    commandLoading,
    commandExecuting,
    commandResults,
    handleInput,
    submitAi,
    submitCommand,
    executeCommand,
    clearCommand,
    toggleMode,
    clear,
    setQuery,
  } = useSmartSearch(boardId);

  // Cycle placeholder text
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Cmd/Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setFocused(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!focused) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [focused]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'ai') {
        submitAi();
      } else if (mode === 'command') {
        submitCommand();
      }
    } else if (e.key === 'Escape') {
      setFocused(false);
      clear();
      inputRef.current?.blur();
    }
  };

  const handleClose = useCallback(() => {
    setFocused(false);
    clear();
  }, [clear]);

  const handleSuggestedQuestion = useCallback((question: string) => {
    setQuery(question);
    handleInput(question);
    // Auto-submit since suggestions are AI follow-ups
    setTimeout(() => {
      submitAi();
    }, 50);
  }, [setQuery, handleInput, submitAi]);

  const handleConnectOwner = useCallback(() => {
    if (onOpenShareModal) {
      onOpenShareModal();
    }
  }, [onOpenShareModal]);

  const handleSaveRecipe = useCallback(async (name: string, command: string) => {
    try {
      await fetch('/api/saved-commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board_id: boardId, name, command }),
      });
    } catch {
      // silent
    }
  }, [boardId]);

  const handleSelectSavedCommand = useCallback((command: string) => {
    setQuery(command);
    handleInput(command);
    // Auto-submit the saved command
    setTimeout(() => {
      submitCommand(command);
    }, 50);
  }, [setQuery, handleInput, submitCommand]);

  const hasContent = query.trim().length > 0;
  const showDropdown = focused && (hasContent || aiResponse || mode === 'command');

  // Mode label and color
  const modeConfig = {
    search: { label: 'Search', color: 'text-navy/40 dark:text-slate-400 bg-cream-dark/50 dark:bg-slate-800/50 hover:bg-cream-dark dark:hover:bg-slate-700', icon: null },
    ai: { label: 'AI', color: 'text-electric bg-electric/10 hover:bg-electric/20', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    command: { label: 'Command', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  };

  const currentModeConfig = modeConfig[mode];

  return (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <div ref={containerRef} className="relative w-full sm:w-auto">
        {/* Search input */}
        <div className={`
          flex items-center gap-2 px-3 py-2 sm:py-1.5 rounded-xl border transition-all
          ${focused
            ? 'w-full sm:w-[320px] lg:w-[420px] bg-white dark:bg-dark-surface border-electric/40 shadow-sm ring-2 ring-electric/10'
            : 'w-full sm:w-[200px] lg:w-[280px] bg-white/80 dark:bg-dark-surface/80 border-cream-dark dark:border-slate-700 hover:border-electric/30'
          }
        `}>
          {/* Search icon */}
          <svg className="w-4 h-4 text-navy/30 dark:text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDERS[placeholderIdx]}
            className="flex-1 text-sm bg-transparent text-navy dark:text-white placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none font-body"
          />

          {/* Mode toggle + indicator */}
          {(hasContent || focused) && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Clickable mode toggle (cycles search -> ai -> command) */}
              <button
                onClick={toggleMode}
                title={`Switch mode (currently: ${mode})${modeOverride ? ' (overridden)' : ''}`}
                className={`
                  flex items-center gap-1 text-[10px] font-body px-1.5 py-0.5 rounded-full transition-colors
                  ${currentModeConfig.color}
                `}
              >
                {currentModeConfig.icon && (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={currentModeConfig.icon} />
                  </svg>
                )}
                {currentModeConfig.label}
                {modeOverride && (
                  <span className="w-1 h-1 rounded-full bg-current opacity-60" />
                )}
              </button>

              {hasContent && (
                <button
                  onClick={handleClose}
                  className="p-0.5 rounded text-navy/30 dark:text-slate-500 hover:text-navy dark:hover:text-white"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Kbd shortcut hint */}
          {!focused && !hasContent && (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-navy/20 dark:text-slate-600 bg-cream-dark/50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded font-body">
              <span className="text-[9px]">&#8984;</span>K
            </kbd>
          )}
        </div>

        {/* Dropdown panel */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 rounded-xl shadow-modal z-[999] overflow-hidden">
            {mode === 'search' && (
              <SearchResults
                results={searchResults}
                loading={loading}
                onCardClick={onCardClick}
                onClose={handleClose}
              />
            )}
            {mode === 'ai' && (
              <>
                {!aiResponse && !aiLoading && (
                  <div className="px-4 py-4 text-center">
                    <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                      Press <kbd className="px-1.5 py-0.5 bg-cream-dark dark:bg-slate-800 rounded text-[10px] font-body">Enter</kbd> to ask the AI assistant
                    </p>
                  </div>
                )}
                <AiBotResponse
                  response={aiResponse}
                  loading={aiLoading}
                  streaming={aiStreaming}
                  query={query}
                  meta={aiMeta}
                  chartData={aiChartData}
                  onSuggestedQuestion={handleSuggestedQuestion}
                  onConnectOwner={onOpenShareModal ? handleConnectOwner : undefined}
                />
              </>
            )}
            {mode === 'command' && (
              <>
                {commandPlan || commandLoading ? (
                  <CommandPreview
                    plan={commandPlan || { actions: [], summary: '' }}
                    loading={commandLoading}
                    executing={commandExecuting}
                    results={commandResults}
                    onExecute={executeCommand}
                    onCancel={() => { clearCommand(); }}
                    onSaveRecipe={handleSaveRecipe}
                    command={query}
                  />
                ) : (
                  <>
                    {hasContent ? (
                      <div className="px-4 py-4 text-center">
                        <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                          Press <kbd className="px-1.5 py-0.5 bg-cream-dark dark:bg-slate-800 rounded text-[10px] font-body">Enter</kbd> to run this command
                        </p>
                      </div>
                    ) : (
                      <SavedCommandsList
                        boardId={boardId}
                        onSelectCommand={handleSelectSavedCommand}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Create button */}
      <CreateMenu boardId={boardId} onCreateCard={onCreateCard} />
    </div>
  );
}
