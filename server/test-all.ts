/**
 * Runs every suite, with the environment that makes them safe.
 *
 * `GANTT_TEST=true` in an npm script would apply to the first command in the
 * chain and no others, which is precisely the kind of half-applied safety rule
 * that holds until the day it matters. Set once here, inherited by every child.
 *
 * What it buys: Inforu refuses to send in a test regardless of any key present,
 * and the assistant never reaches Anthropic. A suite run cannot message an
 * employee or spend money.
 */
import { spawnSync } from 'node:child_process';

const SUITES = [
  'src/utils/csv.test.ts',
  'src/utils/filterEvents.test.ts',
  'src/data/milestones.test.ts',
  'src/utils/period.test.ts',
  'src/utils/routes.test.ts',
  'src/utils/notificationGroups.test.ts',
  'server/db/migrate.test.ts',
  'server/import/import.test.ts',
  'server/export/export.test.ts',
  'server/db/schema.test.ts',
  'server/notifications/reminders.test.ts',
  'server/notifications/milestone-labels.test.ts',
  'server/notifications/inforu.test.ts',
  'server/ai.test.ts',
  'server/validation.test.ts',
  'server/db/repo.test.ts',
  'server/api.test.ts',
  'server/access.test.ts',
  'server/reports/reports.test.ts'
];

const env = {
  ...process.env,
  GANTT_TEST: 'true',
  NODE_ENV: 'test',
  // Belt and braces: even if a real key is sitting in the environment, the
  // switches that would let it out are cleared for the run.
  GANTT_ALLOW_REAL_SEND: '',
  GANTT_AUTH_SEND: '',
  GANTT_ASSIGNMENT_SEND: '',
  GANTT_NOTIFICATIONS_SEND: ''
};

for (const suite of SUITES) {
  const run = spawnSync('npx', ['tsx', suite], { stdio: 'inherit', env });
  if (run.status !== 0) {
    console.error(`\n✗ ${suite}`);
    process.exit(run.status ?? 1);
  }
}
console.log('\nכל החבילות עברו ✓');
