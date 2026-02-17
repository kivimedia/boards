'use client';

import { useEffect, useRef, ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideCloseButton?: boolean;
  onKeyDown?: (e: KeyboardEvent) => void;
}

const sizeStyles = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function Modal({ isOpen, onClose, children, size = 'md', hideCloseButton, onKeyDown }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      onKeyDown?.(e);
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, onKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] sm:pt-[10vh] px-3 sm:px-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      {/* Backdrop - clicking anywhere on it closes the modal */}
      <div
        className="fixed inset-0 bg-navy/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`
          relative w-full ${sizeStyles[size]}
          bg-white dark:bg-dark-surface rounded-2xl shadow-modal dark:shadow-none dark:border dark:border-slate-700
          animate-in fade-in slide-in-from-bottom-4 duration-200
          max-h-[80vh] overflow-y-auto
        `}
      >
        {/* Close button */}
        {!hideCloseButton && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 p-1.5 rounded-lg bg-cream/80 dark:bg-slate-700/80 hover:bg-cream-dark dark:hover:bg-slate-600 text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 transition-colors backdrop-blur-sm"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
