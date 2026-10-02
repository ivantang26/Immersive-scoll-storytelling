// Transactional confirmation email for test-ride bookings.
// Transport: Resend's HTTP API when RESEND_API_KEY + EMAIL_FROM are set; otherwise the message is
// written to ./outbox as a standard .eml file (open it in any mail client) so the flow is verifiable locally.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function prettyDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** Floating local time (UK) calendar invite, 30 minutes. */
export function buildICS(b) {
  const [y, m, d] = b.date.split('-');
  const [hh, mm] = b.time.split(':');
  const start = `${y}${m}${d}T${hh}${mm}00`;
  const endH = String(+hh + (+mm + 30 >= 60 ? 1 : 0)).padStart(2, '0');
  const endM = String((+mm + 30) % 60).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vela//Test ride//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${b.reference}@vela.example`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/London:${start}`,
    `DTEND;TZID=Europe/London:${y}${m}${d}T${endH}${endM}00`,
    `SUMMARY:Vela test ride at ${b.shop.name}`,
    `LOCATION:${b.shop.address.replace(/,/g, '\\,')}`,
    `DESCRIPTION:Booking ${b.reference}. Bring photo ID. Wear comfortable shoes.`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function buildConfirmation(b) {
  const when = `${prettyDate(b.date)} at ${b.time}`;
  const bike = `Vela in ${b.config.colourName}${b.config.extras.length ? ' with ' + b.config.extras.join(' and ') : ''}`;
  const subject = `Your Vela test ride: ${when}`;
  const text = [
    `Hi ${b.name},`,
    '',
    `You're booked in for a 30-minute Vela test ride.`,
    '',
    `When: ${when}`,
    `Where: ${b.shop.name}, ${b.shop.address}`,
    `Bike: ${bike}`,
    `Reference: ${b.reference}`,
    '',
    'Please bring photo ID. The shop will set the saddle height for you, so no special kit is needed.',
    'Need to change the time? Reply to this email and we will sort it.',
    '',
    'See you there,',
    'Vela',
  ].join('\n');
  const html = `<!doctype html><html lang="en-GB"><body style="margin:0;background:#0B0C0F;color:#F1EDE6;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="font-size:18px;letter-spacing:6px;padding-bottom:28px">VELA<span style="color:#D08A4E">.</span></td></tr>
<tr><td style="font-size:32px;line-height:1.15;padding-bottom:16px">You're booked in, ${esc(b.name.split(' ')[0])}.</td></tr>
<tr><td style="font-size:16px;line-height:1.6;color:#cfcbd3;padding-bottom:24px">A 30-minute test ride, with a shop mechanic on hand to fit the bike to you.</td></tr>
<tr><td style="border-top:1px solid #333;padding:16px 0;font-size:15px;line-height:1.7">
<strong>When</strong><br>${esc(when)}<br><br>
<strong>Where</strong><br>${esc(b.shop.name)}<br>${esc(b.shop.address)}<br><br>
<strong>Bike</strong><br>${esc(bike)}<br><br>
<strong>Reference</strong><br><span style="font-family:Menlo,monospace;color:#D08A4E">${esc(b.reference)}</span>
</td></tr>
<tr><td style="border-top:1px solid #333;padding-top:16px;font-size:14px;line-height:1.6;color:#a9a6ae">Please bring photo ID. A calendar invite is attached. Need to change the time? Just reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html, ics: buildICS(b) };
}

function toEml({ from, to, subject, text, html, ics, reference }) {
  const mixed = `mixed_${reference}`;
  const alt = `alt_${reference}`;
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${reference}@vela.example>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text),
    `--${alt}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(html),
    `--${alt}--`,
    `--${mixed}`,
    'Content-Type: text/calendar; charset=utf-8; method=PUBLISH; name="vela-test-ride.ics"',
    'Content-Disposition: attachment; filename="vela-test-ride.ics"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(ics),
    `--${mixed}--`,
    '',
  ].join('\r\n');
}

export async function sendConfirmation(booking) {
  const msg = buildConfirmation(booking);
  const from = process.env.EMAIL_FROM || 'Vela test rides <rides@vela.example>';
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [booking.email],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        attachments: [{ filename: 'vela-test-ride.ics', content: Buffer.from(msg.ics).toString('base64') }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Email provider responded ${res.status}`);
    return { transport: 'resend' };
  }
  const dir = join(process.cwd(), 'outbox');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${booking.reference}.eml`);
  await writeFile(file, toEml({ from, to: booking.email, reference: booking.reference, ...msg }));
  console.log(`[email] Resend not configured; wrote confirmation to ${file}`);
  return { transport: 'outbox', file };
}
