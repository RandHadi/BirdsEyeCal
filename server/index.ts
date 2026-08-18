import "dotenv/config";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";
const redirectUri =
  process.env.GOOGLE_REDIRECT_URI ??
  "http://127.0.0.1:8787/api/auth/google/callback";
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
const sessionSecret = process.env.SESSION_SECRET ?? "";
const isProduction = process.env.NODE_ENV === "production";

const SESSION_COOKIE = "birdseye_google_session";
const STATE_COOKIE = "birdseye_oauth_state";
const CALENDAR_LIST_SCOPE =
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
const EVENT_WRITE_SCOPES = new Set([
  "https://www.googleapis.com/auth/calendar",
  CALENDAR_EVENTS_SCOPE,
  "https://www.googleapis.com/auth/calendar.events.owned",
]);

interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

interface GoogleCalendarListEntry {
  id?: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  selected?: boolean;
  hidden?: boolean;
  accessRole?: string;
  timeZone?: string;
}

interface GoogleCalendarListResponse {
  items?: GoogleCalendarListEntry[];
  nextPageToken?: string;
}

interface GoogleEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  eventType?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
}

interface GoogleEventsResponse {
  items?: GoogleEvent[];
  nextPageToken?: string;
}

interface CreateEventRequest {
  calendarId?: unknown;
  title?: unknown;
  allDay?: unknown;
  start?: unknown;
  end?: unknown;
  location?: unknown;
  notes?: unknown;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const configured = () =>
  Boolean(googleClientId && googleClientSecret && sessionSecret);

const parseCookies = (request: Request) => {
  const header = request.headers.cookie;
  if (!header) return new Map<string, string>();
  return new Map(
    header.split(";").flatMap((part) => {
      const index = part.indexOf("=");
      if (index < 0) return [];
      return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))]];
    }),
  );
};

