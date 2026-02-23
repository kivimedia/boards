'use client';

import { RefObject, useCallback } from 'react';

interface MarkdownToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
}

interface FormatAction {
  label: string;
  title: string;
  icon: React.ReactNode;
  action: (value: string, start: number, end: number) => { text: string; cursor: number };
}

function wrapSelection(
  before: string,
  after: string,
  placeholder: string,
  value: string,
  start: number,
  end: number
) {
  const selected = value.slice(start, end) || placeholder;
  const text = value.slice(0, start) + before + selected + after + value.slice(end);
  const cursor = start + before.length + selected.length + after.length;
  return { text, cursor };
}

function prefixLines(
  prefix: string,
  value: string,
  start: number,
  end: number
) {
  // Find the start of the first line
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end);
  const selectedLines = value.slice(lineStart, lineEnd);
  const prefixed = selectedLines
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line))
    .join('\n');
  const text = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  const cursor = lineStart + prefixed.length;
  return { text, cursor };
}

const ACTIONS: FormatAction[] = [
  {
    label: 'H1',
    title: 'Heading 1',
    icon: <span className="text-xs font-bold font-heading">H1</span>,
    action: (v, s, e) => prefixLines('# ', v, s, e),
  },
  {
    label: 'H2',
    title: 'Heading 2',
    icon: <span className="text-xs font-bold font-heading">H2</span>,
    action: (v, s, e) => prefixLines('## ', v, s, e),
  },
  {
    label: 'Bold',
    title: 'Bold (Ctrl+B)',
    icon: <span className="text-xs font-bold">B</span>,
    action: (v, s, e) => wrapSelection('**', '**', 'bold text', v, s, e),
  },
  {
    label: 'Italic',
    title: 'Italic (Ctrl+I)',
    icon: <span className="text-xs italic">I</span>,
    action: (v, s, e) => wrapSelection('*', '*', 'italic text', v, s, e),
  },
  {
    label: 'Bullets',
    title: 'Bullet list',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        <circle cx="2" cy="6" r="1" fill="currentColor" />
        <circle cx="2" cy="10" r="1" fill="currentColor" />
        <circle cx="2" cy="14" r="1" fill="currentColor" />
        <circle cx="2" cy="18" r="1" fill="currentColor" />
      </svg>
    ),
    action: (v, s, e) => prefixLines('- ', v, s, e),
  },
  {
    label: '1.',
    title: 'Numbered list',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
    action: (v, s, e) => prefixLines('1. ', v, s, e),
  },
  {
    label: 'Code',
    title: 'Inline code',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    action: (v, s, e) => wrapSelection('`', '`', 'code', v, s, e),
  },
];

export default function MarkdownToolbar({ textareaRef, value, onChange }: MarkdownToolbarProps) {
  const applyFormat = useCallback(
    (action: FormatAction) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const { text, cursor } = action.action(value, start, end);
      onChange(text);
      // Restore focus + cursor after React re-render
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(cursor, cursor);
      });
    },
    [textareaRef, value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'b' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        applyFormat(ACTIONS[2]); // Bold
      } else if (e.key === 'i' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        applyFormat(ACTIONS[3]); // Italic
      }
    },
    [applyFormat]
  );

  return { applyFormat, handleKeyDown };
}

// Toolbar UI — rendered inline
export function MarkdownToolbarUI({
  textareaRef,
  value,
  onChange,
}: MarkdownToolbarProps) {
  const { applyFormat } = MarkdownToolbar({ textareaRef, value, onChange });

  return (
    <div className="flex items-center gap-0.5 px-1 py-1 bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 rounded-t-lg border-b-0">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          title={action.title}
          onMouseDown={(e) => {
            e.preventDefault(); // prevent textarea blur
            applyFormat(action);
          }}
          className="w-7 h-7 flex items-center justify-center rounded text-navy/50 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-700 hover:text-navy dark:hover:text-slate-100 transition-colors"
        >
          {action.icon}
        </button>
      ))}
      <span className="ml-auto text-[10px] text-navy/25 dark:text-slate-600 pr-1 font-body">Markdown</span>
    </div>
  );
}
