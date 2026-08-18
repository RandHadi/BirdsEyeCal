import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calendars as demoCalendars,
  dateKey,
  generateEvents,
  type CalendarEvent,
  type CalendarId,
  type CalendarSource,
} from "./mockEvents";
import {
  createGoogleEvent,
  disconnectGoogle,
  getAuthStatus,
  getGoogleCalendars,
  getGoogleEvents,
  type AuthStatus,
} from "./calendarApi";

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(2026, index, 1),
  ),
);

const monthShortNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat("en-US", { month: "short" }).format(
    new Date(2026, index, 1),
  ),
);

const monthTones = [
  "rose",
  "apricot",
  "blue",
  "sage",
  "violet",
  "pink",
  "rose",
  "apricot",
  "blue",
  "sage",
  "violet",
  "pink",
];

const formatDayTitle = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: date.getMinutes() ? "2-digit" : undefined,
  }).format(date);

const isSameLocalDate = (a: Date, b: Date) => dateKey(a) === dateKey(b);

const parseDateInput = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const addDaysToDateInput = (value: string, days: number) => {
  const date = parseDateInput(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
};

const occursOnDate = (event: CalendarEvent, date: Date) => {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return event.start < endOfDay && event.end > startOfDay;
};

type IconName =
  | "bird"
  | "calendar"
  | "chevron-left"
  | "chevron-right"
  | "search"
  | "sparkle"
  | "close"
  | "clock"
  | "pin"
  | "plus"
  | "google"
  | "refresh"
  | "check";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, React.ReactNode> = {
    bird: <><path d="M4 14.5c4.7.4 7.8-2.1 9.4-6.8.7 2.6 2.7 4.5 5.6 5.3-2.7 4.7-7 6.2-12.7 4.5"/><path d="M13.5 8c1.1-1.6 2.5-2.4 4.3-2.5-.1 1.7-.9 3-2.4 4"/><path d="M7 17.5 5 20m5-2.6L9 20"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    "chevron-right": <path d="m9 18 6-6-6-6" />,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    sparkle: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    google: <><path d="M20.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.5 2.7-3.8 2.7-6.4Z"/><path d="M12 21c2.4 0 4.4-.8 5.9-2.2L15 16.5c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0 0 12 21Z"/><path d="M7 13.7a5.4 5.4 0 0 1 0-3.4V8H4a9 9 0 0 0 0 8l3-2.3Z"/><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3L18 5.4A8.8 8.8 0 0 0 4 8l3 2.3c.7-2.1 2.7-3.7 5-3.7Z"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M18.1 15a7 7 0 1 1-.6-7.6L20 10"/></>,
    check: <path d="m5 12 4 4L19 6" />,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function CreateEventModal({
  date,
  calendars,
  canCreateEvents,
  onClose,
  onReconnect,
  onCreated,
}: {
  date: Date;
  calendars: CalendarSource[];
  canCreateEvents: boolean;
  onClose: () => void;
  onReconnect: () => void;
  onCreated: (event: CalendarEvent) => void;
}) {
  const writableCalendars = calendars.filter((calendar) =>
    ["owner", "writer", "writerWithoutPrivateAccess"].includes(
      calendar.accessRole ?? "",
    ),
  );
  const preferredCalendar =
    writableCalendars.find((calendar) => calendar.primary) ?? writableCalendars[0];
  const initialDate = dateKey(date);
  const [title, setTitle] = useState("");
  const [calendarId, setCalendarId] = useState(preferredCalendar?.id ?? "");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!calendarId && preferredCalendar) {
      setCalendarId(preferredCalendar.id);
    }
  }, [calendarId, preferredCalendar]);

  const selectedCalendar = writableCalendars.find(
    (calendar) => calendar.id === calendarId,
  );

  const submitEvent = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Add an event title.");
      return;
    }
    if (!calendarId) {
      setError("Choose a writable calendar.");
      return;
    }

    let start: string;
    let end: string;
    if (allDay) {
      if (endDate < startDate) {
        setError("End date cannot be before the start date.");
        return;
      }
      start = startDate;
      end = addDaysToDateInput(endDate, 1);
    } else {
      const startValue = new Date(`${startDate}T${startTime}`);
      const endValue = new Date(`${endDate}T${endTime}`);
      if (
        !Number.isFinite(startValue.getTime()) ||
        !Number.isFinite(endValue.getTime()) ||
        endValue <= startValue
      ) {
        setError("Event end must be after its start.");
        return;
      }
      start = startValue.toISOString();
      end = endValue.toISOString();
    }

    setSubmitting(true);
    try {
      const created = await createGoogleEvent({
        calendarId,
        title: title.trim(),
        start,
        end,
        allDay,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onCreated(created);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not create the event.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="overlay modal-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-event-title"
      >
        <button className="icon-button modal-close" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
        <div className="create-heading">
          <span className="create-icon"><Icon name="plus" size={20} /></span>
          <div>
            <p className="eyebrow">Google Calendar</p>
            <h2 id="create-event-title">Add to your year.</h2>
          </div>
        </div>

        {!canCreateEvents ? (
          <div className="permission-upgrade">
            <h3>One-time permission update</h3>
            <p>
              BirdsEye currently has read-only access. Reconnect once to allow it to
              create events; editing and deleting remain unavailable.
            </p>
            <button className="button button-primary" onClick={onReconnect}>
              <Icon name="google" size={17} /> Enable event creation
            </button>
          </div>
        ) : !writableCalendars.length ? (
          <div className="permission-upgrade">
            <h3>No writable calendars</h3>
            <p>Your connected calendars are read-only, so Google will not accept new events.</p>
          </div>
        ) : (
          <form className="event-form" onSubmit={(event) => void submitEvent(event)}>
            <label className="field field-wide">
              <span>Event title</span>
              <input
                autoFocus
                maxLength={1024}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What’s happening?"
                required
              />
            </label>

            <label className="field field-wide">
              <span>Calendar</span>
              <select value={calendarId} onChange={(event) => setCalendarId(event.target.value)}>
                {writableCalendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                ))}
              </select>
            </label>

            <label className="all-day-toggle field-wide">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(event) => setAllDay(event.target.checked)}
              />
              <span>All-day event</span>
            </label>

            <label className="field">
              <span>Start date</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
            </label>
            {!allDay && (
              <label className="field">
                <span>Start time</span>
                <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
              </label>
            )}
            <label className="field">
              <span>End date</span>
              <input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} required />
            </label>
            {!allDay && (
              <label className="field">
                <span>End time</span>
                <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
              </label>
            )}

            <label className="field field-wide">
              <span>Location <small>optional</small></span>
              <input maxLength={1024} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Add a place or meeting link" />
            </label>
            <label className="field field-wide">
              <span>Notes <small>optional</small></span>
              <textarea maxLength={8192} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add useful details" rows={3} />
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="create-confirmation field-wide">
              <p>
                This will create one event in <strong>{selectedCalendar?.name}</strong>.
              </p>
              <button className="button button-primary" type="submit" disabled={submitting}>
                <Icon name="plus" size={17} /> {submitting ? "Creating…" : "Create in Google Calendar"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function App() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [enabledCalendars, setEnabledCalendars] = useState<Set<CalendarId>>(
    new Set(demoCalendars.map((calendar) => calendar.id)),
  );
  const [query, setQuery] = useState("");
  const [density, setDensity] = useState<"fit" | "roomy">("fit");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [toast, setToast] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    configured: false,
    connected: false,
    canCreateEvents: false,
  });
  const [statusReady, setStatusReady] = useState(false);
  const [googleCalendars, setGoogleCalendars] = useState<CalendarSource[]>([]);
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const demoEvents = useMemo(() => generateEvents(year), [year]);
  const activeCalendars = authStatus.connected ? googleCalendars : demoCalendars;
  const allEvents = authStatus.connected ? googleEvents : demoEvents;
  const calendarById = useMemo(
    () => new Map(activeCalendars.map((calendar) => [calendar.id, calendar])),
    [activeCalendars],
  );
  const fallbackCalendar: CalendarSource = {
    id: "unknown",
    name: "Calendar",
    color: "#68758b",
    softColor: "#e9edf2",
  };

  useEffect(() => {
    let cancelled = false;
    void getAuthStatus()
      .then((status) => {
        if (!cancelled) setAuthStatus(status);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCalendarError(error instanceof Error ? error.message : "Could not reach the calendar service.");
        }
      })
      .finally(() => {
        if (!cancelled) setStatusReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const authResult = new URLSearchParams(window.location.search).get("auth");
    if (!authResult) return;
    setToast(
      authResult === "connected"
        ? "Google Calendar connected. Loading your year…"
        : "Google Calendar access was not granted.",
    );
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!authStatus.connected) return;
    let cancelled = false;
    setCalendarError("");
    void getGoogleCalendars()
      .then((calendarList) => {
        if (cancelled) return;
        setGoogleCalendars(calendarList);
        const preferred = calendarList.filter(
          (calendar) => calendar.selected || calendar.primary,
        );
        const initial = preferred.length ? preferred : calendarList.slice(0, 1);
        setEnabledCalendars(new Set(initial.map((calendar) => calendar.id)));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCalendarError(error instanceof Error ? error.message : "Could not load Google calendars.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus.connected]);

  const loadLiveEvents = useCallback(async () => {
    if (!authStatus.connected || !googleCalendars.length) return;
    setSyncing(true);
    setCalendarError("");
    try {
      const result = await getGoogleEvents(
        year,
        googleCalendars.map((calendar) => calendar.id),
      );
      setGoogleEvents(result.events);
      setLastSynced(result.syncedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sync Google Calendar.";
      setCalendarError(message);
      if (/not connected|expired/i.test(message)) {
        setAuthStatus((current) => ({
          ...current,
          connected: false,
          canCreateEvents: false,
        }));
        setGoogleCalendars([]);
        setGoogleEvents([]);
        setEnabledCalendars(new Set(demoCalendars.map((calendar) => calendar.id)));
      }
    } finally {
      setSyncing(false);
    }
  }, [authStatus.connected, googleCalendars, year]);

  useEffect(() => {
    void loadLiveEvents();
  }, [loadLiveEvents]);
  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allEvents.filter(
      (event) =>
        enabledCalendars.has(event.calendarId) &&
        (!normalizedQuery ||
          event.title.toLowerCase().includes(normalizedQuery) ||
          event.location?.toLowerCase().includes(normalizedQuery)),
    );
  }, [allEvents, enabledCalendars, query]);

  const eventsByDate = useMemo(() => {
    const result = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((event) => {
      const cursor = new Date(
        Math.max(event.start.getTime(), new Date(year, 0, 1).getTime()),
      );
      cursor.setHours(0, 0, 0, 0);
      const limit = new Date(
        Math.min(event.end.getTime(), new Date(year + 1, 0, 1).getTime()),
      );
      while (cursor < limit) {
        const key = dateKey(cursor);
        const list = result.get(key) ?? [];
        list.push(event);
        result.set(key, list);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    result.forEach((events) =>
      events.sort(
        (a, b) =>
          Number(b.allDay) - Number(a.allDay) ||
          a.start.getTime() - b.start.getTime(),
      ),
    );
    return result;
  }, [filteredEvents, year]);

  const selectedEvents = selectedDate
    ? (eventsByDate.get(dateKey(selectedDate)) ?? []).filter((event) =>
        occursOnDate(event, selectedDate),
      )
    : [];

  const eventDays = eventsByDate.size;
  const focusCalendarIds = new Set(
    activeCalendars
      .filter((calendar) => /focus|deep work/i.test(calendar.name))
      .map((calendar) => calendar.id),
  );
  const focusHours = filteredEvents
    .filter(
      (event) =>
        !event.allDay &&
        (focusCalendarIds.has(event.calendarId) || /focus|deep work/i.test(event.title)),
    )
    .reduce((sum, event) => sum + (event.end.getTime() - event.start.getTime()) / 3_600_000, 0);
  const travelCalendarIds = new Set(
    activeCalendars
      .filter((calendar) => /travel|trip|vacation/i.test(calendar.name))
      .map((calendar) => calendar.id),
  );
  const trips = filteredEvents.filter(
    (event) =>
      travelCalendarIds.has(event.calendarId) ||
      /flight|travel|trip|vacation|holiday|camping/i.test(event.title),
  ).length;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedDate(null);
        setCreateDate(null);
        setShowConnect(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const toggleCalendar = (calendarId: CalendarId) => {
    setEnabledCalendars((current) => {
      const next = new Set(current);
      if (next.has(calendarId)) {
        next.delete(calendarId);
      } else {
        next.add(calendarId);
      }
      return next;
    });
  };

  const jumpToToday = () => {
    setYear(today.getFullYear());
    setSelectedDate(today);
  };

  const connectGoogleCalendar = () => {
    if (!authStatus.configured) {
      setToast("Add the Google OAuth values from .env.example to connect your calendar.");
      return;
    }
    window.location.assign("/api/auth/google/start");
  };

  const openCreateEvent = (date: Date) => {
    setSelectedDate(null);
    setShowConnect(false);
    setCreateDate(date);
  };

  const handleEventCreated = (created: CalendarEvent) => {
    setGoogleEvents((current) =>
      [...current.filter((event) => event.id !== created.id), created].sort(
        (a, b) => a.start.getTime() - b.start.getTime(),
      ),
    );
    setEnabledCalendars((current) => new Set(current).add(created.calendarId));
    setCreateDate(null);
    setToast(`Added “${created.title}” to Google Calendar.`);
    void loadLiveEvents();
  };

  const handleDisconnect = async () => {
    try {
      await disconnectGoogle();
      setAuthStatus((current) => ({
        ...current,
        connected: false,
        canCreateEvents: false,
      }));
      setGoogleCalendars([]);
      setGoogleEvents([]);
      setLastSynced(null);
      setEnabledCalendars(new Set(demoCalendars.map((calendar) => calendar.id)));
      setShowConnect(false);
      setToast("Google Calendar disconnected. Demo data is back on.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not disconnect Google Calendar.");
    }
  };

  const syncLabel = !statusReady
    ? "Checking calendar"
    : syncing
      ? "Syncing calendars"
      : authStatus.connected
        ? "Google synced"
        : authStatus.configured
          ? "Demo data"
          : "Setup required";

  return (
    <div className={`app density-${density}`}>
      <header className="topbar">
        <a className="brand" href="#year-view" aria-label="BirdsEye home">
          <span className="brand-mark"><Icon name="bird" size={23} /></span>
          <span>
            <strong>BirdsEye</strong>
            <small>Annual calendar</small>
          </span>
        </a>

        <div className="topbar-actions">
          <span className={`demo-badge ${authStatus.connected ? "is-connected" : ""}`}>
            <span className={`status-dot ${syncing ? "is-syncing" : ""}`} /> {syncLabel}
          </span>
          {authStatus.connected && (
            <button
              className="button button-primary"
              onClick={() =>
                openCreateEvent(
                  year === today.getFullYear() ? today : new Date(year, 0, 1),
                )
              }
            >
              <Icon name="plus" size={17} /> <span>Add event</span>
            </button>
          )}
          <button
            className={`button ${authStatus.connected ? "button-secondary" : "button-primary"}`}
            onClick={() => setShowConnect(true)}
            aria-label={authStatus.connected ? "Manage Google Calendar" : "Connect Google Calendar"}
          >
            <Icon name="google" size={17} />
            <span className="manage-label">
              {authStatus.connected ? "Manage Google Calendar" : "Connect Google Calendar"}
            </span>
          </button>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow"><Icon name="sparkle" size={15} /> Your year, without the scroll</p>
            <h1 id="page-title">See the shape of your year.</h1>
            <p>Plans, patterns, and breathing room—twelve months in one calm view.</p>
          </div>

          <div className="stats" aria-label={`${year} summary`}>
            <div className="stat">
              <span>Event days</span>
              <strong>{eventDays}</strong>
              <small>{Math.round((eventDays / (year % 4 === 0 ? 366 : 365)) * 100)}% of the year</small>
            </div>
            <div className="stat">
              <span>Focus reserved</span>
              <strong>{Math.round(focusHours)}h</strong>
              <small>Protected time</small>
            </div>
            <div className="stat">
              <span>Trips ahead</span>
              <strong>{trips}</strong>
              <small>Time away</small>
            </div>
          </div>
        </section>

        <section className="calendar-card" id="year-view">
          {calendarError && (
            <div className="sync-error" role="alert">
              <span>{calendarError}</span>
              {authStatus.connected && (
                <button onClick={() => void loadLiveEvents()}>Try again</button>
              )}
            </div>
          )}
          <div className="calendar-toolbar">
            <div className="year-control" aria-label="Choose year">
              <button className="icon-button" aria-label="Previous year" onClick={() => setYear((value) => value - 1)}>
                <Icon name="chevron-left" />
              </button>
              <button className="year-label" onClick={jumpToToday} title="Jump to today">
                <span>{year}</span>
                <small>{year === today.getFullYear() ? "This year" : "Annual view"}</small>
              </button>
              <button className="icon-button" aria-label="Next year" onClick={() => setYear((value) => value + 1)}>
                <Icon name="chevron-right" />
              </button>
              <button className="today-button" onClick={jumpToToday}>Today</button>
            </div>

            <label className="search-box">
              <Icon name="search" size={17} />
              <span className="sr-only">Search events</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your year"
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery("")} type="button">
                  <Icon name="close" size={14} />
                </button>
              )}
            </label>

            <div className="density-control" aria-label="Calendar density">
              <button className={density === "fit" ? "active" : ""} onClick={() => setDensity("fit")}>Fit year</button>
              <button className={density === "roomy" ? "active" : ""} onClick={() => setDensity("roomy")}>Roomy</button>
            </div>
          </div>

          <div className="filter-row" aria-label="Visible calendars">
            <span className="filter-label">Calendars</span>
            {activeCalendars.map((calendar) => {
              const enabled = enabledCalendars.has(calendar.id);
              return (
                <button
                  className={`calendar-filter ${enabled ? "enabled" : ""}`}
                  key={calendar.id}
                  onClick={() => toggleCalendar(calendar.id)}
                  style={{ "--calendar-color": calendar.color, "--calendar-soft": calendar.softColor } as React.CSSProperties}
                  aria-pressed={enabled}
                >
                  <span className="filter-dot">{enabled && <Icon name="check" size={11} />}</span>
                  {calendar.name}
                </button>
              );
            })}
            {query && <span className="result-count">{filteredEvents.length} matching events</span>}
          </div>

          <div className="year-scroll">
            <div className="year-grid" role="grid" aria-label={`${year} calendar`}>
              {monthNames.map((month, monthIndex) => {
                const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
                return (
                  <section className={`month tone-${monthTones[monthIndex]}`} key={month} aria-label={`${month} ${year}`}>
                    <header className="month-header">
                      <span className="month-full">{month}</span>
                      <span className="month-short">{monthShortNames[monthIndex]}</span>
                      <small>{daysInMonth} days</small>
                    </header>
                    <div className="month-days">
                      {Array.from({ length: 31 }, (_, dayIndex) => {
                        const day = dayIndex + 1;
                        if (day > daysInMonth) {
                          return <div className="day day-empty" key={day} aria-hidden="true" />;
                        }
                        const date = new Date(year, monthIndex, day);
                        const dayEvents = eventsByDate.get(dateKey(date)) ?? [];
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const isToday = isSameLocalDate(date, today);
                        const isPast = date < today && !isToday;
                        const visibleEvents = dayEvents.slice(0, density === "roomy" ? 2 : 1);
                        return (
                          <button
                            className={`day ${isWeekend ? "weekend" : ""} ${isToday ? "is-today" : ""} ${isPast && year === today.getFullYear() ? "is-past" : ""}`}
                            key={day}
                            onClick={() => setSelectedDate(date)}
                            aria-label={`${formatDayTitle(date)}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                          >
                            <span className="day-number">{day}</span>
                            <span className="day-content">
                              {visibleEvents.map((event) => {
                                const calendar = calendarById.get(event.calendarId) ?? fallbackCalendar;
                                return (
                                  <span
                                    className="event-pill"
                                    key={event.id}
                                    style={{ "--event-color": calendar.color, "--event-soft": calendar.softColor } as React.CSSProperties}
                                    title={event.title}
                                  >
                                    <span className="event-dot" />
                                    <span>{event.title}</span>
                                  </span>
                                );
                              })}
                              {dayEvents.length > visibleEvents.length && (
                                <span className="more-count">+{dayEvents.length - visibleEvents.length}</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <footer className="calendar-footer">
            <span><span className="weekend-key" /> Weekends</span>
            <span><span className="today-key" /> Today</span>
            <span className="footer-note">Select any date for the full agenda</span>
          </footer>
        </section>
      </main>

      {selectedDate && (
        <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedDate(null)}>
          <aside className="day-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
            <div className="drawer-header">
              <div>
                <p>{selectedDate.getFullYear()}</p>
                <h2 id="drawer-title">{formatDayTitle(selectedDate)}</h2>
              </div>
              <button className="icon-button" aria-label="Close day details" onClick={() => setSelectedDate(null)}>
                <Icon name="close" />
              </button>
            </div>

            <div className="drawer-body">
              <div className="agenda-heading">
                <span>{selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"}</span>
                <button
                  onClick={() =>
                    authStatus.connected
                      ? openCreateEvent(selectedDate)
                      : setToast("Connect Google Calendar to add events.")
                  }
                >
                  <Icon name="plus" size={15} /> Add
                </button>
              </div>

              {selectedEvents.length ? (
                <div className="agenda-list">
                  {selectedEvents.map((event) => {
                    const calendar = calendarById.get(event.calendarId) ?? fallbackCalendar;
                    return (
                      <article className="agenda-event" key={event.id} style={{ "--event-color": calendar.color, "--event-soft": calendar.softColor } as React.CSSProperties}>
                        <span className="agenda-stripe" />
                        <div className="agenda-main">
                          <div className="agenda-topline">
                            <span className="calendar-name">{calendar.name}</span>
                            {event.allDay && <span className="all-day">All day</span>}
                          </div>
                          <h3>{event.title}</h3>
                          <div className="event-meta">
                            {!event.allDay && <span><Icon name="clock" size={15} /> {formatTime(event.start)}–{formatTime(event.end)}</span>}
                            {event.location && <span><Icon name="pin" size={15} /> {event.location}</span>}
                          </div>
                          {event.notes && <p>{event.notes}</p>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-agenda">
                  <span><Icon name="calendar" size={26} /></span>
                  <h3>Nothing planned</h3>
                  <p>A little whitespace looks good on you.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {showConnect && (
        <div className="overlay modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowConnect(false)}>
          <section className="connect-modal" role="dialog" aria-modal="true" aria-labelledby="connect-title">
            <button className="icon-button modal-close" aria-label="Close" onClick={() => setShowConnect(false)}><Icon name="close" /></button>
            <span className="connect-icon"><Icon name="google" size={26} /></span>
            {authStatus.connected ? (
              <>
                <p className="eyebrow">Google Calendar connected</p>
                <h2 id="connect-title">Your year is live.</h2>
                <p>
                  BirdsEye is loading events from {googleCalendars.length} calendar{googleCalendars.length === 1 ? "" : "s"}
                  {authStatus.canCreateEvents ? " and can add new events." : " with read-only access."}
                </p>
                <div className="permission-card connection-summary">
                  <span><Icon name="check" size={16} /> {googleEvents.length} events loaded for {year}</span>
                  <span><Icon name="check" size={16} /> Calendar filters remain on this device</span>
                  <span>
                    <Icon name="check" size={16} />
                    {authStatus.canCreateEvents
                      ? "New events can be created; editing and deleting are disabled"
                      : "Event creation needs a one-time permission update"}
                  </span>
                </div>
                {!authStatus.canCreateEvents && (
                  <button className="button button-primary connect-action" onClick={connectGoogleCalendar}>
                    <Icon name="plus" size={17} /> Enable event creation
                  </button>
                )}
                <button
                  className={`button ${authStatus.canCreateEvents ? "button-primary" : "button-secondary"} connect-action`}
                  disabled={syncing}
                  onClick={() => {
                    void loadLiveEvents();
                    setShowConnect(false);
                  }}
                >
                  <Icon name="refresh" size={18} /> {syncing ? "Syncing…" : "Refresh now"}
                </button>
                <button className="disconnect-button" onClick={() => void handleDisconnect()}>
                  Disconnect Google Calendar
                </button>
                <small>
                  {lastSynced
                    ? `Last synced ${lastSynced.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    : "Waiting for the first sync."}
                </small>
              </>
            ) : (
              <>
                <p className="eyebrow">Calendar connection</p>
                <h2 id="connect-title">Bring your real year into view.</h2>
                <p>BirdsEye will sync your calendars and let you intentionally add new events from this annual view.</p>
                <div className="permission-card">
                  <span><Icon name="check" size={16} /> Read your selected calendars</span>
                  <span><Icon name="check" size={16} /> Create events only after your confirmation</span>
                  <span><Icon name="check" size={16} /> Encrypt authorization in an HttpOnly cookie</span>
                  <span><Icon name="check" size={16} /> Never edit or delete existing events</span>
                </div>
                <button
                  className="button button-primary connect-action"
                  onClick={connectGoogleCalendar}
                  disabled={!statusReady}
                >
                  <Icon name="google" size={18} />
                  {authStatus.configured ? "Continue with Google" : "Google setup required"}
                </button>
                <small>
                  {authStatus.configured
                    ? "You can revoke access at any time."
                    : "Copy .env.example to .env and add your Google OAuth credentials."}
                </small>
              </>
            )}
          </section>
        </div>
      )}

      {createDate && (
        <CreateEventModal
          key={dateKey(createDate)}
          date={createDate}
          calendars={googleCalendars}
          canCreateEvents={authStatus.canCreateEvents}
          onClose={() => setCreateDate(null)}
          onReconnect={connectGoogleCalendar}
          onCreated={handleEventCreated}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default App;
