/**
 * The master switches, one per kind of message.
 *
 * Two layers decide whether anything actually leaves the building, and they
 * answer different questions:
 *
 *   the environment  — "is this deployment allowed to send at all?"
 *                      Keeps a laptop and the test suite silent even when they
 *                      are holding production's credentials. Not editable from
 *                      a screen, on purpose.
 *
 *   these switches   — "has this organisation turned this kind on?"
 *                      An administrator's decision, changed without a deploy,
 *                      and visible on the settings screen rather than buried in
 *                      a dashboard nobody here has an account for.
 *
 * Both must say yes. Sign-in codes are deliberately absent: a switch that can
 * lock every employee out of the system is not a setting, it is a trap.
 */
export interface ChannelSwitches {
  /** The mail sent the moment somebody is handed a task. */
  assignment: boolean;
  /** The daily summary, and the reminders inside it. */
  digest: boolean;
}

/*
 * Assignment mail on, digest off.
 *
 * One is a reply to something a colleague just did, addressed to the one person
 * it concerns — the kind of message people are annoyed to *miss*. The other is
 * a broadcast to everybody on a timer, which is the kind an organisation
 * silently filters into a folder if it arrives before anyone asked for it.
 */
export const DEFAULT_CHANNELS: ChannelSwitches = {
  assignment: true,
  digest: false
};

/** Anything at all in, usable switches out. */
export function readChannels(raw: unknown): ChannelSwitches {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    assignment: typeof v.assignment === 'boolean' ? v.assignment : DEFAULT_CHANNELS.assignment,
    digest: typeof v.digest === 'boolean' ? v.digest : DEFAULT_CHANNELS.digest
  };
}
