'use client';

import { useState, useEffect } from 'react';

export default function PushPermissionPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      setVisible(true);
    }
  }, []);

  const handleEnable = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setVisible(false);

        // Register service worker and subscribe
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const registration = await navigator.serviceWorker.register('/sw.js');
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
          });

          const json = subscription.toJSON();

          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: json.endpoint,
              p256dh: json.keys?.p256dh,
              auth_key: json.keys?.auth,
            }),
          });
        }
      } else {
        setVisible(false);
      }
    } catch (err) {
      console.error('Failed to enable push notifications:', err);
    }
  };

  if (!visible) return null;

  return (
    <div className="bg-electric/10 rounded-xl p-4 inline-flex items-center gap-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-electric/20 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-navy dark:text-white">Stay updated</p>
          <p className="text-xs text-navy/50 dark:text-white/50">Get notified about card assignments, due dates, and mentions.</p>
        </div>
      </div>
      <button
        onClick={handleEnable}
        className="shrink-0 px-4 py-2 bg-electric text-white text-sm font-medium rounded-xl hover:bg-electric/90 transition-colors"
      >
        Enable Push Notifications
      </button>
    </div>
  );
}
