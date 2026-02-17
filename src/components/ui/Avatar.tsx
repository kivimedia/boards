interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Show online status dot: true = green, false = gray, undefined = hidden */
  online?: boolean;
}

const sizeStyles = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-10 h-10 text-sm',
};

const dotSizeStyles = {
  sm: 'w-2 h-2 -bottom-0 -right-0',
  md: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
  lg: 'w-3 h-3 -bottom-0.5 -right-0.5',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getColor(name: string): string {
  const colors = [
    'bg-electric', 'bg-success', 'bg-warning', 'bg-danger',
    'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function Avatar({ name, src, size = 'md', className = '', online }: AvatarProps) {
  const dot = online !== undefined ? (
    <span
      className={`absolute ${dotSizeStyles[size]} rounded-full ring-2 ring-white dark:ring-dark-surface ${
        online ? 'bg-green-500' : 'bg-slate-400'
      }`}
    />
  ) : null;

  if (src) {
    return (
      <span className="relative inline-block shrink-0">
        <img
          src={src}
          alt={name}
          className={`${sizeStyles[size]} rounded-full object-cover ring-2 ring-white dark:ring-dark-surface ${className}`}
        />
        {dot}
      </span>
    );
  }

  return (
    <span className="relative inline-block shrink-0">
      <div
        className={`
          ${sizeStyles[size]} ${getColor(name)}
          rounded-full flex items-center justify-center
          text-white font-medium ring-2 ring-white dark:ring-dark-surface
          ${className}
        `}
        title={name}
      >
        {getInitials(name)}
      </div>
      {dot}
    </span>
  );
}