const cookieOptions = (maxAgeSeconds: number) =>
  [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    appUrl.startsWith("https://") ? "Secure" : "",
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join("; ");

const setCookie = (
  response: Response,
  name: string,
  value: string,
  maxAgeSeconds: number,
) => {
  response.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; ${cookieOptions(maxAgeSeconds)}`,
  );
};

const clearCookie = (response: Response, name: string) =>
  setCookie(response, name, "", 0);

const encryptionKey = () =>
  createHash("sha256").update(sessionSecret).digest();

const encryptSession = (tokens: GoogleTokens) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
};

const decryptSession = (value?: string): GoogleTokens | null => {
  if (!value || !configured()) return null;
  try {
    const payload = Buffer.from(value, "base64url");
    if (payload.length < 29) return null;
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(decrypted) as GoogleTokens;
  } catch {
    return null;
  }
};

const readSession = (request: Request) =>
  decryptSession(parseCookies(request).get(SESSION_COOKIE));

const hasEventWriteAccess = (tokens: GoogleTokens | null) => {
  const scopes = new Set(tokens?.scope?.split(/\s+/).filter(Boolean) ?? []);
  return [...EVENT_WRITE_SCOPES].some((scope) => scopes.has(scope));
};

const storeSession = (response: Response, tokens: GoogleTokens) =>
  setCookie(response, SESSION_COOKIE, encryptSession(tokens), 60 * 60 * 24 * 30);

const readJson = async <T>(response: globalThis.Response): Promise<T> => {
  const data = (await response.json()) as T & {
    error?: string | { message?: string };
    error_description?: string;
  };
  if (!response.ok) {
    const message =
      typeof data.error === "string"
        ? data.error_description ?? data.error
        : data.error?.message ?? "Google API request failed.";
    const status = response.status === 401 || response.status === 403
      ? response.status
      : 502;
    throw new HttpError(status, message);
  }
  return data;
};

const refreshAccessToken = async (tokens: GoogleTokens) => {
  if (!tokens.refreshToken) {
    throw new HttpError(401, "Google Calendar authorization has expired.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const refreshed = await readJson<TokenResponse>(response);
  return {
    ...tokens,
    accessToken: refreshed.access_token,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
    scope: refreshed.scope ?? tokens.scope,
  };
};

const getAccessToken = async (
  request: Request,
  response: Response,
) => {
  let tokens = readSession(request);
  if (!tokens) throw new HttpError(401, "Google Calendar is not connected.");
  if (tokens.expiresAt <= Date.now() + 60_000) {
    tokens = await refreshAccessToken(tokens);
    storeSession(response, tokens);
  }
  return tokens.accessToken;
};

const googleGet = async <T>(url: URL, accessToken: string) => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return readJson<T>(response);
};

const googlePost = async <T>(
  url: URL,
  accessToken: string,
  body: Record<string, unknown>,
) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return readJson<T>(response);
};

const asyncRoute =
  (
    handler: (request: Request, response: Response) => Promise<void>,
  ) =>
  (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, configured: configured() });
});

app.get("/api/auth/status", (request, response) => {
  const session = readSession(request);
  response.json({
    configured: configured(),
    connected: Boolean(session),
    canCreateEvents: hasEventWriteAccess(session),
  });
});

app.get("/api/auth/google/start", (request, response) => {
  if (!configured()) {
    response.status(503).send("Google OAuth is not configured. Add the required .env values first.");
    return;
  }

  const state = randomBytes(32).toString("base64url");
  setCookie(response, STATE_COOKIE, state, 10 * 60);
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [CALENDAR_LIST_SCOPE, CALENDAR_EVENTS_SCOPE].join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  }).toString();
  response.redirect(authorizationUrl.toString());
});

app.get(
  "/api/auth/google/callback",
  asyncRoute(async (request, response) => {
    const expectedState = parseCookies(request).get(STATE_COOKIE);
    const returnedState = typeof request.query.state === "string" ? request.query.state : "";
    clearCookie(response, STATE_COOKIE);

    if (!expectedState || returnedState !== expectedState) {
      throw new HttpError(400, "OAuth state validation failed. Please try connecting again.");
    }
    if (request.query.error) {
      response.redirect(`${appUrl}/?auth=denied`);
      return;
    }
    const code = typeof request.query.code === "string" ? request.query.code : "";
    if (!code) throw new HttpError(400, "Google did not return an authorization code.");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await readJson<TokenResponse>(tokenResponse);
    storeSession(response, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      scope: tokenData.scope,
    });
    response.redirect(`${appUrl}/?auth=connected`);
  }),
);

app.post(
  "/api/auth/logout",
  asyncRoute(async (request, response) => {
    const tokens = readSession(request);
    clearCookie(response, SESSION_COOKIE);
    if (tokens) {
      const token = tokens.refreshToken ?? tokens.accessToken;
      try {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
      } catch {
        // Local sign-out should still succeed if Google is temporarily unreachable.
      }
    }
    response.json({ connected: false });
  }),
);

app.get(
  "/api/calendars",
  asyncRoute(async (request, response) => {
    const accessToken = await getAccessToken(request, response);
    const calendars: GoogleCalendarListEntry[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
      url.searchParams.set("maxResults", "250");
      url.searchParams.set("showDeleted", "false");
      url.searchParams.set("showHidden", "false");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const page = await googleGet<GoogleCalendarListResponse>(url, accessToken);
      calendars.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);

    response.json({
      calendars: calendars
        .filter((calendar) => calendar.id && !calendar.hidden)
        .map((calendar) => ({
          id: calendar.id,
          name: calendar.summaryOverride ?? calendar.summary ?? "Untitled calendar",
          color: calendar.backgroundColor ?? "#5b6fd8",
          foregroundColor: calendar.foregroundColor ?? "#ffffff",
          primary: Boolean(calendar.primary),
          selected: Boolean(calendar.selected || calendar.primary),
          accessRole: calendar.accessRole,
          timeZone: calendar.timeZone,
        })),
    });
  }),
);

const getEventPages = async (
  calendarId: string,
  timeMin: string,
  timeMax: string,
  accessToken: string,
) => {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", "2500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await googleGet<GoogleEventsResponse>(url, accessToken);
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
};

app.get(
  "/api/events",
  asyncRoute(async (request, response) => {
    const year = Number(request.query.year);
    if (!Number.isInteger(year) || year < 1970 || year > 2100) {
      throw new HttpError(400, "A valid year is required.");
    }
    const timeMin = typeof request.query.timeMin === "string" ? request.query.timeMin : "";
    const timeMax = typeof request.query.timeMax === "string" ? request.query.timeMax : "";
    const parsedMin = Date.parse(timeMin);
    const parsedMax = Date.parse(timeMax);
    if (!Number.isFinite(parsedMin) || !Number.isFinite(parsedMax) || parsedMax <= parsedMin) {
      throw new HttpError(400, "Valid calendar time boundaries are required.");
    }
    const maximumWindow = 370 * 24 * 60 * 60 * 1000;
    if (parsedMax - parsedMin > maximumWindow) {
      throw new HttpError(400, "The calendar window cannot exceed one year.");
    }
    const rawIds = request.query.calendarId;
    const calendarIds = (Array.isArray(rawIds) ? rawIds : [rawIds])
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .slice(0, 40);
    if (!calendarIds.length) throw new HttpError(400, "At least one calendar is required.");

    const accessToken = await getAccessToken(request, response);
    const eventGroups = await Promise.all(
      calendarIds.map(async (calendarId) => ({
        calendarId,
        events: await getEventPages(calendarId, timeMin, timeMax, accessToken),
      })),
    );

    const events = eventGroups.flatMap(({ calendarId, events: calendarEvents }) =>
      calendarEvents.flatMap((event) => {
        const declined = event.attendees?.some(
          (attendee) => attendee.self && attendee.responseStatus === "declined",
        );
        const start = event.start?.dateTime ?? event.start?.date;
        const end = event.end?.dateTime ?? event.end?.date;
        if (event.status === "cancelled" || declined || !event.id || !start || !end) return [];
        return [
          {
            id: `${calendarId}:${event.id}`,
            title: event.summary?.trim() || "Busy",
            start,
            end,
            allDay: Boolean(event.start?.date),
            calendarId,
            location: event.location,
            notes: event.description,
            eventType: event.eventType,
            htmlLink: event.htmlLink,
          },
        ];
      }),
    );

    events.sort((a, b) => a.start.localeCompare(b.start));
    response.json({ events, syncedAt: new Date().toISOString() });
  }),
);

const isDateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const optionalText = (value: unknown, limit: number, field: string) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be text.`);
  }
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > limit) {
    throw new HttpError(400, `${field} is too long.`);
  }
  return normalized;
};

