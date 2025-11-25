# Appointment Scheduler API

Simple, dependency-light appointment scheduler built with Express. The service
keeps appointments in memory (perfect for demos, interviews, or prototypes) and
exposes REST endpoints to create, read, update, delete, and check availability.

## Getting started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the API

   ```bash
   npm start
   ```

3. The service listens on `http://localhost:3000` by default. Set `PORT` to use a
   different port.

> ℹ️ Data is stored in memory only. Restarting the server wipes all records.

## Email agent workflow

- Configure your email provider (SendGrid Inbound Parse, Mailgun Routes, AWS SES
  inbound, etc.) to forward incoming messages to `POST /email/inbound`.
- Provide inbound payloads containing at least `from`, `subject`, and the raw
  `text` body.
- The agent parses the email, executes the requested action (create/list/cancel
  appointments or availability checks), and sends a reply email with the result.

### SMTP / transport configuration

Set the following environment variables to send outbound replies through your
SMTP provider (all optional, defaults to a local stream transport if omitted):

| Variable        | Description                            |
| --------------- | -------------------------------------- |
| `SMTP_HOST`     | SMTP host (e.g., `smtp.sendgrid.net`)  |
| `SMTP_PORT`     | SMTP port (default `587`)              |
| `SMTP_SECURE`   | Set to `true` to use TLS/SSL           |
| `SMTP_USER`     | Username/login                         |
| `SMTP_PASS`     | Password/API key                       |
| `MAIL_FROM`     | Friendly from address for agent mails  |

During local development, the fallback transport prints email contents to the
console instead of actually sending them.

### Email syntax

Supported commands (subject or body can contain the keywords):

- `Create appointment` + key/value lines (`Title`, `Start`, `End`, `Attendees`,
  `Location`, optional `Description`)
- `List appointments` with optional filters (`Status`, `Attendee`, `Date`,
  `From`, `To`)
- `Check availability` + `Start`, `End`, `Attendees`
- `Cancel appointment` + `ID`
- `Help` to receive usage instructions

Example email body:

```
Create appointment
Title: Kickoff sync
Start: 2025-01-14T15:00:00Z
End: 2025-01-14T16:00:00Z
Attendees: alex@example.com, taylor@example.com
Location: Zoom
Description: Align on scope
```

## Endpoints

| Method | Path                 | Description                                             |
| ------ | -------------------- | ------------------------------------------------------- |
| GET    | `/healthz`           | Lightweight readiness probe                             |
| GET    | `/appointments`      | List appointments with optional filters                 |
| GET    | `/appointments/:id`  | Fetch a single appointment                              |
| POST   | `/appointments`      | Create a new appointment                                |
| PATCH  | `/appointments/:id`  | Update title, time range, attendees, status, etc.       |
| DELETE | `/appointments/:id`  | Remove an appointment                                   |
| POST   | `/availability`      | Check if a slot is free for a set of attendees          |
| POST   | `/email/inbound`     | Accept inbound email payloads for the agent             |

### Appointment payload

```json
{
  "title": "Project kickoff",
  "description": "Align on scope and dates",
  "startTime": "2025-01-14T15:00:00.000Z",
  "endTime": "2025-01-14T16:00:00.000Z",
  "attendees": ["casey@example.com", "devon@example.com"],
  "location": "Room 3B",
  "metadata": {
    "color": "purple"
  }
}
```

Notes:

- `title`, `startTime`, `endTime`, and `attendees` are required on create.
- Attendees must be a non-empty array of unique strings (e.g., email, name, or
  team identifier).
- `status` is automatically set to `scheduled` on create and can later be
  changed to `completed` or `cancelled`.

### Listing and filtering

`GET /appointments` accepts optional query parameters:

- `status=scheduled,cancelled` – comma-separated status values
- `attendee=casey@example.com` – exact match on an attendee identifier
- `date=2025-01-14` – restrict to a specific calendar day (UTC)
- `from=2025-01-14T12:00:00Z` – return appointments starting after this instant
- `to=2025-01-14T18:00:00Z` – return appointments ending before this instant

Responses include `data` (sorted chronologically) and `meta.total`.

### Availability checks

`POST /availability` uses the same time/attendee validation rules as creation
but never writes data. Example request:

```json
{
  "startTime": "2025-01-15T10:00:00.000Z",
  "endTime": "2025-01-15T11:00:00.000Z",
  "attendees": ["devon@example.com"]
}
```

Response:

```json
{
  "available": true,
  "conflicts": []
}
```

When conflicts exist, the response highlights the overlapping appointment id,
time range, title, and the attendees that collide.

### Email agent test helper

You can simulate an inbound message without a mail provider by running:

```bash
curl -X POST http://localhost:3000/email/inbound \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "you@example.com",
    "subject": "Create appointment",
    "text": "Create appointment\nTitle: Demo\nStart: 2025-01-14T15:00:00Z\nEnd: 2025-01-14T16:00:00Z\nAttendees: you@example.com"
  }'
```

The service replies via the configured SMTP transport (or logs the email body in
development).
