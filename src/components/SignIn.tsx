import React, { useState } from 'react';
import { ArrowRight, Check, Loader2, LogIn, Mail, Smartphone } from 'lucide-react';
import { authClient, fetchSignInCode, type AuthConfig } from '../services/auth';
import { useFormValidation, isEmail, required } from '../hooks/useFormValidation';
import { Button, Field, Input, XtraMark, cn } from './ui';

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
  /** Shown only where nothing was delivered — see showsCodesOnScreen on the server. */
  const [screenCode, setScreenCode] = useState<string | null>(null);

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
    if (error) {
      setError(signInError(error));
      return;
    }
    setStep('code');

    /*
     * On a laptop, the code appears here instead of on a phone.
     *
     * The server only answers this where nothing was actually delivered, so
     * there is no path on which a real recipient also sees their own code on a
     * screen. It exists so the whole flow can be walked without messaging
     * anybody — which is what stops somebody testing a button by texting a
     * colleague.
     */
    if (config.codesOnScreen) {
      setScreenCode(await fetchSignInCode(channel === 'email' ? cleanEmail() : cleanPhone()));
    }
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
    <div className="grid min-h-dvh lg:grid-cols-[1.15fr_minmax(0,1fr)]" dir="rtl">
      {/* ------------------------------------------------------ the brand side
          Hidden on a phone, where it would push the form below the fold and
          make somebody scroll to sign in. It is context, not the task. */}
      <aside className="relative hidden overflow-hidden bg-ink lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-primary via-[#b4232e] to-ink"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -start-24 h-96 w-96 rounded-full bg-white/8 blur-2xl"
        />

        <div className="relative flex items-center gap-3">
          <span className="rounded-lg bg-white px-3 py-2">
            <XtraMark wordmark className="h-8 w-auto" />
          </span>
        </div>

        <div className="relative max-w-lg">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-white">
            כל הקמפיינים, התאריכים והמשימות — במסך אחד.
          </h2>

          <ul className="mt-8 flex flex-col gap-4">
            {[
              'לוח שנה ותכנון לאורך זמן, עם כל אבני הדרך של הקמפיין.',
              'משימות עם אחראי ותאריך יעד, ותזכורת לפני שמשהו נופל.',
              'סיכום יומי אחד בבוקר — רק מה שדורש טיפול.'
            ].map((line) => (
              <li key={line} className="flex items-start gap-3 text-md text-white/90">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-white/70" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/60">XTRA · תכנון אירועים, קמפיינים ומשימות</p>
      </aside>
      {/* ---------------------------------------------------------- the form */}
      <div className="flex items-center justify-center bg-canvas px-4 py-10">
        <div className="flex w-full max-w-sm flex-col gap-5">
          {/* On a phone the brand panel is gone, so the logo comes here. */}
          <div className="flex justify-center lg:hidden">
            <XtraMark wordmark className="h-14 w-auto" />
          </div>

          <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
            <header>
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                {step === 'who' ? 'כניסה למערכת' : 'הזינו את הקוד'}
              </h1>
              <p className="mt-1.5 text-base text-ink-tertiary">
                {step === 'who'
                  ? 'בוחרים לאן ישלח הקוד, מקבלים אותו, ונכנסים.'
                  : 'שלחנו קוד בן 6 ספרות. הוא תקף לעשר דקות.'}
              </p>
            </header>

            {step === 'who' ? (
              <form onSubmit={sendCode} noValidate className="flex flex-col gap-4">
                <div
                  role="group"
                  aria-label="לאן לשלוח את הקוד"
                  className="grid grid-cols-2 gap-1.5 rounded-xl bg-subtle p-1.5"
                >
                  {(
                    [
                      { value: 'phone' as const, label: 'לנייד', icon: Smartphone },
                      { value: 'email' as const, label: 'למייל', icon: Mail }
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

                {channel === 'phone' ? (
                  <Field label="מספר טלפון נייד" error={whoForm.error('phone')} htmlFor="si-phone">
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
                      placeholder="050-000-0000"
                      className={cn('h-12 text-start text-md', whoForm.error('phone') && 'border-late')}
                    />
                    <p className="mt-1.5 text-sm text-ink-tertiary">המספר שאיתו נרשמתם למערכת.</p>
                  </Field>
                ) : (
                  <Field label="כתובת מייל" error={whoForm.error('email')} htmlFor="si-email">
                    <Input
                      id="si-email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      aria-invalid={Boolean(whoForm.error('email'))}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@xtra.co.il"
                      className={cn('h-12 text-md', whoForm.error('email') && 'border-late')}
                    />
                    <p className="mt-1.5 text-sm text-ink-tertiary">הכתובת שאיתה נרשמתם למערכת.</p>
                  </Field>
                )}

                <Button type="submit" variant="primary" disabled={busy !== null} className="h-12 w-full text-md">
                  {busy === 'send' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
                  שליחת קוד
                </Button>
              </form>
            ) : (
              <form onSubmit={verifyCode} noValidate className="flex flex-col gap-4">
                <p className="text-base text-ink-secondary">
                  נשלח אל{' '}
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
                      'h-16 border-2 text-center text-3xl font-extrabold tracking-[0.4em] tnum',
                      codeForm.error('otp') ? 'border-late' : 'border-line-strong'
                    )}
                  />
                </Field>

                <Button type="submit" variant="primary" disabled={busy !== null} className="h-12 w-full text-md">
                  {busy === 'verify' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                  כניסה
                </Button>

                {screenCode && (
                  <div className="rounded-xl border border-dashed border-primary-line bg-primary-soft px-3 py-2.5 text-center">
                    <p className="text-sm font-semibold text-ink-secondary">סביבת פיתוח — לא נשלחה הודעה</p>
                    <p dir="ltr" className="mt-1 text-2xl font-bold tracking-[0.3em] text-primary tnum">
                      {screenCode}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('who');
                      setOtp('');
                      setError('');
                      setScreenCode(null);
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

            {error && (
              <p role="alert" className="rounded-lg bg-late-soft px-3 py-2 text-center text-base text-late">
                {error}
              </p>
            )}

            {!config.mailConfigured && (
              <p className="rounded-lg bg-progress-soft px-3 py-2 text-center text-sm text-ink">
                {config.codesOnScreen
                  ? 'סביבת פיתוח — הקוד יופיע כאן במקום להישלח.'
                  : 'שליחת קודים עדיין לא מופעלת. הקוד נכתב ליומן השרת.'}
              </p>
            )}
          </div>

          <p className="text-center text-sm text-ink-tertiary">
            הכניסה מאובטחת בקוד חד-פעמי. אין סיסמאות לזכור.
          </p>
        </div>
      </div>

    </div>
  );
}
