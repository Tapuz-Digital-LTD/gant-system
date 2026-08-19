import React, { useState } from 'react';
import { LogIn, Mail, Loader2 } from 'lucide-react';
import { authClient, type AuthConfig } from '../services/auth';
import { useFormValidation, isEmail, required } from '../hooks/useFormValidation';
import { Button, Field, Input, cn } from './ui';

/**
 * The only screen a signed-out visitor can reach.
 * Which methods appear is decided by the server, so a deployment cannot
 * accidentally advertise a provider it has no credentials for.
 */
export function SignIn({ config, onSignedIn }: { config: AuthConfig; onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState<'google' | 'send' | 'verify' | null>(null);
  /** Step 1 collects the address, step 2 the six digits it was sent. */
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState('');

  const emailForm = useFormValidation({
    email: () =>
      required(email, 'מה כתובת מייל?') ??
      (isEmail(email) ? undefined : 'נראה שחסר משהו בכתובת. בדוק שיש @ וסיומת')
  });

  const codeForm = useFormValidation({
    otp: () =>
      required(otp, 'הזן את הקוד שקיבלת במייל') ??
      (otp.trim().length === 6 ? undefined : 'הקוד צריך להיות בן 6 ספרות')
  });

  const google = async () => {
    setBusy('google');
    setError('');
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
    if (error) {
      setError(error.message ?? 'לא הצלחנו להכניס אותך. נסה שוב');
      setBusy(null);
    }
  };

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.check('si')) return;
    setBusy('send');
    setError('');
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: 'sign-in'
    });
    setBusy(null);
    // Always advance to the code step: whether the address is known to us is
    // not something a stranger should be able to probe.
    if (error) setError(error.message ?? 'לא הצלחנו לשלוח את הקוד. נסה שוב');
    else setStep('code');
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeForm.check('si')) return;
    setBusy('verify');
    setError('');
    const { error } = await authClient.signIn.emailOtp({
      email: email.trim().toLowerCase(),
      otp: otp.trim()
    });
    setBusy(null);
    if (error) setError(error.message ?? 'הקוד לא נכון או שכבר פג תוקפו. בקש קוד חדש');
    else onSignedIn();
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6" dir="rtl">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-lg font-extrabold text-white">
            X
          </span>
          <div>
            <h1 className="text-xl font-bold text-ink">תכנון אירועים</h1>
            <p className="text-base text-ink-tertiary">כניסה</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card">
          {config.google && (
            <Button variant="primary" onClick={google} disabled={busy !== null} className="w-full">
              {busy === 'google' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
    כניסה עם Google
              {config.staffDomain && <span className="opacity-70">({config.staffDomain})</span>}
            </Button>
          )}

          {config.google && config.emailOtp && (
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs text-ink-tertiary">או</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          )}

          {config.emailOtp &&
            (step === 'email' ? (
              <form onSubmit={sendCode} noValidate className="flex flex-col gap-3">
                <Field label="מייל" error={emailForm.error('email')} htmlFor="si-email">
                  <Input
                    id="si-email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={Boolean(emailForm.error('email'))}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@xtra.co.il"
                    className={emailForm.error('email') ? 'border-late' : undefined}
                  />
                </Field>
                <Button type="submit" variant="secondary" disabled={busy !== null}>
                  {busy === 'send' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
                  שלחו לי קוד
                </Button>
              </form>
            ) : (
              <form onSubmit={verifyCode} noValidate className="flex flex-col gap-3">
                <div
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg px-3 py-2.5',
                    config.mailConfigured ? 'bg-primary-soft' : 'bg-progress-soft'
                  )}
                >
                  <Mail
                    className={cn(
                      'mt-0.5 h-5 w-5 shrink-0',
                      config.mailConfigured ? 'text-primary' : 'text-progress'
                    )}
                  />
                  <p className="text-base text-ink">
                    {config.mailConfigured ? (
                      <>
                        שלחנו קוד בן 6 ספרות אל <b>{email}</b>. בדוק את תיבת מייל.
                      </>
                    ) : (
                      <>שליחת קוד במייל עדיין לא זמינה כאן</>
                    )}
                  </p>
                </div>

                <Field label="הקוד שקיבלת במייל" error={codeForm.error('otp')} htmlFor="si-otp">
                  <Input
                    id="si-otp"
                    // A numeric keypad on mobile, and the browser's own SMS/email autofill.
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    aria-invalid={Boolean(codeForm.error('otp'))}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="text-center text-xl tracking-[0.4em] tnum"
                  />
                </Field>

                <Button type="submit" variant="primary" disabled={busy !== null}>
                  {busy === 'verify' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                  כניסה
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setOtp('');
                    setError('');
                  }}
                  className="text-sm text-ink-tertiary hover:text-ink hover:underline"
                >
לא הגיע? שלחו שוב
                </button>
              </form>
            ))}

          {!config.google && !config.emailOtp && (
            <p className="text-base text-ink-secondary">
              לא הוגדרה שיטת התחברות בשרת. פנה למנהל המערכת.
            </p>
          )}

          {error && <p className={cn('text-sm text-late')}>{error}</p>}
        </div>

        <p className="text-center text-xs text-ink-tertiary">
רק מי שהוזמן למערכת יכול להיכנס.
        </p>
      </div>
    </div>
  );
}
