const nodemailer = require('nodemailer');

let transporter;

const buildTransporter = () => {
  if (
    process.env.SMTP_HOST ||
    process.env.SMTP_URI ||
    process.env.SMTP_CONNECTION_STRING
  ) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            }
          : undefined,
      connectionTimeout: 10_000,
    });
  }

  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  });
};

const getTransporter = () => {
  if (!transporter) {
    transporter = buildTransporter();
  }
  return transporter;
};

const DEFAULT_FROM = process.env.MAIL_FROM || 'scheduler@example.com';

const sendMail = async ({ to, subject, text }) => {
  const transport = getTransporter();
  const info = await transport.sendMail({
    from: DEFAULT_FROM,
    to,
    subject,
    text,
  });

  if (transport.options.streamTransport && info.message) {
    console.log('📧 Email preview:\n', info.message.toString());
  }

  return info;
};

module.exports = {
  sendMail,
};
