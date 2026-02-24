'use client';

import { useMeetingPrep } from '@/hooks/useMeetingPrep';
import MeetingPrepBanner from './MeetingPrepBanner';
import MeetingPrepPopup from './MeetingPrepPopup';
import MeetingView from './MeetingView';

export default function MeetingPrepProvider({ children }: { children: React.ReactNode }) {
  const {
    upcomingMeeting,
    showBanner,
    showPopup,
    showMeetingView,
    sessionId,
    minutesUntil,
    dismissPopup,
    openPopup,
    startMeeting,
    endMeeting,
  } = useMeetingPrep();

  return (
    <>
      {showBanner && upcomingMeeting && (
        <MeetingPrepBanner
          clientName={upcomingMeeting.clientName}
          meetingTitle={upcomingMeeting.meetingTitle}
          minutesUntil={minutesUntil}
          onPrepare={openPopup}
        />
      )}

      {upcomingMeeting && (
        <MeetingPrepPopup
          clientId={upcomingMeeting.clientId}
          meetingTitle={upcomingMeeting.meetingTitle}
          meetingTime={upcomingMeeting.startTime}
          eventLink={upcomingMeeting.eventLink}
          isOpen={showPopup}
          onClose={dismissPopup}
          onStartMeeting={startMeeting}
        />
      )}

      {showMeetingView && sessionId && upcomingMeeting && (
        <MeetingView
          sessionId={sessionId}
          clientId={upcomingMeeting.clientId}
          isOpen={showMeetingView}
          onClose={endMeeting}
        />
      )}

      {children}
    </>
  );
}
