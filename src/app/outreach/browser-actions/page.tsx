import { Metadata } from 'next';
import SidebarWithBoards from '@/components/layout/SidebarWithBoards';
import Header from '@/components/layout/Header';
import BrowserActionLog from '@/components/outreach/BrowserActionLog';

export const metadata: Metadata = {
  title: 'Browser Actions - LinkedIn Outreach',
};

export default function BrowserActionsPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-cream dark:bg-dark-bg">
      <SidebarWithBoards />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <BrowserActionLog />
        </main>
      </div>
    </div>
  );
}
