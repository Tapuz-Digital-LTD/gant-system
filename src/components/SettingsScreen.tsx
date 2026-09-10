import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  Eye,
  Loader2,
  Mail,
  Send,
  MessageSquare,
  Smartphone,
  Users
} from 'lucide-react';
import { DigestPreview, GanttBoard, NotificationPrefs, UserAccess } from '../types';
import { UserPermissionsModal } from './UserPermissionsModal';
import type { Can } from '../hooks/useCan';
import {
  useDigestPreview,
  useNotificationPrefs,
  useNotificationPrefMutations,
  useChannels,
  useSaveChannels,
  useSavePhone
} from '../hooks/useBoardData';
import { Button, cn } from './ui';

interface SettingsScreenProps {
  currentUser: UserAccess;
  can: Can;
  onBackHome: () => void;
  /** Managing people lives here too, so the header does not need its own entry. */
  boards: GanttBoard[];
}

/**
 * Settings a person can finish reading.
 *
 * Four questions, each answered by picking from a short list of sentences —
 * no number spinners, no switch labelled with a field name. "אחרי 3 ימים" is
 * something somebody decides; "stalledAfterDays" is something they endure.
 *
 * The preview at the bottom is the point of the screen: it shows exactly what
 * would arrive, today, for this person, without anything being switched on.
 */

type Choice<T> = { value: T; label: string };

const DAYS_UNTOUCHED: Choice<number>[] = [
  { value: 0, label: 'אף פעם' },
  { value: 1, label: 'אחרי יום' },
  { value: 2, label: 'אחרי יומיים' },
  { value: 3, label: 'אחרי 3 ימים' },
  { value: 5, label: 'אחרי 5 ימים' },
  { value: 7, label: 'אחרי שבוע' }
];

const DAYS_BEFORE: Choice<number>[] = [
  { value: 0, label: 'לא להזכיר' },
  { value: 1, label: 'יום לפני' },
  { value: 2, label: 'יומיים לפני' },
  { value: 3, label: '3 ימים לפני' },
  { value: 7, label: 'שבוע לפני' }
];

