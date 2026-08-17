export type CalendarId = "work" | "personal" | "focus" | "travel";

export interface CalendarSource {
  id: CalendarId;
  name: string;
  color: string;
  softColor: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  calendarId: CalendarId;
  location?: string;
  notes?: string;
}

export const calendars: CalendarSource[] = [
  { id: "work", name: "Work", color: "#4f6edb", softColor: "#e8ecfb" },
  { id: "personal", name: "Personal", color: "#d96d5f", softColor: "#fae9e5" },
  { id: "focus", name: "Focus", color: "#398b77", softColor: "#e1f2ec" },
  { id: "travel", name: "Travel", color: "#b37624", softColor: "#faefd9" },
];

const at = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) => new Date(year, month, day, hour, minute, 0, 0);

const addHours = (date: Date, hours: number) =>
  new Date(date.getTime() + hours * 60 * 60 * 1000);

export const dateKey = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

export const generateEvents = (year: number): CalendarEvent[] => {
  const events: CalendarEvent[] = [];
  let id = 0;

  const add = (
    title: string,
    start: Date,
    end: Date,
    calendarId: CalendarId,
    options: Pick<CalendarEvent, "allDay" | "location" | "notes">,
  ) => {
    events.push({
      id: `demo-${year}-${id++}`,
      title,
      start,
      end,
      calendarId,
      ...options,
    });
  };

  // A light recurring rhythm makes the year useful without filling every cell.
  const cursor = at(year, 0, 1);
  const endOfYear = at(year + 1, 0, 1);
  let week = 0;
  while (cursor < endOfYear) {
    const day = cursor.getDay();
    const month = cursor.getMonth();
    const date = cursor.getDate();

    if (day === 1 && date > 2) {
      const start = at(year, month, date, 10);
      add("Weekly team sync", start, addHours(start, 0.75), "work", {
        allDay: false,
        location: "Google Meet",
        notes: "Weekly priorities and decisions.",
      });
      week += 1;
    }

    if (day === 2 && week % 2 === 0) {
      const start = at(year, month, date, 9);
      add("Deep work", start, addHours(start, 2), "focus", {
        allDay: false,
        notes: "Protected maker time.",
      });
    }

    if (day === 4 && week % 2 === 1) {
      const start = at(year, month, date, 16);
      add("Strength training", start, addHours(start, 1), "personal", {
        allDay: false,
        location: "Neighborhood gym",
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  const milestones: Array<{
    title: string;
    month: number;
    day: number;
    hour?: number;
    duration?: number;
    calendar: CalendarId;
    allDay?: boolean;
    location?: string;
    notes?: string;
    endDay?: number;
  }> = [
    { title: "Annual planning", month: 0, day: 8, hour: 9, duration: 3, calendar: "work", notes: "Set the year's three outcomes." },
    { title: "Dad's birthday", month: 0, day: 24, calendar: "personal", allDay: true },
    { title: "Design review", month: 1, day: 12, hour: 13, duration: 1, calendar: "work", location: "Studio 3" },
    { title: "Napa weekend", month: 1, day: 20, endDay: 22, calendar: "travel", allDay: true, location: "Napa, CA" },
    { title: "Dentist", month: 2, day: 5, hour: 8, duration: 1, calendar: "personal", location: "Mission Dental" },
    { title: "Spring offsite", month: 2, day: 18, endDay: 20, calendar: "work", allDay: true, location: "Sonoma, CA" },
    { title: "Q1 reflection", month: 2, day: 30, hour: 15, duration: 1, calendar: "focus" },
    { title: "Product beta", month: 3, day: 14, calendar: "work", allDay: true, notes: "Limited customer release." },
    { title: "Half marathon", month: 4, day: 3, hour: 7, duration: 4, calendar: "personal", location: "Golden Gate Park" },
    { title: "Mom's birthday", month: 4, day: 19, calendar: "personal", allDay: true },
    { title: "Lisbon", month: 5, day: 6, endDay: 13, calendar: "travel", allDay: true, location: "Lisbon, Portugal" },
    { title: "Summer reset", month: 5, day: 29, calendar: "focus", allDay: true },
    { title: "Independence Day", month: 6, day: 4, calendar: "personal", allDay: true },
    { title: "Friends at the cabin", month: 6, day: 17, endDay: 19, calendar: "travel", allDay: true, location: "Lake Tahoe" },
    { title: "Midyear review", month: 6, day: 28, hour: 14, duration: 1.5, calendar: "work" },
    { title: "Launch day", month: 7, day: 11, calendar: "work", allDay: true, notes: "Public launch and customer communications." },
    { title: "No-meeting week", month: 7, day: 24, endDay: 28, calendar: "focus", allDay: true },
    { title: "Chicago wedding", month: 8, day: 11, endDay: 14, calendar: "travel", allDay: true, location: "Chicago, IL" },
    { title: "Strategy workshop", month: 8, day: 23, hour: 10, duration: 3, calendar: "work" },
    { title: "Camping", month: 9, day: 9, endDay: 11, calendar: "travel", allDay: true, location: "Big Sur, CA" },
    { title: "Health checkup", month: 9, day: 22, hour: 9, duration: 1, calendar: "personal" },
    { title: "Thanksgiving break", month: 10, day: 25, endDay: 29, calendar: "personal", allDay: true },
    { title: "2027 planning", month: 11, day: 3, hour: 9, duration: 2.5, calendar: "focus" },
    { title: "Winter holiday", month: 11, day: 21, endDay: 31, calendar: "travel", allDay: true, location: "Home" },
  ];

  milestones.forEach((item) => {
    const start = at(year, item.month, item.day, item.hour ?? 0);
    const end = item.endDay
      ? at(year, item.month, item.endDay + 1)
      : item.allDay
        ? at(year, item.month, item.day + 1)
        : addHours(start, item.duration ?? 1);
    add(item.title, start, end, item.calendar, {
      allDay: item.allDay ?? false,
      location: item.location,
      notes: item.notes,
    });
  });

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
};
