const { randomUUID } = require('crypto');

class SchedulerError extends Error {
  constructor(code, status, extra = {}) {
    super(code);
    this.name = 'SchedulerError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

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

const listAppointments = (filters = {}) => {
  let list = Array.from(appointments.values());
  const { status, attendee, date, from, to } = filters;

  if (status) {
    const requested = status
      .split(',')
      .map((value) => value.trim())
      .filter((value) => VALID_STATUSES.has(value));
    if (!requested.length) {
      throw new SchedulerError('validation_error', 400, {
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
      throw new SchedulerError('validation_error', 400, {
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
      throw new SchedulerError('validation_error', 400, {
        details: ['from filter must be a valid date'],
      });
    }
    list = list.filter((item) => new Date(item.startTime) >= startFilter);
  }

  if (to) {
    const endFilter = parseDate(to);
    if (!endFilter) {
      throw new SchedulerError('validation_error', 400, {
        details: ['to filter must be a valid date'],
      });
    }
    list = list.filter((item) => new Date(item.endTime) <= endFilter);
  }

  list.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  return {
    data: list.map(serializeAppointment),
    meta: { total: list.length },
  };
};

const getAppointment = (id) => {
  const appointment = appointments.get(id);
  if (!appointment) {
    throw new SchedulerError('not_found', 404, {
      message: 'Unknown id',
    });
  }
  return serializeAppointment(appointment);
};

const createAppointment = (payload) => {
  const { errors, data } = validateAppointmentPayload(payload || {});
  if (errors.length) {
    throw new SchedulerError('validation_error', 400, { details: errors });
  }

  const conflicts = findConflicts({
    start: data.start,
    end: data.end,
    attendees: data.attendees,
  });
  if (conflicts.length) {
    throw new SchedulerError('scheduling_conflict', 409, { conflicts });
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
  return serializeAppointment(appointment);
};

const updateAppointment = (id, payload) => {
  const appointment = appointments.get(id);
  if (!appointment) {
    throw new SchedulerError('not_found', 404, { message: 'Unknown id' });
  }
  if (!payload || !Object.keys(payload).length) {
    throw new SchedulerError('validation_error', 400, {
      details: ['request body must include at least one field'],
    });
  }

  const { errors, data } = validateAppointmentPayload(payload, {
    partial: true,
  });
  if (errors.length) {
    throw new SchedulerError('validation_error', 400, { details: errors });
  }

  const startDate = data.start || new Date(appointment.startTime);
  const endDate = data.end || new Date(appointment.endTime);

  if (startDate >= endDate) {
    throw new SchedulerError('validation_error', 400, {
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
    throw new SchedulerError('scheduling_conflict', 409, { conflicts });
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
  return serializeAppointment(updated);
};

const deleteAppointment = (id) => {
  if (!appointments.has(id)) {
    throw new SchedulerError('not_found', 404, { message: 'Unknown id' });
  }
  appointments.delete(id);
};

const checkAvailability = (payload) => {
  const { errors, start, end, attendees } = validateAvailabilityPayload(
    payload || {}
  );
  if (errors.length) {
    throw new SchedulerError('validation_error', 400, { details: errors });
  }

  const conflicts = findConflicts({ start, end, attendees });
  return { available: conflicts.length === 0, conflicts };
};

module.exports = {
  createAppointment,
  updateAppointment,
  deleteAppointment,
  listAppointments,
  getAppointment,
  checkAvailability,
  getValidStatuses: () => Array.from(VALID_STATUSES),
  SchedulerError,
};
