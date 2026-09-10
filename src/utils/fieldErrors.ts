/**
 * Taking somebody to the thing that is wrong.
 *
 * The server already says which field it rejected. Showing that as a red
 * message floating in the corner throws away the useful half: the person is
 * told something is wrong and then left to find it themselves, in a form that
 * may be scrolled somewhere else entirely.
 *
 * So the message goes to the field. It scrolls into view, takes focus, and is
 * announced — and because it has focus, the next thing typed fixes it.
 */

/** Server field names to the element ids the forms actually use. */
const FIELD_IDS: Record<string, string[]> = {
  title: ['ae-title', 'ev-title'],
  actualDate: ['ae-actual', 'ae-month', 'ev-actual'],
  actualPrecision: ['ae-actual', 'ev-actual'],
  prepMonths: ['ae-prep', 'ev-prep'],
  kickoffDate: ['ae-kickoff', 'ev-kickoff'],
  kickoffMeetingDate: ['ae-kickoffMeeting', 'ev-kickoffMeeting'],
  workStartDate: ['ae-workStart', 'ev-workStart'],
  reviewDate: ['ae-review', 'ev-review'],
  freezeDate: ['ae-freeze', 'ev-freeze'],
  announceDate: ['ae-announce', 'ev-announce'],
  campaignEndDate: ['ae-campaignEnd', 'ev-campaignEnd'],
  dueDate: ['task-due'],
  assigneeId: ['task-assignee']
};

/**
 * Puts the cursor on the first field the server complained about.
 *
 * Returns whether it found one — a caller that gets `false` still has to say
 * something, because an error nobody can see is worse than one in the corner.
 */
export function focusFirstBadField(details: { field: string; message: string }[] | undefined): boolean {
  for (const detail of details ?? []) {
    // Zod reports nested paths as `dates.kickoffDate`; the last segment is the
    // field a person actually sees.
    const name = detail.field.split('.').pop() ?? detail.field;

    for (const id of FIELD_IDS[name] ?? [name]) {
      const el = document.getElementById(id);
      if (!el) continue;

      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // After the scroll, so the browser does not fight its own smooth scroll
      // by jumping to the focused element.
      setTimeout(() => {
        (el as HTMLInputElement).focus({ preventScroll: true });
        el.setAttribute('aria-invalid', 'true');
      }, 250);
      return true;
    }
  }
  return false;
}
