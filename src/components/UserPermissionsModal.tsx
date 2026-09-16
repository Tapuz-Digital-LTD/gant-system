import React, { useState } from 'react';
import { UserPlus, Trash2, Loader2, Shield, Eye, Pencil, Building2, Mail, Smartphone, Users, SlidersHorizontal, Crown } from 'lucide-react';
import { GanttBoard, Person, UserAccess, UserRole } from '../types';
import { usePeople, usePeopleMutations, describeError } from '../hooks/useBoardData';
import { useFormValidation, isEmail, required } from '../hooks/useFormValidation';
import { avatarColor } from '../utils/eventMeta';
import { Modal, Button, Badge, Field, Input, Select, Tooltip, useToast, cn } from './ui';
import { PermissionsChecklist } from './PermissionsChecklist';
import { NoPermission } from './NoPermission';

interface UserPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  boards: GanttBoard[];
  currentUser: UserAccess;
  /**
   * Render the body without the dialog around it.
   *
   * Managing people is a settings job, not an interruption — it belongs on a
   * page somebody navigates to. The same component serves both so the two can
   * never drift into different screens for the same thing.
   */
  inline?: boolean;
}

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: 'admin', label: 'מנהל', hint: 'יכול לעשות הכול, כולל לנהל אנשים וגישה' },
  { value: 'editor', label: 'עורך', hint: 'יכול ליצור ולערוך אירועים ומשימות' },
  { value: 'viewer', label: 'צופה', hint: 'יכול לצפות ולהוריד בלבד' }
];

