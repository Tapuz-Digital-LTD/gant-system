import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

/**
 * AI suggestions are optional and never on the critical path.
 * Without a working model the endpoint says so — it does not serve canned text
 * dressed up as generated output.
 */

const suggestInput = z.object({
  eventTitle: z.string().trim().min(1).max(200),
  category: z.string().optional(),
  kickoffDate: z.string().nullish(),
  actualDate: z.string().nullish(),
  prepMonths: z.number().int().min(0).max(12).default(2)
});

// Per-instance throttle. Real enforcement moves to the edge (Vercel WAF) with auth;
// this is here so a loop cannot run up a bill before that lands.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits: number[] = [];

function overLimit(): boolean {
  const now = Date.now();
  while (hits.length && now - hits[0] > WINDOW_MS) hits.shift();
  if (hits.length >= MAX_PER_WINDOW) return true;
  hits.push(now);
  return false;
}

export function createAiRouter(): Router {
  const ai = Router();

  ai.post('/suggest-tasks', async (req: Request, res: Response) => {
    const parsed = suggestInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'קלט לא תקין' } });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        aiGenerated: false,
        error: { code: 'AI_UNAVAILABLE', message: 'שירות ההצעות אינו מוגדר' }
      });
    }

    if (overLimit()) {
      return res.status(429).json({
        aiGenerated: false,
        error: { code: 'RATE_LIMITED', message: 'יותר מדי בקשות. נסה שוב בעוד דקה.' }
      });
    }

    const { eventTitle, category, kickoffDate, actualDate, prepMonths } = parsed.data;

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const client = new GoogleGenAI({ apiKey });

      const prompt = `אתה מומחה לתכנון קמפיינים ותווי שי בישראל.
הפק רשימת משימות מומלצת עבור:
- אירוע: "${eventTitle}"
- קטגוריה: ${category ?? 'קמפיין'}
- תאריך תאריך התנעה: ${kickoffDate ?? 'לא הוגדר'}
- תאריך אמת: ${actualDate ?? 'לא הוגדר'}
- חודשי הכנה: ${prepMonths}

החזר JSON תקין בלבד:
{"recommendedTasks":[{"title":"","description":"","priority":"high|medium|urgent|low","suggestedRole":"","checklist":[""]}],"strategicTips":[""]}`;

      const response = await Promise.race([
        client.models.generateContent({
          model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 20_000))
      ]);

      const data = JSON.parse(response.text?.trim() || '{}');
      return res.json({ aiGenerated: true, data });
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'ai_suggest_failed', error: String(err) }));
      return res.status(502).json({
        aiGenerated: false,
        error: { code: 'AI_FAILED', message: 'ייצור ההצעות נכשל. נסה שוב או הוסף משימות ידנית.' }
      });
    }
  });

  return ai;
}