app.post(
  "/api/events",
  asyncRoute(async (request, response) => {
    const body = request.body as CreateEventRequest;
    const calendarId = optionalText(body.calendarId, 1024, "Calendar");
    const title = optionalText(body.title, 1024, "Event title");
    const location = optionalText(body.location, 1024, "Location");
    const notes = optionalText(body.notes, 8192, "Notes");
    if (!calendarId) throw new HttpError(400, "Choose a calendar.");
    if (!title) throw new HttpError(400, "Event title is required.");
    if (typeof body.allDay !== "boolean") {
      throw new HttpError(400, "Choose whether this is an all-day event.");
    }
    if (typeof body.start !== "string" || typeof body.end !== "string") {
      throw new HttpError(400, "Event start and end are required.");
    }

    let eventStart: { date: string } | { dateTime: string };
    let eventEnd: { date: string } | { dateTime: string };
    if (body.allDay) {
      if (!isDateOnly(body.start) || !isDateOnly(body.end) || body.end <= body.start) {
        throw new HttpError(400, "All-day events need valid start and end dates.");
      }
      eventStart = { date: body.start };
      eventEnd = { date: body.end };
    } else {
      const startTime = Date.parse(body.start);
      const endTime = Date.parse(body.end);
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
        throw new HttpError(400, "Event end must be after its start.");
      }
      if (endTime - startTime > 370 * 24 * 60 * 60 * 1000) {
        throw new HttpError(400, "An event cannot be longer than one year.");
      }
      eventStart = { dateTime: new Date(startTime).toISOString() };
      eventEnd = { dateTime: new Date(endTime).toISOString() };
    }

    const session = readSession(request);
    if (!session) throw new HttpError(401, "Google Calendar is not connected.");
    if (!hasEventWriteAccess(session)) {
      throw new HttpError(403, "Reconnect Google Calendar to enable event creation.");
    }
    const accessToken = await getAccessToken(request, response);
    const calendarUrl = new URL(
      `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}`,
    );
    const calendar = await googleGet<GoogleCalendarListEntry>(calendarUrl, accessToken);
    const writableRoles = new Set(["owner", "writer", "writerWithoutPrivateAccess"]);
    if (!calendar.accessRole || !writableRoles.has(calendar.accessRole)) {
      throw new HttpError(403, "You do not have permission to add events to that calendar.");
    }

    const eventUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    const created = await googlePost<GoogleEvent>(eventUrl, accessToken, {
      summary: title,
      start: eventStart,
      end: eventEnd,
      ...(location ? { location } : {}),
      ...(notes ? { description: notes } : {}),
      reminders: { useDefault: true },
    });
    const createdStart = created.start?.dateTime ?? created.start?.date;
    const createdEnd = created.end?.dateTime ?? created.end?.date;
    if (!created.id || !createdStart || !createdEnd) {
      throw new HttpError(502, "Google created the event but returned an incomplete response.");
    }
    response.status(201).json({
      event: {
        id: `${calendarId}:${created.id}`,
        title: created.summary?.trim() || title,
        start: createdStart,
        end: createdEnd,
        allDay: Boolean(created.start?.date),
        calendarId,
        location: created.location,
        notes: created.description,
        eventType: created.eventType,
        htmlLink: created.htmlLink,
      },
    });
  }),
);

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const productionDist = path.resolve(currentDirectory, "../dist");
if (isProduction && existsSync(productionDist)) {
  app.use(express.static(productionDist));
  app.use((request, response, next) => {
    if (request.method === "GET" && request.accepts("html")) {
      response.sendFile(path.join(productionDist, "index.html"));
      return;
    }
    next();
  });
}

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  if (status >= 500) console.error(error);
  response.status(status).json({ error: message });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`BirdsEye API listening on http://127.0.0.1:${port}`);
});
