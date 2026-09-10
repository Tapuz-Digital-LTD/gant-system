/**
 * The milestone names, for text the server writes.
 *
 * A deliberate mirror of `src/data/milestones.ts`. The client list carries
 * icons and colours and imports lucide-react, which has no business inside a
 * serverless function — and the client cannot import server code either. So
 * the names are written twice, and `milestone-labels.test.ts` fails the build
 * if the two ever disagree.
 */

export interface MilestoneLabel {
  key: string;
  /** The column on `events`, in the shape the repository returns. */
  field:
    | 'kickoffMeetingDate'
    | 'workStartDate'
    | 'reviewDate'
    | 'freezeDate'
    | 'kickoffDate'
    | 'announceDate'
    | 'campaignEndDate';
  /** What a person calls it. */
  short: string;
  order: number;
}

export const MILESTONE_LABELS: MilestoneLabel[] = [
  { key: 'kickoffMeeting', field: 'kickoffMeetingDate', short: 'ישיבת התנעה', order: 1 },
  { key: 'workStart', field: 'workStartDate', short: 'תחילת עבודה', order: 2 },
  { key: 'review', field: 'reviewDate', short: 'בקרה', order: 3 },
  { key: 'freeze', field: 'freezeDate', short: 'הקפאת שינויים', order: 4 },
  { key: 'kickoff', field: 'kickoffDate', short: 'עלייה לאוויר', order: 5 },
  { key: 'announce', field: 'announceDate', short: 'הודעה לחברה', order: 6 },
  { key: 'campaignEnd', field: 'campaignEndDate', short: 'סיום הקמפיין', order: 8 }
];
