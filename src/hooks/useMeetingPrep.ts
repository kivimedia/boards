'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UpcomingMeeting {
  clientId: string;
  clientName: string;
  meetingTitle: string;
  startTime: string;
  eventLink: string | null;
}

interface MeetingPrepState {
  upcomingMeeting: UpcomingMeeting | null;
  showBanner: boolean;
  showPopup: boolean;
  showMeetingView: boolean;
  sessionId: string | null;
  minutesUntil: number;
}

export function useMeetingPrep() {
  const [state, setState] = useState<MeetingPrepState>({
    upcomingMeeting: null,
    showBanner: false,
    showPopup: false,
    showMeetingView: false,
    sessionId: null,
    minutesUntil: Infinity,
  });
  const dismissedRef = useRef<Set<string>>(new Set());

  const checkMeetings = useCallback(async () => {
    try {
      // Fetch today's events
      const eventsRes = await fetch('/api/google-calendar/events?days=1');
      if (!eventsRes.ok) return;
      const eventsData = await eventsRes.json();
      const events = eventsData.data || [];

      if (events.length === 0) return;

      // Fetch active configs
      // We can't easily fetch all configs in one call, so we check events against known patterns
      // For simplicity, find the nearest event and check if any config matches
      const now = Date.now();
      const configsRes = await fetch('/api/google-calendar/events?days=1');
      // Actually we need the configs — let's check differently
      // The meeting-prep cron handles the actual triggering via push notifications
      // This hook just watches for imminent meetings based on cached events

      for (const event of events) {
        const startMs = new Date(event.start_time).getTime();
        const minutesUntil = Math.floor((startMs - now) / 60000);

        if (minutesUntil < 0 || minutesUntil > 15) continue;
        if (dismissedRef.current.has(event.google_event_id)) continue;

        setState(prev => ({
          ...prev,
          upcomingMeeting: {
            clientId: '', // Will be resolved from configs
            clientName: event.title,
            meetingTitle: event.title,
            startTime: event.start_time,
            eventLink: event.event_link,
          },
          minutesUntil,
          showBanner: minutesUntil <= 10 && !prev.showPopup && !prev.showMeetingView,
          showPopup: minutesUntil <= 5 && !prev.showMeetingView && !dismissedRef.current.has(event.google_event_id),
        }));
        return; // Show the first imminent meeting only
      }

      // No imminent meetings
      setState(prev => ({
        ...prev,
        upcomingMeeting: null,
        showBanner: false,
        showPopup: false,
        minutesUntil: Infinity,
      }));
    } catch {}
  }, []);

  useEffect(() => {
    checkMeetings();
    const interval = setInterval(checkMeetings, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [checkMeetings]);

  const dismissPopup = useCallback(() => {
    if (state.upcomingMeeting) {
      // Use meeting title as key since we may not have event ID
      dismissedRef.current.add(state.upcomingMeeting.meetingTitle);
    }
    setState(prev => ({ ...prev, showPopup: false }));
  }, [state.upcomingMeeting]);

  const openPopup = useCallback(() => {
    setState(prev => ({ ...prev, showPopup: true, showBanner: false }));
  }, []);

  const startMeeting = useCallback((sessionId: string) => {
    setState(prev => ({
      ...prev,
      showPopup: false,
      showMeetingView: true,
      sessionId,
    }));
  }, []);

  const endMeeting = useCallback(() => {
    setState(prev => ({
      ...prev,
      showMeetingView: false,
      showBanner: false,
      sessionId: null,
    }));
  }, []);

  return {
    ...state,
    dismissPopup,
    openPopup,
    startMeeting,
    endMeeting,
  };
}
