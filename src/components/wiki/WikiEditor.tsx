'use client';

interface WikiEditorProps {
  content: string;
  onChange: (content: string) => void;
}

/**
 * Simple wiki content editor.
 * Uses a textarea for now; TipTap rich text integration can replace this later.
 */
export default function WikiEditor({ content, onChange }: WikiEditorProps) {
  return (
    <div className="w-full">
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your wiki page content here... (HTML supported)"
        className="
          w-full min-h-[400px] px-4 py-3 rounded-xl
          bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700
          text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 placeholder:font-medium
          focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric
          transition-all duration-200
          font-body text-sm leading-relaxed
          resize-y
        "
      />
      <p className="mt-1.5 text-xs text-navy/40 dark:text-slate-500 font-body">
        HTML content is supported. A rich text editor (TipTap) will be integrated in a future update.
      </p>
    </div>
  );
}
