import express, { type Express } from 'express';

/**
 * The body rules, in one place.
 *
 * There are two of them and they interact: an uploaded workbook needs room, and
 * nothing else does — a 25MB limit on every route is a 25MB hole. Written out
 * separately in each entry point, the pair drifted immediately: the local
 * server, the serverless function and the test suite each had their own idea,
 * and the suite's 100kb default rejected the very file the feature exists for
 * with an HTML error page.
 *
 * Order matters. body-parser marks a request it has already read, so the
 * generous parser has to be mounted first for the strict one to leave it alone.
 */
export function mountBodyParsers(app: Express): void {
  app.use('/api/import', express.json({ limit: '25mb' }));
  app.use(express.json({ limit: '1mb' }));
}
