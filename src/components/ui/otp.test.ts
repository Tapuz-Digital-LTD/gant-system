// Run: npx tsx src/components/ui/otp.test.ts
import assert from 'node:assert/strict';
import { isCompleteOtp, setOtpDigit } from './OtpInput';

/* Typing straight through, left to right. */
let code = '';
for (const [i, d] of [...'774467'].entries()) code = setOtpDigit(code, i, d);
assert.equal(code, '774467');
assert.ok(isCompleteOtp(code));

/*
 * Correcting the third digit.
 *
 * The bug this guards: clearing box 2 used to collapse "774467" to "77467", so
 * box 2 then showed the 4 that belonged in box 3 and the correction overwrote
 * it. The person saw six digits they had checked, and the server saw a code
 * that was never sent.
 */
const cleared = setOtpDigit('774467', 2, '');
assert.equal(cleared, '77 467', 'a cleared box must stay a hole, not close up');
assert.equal(isCompleteOtp(cleared), false, 'a code with a hole is not ready to send');
assert.equal(setOtpDigit(cleared, 2, '9'), '779467', 'the correction lands on the digit it replaces');

/* The last box: clearing it leaves nothing dangling. */
assert.equal(setOtpDigit('774467', 5, ''), '77446');

/* A value with a hole never reads as complete, however long it is. */
assert.equal(isCompleteOtp('77 467'), false);
assert.equal(isCompleteOtp('7744'), false);
assert.equal(isCompleteOtp('774467'), true);

console.log('otp: כל הבדיקות עברו ✓');
