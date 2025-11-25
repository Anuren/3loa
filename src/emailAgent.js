const scheduler = require('./scheduler');
const mailClient = require('./mailClient');

const HELP_TEXT = `Hi!

I can help you manage appointments via email. Supported commands:

- "Create appointment" + key/value lines (Title, Start, End, Attendees, Location, Description)
- "List appointments" (optional filters: Status, Attendee, Date)
- "Check availability" + Start, End, Attendees
- "Cancel appointment" + ID

Example body:

Create appointment
Title: Project kickoff
Start: 2025-01-14T15:00:00Z
End: 2025-01-14T16:00:00Z
Attendees: casey@example.com, devon@example.com
Location: Room 3B

`;

const KEY_MAP = {
  title: 'title',
  subject: 'title',
  description: 'description',
  start: 'startTime',
  starttime: 'startTime',
  end: 'endTime',
  endtime: 'endTime',
  attendees: 'attendees',
  invitees: 'attendees',
  participants: 'attendees',
  attendee: 'attendee',
  location: 'location',
  room: 'location',
  status: 'status',
  metadata: 'metadata',
  date: 'date',
  from: 'from',
  to: 'to',
  notes: 'description',
  id: 'id',
};

const normalizeAttendees = (value) =>
  value
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const extractKeyValues = (text) => {
  const result = {};
  const regex = /^\s*([A-Za-z ]+)\s*:\s*(.+)$/;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(regex);
    if (!match) continue;
    const key = KEY_MAP[match[1].toLowerCase().replace(/\s+/g, '')];
    if (!key) continue;
    result[key] = match[2].trim();
  }
  if (result.attendees) {
    result.attendees = normalizeAttendees(result.attendees);
  }
  if (result.metadata) {
    try {
      result.metadata = JSON.parse(result.metadata);
    } catch (_) {
      // leave as-is; scheduler validation will raise a useful error
    }
  }
  return result;
};

const formatAppointment = (appointment) => {
  const attendees = appointment.attendees.join(', ') || '—';
  return [
    `ID: ${appointment.id}`,
    `Title: ${appointment.title}`,
    `Time: ${appointment.startTime} → ${appointment.endTime}`,
    `Attendees: ${attendees}`,
    `Location: ${appointment.location || '—'}`,
    `Status: ${appointment.status}`,
  ].join('\n');
};

const formatConflicts = (conflicts) =>
  conflicts
    .map(
      (conflict) =>
        `• ${conflict.title} (${conflict.startTime} → ${conflict.endTime}) with ${conflict.attendees.join(', ')}`
    )
    .join('\n');

const classifyCommand = (subject = '', text = '') => {
  const haystack = `${subject}\n${text}`.toLowerCase();
  if (haystack.includes('cancel')) return 'cancel';
  if (haystack.includes('availability') || haystack.includes('free slot'))
    return 'availability';
  if (haystack.includes('create') || haystack.includes('schedule'))
    return 'create';
  if (haystack.includes('list') || haystack.includes('show appointments'))
    return 'list';
  if (haystack.includes('help')) return 'help';
  return 'unknown';
};

const buildReplySubject = (subject) =>
  subject && subject.toLowerCase().startsWith('re:')
    ? subject
    : `Re: ${subject || 'Appointment request'}`;

class EmailAgent {
  async handleInbound(payload = {}) {
    const from = payload.from || payload.sender;
    const subject = payload.subject || '';
    const text = payload.text || payload.body || '';

    if (!from) {
      throw new Error('Inbound payload is missing "from"');
    }

    const action = classifyCommand(subject, text);
    let message = '';

    try {
      switch (action) {
        case 'create': {
          const values = extractKeyValues(text);
          const appointment = scheduler.createAppointment(values);
          message =
            '✅ Appointment created successfully\n\n' +
            `${formatAppointment(appointment)}\n`;
          break;
        }
        case 'list': {
          const filters = extractKeyValues(text);
          const result = scheduler.listAppointments(filters);
          const lines =
            result.data.length === 0
              ? ['No appointments found.']
              : result.data.map((appt, idx) => `${idx + 1}. ${appt.title} (${appt.startTime}) [${appt.id}]`);
          message =
            '📅 Upcoming appointments\n\n' +
            lines.join('\n') +
            `\n\nTotal: ${result.meta.total}`;
          break;
        }
        case 'availability': {
          const values = extractKeyValues(text);
          const availability = scheduler.checkAvailability(values);
          message = availability.available
            ? '✅ Slot is available for all requested attendees.'
            : `⚠️ Slot has conflicts:\n${formatConflicts(availability.conflicts)}`;
          break;
        }
        case 'cancel': {
          const values = extractKeyValues(text);
          const id =
            values.id ||
            (text.match(/([0-9a-fA-F-]{8,})/) || [])[0] ||
            null;
          if (!id) {
            message =
              '⚠️ Please provide the appointment ID (e.g., "ID: 123e4567-e89b-12d3-a456-426614174000").';
            break;
          }
          const appt = scheduler.getAppointment(id);
          scheduler.deleteAppointment(id);
          message =
            '🗑️ Appointment cancelled\n\n' + `${formatAppointment(appt)}\n`;
          break;
        }
        case 'help':
        case 'unknown':
        default:
          message = HELP_TEXT;
      }
    } catch (error) {
      if (error.code === 'validation_error') {
        message =
          '⚠️ Validation issues:\n- ' + error.extra.details.join('\n- ');
      } else if (error.code === 'scheduling_conflict') {
        message =
          '⚠️ Unable to schedule due to conflicts:\n' +
          formatConflicts(error.extra.conflicts);
      } else if (error.code === 'not_found') {
        message = '⚠️ Appointment not found. Please verify the ID.';
      } else {
        console.error('Email agent error:', error);
        message = '❌ Something went wrong. Please try again later.';
      }
    }

    await mailClient.sendMail({
      to: from,
      subject: buildReplySubject(subject),
      text: message,
    });

    return {
      status: 'processed',
      action,
      deliveredTo: from,
    };
  }
}

module.exports = new EmailAgent();
