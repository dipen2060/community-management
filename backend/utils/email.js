const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('EMAIL_USER/EMAIL_PASS not set — emails will be logged to console instead of sent.');
    return null;
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  return transporter;
}

// Sends an email if EMAIL_USER/EMAIL_PASS are configured; otherwise logs it
// to the console so local development still works without real credentials.
async function sendEmail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[email:not-configured] To: ${to} | Subject: ${subject}\n${html}`);
    return { sent: false };
  }
  await t.sendMail({
    from: `"Tole Community Management" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html
  });
  return { sent: true };
}

module.exports = { sendEmail };