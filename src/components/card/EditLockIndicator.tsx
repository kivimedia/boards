'use client';

interface EditLockIndicatorProps {
  displayName: string;
  field: string;
}

export default function EditLockIndicator({ displayName, field }: EditLockIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-warning/10 dark:bg-warning/20 rounded text-xs text-warning">
      <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
      <span>{displayName} is editing {field}</span>
    </div>
  );
}
