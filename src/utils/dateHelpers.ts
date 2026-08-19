import { EventItem, isFloating, monthKeyOf } from '../types';
import { toCsvDocument } from './csv';

export function formatDate(isoStr?: string): string {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  if (parts.length === 2) {
    return `${parts[1]}.${parts[0]}`;
  }
  return isoStr;
}

export function parseISODate(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  if (parts.length === 2) {
    return new Date(parts[0], parts[1] - 1, 1);
  }
  return new Date();
}

export interface CalendarDayCell {
  dayNumber: number;
  inCurrentMonth: boolean;
  dateString: string; // YYYY-MM-DD
  events: {
    item: EventItem;
    type: 'kickoff' | 'actual';
    badgeLabel: string;
    bg: string;
    fg: string;
  }[];
}

export function buildMonthCalendarGrid(
  monthKey: string,
  events: EventItem[],
  showKickoffs: boolean = true,
  showActuals: boolean = true
): {
  cells: CalendarDayCell[];
  floatingEvents: EventItem[];
  kickoffsThisMonth: EventItem[];
  actualsThisMonth: EventItem[];
} {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;

  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay(); // 0 = Sunday (א)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, monthIndex, 0).getDate();

  const totalCellsCount = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  // Group events by day of current month
  const byDay: { [day: number]: CalendarDayCell['events'] } = {};

  const kickoffsThisMonth: EventItem[] = [];
  const actualsThisMonth: EventItem[] = [];
  const floatingEvents: EventItem[] = [];

  events.forEach((ev) => {
    // Check kickoffs
    if (showKickoffs && ev.kickoffDate && ev.kickoffDate.startsWith(monthKey)) {
      kickoffsThisMonth.push(ev);
      const day = Number(ev.kickoffDate.split('-')[2]);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push({
        item: ev,
        type: 'kickoff',
        badgeLabel: `תאריך תאריך התנעה: ${ev.title}`,
        bg: '#F7414B',
        fg: '#FFFFFF'
      });
    }

    // Check actual dates
    if (showActuals && ev.actualDate) {
      if (isFloating(ev) && monthKeyOf(ev) === monthKey) {
        if (!floatingEvents.some((f) => f.id === ev.id)) {
          floatingEvents.push(ev);
        }
        if (!actualsThisMonth.some((a) => a.id === ev.id)) {
          actualsThisMonth.push(ev);
        }
      } else if (ev.actualDate.startsWith(monthKey)) {
        if (!actualsThisMonth.some((a) => a.id === ev.id)) {
          actualsThisMonth.push(ev);
        }
        const parts = ev.actualDate.split('-');
        if (parts.length === 3) {
          const day = Number(parts[2]);
          if (!byDay[day]) byDay[day] = [];
          byDay[day].push({
            item: ev,
            type: 'actual',
            badgeLabel: `תאריך אמת: ${ev.title}`,
            bg: '#3A3534',
            fg: '#FFFFFF'
          });
        }
      }
    }
  });

  const cells: CalendarDayCell[] = [];

  for (let i = 0; i < totalCellsCount; i++) {
    const dayNum = i - firstDayOfWeek + 1;
    const inCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;

    let displayDay = dayNum;
    let cellDateStr = '';

    if (inCurrentMonth) {
      displayDay = dayNum;
      const mm = String(monthIndex + 1).padStart(2, '0');
      const dd = String(dayNum).padStart(2, '0');
      cellDateStr = `${year}-${mm}-${dd}`;
    } else if (dayNum < 1) {
      displayDay = daysInPrevMonth + dayNum;
      const prevMonth = monthIndex === 0 ? 12 : monthIndex;
      const prevYear = monthIndex === 0 ? year - 1 : year;
      cellDateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(displayDay).padStart(2, '0')}`;
    } else {
      displayDay = dayNum - daysInMonth;
      const nextMonth = monthIndex === 11 ? 1 : monthIndex + 2;
      const nextYear = monthIndex === 11 ? year + 1 : year;
      cellDateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(displayDay).padStart(2, '0')}`;
    }

    cells.push({
      dayNumber: displayDay,
      inCurrentMonth,
      dateString: cellDateStr,
      events: inCurrentMonth && byDay[dayNum] ? byDay[dayNum] : []
    });
  }

  return { cells, floatingEvents, kickoffsThisMonth, actualsThisMonth };
}

export function calculateEventProgress(event: EventItem): {
  totalTasks: number;
  completedTasks: number;
  percentage: number;
} {
  const tasks = event.tasks || [];
  if (tasks.length === 0) {
    return { totalTasks: 0, completedTasks: 0, percentage: 0 };
  }
  const completed = tasks.filter((t) => t.status === 'done').length;
  const pct = Math.round((completed / tasks.length) * 100);
  return { totalTasks: tasks.length, completedTasks: completed, percentage: pct };
}

export function exportBoardToCSV(boardName: string, events: EventItem[]): void {
  const headers = [
    'מספר פנימי',
    'שם האירוע',
    'קטגוריה',
    'תאריך תאריך התנעה',
    'תאריך אמת',
    'חודשי הכנה',
    'חודש יעד',
    'בלי יום מדויק',
    'הערות',
    'תיאור',
    'מספר משימות',
    'משימות שהושלמו',
    'התקדמות'
  ];

  const rows = events.map((ev) => {
    const progress = calculateEventProgress(ev);
    return [
      ev.id,
      ev.title,
      ev.category,
      ev.kickoffDate || '',
      ev.actualDate,
      ev.prepMonths,
      monthKeyOf(ev),
      isFloating(ev) ? 'כן' : 'לא',
      ev.note || '',
      ev.description || '',
      progress.totalTasks,
      progress.completedTasks,
      `${progress.percentage}%`
    ];
  });

  const csvContent = toCsvDocument(headers, rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${boardName}_export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
