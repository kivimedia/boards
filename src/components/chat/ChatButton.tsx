'use client';

import { useState, useCallback } from 'react';
import type { ChatScope } from '@/lib/types';
import ChatPanel from './ChatPanel';

interface ChatButtonProps {
  cardId?: string;
  boardId?: string;
  clientId?: string;
}

export default function ChatButton({ cardId, boardId, clientId }: ChatButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getDefaultScope = useCallback((): ChatScope => {
    if (cardId) return 'ticket';
    if (boardId) return 'board';
    return 'all_boards';
  }, [cardId, boardId]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={handleToggle}
        className={`
          fixed bottom-4 right-4 z-50
          w-12 h-12 rounded-2xl shadow-lg
          flex items-center justify-center
          transition-all duration-300 ease-out
          ${isOpen
            ? 'bg-navy text-white rotate-0 hover:bg-navy-light'
            : 'bg-electric text-white hover:bg-electric-bright hover:shadow-xl hover:scale-105'
          }
          active:scale-95
        `}
        title={isOpen ? 'Close chat' : 'Open AI chat'}
      >
        {isOpen ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <ChatPanel
          scope={getDefaultScope()}
          cardId={cardId}
          boardId={boardId}
          clientId={clientId}
          onClose={handleClose}
        />
      )}
    </>
  );
}
