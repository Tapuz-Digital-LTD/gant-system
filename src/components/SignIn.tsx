import React, { useState } from 'react';
import { ArrowRight, Loader2, LogIn, Mail, Smartphone } from 'lucide-react';
import { authClient, type AuthConfig } from '../services/auth';
import { useFormValidation, isEmail, required } from '../hooks/useFormValidation';
import { Button, Field, Input, cn } from './ui';

/**
 * The only screen a signed-out visitor can reach.
 *
 * Two steps and one decision: where the code should arrive. Not a security
 * choice — the code, its length, its expiry and the attempt budget are the same
 * either way — but a practical one. The people using this are as likely to be
 * standing in a warehouse with a phone as sitting at a desk with a mailbox open.
 *
 * The second step is deliberately calm: one large field, no chrome, and a way
 * back that does not lose the address already typed. A login screen is the one
 * place where being slightly slower and completely obvious beats being clever.
 */

type Channel = 'email' | 'phone';

/**
 * Something a person can act on, in their own language.
 *
 * better-auth answers in English, and its rate limit is the one somebody meets
 * by pressing "send again" twice — which is exactly the moment they are least
 * able to read "Too many requests" and work out that waiting is the answer.
 */
function signInError(error: { status?: number; message?: string }, fallback?: string): string {
  if (error.status === 429 || error.status === 403) {
    return 'שלחנו כבר קוד. חכה דקה ונסה שוב.';
  }
  return fallback ?? 'לא הצלחנו לשלוח את הקוד. נסה שוב בעוד רגע.';
}

