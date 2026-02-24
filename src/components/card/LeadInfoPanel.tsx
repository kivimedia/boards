'use client';

import { useState, useEffect } from 'react';
import { BalloonEventType, LeadSource } from '@/lib/types';

interface LeadInfoPanelProps {
  cardId: string;
  eventDate: string | null;
  eventType: string | null;
  venueName: string | null;
  venueCity: string | null;
  estimatedValue: number | null;
  leadSource: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  followUpDate: string | null;
  onUpdate: (updates: Record<string, unknown>) => void;
}

const EVENT_TYPES: BalloonEventType[] = [
  'wedding', 'corporate', 'birthday', 'baby_shower', 'bridal_shower',
  'grand_opening', 'holiday', 'school_event', 'nonprofit', 'other',
];

const LEAD_SOURCES: LeadSource[] = [
  'google_ads', 'organic_search', 'instagram', 'facebook',
  'referral', 'repeat_client', 'venue_referral', 'other',
];

function formatEventType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatLeadSource(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LeadInfoPanel({
  eventDate,
  eventType,
  venueName,
  venueCity,
  estimatedValue,
  leadSource,
  clientEmail,
  clientPhone,
  followUpDate,
  onUpdate,
}: LeadInfoPanelProps) {
  const [localEventDate, setLocalEventDate] = useState(eventDate ?? '');
  const [localEventType, setLocalEventType] = useState(eventType ?? '');
  const [localVenueName, setLocalVenueName] = useState(venueName ?? '');
  const [localVenueCity, setLocalVenueCity] = useState(venueCity ?? '');
  const [localValue, setLocalValue] = useState(estimatedValue?.toString() ?? '');
  const [localLeadSource, setLocalLeadSource] = useState(leadSource ?? '');
  const [localEmail, setLocalEmail] = useState(clientEmail ?? '');
  const [localPhone, setLocalPhone] = useState(clientPhone ?? '');
  const [localFollowUp, setLocalFollowUp] = useState(followUpDate ?? '');

  // Sync from props when card data refreshes
  useEffect(() => {
    setLocalEventDate(eventDate ?? '');
    setLocalEventType(eventType ?? '');
    setLocalVenueName(venueName ?? '');
    setLocalVenueCity(venueCity ?? '');
    setLocalValue(estimatedValue?.toString() ?? '');
    setLocalLeadSource(leadSource ?? '');
    setLocalEmail(clientEmail ?? '');
    setLocalPhone(clientPhone ?? '');
    setLocalFollowUp(followUpDate ?? '');
  }, [eventDate, eventType, venueName, venueCity, estimatedValue, leadSource, clientEmail, clientPhone, followUpDate]);

  const handleBlur = (field: string, value: string | number | null) => {
    onUpdate({ [field]: value || null });
  };

  const inputClass =
    'w-full px-2.5 py-1.5 rounded-lg bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-300/40 focus:border-pink-400 transition-colors font-body';
  const selectClass =
    'w-full px-2.5 py-1.5 rounded-lg bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-pink-300/40 focus:border-pink-400 transition-colors font-body appearance-none';
  const labelClass = 'text-[11px] font-medium text-navy/50 dark:text-slate-400 uppercase tracking-wide';

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-pink-500 dark:text-pink-400 font-heading flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        Lead Info
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {/* Event Date */}
        <div>
          <label className={labelClass}>Event Date</label>
          <input
            type="date"
            value={localEventDate ? localEventDate.split('T')[0] : ''}
            onChange={(e) => setLocalEventDate(e.target.value)}
            onBlur={() => handleBlur('event_date', localEventDate ? new Date(localEventDate + 'T00:00:00').toISOString() : null)}
            className={inputClass}
          />
        </div>

        {/* Event Type */}
        <div>
          <label className={labelClass}>Event Type</label>
          <select
            value={localEventType}
            onChange={(e) => {
              setLocalEventType(e.target.value);
              onUpdate({ event_type: e.target.value || null });
            }}
            className={selectClass}
          >
            <option value="">Select...</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{formatEventType(t)}</option>
            ))}
          </select>
        </div>

        {/* Venue Name */}
        <div>
          <label className={labelClass}>Venue</label>
          <input
            type="text"
            value={localVenueName}
            onChange={(e) => setLocalVenueName(e.target.value)}
            onBlur={() => handleBlur('venue_name', localVenueName)}
            placeholder="Venue name"
            className={inputClass}
          />
        </div>

        {/* Venue City */}
        <div>
          <label className={labelClass}>City</label>
          <input
            type="text"
            value={localVenueCity}
            onChange={(e) => setLocalVenueCity(e.target.value)}
            onBlur={() => handleBlur('venue_city', localVenueCity)}
            placeholder="City"
            className={inputClass}
          />
        </div>

        {/* Estimated Value */}
        <div>
          <label className={labelClass}>Est. Value ($)</label>
          <input
            type="number"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => handleBlur('estimated_value', localValue ? parseFloat(localValue) : null)}
            placeholder="0.00"
            min="0"
            step="0.01"
            className={inputClass}
          />
        </div>

        {/* Lead Source */}
        <div>
          <label className={labelClass}>Lead Source</label>
          <select
            value={localLeadSource}
            onChange={(e) => {
              setLocalLeadSource(e.target.value);
              onUpdate({ lead_source: e.target.value || null });
            }}
            className={selectClass}
          >
            <option value="">Select...</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>{formatLeadSource(s)}</option>
            ))}
          </select>
        </div>

        {/* Client Email */}
        <div>
          <label className={labelClass}>Client Email</label>
          <input
            type="email"
            value={localEmail}
            onChange={(e) => setLocalEmail(e.target.value)}
            onBlur={() => handleBlur('client_email', localEmail)}
            placeholder="email@example.com"
            className={inputClass}
          />
        </div>

        {/* Client Phone */}
        <div>
          <label className={labelClass}>Client Phone</label>
          <input
            type="tel"
            value={localPhone}
            onChange={(e) => setLocalPhone(e.target.value)}
            onBlur={() => handleBlur('client_phone', localPhone)}
            placeholder="(555) 555-5555"
            className={inputClass}
          />
        </div>

        {/* Follow-Up Date */}
        <div className="col-span-2">
          <label className={labelClass}>Follow-Up Date</label>
          <input
            type="date"
            value={localFollowUp ? localFollowUp.split('T')[0] : ''}
            onChange={(e) => setLocalFollowUp(e.target.value)}
            onBlur={() => handleBlur('follow_up_date', localFollowUp ? new Date(localFollowUp + 'T00:00:00').toISOString() : null)}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}
