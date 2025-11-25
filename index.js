require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');

const scheduler = require('./src/scheduler');
const emailAgent = require('./src/emailAgent');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(bodyParser.json({ limit: '128kb' }));
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    message: 'Appointment scheduler API with email agent',
    endpoints: [
      'GET /appointments',
      'POST /appointments',
      'PATCH /appointments/:id',
      'DELETE /appointments/:id',
      'POST /availability',
      'POST /email/inbound',
    ],
  });
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/appointments', (req, res, next) => {
  try {
    const result = scheduler.listAppointments(req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/appointments/:id', (req, res, next) => {
  try {
    const appointment = scheduler.getAppointment(req.params.id);
    res.json(appointment);
  } catch (error) {
    next(error);
  }
});

app.post('/appointments', (req, res, next) => {
  try {
    const appointment = scheduler.createAppointment(req.body);
    res.status(201).json(appointment);
  } catch (error) {
    next(error);
  }
});

app.patch('/appointments/:id', (req, res, next) => {
  try {
    const appointment = scheduler.updateAppointment(req.params.id, req.body);
    res.json(appointment);
  } catch (error) {
    next(error);
  }
});

app.delete('/appointments/:id', (req, res, next) => {
  try {
    scheduler.deleteAppointment(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post('/availability', (req, res, next) => {
  try {
    const availability = scheduler.checkAvailability(req.body);
    res.json(availability);
  } catch (error) {
    next(error);
  }
});

app.post('/email/inbound', async (req, res, next) => {
  try {
    const result = await emailAgent.handleInbound(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found' });
});

app.use((err, req, res, next) => {
  if (err.name === 'SyntaxError' && 'body' in err) {
    return res.status(400).json({ error: 'invalid_json', message: err.message });
  }

  const status = err.status || 500;
  const body = {
    error: err.code || err.name || 'internal_error',
  };

  if (err.extra && typeof err.extra === 'object') {
    Object.assign(body, err.extra);
  } else if (err.message && status < 500) {
    body.message = err.message;
  }

  if (status >= 500) {
    console.error('Unhandled error:', err);
    body.message = 'Please try again later';
  }

  res.status(status).json(body);
});

app.listen(PORT, () => {
  console.log(`===> Appointment scheduler listening on ${PORT}`);
});
