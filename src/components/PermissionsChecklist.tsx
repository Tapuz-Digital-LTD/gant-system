import React from 'react';
import { Check, Loader2, ShieldCheck, Info } from 'lucide-react';
import { UserRole } from '../types';
import { usePermissions, usePermissionMutation, describeError } from '../hooks/useBoardData';
import { useToast, cn } from './ui';

/**
 * The permission matrix, as a checklist.
 *
 * Ticking a box saves immediately — there is no separate save button, because a
 * grid of forty checkboxes with one save button is exactly where people lose work.
 */
export function PermissionsChecklist({ enabled, isOwner }: { enabled: boolean; isOwner: boolean }) {
  const { notify } = useToast();
  const query = usePermissions(enabled);
  const mutation = usePermissionMutation();

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-ink-tertiary" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <p className="py-8 text-center text-base text-late">{describeError(query.error)}</p>;
  }

  const { catalog, roles, matrix } = query.data;

  // Group order follows the catalog, so adding a capability shows up in place.
  const groups: { name: string; items: typeof catalog }[] = [];
  for (const item of catalog) {
    const existing = groups.find((g) => g.name === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  const toggle = async (role: UserRole, permission: string, next: boolean) => {
    try {
      await mutation.mutateAsync({ role, permission, allowed: next });
    } catch (err) {
      notify('error', describeError(err));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2.5 rounded-lg bg-primary-soft px-3 py-2.5">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="text-base text-ink">
          סמן מה כל סוג משתמש יכול לעשות. השינוי נשמר מיד.
          {isOwner && ' כמנהל ראשי, ההרשאות שלך לא מושפעות מהטבלה הזו.'}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[30rem]">
          <thead>
            <tr className="border-b border-line bg-canvas">
              <th className="px-3 py-2.5 text-start text-sm font-semibold text-ink-secondary">פעולה</th>
              {roles.map((r) => (
                <th key={r.key} className="w-24 px-3 py-2.5 text-center text-sm font-semibold text-ink-secondary">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {groups.map((group) => (
              <React.Fragment key={group.name}>
                <tr className="bg-subtle/60">
                  <td colSpan={roles.length + 1} className="px-3 py-1.5 text-xs font-semibold text-ink-tertiary">
                    {group.name}
                  </td>
                </tr>

                {group.items.map((item) => (
                  <tr key={item.key} className="border-b border-line last:border-0 hover:bg-canvas">
                    <td className="px-3 py-2 text-base text-ink">{item.label}</td>

                    {roles.map((r) => {
                      const on = matrix[r.key]?.[item.key] ?? false;
                      // Admins keep the key to the permissions screen itself.
                      const locked = r.key === 'admin' && item.key === 'permissions.manage' && !isOwner;

                      return (
                        <td key={r.key} className="px-3 py-2 text-center">
                          <button
                            role="switch"
                            aria-checked={on}
                            aria-label={`${item.label} — ${r.label}`}
                            disabled={locked}
                            onClick={() => toggle(r.key, item.key, !on)}
                            className={cn(
                              'grid h-6 w-6 place-items-center rounded-md border transition-colors',
                              on
                                ? 'border-done bg-done text-white hover:bg-done/90'
                                : 'border-line-strong bg-surface hover:border-ink-tertiary',
                              locked && 'cursor-not-allowed opacity-50'
                            )}
                          >
                            {on && <Check className="h-4 w-4" strokeWidth={3} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-1.5 text-sm text-ink-tertiary">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        אורחים מוגבלים גם לפי הבחר לוח שסימנת להם — גם אם התפקיד שלהם מרשה יותר.
      </p>
    </div>
  );
}