export const UserPermissionsModal: React.FC<UserPermissionsModalProps> = ({
  isOpen,
  onClose,
  boards,
  currentUser,
  inline = false
}) => {
  const { notify } = useToast();
  const isAdmin = currentUser.role === 'admin';

  const people = usePeople(isOpen && isAdmin);
  const m = usePeopleMutations();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  /** Optional, and the other way in: with a number they can sign in by SMS. */
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('editor');
  /** A guest reaches only the boards granted to them; staff reach the workspace. */
  const [isGuest, setIsGuest] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [tab, setTab] = useState<'people' | 'permissions'>('people');

  const form = useFormValidation({
    email: () =>
      required(email, 'מה כתובת מייל?') ??
      (isEmail(email) ? undefined : 'נראה שחסר משהו בכתובת. בדוק שיש @'),
    // Checked here as well as on the server: a number rejected after the click
    // loses the rest of the form for somebody who typed one digit too few.
    phone: () =>
      !phone.trim() || /^0?5\d[- ]?\d{3}[- ]?\d{4}$/.test(phone.replace(/[^\d-\s]/g, '').trim())
        ? undefined
        : 'מספר נייד ישראלי, למשל 050-1234567'
  });

  const run = async (work: Promise<unknown>, ok?: string) => {
    try {
      await work;
      if (ok) notify('success', ok);
      return true;
    } catch (err) {
      notify('error', describeError(err));
      return false;
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.check('up')) return;
    const added = await run(
      m.add.mutateAsync({
        email: email.trim(),
        name: name.trim() || undefined,
        role,
        isGuest,
        phone: phone.trim() || null
      }),
      'נוסף'
    );
    if (added) {
      setEmail('');
      setName('');
      setPhone('');
      form.reset();
    }
  };

  if (!isAdmin) {
    return (
      <Modal
        open={isOpen}
        onOpenChange={(o) => !o && onClose()}
        title="אנשים"
        footer={<Button variant="secondary" onClick={onClose}>סגור</Button>}
      >
        <p className="py-8 text-center text-base text-ink-secondary">
          ניהול אנשים שמור למנהלי מערכת.
        </p>
      </Modal>
    );
  }

  const list: Person[] = people.data ?? [];

  const bodyContent = (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-1 border-b border-line" role="tablist">
          {([
            { id: 'people', label: 'אנשים', icon: Users },
            { id: 'permissions', label: 'מה כל אחד יכול לעשות', icon: SlidersHorizontal }
          ] as const).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative flex items-center gap-2 px-3 py-2 text-base font-semibold transition-colors',
                  active ? 'text-primary' : 'text-ink-tertiary hover:text-ink-secondary'
                )}
              >
                <Icon className="h-5 w-5" />
                {t.label}
                {active && <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-t-full bg-primary" />}
              </button>
            );
          })}
        </div>

        {tab === 'permissions' && (
          <PermissionsChecklist enabled={isOpen} isOwner={Boolean(currentUser.isOwner)} />
        )}

        {tab === 'people' && (
        <>
        {/* --- invite --- */}
        <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-lg bg-canvas p-3">
          <span className="text-base font-semibold text-ink">הוסף אדם</span>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="מייל" required error={form.error('email')} htmlFor="up-email">
              <Input
                id="up-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@xtra.co.il"
                aria-invalid={Boolean(form.error('email'))}
                className={form.error('email') ? 'border-late' : undefined}
              />
            </Field>
            <Field label="שם" hint="לא חובה" htmlFor="up-name">
              <Input id="up-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="נייד"
              hint="לא חובה — מאפשר כניסה בקוד ל-SMS"
              error={form.error('phone')}
              htmlFor="up-phone"
            >
              <Input
                id="up-phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-000-0000"
                aria-invalid={Boolean(form.error('phone'))}
                className={cn('text-start', form.error('phone') && 'border-late')}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="תפקיד" hint={ROLES.find((r) => r.value === role)?.hint} htmlFor="up-role">
              <Select id="up-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
            </Field>

            <Field label="גישה ללוחות" htmlFor="up-scope">
              <Select
                id="up-scope"
                value={isGuest ? 'guest' : 'staff'}
                onChange={(e) => setIsGuest(e.target.value === 'guest')}
              >
                <option value="staff">צוות פנימי — רואה את כל הלוחות</option>
                <option value="guest">אורח — רואה רק לוחות ששיתפת איתו</option>
              </Select>
            </Field>
          </div>

          <Button type="submit" variant="primary" size="sm" className="self-start" disabled={m.add.isPending}>
            {m.add.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
            הוספה
          </Button>

          <p className="flex items-start gap-1.5 text-sm text-ink-tertiary">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" />
            אין צורך בסיסמה. בכניסה הראשונה הם יזינו את המייל — או את הנייד, אם מולא — ויקבלו קוד.
          </p>
        </form>

        {/* --- list --- */}
        {people.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-ink-tertiary" /></div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {list.map((u) => {
              const isMe = u.id === currentUser.id;
              const removing = confirmRemove === u.id;

              return (
                <li key={u.id} className="flex flex-col gap-2 rounded-lg border border-line px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white', avatarColor(u.email))}>
                      {u.name.charAt(0)}
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-base font-semibold text-ink">{u.name}</span>
                        {isMe && <Badge tone="primary">זה אני</Badge>}
                        {u.isOwner ? (
                          <Badge tone="ready">
                            <Crown className="h-3.5 w-3.5" />
                            מנהל ראשי
                          </Badge>
                        ) : (
                          <Badge tone={u.isGuest ? 'progress' : 'neutral'}>
                            {u.isGuest ? <Building2 className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                            {u.isGuest ? 'אורח' : 'צוות פנימי'}
                          </Badge>
                        )}
                      </span>
                      <span className="flex min-w-0 items-center gap-2 text-sm text-ink-tertiary">
                        <span className="truncate">{u.email}</span>
                        {u.phone && (
                          <span className="flex shrink-0 items-center gap-1" dir="ltr">
                            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                            {u.phone}
                          </span>
                        )}
                      </span>
                    </div>

                    {u.isOwner ? (
                      <Badge tone="neutral" className="shrink-0">מנהל · קבוע</Badge>
                    ) : (
                      <Select
                        value={u.role}
                        onChange={(e) => run(m.update.mutateAsync({ id: u.id, role: e.target.value as UserRole }), 'התפקיד עודכן')}
                        aria-label={`שנה את התפקיד של ${u.name}`}
                        className="h-8 w-28 shrink-0 text-sm"
                      >
                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </Select>
                    )}

                    {removing ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(null)}>ביטול</Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={async () => {
                            await run(m.remove.mutateAsync(u.id), 'הגישה הוסרה');
                            setConfirmRemove(null);
                          }}
                        >
                          הסרה
                        </Button>
                      </div>
                    ) : (
                      !isMe && !u.isOwner && (
                        <Tooltip label="הסר גישה">
                          <Button variant="ghost" size="sm" iconOnly aria-label={`הסר את הגישה של ${u.name}`} onClick={() => setConfirmRemove(u.id)}>
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </Tooltip>
                      )
                    )}
                  </div>

                  {/* guests need explicit board grants */}
                  {u.isGuest && (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2 ps-12">
                      <span className="text-sm text-ink-tertiary">לוחות</span>
                      {boards.map((b) => {
                        const grant = u.boards.find((g) => g.boardId === b.id);
                        return (
                          <button
                            key={b.id}
                            onClick={() =>
                              grant
                                ? run(m.revoke.mutateAsync({ boardId: b.id, userId: u.id }))
                                : run(m.grant.mutateAsync({ boardId: b.id, userId: u.id, role: 'viewer' }))
                            }
                            className={cn(
                              'flex items-center gap-1 rounded-md border px-2 py-1 text-sm transition-colors',
                              grant
                                ? 'border-primary-line bg-primary-soft text-primary'
                                : 'border-line text-ink-tertiary hover:bg-subtle'
                            )}
                          >
                            {grant && (grant.role === 'editor' ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />)}
                            {b.name}
                          </button>
                        );
                      })}
                      {u.boards.length > 0 && (
                        <Select
                          value={u.boards[0].role}
                          onChange={(e) =>
                            u.boards.forEach((g) =>
                              run(m.grant.mutateAsync({ boardId: g.boardId, userId: u.id, role: e.target.value as 'editor' | 'viewer' }))
                            )
                          }
                          aria-label="בחר גישה ללוח"
                          className="h-7 w-24 text-sm"
                        >
                          <option value="viewer">צפייה בלבד</option>
                          <option value="editor">ערוך</option>
                        </Select>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        </>
        )}
    </div>
  );

  if (inline) return bodyContent;

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="אנשים וגישה"
      description={`${list.length} אנשים`}
      footer={<Button variant="secondary" onClick={onClose}>סגור</Button>}
    >
      {bodyContent}
    </Modal>
  );
};
