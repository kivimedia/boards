'use client';

import { RefObject, useCallback } from 'react';

interface MarkdownToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
}

function wrapSelection(
  before: string,
  after: string,
  placeholder: string,
  value: string,
  start: number,
  end: number
): { text: string; cursorStart: number; cursorEnd: number } {
  const selected = value.slice(start, end) || placeholder;
  const text = value.slice(0, start) + before + selected + after + value.slice(end);
  const cursorStart = start + before.length;
  const cursorEnd = cursorStart + selected.length;
  return { text, cursorStart, cursorEnd };
}

function prefixLines(
  prefix: string,
  value: string,
  start: number,
  end: number
): { text: string; cursorStart: number; cursorEnd: number } {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end);
  const selectedLines = value.slice(lineStart, lineEnd);
  const prefixed = selectedLines
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line))
    .join('\n');
  const text = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  return { text, cursorStart: lineStart, cursorEnd: lineStart + prefixed.length };
}

export function MarkdownToolbarUI({ textareaRef, value, onChange }: MarkdownToolbarProps) {
  const apply = useCallback(
    (fn: (v: string, s: number, e: number) => { text: string; cursorStart: number; cursorEnd: number }) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const s = ta.selectionStart ?? 0;
      const e = ta.selectionEnd ?? 0;
      const { text, cursorStart, cursorEnd } = fn(value, s, e);
      onChange(text);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(cursorStart, cursorEnd);
      });
    },
    [textareaRef, value, onChange]
  );

  const ACTIONS = [
    {
      label: 'P',
      title: 'Paragraph',
      icon: <span className="text-xs font-bold font-heading leading-none">P</span>,
      fn: (v: string, s: number, e: number) => {
        // Remove heading prefixes (# or ##) from the start of lines
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        const lineEnd = v.indexOf('\n', e) === -1 ? v.length : v.indexOf('\n', e);
        const selectedLines = v.slice(lineStart, lineEnd);
        const cleaned = selectedLines
          .split('\n')
          .map((line) => {
            // Remove heading prefixes
            if (line.startsWith('## ')) return line.slice(3);
            if (line.startsWith('# ')) return line.slice(2);
            return line;
          })
          .join('\n');
        const text = v.slice(0, lineStart) + cleaned + v.slice(lineEnd);
        return { text, cursorStart: lineStart, cursorEnd: lineStart + cleaned.length };
      },
    },
    {
      label: 'H1',
      title: 'Heading 1',
      icon: <span className="text-xs font-bold font-heading leading-none">H1</span>,
      fn: (v: string, s: number, e: number) => prefixLines('# ', v, s, e),
    },
    {
      label: 'H2',
      title: 'Heading 2',
      icon: <span className="text-xs font-bold font-heading leading-none">H2</span>,
      fn: (v: string, s: number, e: number) => prefixLines('## ', v, s, e),
    },
    {
      label: 'B',
      title: 'Bold (Ctrl+B)',
      icon: <span className="text-xs font-extrabold leading-none">B</span>,
      fn: (v: string, s: number, e: number) => wrapSelection('**', '**', 'bold text', v, s, e),
    },
    {
      label: 'I',
      title: 'Italic (Ctrl+I)',
      icon: <span className="text-xs italic leading-none">I</span>,
      fn: (v: string, s: number, e: number) => wrapSelection('*', '*', 'italic text', v, s, e),
    },
    {
      label: 'UL',
      title: 'Bullet list',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5h11M9 12h11M9 19h11" />
          <circle cx="4" cy="5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="19" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      ),
      fn: (v: string, s: number, e: number) => prefixLines('- ', v, s, e),
    },
    {
      label: 'OL',
      title: 'Numbered list',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 5h11M10 12h11M10 19h11M4 7V4l-1 1M4 14a1 1 0 100-2 1 1 0 000 2zM3 19h2M4 19v-2" />
        </svg>
      ),
      fn: (v: string, s: number, e: number) => prefixLines('1. ', v, s, e),
    },
  ];

  const handleLinkInsert = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    // Capture selection BEFORE prompt (prompt steals focus + clears selection)
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? 0;
    const selectedText = value.slice(s, e) || '';

    const url = window.prompt('Enter URL:', 'https://');
    if (!url || url === 'https://') return;

    const linkText = selectedText || 'link text';
    const markdown = `[${linkText}](${url})`;
    const newValue = value.slice(0, s) + markdown + value.slice(e);
    onChange(newValue);

    // Place cursor after the inserted link
    requestAnimationFrame(() => {
      ta.focus();
      const end = s + markdown.length;
      ta.setSelectionRange(end, end);
    });
  }, [textareaRef, value, onChange]);

  return (
    <div className="flex items-center gap-0.5 px-1.5 py-1 bg-white dark:bg-slate-800 border border-cream-dark dark:border-slate-600 rounded-t-lg border-b-0">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          title={action.title}
          onMouseDown={(e) => {
            e.preventDefault(); // keep textarea focus
            apply(action.fn);
          }}
          className="w-7 h-7 flex items-center justify-center rounded text-navy/50 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-700 hover:text-navy dark:hover:text-slate-100 transition-colors"
        >
          {action.icon}
        </button>
      ))}
      {/* Link button - separate because it needs a URL prompt */}
      <button
        type="button"
        title="Insert link (Ctrl+K)"
        onMouseDown={(e) => { e.preventDefault(); handleLinkInsert(); }}
        className="w-7 h-7 flex items-center justify-center rounded text-navy/50 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-700 hover:text-navy dark:hover:text-slate-100 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </button>
      <span className="ml-auto text-[10px] text-navy/25 dark:text-slate-600 pr-1 font-body select-none">md</span>
    </div>
  );
}