export function SignIn({ config, onSignedIn }: { config: AuthConfig; onSignedIn: () => void }) {
  const [channel, setChannel] = useState<Channel>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [step, setStep] = useState<'who' | 'code'>('who');
  const [error, setError] = useState('');

  const whoForm = useFormValidation({
    email: () =>
      channel !== 'email'
        ? undefined
        : (required(email, 'מה כתובת המייל?') ??
          (isEmail(email) ? undefined : 'נראה שחסר משהו בכתובת. בדוק שיש @ וסיומת')),
    phone: () =>
      channel !== 'phone'
        ? undefined
        : (required(phone, 'מה מספר הנייד?') ??
          (/^0?5\d[- ]?\d{3}[- ]?\d{4}$/.test(phone.replace(/[^\d-\s]/g, '').trim())
            ? undefined
            : 'מספר נייד ישראלי, למשל 050-1234567'))
  });

  const codeForm = useFormValidation({
    otp: () =>
      required(otp, 'הזן את הקוד שקיבלת') ??
      (otp.trim().length === 6 ? undefined : 'הקוד צריך להיות בן 6 ספרות')
  });

  const cleanEmail = () => email.trim().toLowerCase();
  const cleanPhone = () => phone.replace(/\D/g, '').replace(/^972/, '0');

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whoForm.check('si')) return;
    setBusy('send');
    setError('');

    const { error } =
      channel === 'email'
        ? await authClient.emailOtp.sendVerificationOtp({ email: cleanEmail(), type: 'sign-in' })
        : await authClient.phoneNumber.sendOtp({ phoneNumber: cleanPhone() });

    setBusy(null);
    // Always advance: whether an address is known to us is not something a
    // stranger should be able to probe by watching which ones fail.
    if (error) setError(signInError(error));
    else setStep('code');
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeForm.check('si')) return;
    setBusy('verify');
    setError('');

    const { error } =
      channel === 'email'
        ? await authClient.signIn.emailOtp({ email: cleanEmail(), otp: otp.trim() })
        : await authClient.phoneNumber.verify({ phoneNumber: cleanPhone(), code: otp.trim() });

    setBusy(null);
    if (error) setError(signInError(error, 'הקוד לא נכון או שכבר פג תוקפו. בקש קוד חדש'));
    else onSignedIn();
  };

  const destination = channel === 'email' ? cleanEmail() : cleanPhone();

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-4 py-10" dir="rtl">
      {/*
        A little warmth behind the card, and nothing more.
        
        Two very soft washes, well under the text, so the screen stops looking
        like a form floating on grey without ever competing with the one thing
        on it that matters. Hidden from assistive tech because it says nothing.
      */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 start-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/6 blur-3xl" />
        <div className="absolute -bottom-40 end-1/4 h-80 w-80 rounded-full bg-ms-kickoff/5 blur-3xl" />
      </div>

      <div className="relative flex w-full max-w-sm flex-col gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <img
            src="/xtra-logo.png"
            alt="XTRA Giftcard"
            width={180}
            height={111}
            className="h-20 w-auto"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">תכנון אירועים וקמפיינים</h1>
            <p className="mt-1 text-base text-ink-tertiary">
              {step === 'who' ? 'נעים לראות אותך. איך תרצה להיכנס?' : 'עוד רגע ואתה בפנים'}
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-raised">
          {step === 'who' ? (
            <form onSubmit={sendCode} noValidate className="flex flex-col gap-4">
              {/*
                A choice made before typing, not after. Switching afterwards
                would throw away whatever is already in the field.
              */}
              <div
                role="group"
                aria-label="לאן לשלוח את הקוד"
                className="grid grid-cols-2 gap-1.5 rounded-xl bg-subtle p-1.5"
              >
                {(
                  [
                    { value: 'email' as const, label: 'למייל', icon: Mail },
                    { value: 'phone' as const, label: 'לנייד', icon: Smartphone }
                  ]
                ).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setChannel(value);
                      setError('');
                    }}
                    aria-pressed={channel === value}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-base font-semibold transition-all',
                      channel === value
                        ? 'bg-surface text-ink shadow-card'
                        : 'text-ink-tertiary hover:text-ink-secondary'
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>

              {channel === 'email' ? (
                <Field label="כתובת המייל שלך" error={whoForm.error('email')} htmlFor="si-email">
                  <Input
                    id="si-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    aria-invalid={Boolean(whoForm.error('email'))}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@xtra.co.il"
                    className={whoForm.error('email') ? 'border-late' : undefined}
                  />
                </Field>
              ) : (
                <Field label="מספר הנייד שלך" error={whoForm.error('phone')} htmlFor="si-phone">
                  <Input
                    id="si-phone"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    autoComplete="tel"
                    autoFocus
                    aria-invalid={Boolean(whoForm.error('phone'))}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="050-1234567"
                    className={cn('text-start', whoForm.error('phone') && 'border-late')}
                  />
                </Field>
              )}

              <Button type="submit" variant="primary" size="md" disabled={busy !== null}>
                {busy === 'send' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
                שלחו לי קוד
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} noValidate className="flex flex-col gap-4">
              <p className="text-center text-base text-ink-secondary">
                שלחנו קוד בן 6 ספרות אל
                <br />
                <b dir="ltr" className="inline-block text-ink">
                  {destination}
                </b>
              </p>

              <Field label="" error={codeForm.error('otp')} htmlFor="si-otp">
                <Input
                  id="si-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  aria-label="קוד בן 6 ספרות"
                  aria-invalid={Boolean(codeForm.error('otp'))}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  dir="ltr"
                  className={cn(
                    'h-16 text-center text-3xl font-bold tracking-[0.4em] tnum',
                    codeForm.error('otp') && 'border-late'
                  )}
                />
              </Field>

              <Button type="submit" variant="primary" size="md" disabled={busy !== null}>
                {busy === 'verify' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                כניסה
              </Button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setStep('who');
                    setOtp('');
                    setError('');
                  }}
                  className="flex items-center gap-1 text-sm text-ink-tertiary hover:text-ink hover:underline"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  {channel === 'email' ? 'תיקון כתובת' : 'תיקון מספר'}
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    setOtp('');
                    setError('');
                    void sendCode(e);
                  }}
                  className="text-sm text-ink-tertiary hover:text-ink hover:underline"
                >
                  לא הגיע? שלחו שוב
                </button>
              </div>
            </form>
          )}

          {error && <p className="text-center text-sm text-late">{error}</p>}

          {!config.mailConfigured && (
            <p className="rounded-lg bg-progress-soft px-3 py-2 text-center text-sm text-ink">
              שליחת קודים עדיין לא מופעלת. הקוד נכתב ליומן השרת.
            </p>
          )}
        </div>

        <p className="text-center text-xs text-ink-tertiary">רק מי שהוזמן למערכת יכול להיכנס.</p>
      </div>
    </div>
  );
}
