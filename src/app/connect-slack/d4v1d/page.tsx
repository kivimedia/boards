'use client';

import { useEffect, useState } from 'react';

// Config IDs for the two teams that need Slack
const CONFIGS = [
  {
    id: '6a2ce915-2e6b-4a46-af33-9d72c2854861',
    label: 'SEO Team - Orlando Stage Rental',
    table: 'seo',
  },
  {
    id: '2f3a9ae4-e166-4392-9f15-ff00a178f534',
    label: 'Historian Team',
    table: 'historian',
  },
];

const SLACK_CLIENT_ID = '6362417875286.10661663574498';
const USER_SCOPES = 'channels:history,files:read,chat:write';

export default function ConnectSlackPage() {
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [channelId, setChannelId] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('slack_error');
    const ok = params.get('slack_success');
    const configId = params.get('config_id');
    if (err) {
      setStatus({ type: 'error', message: `Connection failed: ${err}` });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (ok) {
      const which = CONFIGS.find(c => c.id === configId);
      setStatus({
        type: 'success',
        message: `Connected! Tokens stored for ${which?.label || configId}. They will auto-refresh.`,
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = (config: typeof CONFIGS[0]) => {
    const redirectUri = `${window.location.origin}/api/slack/callback`;
    // State format: configId:channelId:table:redirectPath
    const state = `${config.id}:${channelId}:${config.table}:/connect-slack/d4v1d`;
    const url = `https://slack.com/oauth/v2/authorize?client_id=${SLACK_CLIENT_ID}&user_scope=${USER_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    window.location.href = url;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '20px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        padding: '40px',
        maxWidth: '480px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="#4A154B" style={{ display: 'inline-block' }}>
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a2e', margin: 0 }}>
            Connect Slack
          </h1>
          <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
            Authorize Slack access for image fetching and messaging
          </p>
        </div>

        {status && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '24px',
            fontSize: '13px',
            background: status.type === 'success' ? '#ecfdf5' : '#fef2f2',
            color: status.type === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${status.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          }}>
            {status.type === 'success' ? '  ' : '  '}{status.message}
          </div>
        )}

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
            Slack Channel ID (optional)
          </label>
          <input
            type="text"
            value={channelId}
            onChange={e => setChannelId(e.target.value)}
            placeholder="C0123456789"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
            Right-click a channel in Slack, Copy Link, the ID is the last part
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {CONFIGS.map(config => (
            <button
              key={config.id}
              onClick={() => handleConnect(config)}
              style={{
                width: '100%',
                padding: '14px 20px',
                borderRadius: '10px',
                border: 'none',
                background: '#4A154B',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'background 0.2s',
              }}
              onMouseOver={e => (e.currentTarget.style.background = '#3a1039')}
              onMouseOut={e => (e.currentTarget.style.background = '#4A154B')}
            >
              Connect for {config.label}
            </button>
          ))}
        </div>

        <p style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', marginTop: '24px' }}>
          Scopes requested: channels:history, files:read, chat:write
        </p>
      </div>
    </div>
  );
}
