import ClientLayout from '@/components/client/ClientLayout';

export default function ClientBoardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientLayout>{children}</ClientLayout>;
}
