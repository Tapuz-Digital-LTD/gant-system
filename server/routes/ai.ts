import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

export const aiRouter = Router();

// Lazy Gemini client helper
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    console.error('Error initializing GoogleGenAI:', err);
    return null;
  }
}

// POST generate smart tasks & checklist for an event
aiRouter.post('/suggest-tasks', async (req: Request, res: Response) => {
  try {
    const { eventTitle, category, kickoffDate, actualDate, prepMonths } = req.body;

    if (!eventTitle) {
      return res.status(400).json({ success: false, message: 'eventTitle is required' });
    }

    const ai = getGeminiClient();

    if (ai) {
      try {
        const prompt = `אתה מומחה ניהול פרויקטים, שיווק, תווי שי (Giftcard) ומבצעים בישראל עבור חברת XTRA Giftcard.
עליך לייצר רשימת משימות מומלצות, חלוקת תפקידים וצ'קליסט עבור האירוע הבא:
- שם האירוע: "${eventTitle}"
- קטגוריה: "${category || 'קמפיין'}"
- תאריך התנעה (עולים לאוויר): "${kickoffDate || 'לא הוגדר'}"
- תאריך אמת (האירוע עצמו): "${actualDate || 'לא הוגדר'}"
- חודשי הכנה נדרשים: ${prepMonths || 2} חודשים

החזר תשובה אך ורק בפורמט JSON תקין (ללא markdown וללא הערות) במבנה הבא:
{
  "recommendedTasks": [
    {
      "title": "שם המשימה",
      "description": "הסבר קצר ותמציתי",
      "priority": "high" | "medium" | "urgent" | "low",
      "suggestedRole": "שיווק" | "תפעול" | "מכירות B2B" | "עיצוב",
      "daysBeforeKickoff": 30,
      "checklist": ["סעיף 1", "סעיף 2", "סעיף 3"]
    }
  ],
  "strategicTips": ["טיפ אסטרטגי 1", "טיפ 2"]
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const text = response.text?.trim() || '{}';
        const parsed = JSON.parse(text);
        return res.json({ success: true, aiGenerated: true, data: parsed });
      } catch (geminiError: any) {
        console.error('Gemini API call failed, falling back to heuristics:', geminiError);
      }
    }

    // Heuristic fallback if API key not available or request fails
    const fallbackTasks = [
      {
        title: `תכנון קריאייטיב ודפי נחיתה עבור ${eventTitle}`,
        description: 'עיצוב באנרים, מודעות דיגיטל, גרפיקה לסושיאל ודפי נחיתה ייעודיים',
        priority: 'high',
        suggestedRole: 'שיווק',
        daysBeforeKickoff: 21,
        checklist: [
          'גיבוש מסר שיווקי וסלוגן',
          'עיצוב באנרים בגדלים שונים',
          'אישור סקיצות סופי'
        ]
      },
      {
        title: `הגדרת מלאי תווי שי ושוברים במערכת`,
        description: 'הקצאת קודי שובר, בדיקת סליקה מול רשתות ואימות אחוזי הנחה',
        priority: 'urgent',
        suggestedRole: 'תפעול',
        daysBeforeKickoff: 14,
        checklist: [
          'תיאום מול רשתות מובילות',
          'בדיקת טעינת כרטיסים במערכת הליבה',
          'וידוא תוקף ומגבלות מימוש'
        ]
      },
      {
        title: `הפצת הצעות מחיר לוועדי עובדים וארגונים (B2B)`,
        description: 'פנייה יזומה למנהלות רווחה ומשאבי אנוש להזמנת תווי שי מרוכזים',
        priority: 'medium',
        suggestedRole: 'מכירות B2B',
        daysBeforeKickoff: 45,
        checklist: [
          'הכנת קטלוג הטבות מיוחד לארגונים',
          'דיוור מותאם אישית למאגר הלקוחות',
          'מעקב וסגירת עסקאות'
        ]
      }
    ];

    return res.json({
      success: true,
      aiGenerated: false,
      data: {
        recommendedTasks: fallbackTasks,
        strategicTips: [
          'מומלץ להתחיל בהפצה לוועדי עובדים לפחות 6 שבועות מראש לפני מועד החג/קמפיין.',
          'ודא כי כל הרשתות המשתתפות מעודכנות בקוד המבצע למניעת תקלות בקופות.'
        ]
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// POST executive AI insights for upcoming months
aiRouter.post('/campaign-insights', async (req: Request, res: Response) => {
  try {
    const { boardName, eventCount, upcomingEvents } = req.body;
    const ai = getGeminiClient();

    if (ai) {
      try {
        const prompt = `נתח את תוכנית העבודה הבאה עבור לוח "${boardName}":
סך אירועים: ${eventCount}
אירועים קרובים: ${JSON.stringify(upcomingEvents || [])}

הפק סיכום מנהלים קצר ותמציתי בעברית בפורמט JSON:
{
  "summary": "סיכום קצר של תוכנית העבודה",
  "criticalMilestones": ["אבן דרך קריטית 1", "אבן דרך 2"],
  "workloadAssessment": "הערכת עומסים והמלצה לצוות"
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const text = response.text?.trim() || '{}';
        const parsed = JSON.parse(text);
        return res.json({ success: true, aiGenerated: true, data: parsed });
      } catch (err) {
        console.error('Gemini insights error:', err);
      }
    }

    return res.json({
      success: true,
      aiGenerated: false,
      data: {
        summary: `בלוח ${boardName} מוגדרים ${eventCount} אירועים וקמפיינים פרוסים על פני השנים 2026–2028.`,
        criticalMilestones: [
          'התנעת קמפיין ראש השנה לפחות חודשיים מראש לקליטת הזמנות שי מוקדמות',
          'היערכות ל-ShoppingIL ו-Black Friday בחודשי אוקטובר-נובמבר'
        ],
        workloadAssessment: 'מומלץ לוודא חלוקת משימות מאוזנת בין מחלקת השיווק למחלקת התפעול.'
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});
