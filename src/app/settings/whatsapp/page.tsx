import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import PhoneLinkForm from '@/components/whatsapp/PhoneLinkForm';
import WhatsAppSettings from '@/components/whatsapp/WhatsAppSettings';
import QuickActionManager from '@/components/whatsapp/QuickActionManager';
import DigestConfigForm from '@/components/whatsapp/DigestConfigForm';
import MessageLog from '@/components/whatsapp/MessageLog';

export default async function WhatsAppSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="WhatsApp Integration" />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-navy font-heading">WhatsApp Integration</h2>
              <p className="text-sm text-navy/50 font-body mt-1">
                Link your WhatsApp number, configure notifications, quick actions, and daily digests.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left column */}
              <div className="space-y-6">
                <PhoneLinkForm />
                <WhatsAppSettings />
                <DigestConfigForm />
              </div>

              {/* Right column */}
              <div className="space-y-6">
                <QuickActionManager />
                <MessageLog />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
