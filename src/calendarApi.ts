import type { CalendarEvent, CalendarSource } from "./mockEvents";

export interface AuthStatus {
  configured: boolean;
  connected: boolean;
  canCreateEvents: boolean;
}

export interface CreateEventInput {
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  notes?: string;
}

interface CalendarListResponse {
  calendars: Array<{
    id: string;
    name: string;
    color: string;
    primary?: boolean;
    selected?: boolean;
    accessRole?: string;
    timeZone?: string;
  }>;
}

interface RemoteCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  location?: string;
  notes?: string;
  eventType?: string;
  htmlLink?: string;
}

interface EventsResponse {
  events: RemoteCalendarEvent[];
  syncedAt: string;
}

interface CreateEventResponse {
  event: RemoteCalendarEvent;
}

const requestJson = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...options?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Calendar request failed.");
  return payload;
};

const softColor = (color: string) => {
  if (/^#[0-9a-f]{6}$/i.test(color)) return `${color}24`;
  return "#e8ecfb";
};

const parseAllDayDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};

const toCalendarEvent = (event: RemoteCalendarEvent): CalendarEvent => ({
  ...event,
  start: event.allDay ? parseAllDayDate(event.start) : new Date(event.start),
  end: event.allDay ? parseAllDayDate(event.end) : new Date(event.end),
});

export const getAuthStatus = () => requestJson<AuthStatus>("/api/auth/status");

export const getGoogleCalendars = async (): Promise<CalendarSource[]> => {
  const response = await requestJson<CalendarListResponse>("/api/calendars");
  return response.calendars.map((calendar) => ({
    ...calendar,
    softColor: softColor(calendar.color),
  }));
};

export const getGoogleEvents = async (
  year: number,
  calendarIds: string[],
) => {
  const params = new URLSearchParams({
    year: String(year),
    timeMin: new Date(year, 0, 1).toISOString(),
    timeMax: new Date(year + 1, 0, 1).toISOString(),
  });
  calendarIds.forEach((calendarId) => params.append("calendarId", calendarId));
  const response = await requestJson<EventsResponse>(`/api/events?${params}`);
  return {
    events: response.events.map(toCalendarEvent),
    syncedAt: new Date(response.syncedAt),
  };
};

export const disconnectGoogle = () =>
  requestJson<{ connected: false }>("/api/auth/logout", { method: "POST" });

export const createGoogleEvent = async (input: CreateEventInput) => {
  const response = await requestJson<CreateEventResponse>("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return toCalendarEvent(response.event);
};
