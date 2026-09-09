// Run: npx tsx server/notifications/inforu.test.ts
//
// Nothing here reaches Inforu. The rules under test are the ones that decide
// whether a real message goes out at all, and what a caller is told when it
// doesn't — both of which have to be right before any credential exists.
import assert from 'node:assert/strict';
import { deliveryMode, israeliMobile, sendEmail, sendSms } from './inforu.ts';

// ---------- one number, however it was typed ----------
for (const spelling of [
  '0525770223',
  '052-577-0223',
  '052 577 0223',
  '+972525770223',
  '00972525770223',
  '972525770223',
  '‏0525770223‎' // pasted out of a Hebrew field
]) {
  assert.equal(israeliMobile(spelling), '0525770223', `"${spelling}" is the same person`);
}

// ---------- and a guess is worse than a refusal ----------
for (const junk of ['', '   ', '05257702', '05257702234', '036234567', 'לא מספר', null, undefined, '+15551234567']) {
  assert.equal(israeliMobile(junk as string), null, `${JSON.stringify(junk)} is not an Israeli mobile`);
}

// ---------- nothing goes out by accident ----------
const env = { ...process.env };
const reset = () => {
  delete process.env.GANTT_INFORU_API_URL;
  delete process.env.GANTT_INFORU_AUTH;
  delete process.env.GANTT_NOTIFICATIONS_SEND;
  delete process.env.GANTT_AUTH_SEND;
};

reset();
assert.equal(deliveryMode('notification'), 'unconfigured', 'no credentials, and the settings screen can say so');
assert.equal(deliveryMode('auth'), 'unconfigured');

process.env.GANTT_INFORU_API_URL = 'https://example.invalid';
process.env.GANTT_INFORU_AUTH = 'not-a-real-key';
assert.equal(deliveryMode('notification'), 'log', 'credentials alone do not switch sending on');
assert.equal(deliveryMode('auth'), 'log');

process.env.GANTT_NOTIFICATIONS_SEND = 'true';
assert.equal(deliveryMode('notification'), 'send', 'sending is a deliberate act');

process.env.GANTT_NOTIFICATIONS_SEND = 'yes';
assert.equal(deliveryMode('notification'), 'log', 'and only that exact word means it');

/*
 * The two switches are independent, and this is the bug that proved it matters.
 *
 * Sign-in codes were gated by GANTT_AUTH_SEND in one file and then blocked by
 * GANTT_NOTIFICATIONS_SEND inside the shared client. The login screen said
 * "codes are being sent", the code went to a log line, and nobody could get in.
 */
{
  reset();
  process.env.GANTT_INFORU_API_URL = 'https://example.invalid';
  process.env.GANTT_INFORU_AUTH = 'not-a-real-key';

  process.env.GANTT_AUTH_SEND = 'true';
  assert.equal(deliveryMode('auth'), 'send', 'letting people sign in is its own decision');
  assert.equal(
    deliveryMode('notification'),
    'log',
    'and it must not quietly switch the morning reminders on with it'
  );

  delete process.env.GANTT_AUTH_SEND;
  process.env.GANTT_NOTIFICATIONS_SEND = 'true';
  assert.equal(deliveryMode('notification'), 'send');
  assert.equal(
    deliveryMode('auth'),
    'log',
    'and turning reminders on must not answer for the login codes either'
  );
}

// ---------- log-only reports failure, not success ----------
{
  reset();
  const quiet = console.log;
  const lines: string[] = [];
  console.log = (l: string) => void lines.push(String(l));

  const sms = await sendSms('052-577-0223', 'תזכורת בדיקה', 'notification');
  const mail = await sendEmail({
    to: 'tomer@xtra.co.il',
    subject: 'בדיקה',
    html: '<p>בדיקה</p>',
    text: 'בדיקה',
    purpose: 'notification'
  });
  console.log = quiet;

  // Saying "sent" about a message that never left the process is how a screen
  // ends up lying to somebody who is waiting for it.
  assert.equal(sms.ok, false, 'a message that was only logged was not sent');
  assert.equal(mail.ok, false);
  assert.ok(sms.error?.startsWith('not_sent:'), 'and the caller is told which');
  assert.equal(lines.length, 2, 'both went to the log');
  assert.ok(JSON.parse(lines[0]).text.includes('תזכורת בדיקה'), 'in full, so it can be read before it is switched on');
}

// ---------- a rejected request is not retried ----------
{
  process.env.GANTT_INFORU_API_URL = 'https://example.invalid';
  process.env.GANTT_INFORU_AUTH = 'not-a-real-key';
  process.env.GANTT_NOTIFICATIONS_SEND = 'true';

  const realFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls++;
    return new Response('nope', { status: 401, statusText: 'Unauthorized' });
  }) as typeof fetch;
  let r = await sendSms('0525770223', 'בדיקה', 'notification');
  assert.equal(calls, 1, 'a bad key is still a bad key on the second try — spending quota to prove it is waste');
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes('401'));

  // A provider having a bad minute is worth another go.
  calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return calls < 3
      ? new Response('boom', { status: 502, statusText: 'Bad Gateway' })
      : new Response(JSON.stringify({ StatusId: 1, RequestId: 'req-7' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
  }) as typeof fetch;
  r = await sendSms('0525770223', 'בדיקה', 'notification');
  assert.equal(calls, 3, 'and a fault on the far side gets retried');
  assert.equal(r.ok, true);
  assert.equal(r.providerMessageId, 'req-7', 'the provider handle comes back, for chasing a delivery later');

  // 200 OK with a refusal inside it. Inforu says no this way.
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ StatusId: -1, StatusDescription: 'Invalid sender' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as typeof fetch;
  r = await sendSms('0525770223', 'בדיקה', 'notification');
  assert.equal(r.ok, false, 'HTTP 200 is not the same as "sent"');
  assert.ok(r.error?.includes('Invalid sender'));

  globalThis.fetch = realFetch;
}

// ---------- a number nobody can text is not a send ----------
assert.equal((await sendSms('לא מספר', 'בדיקה', 'notification')).error, 'invalid_phone');

process.env = env;
console.log('inforu: כל הבדיקות עברו ✓');
