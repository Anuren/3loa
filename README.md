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
