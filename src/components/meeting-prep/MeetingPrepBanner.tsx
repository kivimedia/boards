'use client';

interface Props {
  clientName: string;
  meetingTitle: string;
  minutesUntil: number;
  onPrepare: () => void;
}

export default function MeetingPrepBanner({ clientName, meetingTitle, minutesUntil, onPrepare }: Props) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-electric/95 text-white px-4 py-2 flex items-center justify-center gap-3 shadow-lg animate-in slide-in-from-top duration-300">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
      </span>
      <span className="text-sm font-medium font-body">
        Meeting with <strong>{clientName}</strong> in {minutesUntil} min
      </span>
      <button
        onClick={onPrepare}
        className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium transition-colors font-body"
      >
        Prepare
      </button>
    </div>
  );
}