const MILESTONE_BEFORE: Choice<number>[] = [
  { value: 0, label: 'לא להזכיר' },
  { value: 1, label: 'יום לפני' },
  { value: 3, label: '3 ימים לפני' },
  { value: 7, label: 'שבוע לפני' },
  { value: 14, label: 'שבועיים לפני' }
];

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ currentUser, can, onBackHome, boards }) => {
  const prefsQuery = useNotificationPrefs();
  const preview = useDigestPreview();
  const save = useNotificationPrefMutations();

  const prefs = prefsQuery.data;
  const set = (patch: Partial<NotificationPrefs>) => save.mutate({ ...prefs, ...patch });

  const mayManage = can('activity.view') || Boolean(currentUser.isOwner);
  const mayManagePeople = can('people.manage');

  /*
   * One settings screen with sections, rather than settings scattered across
   * the header.
   *
   * "התראות" and "אנשים וגישה" both sat next to the notification bell, so three
   * things that mean different things looked like one cluster — and managing
   * people is a task somebody navigates to, not an interruption that deserves
   * a dialog over whatever they were doing.
   */
  const [section, setSection] = useState<'notifications' | 'sending' | 'people'>('notifications');

  return (
    <div className="min-h-dvh bg-canvas" dir="rtl">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-6">
          <Button variant="ghost" size="sm" onClick={onBackHome}>
            <ArrowRight className="h-4.5 w-4.5" />
            למסך הראשי
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-16 pt-6 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-ink">הגדרות</h1>
            <p className="mt-1 text-base text-ink-secondary">
              {section === 'notifications'
                ? 'מה שהמערכת תזכיר לך, ואיך. נשמר מיד, בלי כפתור שמירה.'
                : 'מי נמצא במערכת, ומה כל אחד יכול לעשות.'}
            </p>
          </div>

          {/*
            There is no save button, so the screen has to say so itself. A change
            that vanishes without a word is a change somebody makes twice.
          */}
          <span
            aria-live="polite"
            className="mt-1 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold"
          >
            {save.isPending ? (
              <span className="flex items-center gap-1.5 rounded-md bg-subtle px-2 py-1 text-ink-secondary">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                שומר…
              </span>
            ) : save.isSuccess ? (
              <span className="flex items-center gap-1.5 rounded-md bg-done-soft px-2 py-1 text-done">
                <Check className="h-4 w-4" aria-hidden="true" />
                נשמר
              </span>
            ) : null}
          </span>
        </div>

        {mayManagePeople && (
          <nav className="flex gap-1 border-b border-line" role="tablist" aria-label="אזורי הגדרות">
            {(
              [
                { id: 'notifications' as const, label: 'התראות', icon: Bell },
                { id: 'sending' as const, label: 'שליחה', icon: Send },
                { id: 'people' as const, label: 'אנשים וגישה', icon: Users }
              ]
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={section === id}
                onClick={() => setSection(id)}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-3 py-2.5 text-base font-semibold transition-colors',
                  section === id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-ink-tertiary hover:text-ink'
                )}
              >
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>
        )}

        {section === 'sending' && mayManagePeople ? (
          <ChannelsSection />
        ) : section === 'people' && mayManagePeople ? (
          <UserPermissionsModal
            inline
            isOpen
            onClose={() => undefined}
            boards={boards}
            currentUser={currentUser}
          />
        ) : !prefs ? (
          <div className="flex items-center justify-center gap-2 py-16 text-ink-tertiary">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            טוען…
          </div>
        ) : (
          <>
            <Card icon={Bell} title="המשימות שלי" blurb="תזכורות על העבודה שעל שמך.">
              <Row label="אם לא התחלתי לטפל במשימה" hint="מפסיק מעצמו ברגע שהמשימה יוצאת לדרך.">
                <Pills
                  options={DAYS_UNTOUCHED}
                  value={prefs.stalledAfterDays}
                  onChange={(stalledAfterDays) => set({ stalledAfterDays })}
                />
              </Row>

              <Row label="לפני תאריך היעד">
                <Pills
                  options={DAYS_BEFORE}
                  value={prefs.dueBeforeDays}
                  onChange={(dueBeforeDays) => set({ dueBeforeDays })}
                />
              </Row>

              <Row label="כשמשימה באיחור" hint="מופיע פעם ביום, עד שהמשימה נסגרת.">
                <Toggle
                  value={prefs.overdue}
                  onChange={(overdue) => set({ overdue })}
                  onLabel="להזכיר"
                  offLabel="לא להזכיר"
                />
              </Row>
            </Card>

            <Card
              icon={CalendarClock}
              title="תאריכים בקמפיינים"
              blurb="בקרה, הקפאת שינויים, עלייה לאוויר וסיום קמפיין."
            >
              <Row label="להזכיר לי">
                <Pills
                  options={MILESTONE_BEFORE}
                  value={prefs.milestoneBeforeDays}
                  onChange={(milestoneBeforeDays) => set({ milestoneBeforeDays })}
                />
              </Row>
            </Card>

            <Card icon={Mail} title="איך תרצה לקבל הודעות?" blurb="בתוך המערכת זה תמיד דלוק — הפעמון למעלה.">
              <Row label="מייל">
                <Pills
                  options={[
                    { value: 'digest' as const, label: 'סיכום יומי אחד' },
                    { value: 'off' as const, label: 'בלי מייל' }
                  ]}
                  value={prefs.email}
                  onChange={(email) => set({ email })}
                />
              </Row>

              {prefs.email === 'digest' && (
                <>
                  <Row label="שעת הסיכום">
                    <Pills
                      options={[6, 7, 8, 9, 10, 16].map((h) => ({
                        value: h,
                        label: `${String(h).padStart(2, '0')}:00`
                      }))}
                      value={prefs.digestHour}
                      onChange={(digestHour) => set({ digestHour })}
                    />
                  </Row>
                  <Row label="באילו ימים">
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((label, day) => {
                        const on = prefs.digestDays.includes(day);
                        return (
                          <button
                            key={day}
                            onClick={() =>
                              set({
                                digestDays: on
                                  ? prefs.digestDays.filter((d) => d !== day)
                                  : [...prefs.digestDays, day].sort((a, b) => a - b)
                              })
                            }
                            aria-pressed={on}
                            className={cn(
                              'grid aspect-square h-9 w-9 place-items-center rounded-lg border-2 text-base font-bold transition-colors',
                              on
                                ? 'border-primary bg-primary-soft text-primary'
                                : 'border-line bg-surface text-ink-tertiary hover:border-line-strong'
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </Row>
                </>
              )}

              <Row
                label="SMS"
                hint="כבוי כברירת מחדל. הודעה לטלפון קוטעת אדם באמצע, וכמעט שום דבר כאן לא מצדיק את זה."
              >
                <Pills
                  options={[
                    { value: 'off' as const, label: 'כבוי' },
                    { value: 'urgent' as const, label: 'רק דברים דחופים' }
                  ]}
                  value={prefs.sms}
                  onChange={(sms) => set({ sms })}
                />
              </Row>

              {prefs.sms !== 'off' && <PhoneRow currentPhone={currentUser.phone ?? null} />}

              {/*
                What is actually true, asked of the server.
                
                This was a fixed sentence saying mail "is not connected yet",
                and it stayed on the screen after it was connected. A settings
                page describing a state nobody has rechecked since it was
                written is worse than no notice at all — it teaches people that
                the screen does not know.
              */}
              <DeliveryNotice delivery={preview.data?.delivery} assignment={preview.data?.assignmentDelivery} />
            </Card>

            {mayManage && (
              <Card
                icon={Users}
                title="מעקב אחרי עבודה של אחרים"
                blurb="אם אתה מנהל צוות או פרויקט, אפשר להוסיף לסיכום היומי שלך גם משימות של אנשים אחרים."
              >
                <Row
                  label="האם להוסיף לסיכום היומי גם משימות של אחרים?"
                  hint="רק מה שתקוע: משימות שעבר להן התאריך, ומשימות שאף אחד לא התחיל. לא עדכון על כל פעולה שמישהו עושה."
                >
                  <Pills
                    options={[
                      { value: 'none' as const, label: 'לא, רק המשימות שלי' },
                      { value: 'team' as const, label: 'כן, של הצוות שלי' },
                      { value: 'all' as const, label: 'כן, של כל העובדים' }
                    ]}
                    value={prefs.managerScope}
                    onChange={(managerScope) => set({ managerScope })}
                  />
                </Row>

                {/*
                  An example, because "scope" is an abstraction and a line of a
                  real message is not. This is exactly what the extra section
                  looks like when it appears.
                */}
                {prefs.managerScope !== 'none' && (
                  <div className="rounded-lg bg-canvas px-3 py-2.5">
                    <p className="text-sm font-semibold text-ink-secondary">
                      איך זה ייראה בסיכום שלך
                    </p>
                    <p className="mt-1 text-base text-ink" dir="rtl">
                      אצל הצוות
                      <br />
                      <span className="text-ink-secondary">
                        · באיחור: הכנת דיוור ללקוחות — חנוכה · אצל שיר
                      </span>
                    </p>
                  </div>
                )}
              </Card>
            )}

            <Card icon={Eye} title="מה היה נשלח לי היום" blurb="בדיוק מה שהיה מגיע אליך, בלי להפעיל כלום.">
              {preview.isLoading ? (
                <p className="text-base text-ink-tertiary">טוען…</p>
              ) : !preview.data?.hasAnything ? (
                <p className="flex items-center gap-2 text-base text-ink-secondary">
                  <Check className="h-5 w-5 text-done" aria-hidden="true" />
                  היום אין מה לשלוח — ולכן לא היה נשלח כלום.
                </p>
              ) : (
                <pre dir="rtl" className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-canvas px-3 py-3 text-start font-sans text-base leading-relaxed text-ink">
                  {preview.data.text}
                </pre>
              )}
            </Card>

            {save.isError && (
              <p className="text-base text-late">לא הצלחנו לשמור. נסה שוב.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
};

/**
 * Where things stand with sending, in one honest line.
 *
 * Silent when everything is on: a green banner saying "working" is a thing to
 * read every time you open the screen, and it says nothing you needed.
 */
const DeliveryNotice: React.FC<{
  delivery: DigestPreview['delivery'] | undefined;
  assignment: DigestPreview['assignmentDelivery'] | undefined;
}> = ({ delivery, assignment }) => {
  if (!delivery) return null;

  // Both on: nothing to say, and nothing to read every morning.
  if (delivery === 'send' && assignment === 'send') return null;

  /*
   * The common state today, and the one a fixed sentence gets wrong.
   *
   * Being handed a task does send a mail; the daily summary does not yet. A
   * single "sending is off" would be a lie to somebody who just received one,
   * and "sending is on" a lie to somebody waiting for the eight o'clock mail.
   */
  const text =
    assignment === 'send'
      ? 'שיוך למשימה שולח מייל מיד. הסיכום היומי עדיין לא מופעל — הוא מופיע בינתיים בפעמון שלמעלה.'
      : delivery === 'unconfigured'
        ? 'שליחת מייל ו-SMS עדיין לא מחוברת. ההתראות מופיעות בינתיים בפעמון שלמעלה, וההגדרות כאן נשמרות.'
        : 'החיבור לספק מוכן, אבל שליחת מייל ו-SMS עדיין לא הופעלה. ההתראות מופיעות בינתיים בפעמון שלמעלה, וההגדרות כאן נשמרות.';

  return (
    <p className="flex items-start gap-2 rounded-lg bg-progress-soft px-3 py-2.5 text-base text-ink">
      <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-progress" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
};

/**
 * The number, only for the person it belongs to.
 *
 * Kept in local state while it is being typed, because a field that reformats
 * itself under the cursor is a field people fight with. It is normalised once,
 * on the server, when they are done — and if it cannot be, they are told now
 * rather than by a text message that never arrives.
 */
const PhoneRow: React.FC<{ currentPhone: string | null }> = ({ currentPhone }) => {
  const save = useSavePhone();
  const [draft, setDraft] = React.useState(currentPhone ?? '');

  React.useEffect(() => setDraft(currentPhone ?? ''), [currentPhone]);

  const commit = () => {
    const value = draft.trim();
    if (value === (currentPhone ?? '')) return;
    save.mutate(value === '' ? null : value);
  };

  return (
    <Row
      label="המספר שלך לקבלת SMS"
      hint="לכאן יישלחו ההודעות אליך. בלי מספר אין לאן לשלוח, ואפשר למחוק אותו בכל רגע."
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Smartphone
            className="pointer-events-none absolute end-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-tertiary"
            aria-hidden="true"
          />
          <input
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoComplete="tel"
            placeholder="050-1234567"
            aria-label="מספר נייד לקבלת SMS"
            aria-invalid={save.isError || undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={cn(
              'h-11 w-52 rounded-lg border-2 bg-surface px-3 pe-10 text-start text-base text-ink',
              'focus:border-primary focus:outline-none',
              save.isError ? 'border-late' : 'border-line'
            )}
          />
        </div>

        {save.isPending && <Loader2 className="h-4.5 w-4.5 animate-spin text-ink-tertiary" aria-hidden="true" />}
        {save.isSuccess && !save.isPending && (
          <span className="flex items-center gap-1 text-sm font-semibold text-done">
            <Check className="h-4 w-4" aria-hidden="true" />
            נשמר
          </span>
        )}
      </div>

      {save.isError && (
        <p role="alert" className="mt-1.5 text-base text-late">
          מספר הנייד לא נראה תקין. לדוגמה: 050-1234567
        </p>
      )}
    </Row>
  );
};

/**
 * Every master switch, in one place, with the truth next to it.
 *
 * This screen exists because "why didn't anybody get an email?" had no answer
 * anywhere a person here could reach. The switches used to live only in
 * environment variables, which means the answer was in a dashboard nobody in
 * this company has an account for, and changing one needed a deploy.
 *
 * A switch that cannot work is still shown — greyed, with the reason. Hiding it
 * would leave somebody hunting for a control that is simply not available yet.
 */
const CHANNELS: {
  key: 'assignment' | 'digest';
  title: string;
  blurb: string;
  example: string;
  icon: typeof Mail;
}[] = [
  {
    key: 'assignment',
    title: 'מייל כששייכו לך משימה',
    blurb: 'יוצא מיד, לאדם אחד — זה שהרגע שייכו אליו.',
    example: 'לדוגמה: שמת את רומי על "הכנת באנרים" — רומי מקבלת מייל עם קישור ישר למשימה.',
    icon: Mail
  },
  {
    key: 'digest',
    title: 'הסיכום היומי',
    blurb: 'יוצא פעם ביום בבוקר, לכל מי שיש לו מה לקבל. אם אין — לא נשלח כלום.',
    example: 'לדוגמה: בבוקר ראשון, מי שיש לו משימה שאיחרה או תאריך שמתקרב מקבל מייל אחד מרוכז.',
    icon: CalendarClock
  }
];

const CHANNEL_STATE: Record<
  'on' | 'off' | 'blocked' | 'unconfigured',
  { label: string; tone: string; note?: string }
> = {
  on: { label: 'פעיל', tone: 'bg-done-soft text-done' },
  off: { label: 'כבוי', tone: 'bg-subtle text-ink-secondary' },
  blocked: {
    label: 'חסום',
    tone: 'bg-progress-soft text-progress',
    note: 'הסביבה הזאת לא מורשית לשלוח מהסוג הזה. המתג יעבוד אחרי שההרשאה תיפתח בפריסה.'
  },
  unconfigured: {
    label: 'לא מחובר',
    tone: 'bg-progress-soft text-progress',
    note: 'אין ספק שליחה מחובר, אז אין מה להדליק עדיין.'
  }
};

function ChannelsSection() {
  const channels = useChannels();
  const save = useSaveChannels();

  if (!channels.data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-ink-tertiary">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        טוען…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {CHANNELS.map(({ key, title, blurb, example, icon: Icon }) => {
        const channel = channels.data[key];
        const meta = CHANNEL_STATE[channel.state];
        const movable = channel.state === 'on' || channel.state === 'off';

        return (
          <Card key={key} icon={Icon} title={title} blurb={blurb}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={cn('rounded-md px-2 py-1 text-sm font-semibold', meta.tone)}>
                {meta.label}
              </span>
              <Toggle
                value={channel.enabled}
                onChange={(next) => save.mutate({ [key]: next })}
                onLabel="להדליק"
                offLabel="לכבות"
              />
            </div>
            <p className="text-base text-ink-secondary">{example}</p>
            {meta.note && <p className="text-sm text-ink-tertiary">{meta.note}</p>}
            {!movable && (
              <p className="sr-only">המתג לא זמין כרגע בסביבה הזאת.</p>
            )}
          </Card>
        );
      })}

      {/*
       * The one that is deliberately not here.
       *
       * A switch that can lock every employee out of the system is not a
       * setting. Saying so is better than leaving somebody looking for it.
       */}
      <p className="rounded-lg bg-subtle px-3 py-2.5 text-base text-ink-secondary">
        קודי כניסה נשלחים תמיד, ואין להם מתג — בלעדיהם אף אחד לא יוכל להיכנס למערכת.
      </p>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  blurb,
  children
}: {
  icon: typeof Bell;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <header className="mb-3 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-subtle text-ink-secondary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-md font-bold text-ink">{title}</h2>
          <p className="text-base text-ink-secondary">{blurb}</p>
        </div>
      </header>
      <div className="flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

/*
 * A row is a group, not a heading with some buttons under it.
 *
 * Sighted, "אחרי 3 ימים" sits visibly beneath "אם לא התחלתי לטפל במשימה". Read
 * aloud, without the group, it is a button called "אחרי 3 ימים" answering
 * nothing. One wrapper here fixes every row on the screen, including the
 * weekday squares, which are not Pills.
 */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const labelId = React.useId();
  const hintId = React.useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
      className="flex flex-col gap-1.5 border-t border-line pt-3 first:border-0 first:pt-0"
    >
      <span id={labelId} className="text-base font-semibold text-ink">
        {label}
      </span>
      {hint && (
        <span id={hintId} className="text-sm text-ink-tertiary">
          {hint}
        </span>
      )}
      {children}
    </div>
  );
}

/** A row of sentences to pick from. Bigger targets than a dropdown, and all of
 *  the options are visible, which is what makes a choice feel like a choice. */
function Pills<T extends string | number>({
  options,
  value,
  onChange
}: {
  options: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'rounded-lg border-2 px-3 py-1.5 text-base font-semibold transition-colors',
              active
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  value,
  onChange,
  onLabel,
  offLabel
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <Pills
      options={[
        { value: 'on', label: onLabel },
        { value: 'off', label: offLabel }
      ]}
      value={value ? 'on' : 'off'}
      onChange={(v) => onChange(v === 'on')}
    />
  );
}
