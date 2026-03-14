import PRChat from '@/components/team-pr/PRChat';

export default function TeamPRLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PRChat />
    </>
  );
}
