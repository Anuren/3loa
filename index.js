const express = require('express');
const bodyParser = require('body-parser');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(bodyParser.json({ limit: '64kb' }));

// In-memory appointment store. Replace with a database for production use.
const appointments = new Map();
const VALID_STATUSES = new Set(['scheduled', 'completed', 'cancelled']);

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeAttendees = (value) => {
  if (!Array.isArray(value)) return null;
  const unique = Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    )
  );
  return unique.length ? unique : null;
};

const rangesOverlap = (startA, endA, startB, endB) =>
  startA < endB && startB < endA;

const getDayRange = (value) => {
  const date = parseDate(value);
  if (!date) return null;
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const serializeAppointment = (appointment) => ({ ...appointment });

const findConflicts = ({ start, end, attendees, ignoreId }) => {
  const conflicts = [];
  const attendeesSet = new Set(attendees);
  for (const appt of appointments.values()) {
    if (ignoreId && appt.id === ignoreId) continue;
    const sharedAttendees = appt.attendees.filter((person) =>
      attendeesSet.has(person)
    );
    if (!sharedAttendees.length) continue;
    const apptStart = new Date(appt.startTime);
    const apptEnd = new Date(appt.endTime);
    if (rangesOverlap(start, end, apptStart, apptEnd)) {
      conflicts.push({
        appointmentId: appt.id,
        attendees: sharedAttendees,
        startTime: appt.startTime,
        endTime: appt.endTime,
        title: appt.title,
      });
    }
  }
  return conflicts;
};

const validateAppointmentPayload = (payload, { partial = false } = {}) => {
  const errors = [];
  const data = {};

  if (!partial || payload.title !== undefined) {
    if (typeof payload.title !== 'string' || !payload.title.trim()) {
      errors.push('title must be a non-empty string');
    } else {
      data.title = payload.title.trim();
    }
  }

  if (payload.description !== undefined) {
    if (typeof payload.description !== 'string') {
      errors.push('description must be a string');
    } else {
      data.description = payload.description.trim();
    }
  }

  if (!partial || payload.startTime !== undefined) {
    const parsed = parseDate(payload.startTime);
    if (!parsed) {
      errors.push('startTime must be a valid ISO-8601 date string');
    } else {
      data.start = parsed;
    }
  }

  if (!partial || payload.endTime !== undefined) {
    const parsed = parseDate(payload.endTime);
    if (!parsed) {
      errors.push('endTime must be a valid ISO-8601 date string');
    } else {
      data.end = parsed;
    }
  }

  if (!partial || payload.attendees !== undefined) {
    const attendees = normalizeAttendees(payload.attendees);
    if (!attendees) {
      errors.push('attendees must be a non-empty array of unique strings');
    } else {
      data.attendees = attendees;
    }
  }

  if (payload.location !== undefined) {
    if (typeof payload.location !== 'string') {
      errors.push('location must be a string');
    } else {
      data.location = payload.location.trim();
    }
  }

  if (payload.status !== undefined) {
    if (!VALID_STATUSES.has(payload.status)) {
      errors.push(
        `status must be one of: ${Array.from(VALID_STATUSES).join(', ')}`
      );
    } else {
      data.status = payload.status;
    }
  }

  if (payload.metadata !== undefined) {
    if (
      typeof payload.metadata !== 'object' ||
      Array.isArray(payload.metadata) ||
      payload.metadata === null
    ) {
      errors.push('metadata must be an object');
    } else {
      data.metadata = payload.metadata;
    }
  }

  if (data.start && data.end && data.start >= data.end) {
    errors.push('startTime must be before endTime');
  }

  return { errors, data };
};

const validateAvailabilityPayload = (payload) => {
  const errors = [];
  const start = parseDate(payload?.startTime);
  const end = parseDate(payload?.endTime);
  const attendees = normalizeAttendees(payload?.attendees);

  if (!start) errors.push('startTime must be provided and valid');
  if (!end) errors.push('endTime must be provided and valid');
  if (start && end && start >= end) {
    errors.push('startTime must be before endTime');
  }
  if (!attendees) {
    errors.push('attendees must be a non-empty array of unique strings');
  }

  return { errors, start, end, attendees };
};

app.get('/', (req, res) => {
  res.json({
    message: 'Appointment scheduler API is ready',
    endpoints: ['GET /appointments', 'POST /appointments', 'POST /availability'],
  });
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/appointments', (req, res) => {
  let list = Array.from(appointments.values());
  const { status, attendee, date, from, to } = req.query;

  if (status) {
    const requested = status
      .split(',')
      .map((value) => value.trim())
      .filter((value) => VALID_STATUSES.has(value));
    if (!requested.length) {
      return res.status(400).json({
        error: 'validation_error',
        details: ['status filter must include valid statuses'],
      });
    }
    list = list.filter((item) => requested.includes(item.status));
  }

  if (attendee) {
    list = list.filter((item) => item.attendees.includes(attendee));
  }

  if (date) {
    const range = getDayRange(date);
    if (!range) {
      return res.status(400).json({
        error: 'validation_error',
        details: ['date filter must be a valid date'],
      });
    }
    list = list.filter((item) => {
      const starts = new Date(item.startTime);
      return starts >= range.start && starts < range.end;
    });
  }

  if (from) {
    const startFilter = parseDate(from);
    if (!startFilter) {
      return res.status(400).json({
        error: 'validation_error',
        details: ['from filter must be a valid date'],
      });
    }
    list = list.filter((item) => new Date(item.startTime) >= startFilter);
  }

  if (to) {
    const endFilter = parseDate(to);
    if (!endFilter) {
      return res.status(400).json({
        error: 'validation_error',
        details: ['to filter must be a valid date'],
      });
    }
    list = list.filter((item) => new Date(item.endTime) <= endFilter);
  }

  list.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  res.json({
    data: list.map(serializeAppointment),
    meta: { total: list.length },
  });
});

app.get('/appointments/:id', (req, res) => {
  const appointment = appointments.get(req.params.id);
  if (!appointment) {
    return res.status(404).json({ error: 'not_found', message: 'Unknown id' });
  }
  res.json(serializeAppointment(appointment));
});

app.post('/appointments', (req, res) => {
  const { errors, data } = validateAppointmentPayload(req.body || {});
  if (errors.length) {
    return res.status(400).json({ error: 'validation_error', details: errors });
  }

  const conflicts = findConflicts({
    start: data.start,
    end: data.end,
    attendees: data.attendees,
  });
  if (conflicts.length) {
    return res
      .status(409)
      .json({ error: 'scheduling_conflict', conflicts });
  }

  const now = new Date().toISOString();
  const appointment = {
    id: randomUUID(),
    title: data.title,
    description: data.description ?? '',
    startTime: data.start.toISOString(),
    endTime: data.end.toISOString(),
    attendees: data.attendees,
    location: data.location ?? '',
    status: 'scheduled',
    metadata: data.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  appointments.set(appointment.id, appointment);
  res.status(201).json(serializeAppointment(appointment));
});

app.patch('/appointments/:id', (req, res) => {
  const appointment = appointments.get(req.params.id);
  if (!appointment) {
    return res.status(404).json({ error: 'not_found', message: 'Unknown id' });
  }
  if (!req.body || !Object.keys(req.body).length) {
    return res.status(400).json({
      error: 'validation_error',
      details: ['request body must include at least one field'],
    });
  }

  const { errors, data } = validateAppointmentPayload(req.body, {
    partial: true,
  });
  if (errors.length) {
    return res.status(400).json({ error: 'validation_error', details: errors });
  }

  const startDate = data.start || new Date(appointment.startTime);
  const endDate = data.end || new Date(appointment.endTime);

  if (startDate >= endDate) {
    return res.status(400).json({
      error: 'validation_error',
      details: ['startTime must be before endTime'],
    });
  }

  const attendees = data.attendees || appointment.attendees;
  const conflicts = findConflicts({
    start: startDate,
    end: endDate,
    attendees,
    ignoreId: appointment.id,
  });
  if (conflicts.length) {
    return res
      .status(409)
      .json({ error: 'scheduling_conflict', conflicts });
  }

  const updated = {
    ...appointment,
    title: data.title ?? appointment.title,
    description: data.description ?? appointment.description,
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    attendees,
    location: data.location ?? appointment.location,
    status: data.status ?? appointment.status,
    metadata: data.metadata ?? appointment.metadata,
    updatedAt: new Date().toISOString(),
  };

  appointments.set(updated.id, updated);
  res.json(serializeAppointment(updated));
});

app.delete('/appointments/:id', (req, res) => {
  if (!appointments.has(req.params.id)) {
    return res.status(404).json({ error: 'not_found', message: 'Unknown id' });
  }
  appointments.delete(req.params.id);
  res.status(204).send();
});

app.post('/availability', (req, res) => {
  const { errors, start, end, attendees } = validateAvailabilityPayload(
    req.body || {}
  );
  if (errors.length) {
    return res.status(400).json({ error: 'validation_error', details: errors });
  }

  const conflicts = findConflicts({ start, end, attendees });
  res.json({ available: conflicts.length === 0, conflicts });
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Unexpected error', err);
  res
    .status(500)
    .json({ error: 'internal_error', message: 'Please try again later' });
});

app.listen(PORT, () => {
  console.log(`===> Appointment scheduler listening on ${PORT}`);
});
