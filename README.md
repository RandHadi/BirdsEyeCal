# BirdsEye Calendar

A desktop-first annual calendar inspired by the “Year at a Glance” spreadsheet format. It keeps all twelve months visible in one scan-friendly grid while adding filters, search, density controls, daily agenda details, Google Calendar sync, and intentional event creation.

## Run in demo mode

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Without Google credentials, BirdsEye stays in deterministic demo mode.

## Connect Google Calendar

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Calendar API**.
3. Configure an OAuth consent screen. During development, add your Google account as a test user.
4. Create an OAuth client with application type **Web application**.
5. Add this exact authorized redirect URI:

   ```text
   http://127.0.0.1:8787/api/auth/google/callback
   ```

6. Copy the environment template and add the client ID and secret:

   ```bash
   cp .env.example .env
   openssl rand -base64 32
   ```

   Use the generated value for `SESSION_SECRET`.

7. Restart `npm run dev`, open BirdsEye, and choose **Connect Google Calendar**.

BirdsEye requests `calendar.calendarlist.readonly` to list calendars and `calendar.events` to read and create events. OAuth state is validated to mitigate CSRF, access and refresh tokens are encrypted into an HttpOnly same-site cookie, and declined or cancelled events are omitted.

Creating an event always requires a final **Create in Google Calendar** confirmation. The server validates dates and field lengths, verifies the selected calendar has a writable access role, and then calls Google Calendar's `events.insert` endpoint. Editing and deleting existing events are not implemented.

If you previously connected the read-only version, choose **Add event → Enable event creation** once to grant the updated scope.

## Commands

```bash
npm run dev       # Vite frontend and OAuth/API server
npm run typecheck # Frontend and server TypeScript checks
npm run build     # Production client and server build
npm start         # Serve a production build
```

For production, set `APP_URL` and `GOOGLE_REDIRECT_URI` to the deployed HTTPS URLs and add that callback to the Google OAuth client.
