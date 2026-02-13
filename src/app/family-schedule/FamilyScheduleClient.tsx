'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, ChevronLeft, Plus, X, AlertTriangle, Sparkles, Loader2, Trash2, RotateCcw, Megaphone, ChevronUp, ChevronDown } from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, addMonths, subMonths,
  isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, getDay, getHours, getMinutes,
  setHours, setMinutes, differenceInMinutes, isToday as isDateToday, startOfDay, endOfDay,
} from 'date-fns';

const ENV_MEMBERS = (process.env.NEXT_PUBLIC_FAMILY_MEMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
const PEOPLE = [...ENV_MEMBERS, 'כולם'];
const DEFAULT_PERSON = process.env.NEXT_PUBLIC_DEFAULT_PERSON || ENV_MEMBERS[0] || 'כולם';
const DEFAULT_CATEGORIES_ENV = process.env.NEXT_PUBLIC_FAMILY_CATEGORIES;
const DEFAULT_CATEGORIES = DEFAULT_CATEGORIES_ENV
  ? DEFAULT_CATEGORIES_ENV.split(',').map(s => s.trim()).filter(Boolean)
  : ['אימון', 'חוג', 'עבודה', 'משפחה', 'אחר'];

interface FamilyEvent {
  id: string; title: string; person: string; category: string;
  start_time: string; end_time: string; recurring: boolean;
  reminder_minutes?: number | null; notes?: string | null;
}
interface ParsedEvent {
  title: string; person: string; category: string; date: string;
  start_time: string; end_time: string; recurring: boolean; notes?: string;
  reminder_minutes?: number | null;
}
type ViewMode = 'day' | 'week' | 'month';

const COLOR_PALETTE = [
  { bg: 'bg-pink-100', text: 'text-pink-800' },
  { bg: 'bg-sky-100', text: 'text-sky-800' },
  { bg: 'bg-amber-100', text: 'text-amber-800' },
  { bg: 'bg-lime-100', text: 'text-lime-800' },
  { bg: 'bg-violet-100', text: 'text-violet-800' },
  { bg: 'bg-rose-100', text: 'text-rose-800' },
  { bg: 'bg-teal-100', text: 'text-teal-800' },
  { bg: 'bg-orange-100', text: 'text-orange-800' },
];

const PERSON_COLORS: Record<string, string> = { 'כולם': 'bg-gray-100 text-gray-800' };
ENV_MEMBERS.forEach((name, i) => {
  const c = COLOR_PALETTE[i % COLOR_PALETTE.length];
  PERSON_COLORS[name] = `${c.bg} ${c.text}`;
});

const CAT_BG: Record<string, string> = {
  'אימון': '#3b82f6', 'חוג': '#a855f7', 'עבודה': '#10b981', 'משפחה': '#f97316', 'אחר': '#6b7280',
};

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAYS_HE_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const ANNOUNCEMENT_COLORS = [
  { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
];

interface Announcement { id: string; text: string; color: number; created_at: string; }

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(getHours(d)).padStart(2, '0')}:${String(getMinutes(d)).padStart(2, '0')}`;
}

function getWeekDates(date: Date): Date[] {
  const sun = startOfWeek(date, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(sun, i));
}

function getEventsForDay(events: FamilyEvent[], day: Date): FamilyEvent[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = endOfDay(day).getTime();
  return events.filter(e => {
    const eStart = new Date(e.start_time).getTime();
    const eEnd = new Date(e.end_time).getTime();
    return eStart <= dayEnd && eEnd >= dayStart;
  });
}

function findConflicts(events: FamilyEvent[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j];
      if (a.person !== b.person && a.person !== 'כולם' && b.person !== 'כולם') continue;
      const [as, ae, bs, be] = [new Date(a.start_time).getTime(), new Date(a.end_time).getTime(), new Date(b.start_time).getTime(), new Date(b.end_time).getTime()];
      if (as < be && bs < ae) { ids.add(a.id); ids.add(b.id); }
    }
  }
  return ids;
}

function getHoursRange(events: FamilyEvent[], expandS = 0, expandE = 0) {
  let mn = 8, mx = 18;
  if (events.length > 0) {
    mn = 23; mx = 0;
    events.forEach(e => {
      const sh = getHours(new Date(e.start_time)), eh = getHours(new Date(e.end_time));
      const em = getMinutes(new Date(e.end_time));
      const eeh = em > 0 ? eh + 1 : eh;
      mn = Math.min(mn, sh, eh); mx = Math.max(mx, sh, eeh);
    });
  }
  mn = Math.max(0, mn - expandS); mx = Math.min(23, mx + expandE);
  if (mx - mn < 6) mx = Math.min(23, mn + 6);
  return { hours: Array.from({ length: mx - mn + 1 }, (_, i) => mn + i), minHour: mn, maxHour: mx, canExpandStart: mn > 0, canExpandEnd: mx < 23 };
}

interface LayoutEvent extends FamilyEvent { col: number; totalCols: number; }
function layoutOverlappingEvents(events: FamilyEvent[], minHour: number): LayoutEvent[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const result: LayoutEvent[] = [];
  const groups: FamilyEvent[][] = [];
  let currentGroup: FamilyEvent[] = [sorted[0]];
  let groupEnd = new Date(sorted[0].end_time).getTime();

  for (let i = 1; i < sorted.length; i++) {
    const evStart = new Date(sorted[i].start_time).getTime();
    if (evStart < groupEnd) {
      currentGroup.push(sorted[i]);
      groupEnd = Math.max(groupEnd, new Date(sorted[i].end_time).getTime());
    } else {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
      groupEnd = new Date(sorted[i].end_time).getTime();
    }
  }
  groups.push(currentGroup);

  for (const group of groups) {
    const columns: FamilyEvent[][] = [];
    for (const ev of group) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1];
        if (new Date(lastInCol.end_time).getTime() <= new Date(ev.start_time).getTime()) {
          columns[c].push(ev); placed = true; break;
        }
      }
      if (!placed) columns.push([ev]);
    }
    const totalCols = columns.length;
    columns.forEach((col, colIdx) => {
      col.forEach(ev => result.push({ ...ev, col: colIdx, totalCols }));
    });
  }
  return result;
}

function EventBlock({ event, isConflict, compact = false, onClick, minHour = 6, col = 0, totalCols = 1, onDragStart, viewDay }: {
  event: FamilyEvent; isConflict: boolean; compact?: boolean; onClick?: () => void;
  minHour?: number; col?: number; totalCols?: number; onDragStart?: (e: FamilyEvent) => void;
  viewDay?: Date;
}) {
  const bg = CAT_BG[event.category] || CAT_BG['אחר'];
  const evStart = new Date(event.start_time);
  const evEnd = new Date(event.end_time);
  const isMultiDay = !isSameDay(evStart, evEnd);
  const isFirstDay = viewDay ? isSameDay(evStart, viewDay) : true;
  const isLastDay = viewDay ? isSameDay(evEnd, viewDay) : true;

  if (compact) {
    const timeLabel = isMultiDay
      ? (isFirstDay ? fmtTime(event.start_time) : isLastDay ? `עד ${fmtTime(event.end_time)}` : 'כל היום')
      : fmtTime(event.start_time);
    return (
      <button onClick={onClick} className="w-full text-right px-1.5 py-0.5 rounded text-[10px] leading-tight truncate hover:opacity-80 transition-opacity" style={{ backgroundColor: bg + '22', borderRight: `3px solid ${bg}`, color: bg }}>
        <span className="font-medium">{timeLabel}</span> {event.title}
      </button>
    );
  }

  let displayStartH: number, displayEndH: number;
  if (isMultiDay) {
    if (isFirstDay) { displayStartH = getHours(evStart) + getMinutes(evStart) / 60; displayEndH = 23.99; }
    else if (isLastDay) { displayStartH = minHour; displayEndH = getHours(evEnd) + getMinutes(evEnd) / 60; }
    else { displayStartH = minHour; displayEndH = 23.99; }
  } else {
    displayStartH = getHours(evStart) + getMinutes(evStart) / 60;
    displayEndH = getHours(evEnd) + getMinutes(evEnd) / 60;
  }

  const duration = Math.abs(displayEndH - displayStartH);
  const top = (Math.min(displayStartH, displayEndH) - minHour) * 60;
  const height = Math.max(duration * 60, 24);
  const widthPct = 100 / totalCols;
  const rightPct = col * widthPct;

  const timeStr = isMultiDay
    ? (isFirstDay ? `${fmtTime(event.start_time)} →` : isLastDay ? `→ ${fmtTime(event.end_time)}` : 'כל היום')
    : `${fmtTime(event.start_time)} - ${fmtTime(event.end_time)}`;

  return (
    <button
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart?.(event); }}
      onClick={onClick}
      style={{ top: `${top}px`, height: `${height}px`, right: `${rightPct}%`, width: `${widthPct - 1}%`, backgroundColor: bg + '18', borderRight: `3px solid ${bg}` }}
      className={`absolute rounded-md px-1 py-0.5 overflow-hidden cursor-pointer transition-all hover:shadow-md pointer-events-auto ${isConflict ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}
    >
      {isConflict && <AlertTriangle size={9} className="absolute top-0.5 left-0.5 text-red-500" />}
      <p className="text-[10px] font-semibold truncate" style={{ color: bg }}>{event.title}</p>
      {height > 28 && <p className="text-[9px] text-gray-500">{timeStr}</p>}
      {height > 44 && <span className={`inline-block text-[8px] px-1 rounded mt-0.5 ${PERSON_COLORS[event.person] || 'bg-gray-100 text-gray-800'}`}>{event.person}</span>}
    </button>
  );
}

function MobileDayView({ events, date, conflicts, onCellClick, onEventClick, minHour, hours }: {
  events: FamilyEvent[]; date: Date; conflicts: Set<string>;
  onCellClick: (d: Date, h: number) => void; onEventClick: (e: FamilyEvent) => void;
  minHour: number; hours: number[];
}) {
  const dayEvents = getEventsForDay(events, date);
  const laid = layoutOverlappingEvents(dayEvents, minHour);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const firstEvent = dayEvents.length > 0 ? Math.min(...dayEvents.map(e => getHours(new Date(e.start_time)))) : 8;
      const scrollTo = Math.max(0, (firstEvent - minHour - 1) * 60);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, [date, dayEvents, minHour]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto bg-white">
      <div className="relative" style={{ height: `${hours.length * 60}px` }}>
        {hours.map(hour => (
          <div key={hour} className="absolute w-full border-b border-gray-100 flex" style={{ top: `${(hour - minHour) * 60}px`, height: '60px' }}
            onClick={() => onCellClick(date, hour)}>
            <div className="w-12 text-[11px] text-gray-400 text-left pl-2 pt-0.5 shrink-0">{String(hour).padStart(2, '0')}:00</div>
            <div className="flex-1 border-r border-gray-100" />
          </div>
        ))}
        <div className="absolute top-0 bottom-0" style={{ right: '48px', left: '4px' }}>
          {laid.map(ev => (
            <EventBlock key={ev.id} event={ev} isConflict={conflicts.has(ev.id)} onClick={() => onEventClick(ev)} minHour={minHour} col={ev.col} totalCols={ev.totalCols} viewDay={date} />
          ))}
        </div>
        {isDateToday(date) && (() => {
          const now = new Date();
          const nowMin = (getHours(now) + getMinutes(now) / 60 - minHour) * 60;
          if (nowMin < 0 || nowMin > hours.length * 60) return null;
          return <div className="absolute left-0 right-0 z-10 flex items-center" style={{ top: `${nowMin}px` }}>
            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
            <div className="flex-1 border-t border-red-500" />
          </div>;
        })()}
      </div>
    </div>
  );
}

function MobileWeekStrip({ weekDates, currentDate, onSelectDate, events }: {
  weekDates: Date[]; currentDate: Date; onSelectDate: (d: Date) => void; events: FamilyEvent[];
}) {
  return (
    <div className="flex border-b border-gray-200 bg-white">
      {weekDates.map((d, i) => {
        const selected = isSameDay(d, currentDate);
        const today = isDateToday(d);
        const hasEvents = getEventsForDay(events, d).length > 0;
        return (
          <button key={i} onClick={() => onSelectDate(d)} className="flex-1 py-1.5 flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-gray-500">{DAYS_HE_SHORT[i]}</span>
            <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-all
              ${selected ? 'bg-blue-500 text-white' : today ? 'bg-blue-100 text-blue-600' : 'text-gray-900 hover:bg-gray-100'}`}>
              {d.getDate()}
            </span>
            {hasEvents && !selected && <div className="w-1 h-1 rounded-full bg-blue-400" />}
            {!hasEvents && <div className="w-1 h-1" />}
          </button>
        );
      })}
    </div>
  );
}

function WeekView({ events, weekDates, conflicts, onCellClick, onEventClick, expandStart, expandEnd, onEventDrop }: {
  events: FamilyEvent[]; weekDates: Date[]; conflicts: Set<string>;
  onCellClick: (d: Date, h: number) => void; onEventClick: (e: FamilyEvent) => void;
  expandStart: number; expandEnd: number;
  onEventDrop?: (e: FamilyEvent, d: Date, h: number) => void;
}) {
  const { hours, minHour } = getHoursRange(events, expandStart, expandEnd);
  const [draggedEvent, setDraggedEvent] = useState<FamilyEvent | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const gridCols = '60px repeat(7, 1fr)';

  const handleDrop = (d: Date, h: number) => {
    if (draggedEvent && onEventDrop) onEventDrop(draggedEvent, d, h);
    setDraggedEvent(null); setDragOverCell(null);
  };

  return (
    <div className="overflow-auto h-full">
      <div className="border-b border-gray-200 sticky top-0 bg-white z-10" style={{ display: 'grid', gridTemplateColumns: gridCols }}>
        <div />
        {weekDates.map((d, i) => {
          const today = isDateToday(d);
          return (
            <div key={i} className={`py-2 text-center border-r border-gray-100 ${today ? 'bg-blue-50' : ''}`}>
              <p className="text-xs text-gray-500">{DAYS_HE[i]}</p>
              <p className={`text-base font-semibold ${today ? 'bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center mx-auto' : 'text-gray-900'}`}>{d.getDate()}</p>
            </div>
          );
        })}
      </div>
      <div className="relative">
        {hours.map(h => (
          <div key={h} className="border-b border-gray-50" style={{ display: 'grid', gridTemplateColumns: gridCols, height: '60px' }}>
            <div className="text-[11px] text-gray-400 text-center pt-0.5">{String(h).padStart(2, '0')}:00</div>
            {weekDates.map((d, di) => {
              const key = `${d.toISOString()}-${h}`;
              return (
                <div key={di} className={`border-r border-gray-50 cursor-pointer hover:bg-blue-50/30 ${isDateToday(d) ? 'bg-blue-50/20' : ''} ${dragOverCell === key ? 'bg-blue-200/40' : ''}`}
                  onClick={() => onCellClick(d, h)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverCell(key); }}
                  onDragLeave={() => setDragOverCell(null)}
                  onDrop={(e) => { e.preventDefault(); handleDrop(d, h); }} />
              );
            })}
          </div>
        ))}
        <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: `${hours.length * 60}px`, display: 'grid', gridTemplateColumns: gridCols, pointerEvents: 'none' }}>
          <div />
          {weekDates.map((d, di) => {
            const dayEvts = getEventsForDay(events, d);
            const laid = layoutOverlappingEvents(dayEvts, minHour);
            return (
              <div key={di} className="relative border-r border-gray-50">
                {laid.map(ev => (
                  <EventBlock key={ev.id} event={ev} isConflict={conflicts.has(ev.id)} onClick={() => onEventClick(ev)} minHour={minHour} col={ev.col} totalCols={ev.totalCols} onDragStart={setDraggedEvent} viewDay={d} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DesktopDayView({ events, date, conflicts, onCellClick, onEventClick, expandStart, expandEnd, onEventDrop }: {
  events: FamilyEvent[]; date: Date; conflicts: Set<string>;
  onCellClick: (d: Date, h: number) => void; onEventClick: (e: FamilyEvent) => void;
  expandStart: number; expandEnd: number;
  onEventDrop?: (e: FamilyEvent, d: Date, h: number) => void;
}) {
  const dayEvents = getEventsForDay(events, date);
  const { hours, minHour } = getHoursRange(dayEvents, expandStart, expandEnd);
  const laid = layoutOverlappingEvents(dayEvents, minHour);
  const [draggedEvent, setDraggedEvent] = useState<FamilyEvent | null>(null);
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);

  return (
    <div className="overflow-auto h-full">
      <div className="text-center py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <p className="text-sm text-gray-500">{DAYS_HE[getDay(date)]}</p>
        <p className="text-xl font-semibold text-gray-900">{format(date, 'd/M')}</p>
      </div>
      <div className="relative">
        {hours.map(h => (
          <div key={h} className="flex border-b border-gray-50" style={{ height: '60px' }}>
            <div className="w-[60px] text-[11px] text-gray-400 text-center pt-0.5 shrink-0">{String(h).padStart(2, '0')}:00</div>
            <div className={`flex-1 cursor-pointer hover:bg-blue-50/30 ${dragOverHour === h ? 'bg-blue-200/40' : ''}`}
              onClick={() => onCellClick(date, h)}
              onDragOver={(e) => { e.preventDefault(); setDragOverHour(h); }}
              onDragLeave={() => setDragOverHour(null)}
              onDrop={(e) => { e.preventDefault(); if (draggedEvent && onEventDrop) onEventDrop(draggedEvent, date, h); setDraggedEvent(null); setDragOverHour(null); }} />
          </div>
        ))}
        <div className="absolute top-0 left-0" style={{ right: '60px', height: `${hours.length * 60}px` }}>
          {laid.map(ev => (
            <EventBlock key={ev.id} event={ev} isConflict={conflicts.has(ev.id)} onClick={() => onEventClick(ev)} minHour={minHour} col={ev.col} totalCols={ev.totalCols} onDragStart={setDraggedEvent} viewDay={date} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthView({ events, currentDate, conflicts, onDayClick }: {
  events: FamilyEvent[]; currentDate: Date; conflicts: Set<string>; onDayClick: (d: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const dates = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAYS_HE.map(d => <div key={d} className="p-2 text-center text-xs font-medium text-gray-500">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dates.map((d, i) => {
          const isCur = d.getMonth() === currentDate.getMonth();
          const dayEvts = getEventsForDay(events, d);
          return (
            <div key={i} className={`min-h-[80px] md:min-h-[100px] border-b border-r border-gray-100 p-1 cursor-pointer hover:bg-gray-50 ${!isCur ? 'bg-gray-50/50' : ''}`} onClick={() => onDayClick(d)}>
              <p className={`text-xs font-medium mb-1 ${isDateToday(d) ? 'bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center' : isCur ? 'text-gray-900' : 'text-gray-300'}`}>{d.getDate()}</p>
              <div className="space-y-0.5">
                {dayEvts.slice(0, 3).map(ev => <EventBlock key={ev.id} event={ev} isConflict={conflicts.has(ev.id)} compact viewDay={d} />)}
                {dayEvts.length > 3 && <p className="text-[9px] text-gray-400 text-center">+{dayEvts.length - 3}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventModal({ isOpen, onClose, onSave, onDelete, initialDate, initialHour, editEvent, categories, onAddCategory }: {
  isOpen: boolean; onClose: () => void; onSave: (e: Omit<FamilyEvent, 'id'>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>; initialDate?: Date; initialHour?: number;
  editEvent?: FamilyEvent | null; categories: string[]; onAddCategory: (c: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [person, setPerson] = useState(DEFAULT_PERSON);
  const [category, setCategory] = useState('אחר');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [recurring, setRecurring] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editEvent) {
      setTitle(editEvent.title); setPerson(editEvent.person); setCategory(editEvent.category);
      setStartDate(format(new Date(editEvent.start_time), 'yyyy-MM-dd'));
      setEndDate(format(new Date(editEvent.end_time), 'yyyy-MM-dd'));
      setStartTime(fmtTime(editEvent.start_time)); setEndTime(fmtTime(editEvent.end_time));
      setRecurring(editEvent.recurring);
      setReminderMinutes(editEvent.reminder_minutes ? String(editEvent.reminder_minutes) : '');
      setNotes(editEvent.notes || '');
    } else {
      const d = initialDate || new Date();
      setTitle(''); setPerson(DEFAULT_PERSON); setCategory('אחר');
      setStartDate(format(d, 'yyyy-MM-dd')); setEndDate(format(d, 'yyyy-MM-dd'));
      setStartTime(initialHour !== undefined ? `${String(initialHour).padStart(2, '0')}:00` : '08:00');
      setEndTime(initialHour !== undefined ? `${String(Math.min(initialHour + 1, 23)).padStart(2, '0')}:00` : '09:00');
      setRecurring(false); setReminderMinutes(''); setNotes('');
    }
    setAiText(''); setAiError('');
  }, [isOpen, editEvent, initialDate, initialHour]);

  const handleAiParse = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true); setAiError('');
    try {
      const res = await fetch('/api/family/parse-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: aiText }) });
      const data = await res.json();
      if (data.error) { setAiError(data.error); return; }
      const p: ParsedEvent = data.parsed;
      if (p.title) setTitle(p.title);
      if (p.person && PEOPLE.includes(p.person)) setPerson(p.person);
      if (p.category && categories.includes(p.category)) setCategory(p.category);
      if (p.date) { setStartDate(p.date); setEndDate(p.date); }
      if (p.start_time) setStartTime(p.start_time);
      if (p.end_time) setEndTime(p.end_time);
      if (p.recurring !== undefined) setRecurring(p.recurring);
      if (p.reminder_minutes !== undefined && p.reminder_minutes !== null) setReminderMinutes(String(p.reminder_minutes));
      if (p.notes) setNotes(p.notes);
    } catch { setAiError('שגיאה בפענוח'); } finally { setAiLoading(false); }
  };

  const handleSave = async () => {
    if (!title || !startDate || !endDate || !startTime || !endTime) return;
    setSaving(true);
    try {
      await onSave({
        title, person, category,
        start_time: new Date(`${startDate}T${startTime}:00`).toISOString(),
        end_time: new Date(`${endDate}T${endTime}:00`).toISOString(),
        recurring, reminder_minutes: reminderMinutes ? parseInt(reminderMinutes) : null, notes: notes || null,
      });
      onClose();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!editEvent || !onDelete) return;
    setDeleting(true);
    try { await onDelete(editEvent.id); onClose(); } finally { setDeleting(false); }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${window.scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    return () => { document.body.style.overflow = ''; document.body.style.position = ''; document.body.style.width = ''; document.body.style.top = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm overscroll-none touch-none" onClick={onClose} onTouchMove={e => e.preventDefault()}>
      <div className="bg-white w-full md:max-w-md md:rounded-xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto overscroll-contain touch-auto" onClick={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} dir="rtl">
        <div className="sticky top-0 bg-white rounded-t-2xl md:rounded-t-xl border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{editEvent ? 'עריכת אירוע' : 'אירוע חדש'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={20} className="text-gray-500" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {!editEvent && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-3 border border-blue-100">
              <div className="flex items-center gap-1.5 mb-2"><Sparkles size={14} className="text-blue-500" /><span className="text-xs font-medium text-blue-700">הוספה חכמה</span></div>
              <div className="flex gap-2">
                <input type="text" value={aiText} onChange={e => setAiText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAiParse()} className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none bg-white" placeholder='למשל: "כדורסל יום שני 19:00"' />
                <button onClick={handleAiParse} disabled={aiLoading || !aiText.trim()} className="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1">
                  {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} פענח
                </button>
              </div>
              {aiError && <p className="text-xs text-red-500 mt-1">{aiError}</p>}
            </div>
          )}
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none" placeholder="כותרת האירוע" />
          <div className="grid grid-cols-2 gap-3">
            <select value={person} onChange={e => setPerson(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none bg-white">
              {PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {!showNewCat ? (
              <div className="flex gap-1">
                <select value={category} onChange={e => setCategory(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none bg-white">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={() => setShowNewCat(true)} className="px-2 border border-gray-300 rounded-lg hover:bg-gray-50"><Plus size={16} className="text-gray-600" /></button>
              </div>
            ) : (
              <div className="flex gap-1">
                <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newCatName.trim()) { onAddCategory(newCatName.trim()); setCategory(newCatName.trim()); setNewCatName(''); setShowNewCat(false); } }} autoFocus className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" placeholder="קטגוריה חדשה" />
                <button onClick={() => { setShowNewCat(false); setNewCatName(''); }} className="px-2 border border-gray-300 rounded-lg hover:bg-gray-50"><X size={16} className="text-gray-600" /></button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (endDate && e.target.value > endDate) setEndDate(e.target.value); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none resize-none" rows={2} placeholder="הערות (אופציונלי)" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="rounded border-gray-300" />
              <RotateCcw size={12} /> חוזר כל שבוע
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">תזכורת</span>
              <select value={reminderMinutes} onChange={e => setReminderMinutes(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white">
                <option value="">ללא</option>
                <option value="5">5 דק׳ לפני</option>
                <option value="10">10 דק׳ לפני</option>
                <option value="15">15 דק׳ לפני</option>
                <option value="30">30 דק׳ לפני</option>
                <option value="60">שעה לפני</option>
                <option value="120">שעתיים לפני</option>
                <option value="1440">יום לפני</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={saving || !title} className="flex-1 bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1">
              {saving && <Loader2 size={14} className="animate-spin" />} {editEvent ? 'עדכן' : 'שמור'}
            </button>
            {editEvent && onDelete && (
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2.5 border border-red-300 text-red-600 rounded-lg text-sm font-medium flex items-center gap-1">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} מחק
              </button>
            )}
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterBar({ selectedPeople, onTogglePerson }: { selectedPeople: Set<string>; onTogglePerson: (p: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PEOPLE.map(p => (
        <button key={p} onClick={() => onTogglePerson(p)} className={`px-2 py-1 rounded-full text-[11px] font-medium transition-all ${selectedPeople.has(p) ? (PERSON_COLORS[p] || 'bg-gray-100 text-gray-800') : 'bg-gray-100 text-gray-300'}`}>
          {p}
        </button>
      ))}
    </div>
  );
}

export default function FamilyScheduleClient() {
  const [view, setView] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState<Date>();
  const [modalHour, setModalHour] = useState<number>();
  const [editEvent, setEditEvent] = useState<FamilyEvent | null>(null);
  const [selectedPeople, setSelectedPeople] = useState(new Set(PEOPLE));
  const [isMobile, setIsMobile] = useState(false);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAnnInput, setShowAnnInput] = useState(false);
  const [annText, setAnnText] = useState('');

  const [expandStart, setExpandStart] = useState(0);
  const [expandEnd, setExpandEnd] = useState(0);

  const [customCats, setCustomCats] = useState<string[]>([]);
  const categories = useMemo(() => [...DEFAULT_CATEGORIES, ...customCats], [customCats]);

  useEffect(() => {
    const saved = localStorage.getItem('family-schedule-custom-categories');
    if (saved) try { setCustomCats(JSON.parse(saved)); } catch {}
  }, []);

  const addCustomCat = (c: string) => {
    if (!c.trim() || categories.includes(c.trim())) return;
    const u = [...customCats, c.trim()];
    setCustomCats(u);
    localStorage.setItem('family-schedule-custom-categories', JSON.stringify(u));
  };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => { if (isMobile) setView('day'); }, [isMobile]);
  useEffect(() => { setExpandStart(0); setExpandEnd(0); }, [view]);

  const fetchEvents = useCallback(async () => {
    try {
      const wk = getWeekDates(currentDate);
      const s = addDays(wk[0], -35), e = addDays(wk[6], 35);
      const res = await fetch(`/api/family/events?start=${s.toISOString()}&end=${e.toISOString()}`);
      const data = await res.json();
      if (data.events) setEvents(data.events);
    } catch {} finally { setLoading(false); }
  }, [currentDate]);
  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const fetchAnn = useCallback(async () => {
    try { const res = await fetch('/api/family/announcements'); const d = await res.json(); if (d.announcements) setAnnouncements(d.announcements); } catch {}
  }, []);
  useEffect(() => { fetchAnn(); }, [fetchAnn]);

  const addAnn = async () => {
    if (!annText.trim()) return;
    await fetch('/api/family/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: annText.trim(), color: Math.floor(Math.random() * ANNOUNCEMENT_COLORS.length) }) });
    setAnnText(''); setShowAnnInput(false); await fetchAnn();
  };
  const delAnn = async (id: string) => { await fetch(`/api/family/announcements/${id}`, { method: 'DELETE' }); await fetchAnn(); };

  const filteredEvents = useMemo(() => events.filter(e => selectedPeople.has(e.person) || (e.person === 'כולם' && selectedPeople.size > 0)), [events, selectedPeople]);
  const conflicts = useMemo(() => findConflicts(filteredEvents), [filteredEvents]);
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);

  const hoursInfo = useMemo(() => {
    const evts = view === 'day' ? getEventsForDay(filteredEvents, currentDate) : filteredEvents;
    return getHoursRange(evts, expandStart, expandEnd);
  }, [filteredEvents, currentDate, view, expandStart, expandEnd]);

  const navBack = () => {
    if (view === 'day') setCurrentDate(d => addDays(d, -1));
    else if (view === 'week') setCurrentDate(d => subWeeks(d, 1));
    else setCurrentDate(d => subMonths(d, 1));
    setExpandStart(0); setExpandEnd(0);
  };
  const navForward = () => {
    if (view === 'day') setCurrentDate(d => addDays(d, 1));
    else if (view === 'week') setCurrentDate(d => addWeeks(d, 1));
    else setCurrentDate(d => addMonths(d, 1));
    setExpandStart(0); setExpandEnd(0);
  };

  const togglePerson = (p: string) => setSelectedPeople(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const handleSave = async (data: Omit<FamilyEvent, 'id'>) => {
    if (editEvent) await fetch(`/api/family/events/${editEvent.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    else await fetch('/api/family/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await fetchEvents();
  };
  const handleDelete = async (id: string) => { await fetch(`/api/family/events/${id}`, { method: 'DELETE' }); await fetchEvents(); };
  const handleDrop = async (ev: FamilyEvent, newDate: Date, newHour: number) => {
    const dur = differenceInMinutes(new Date(ev.end_time), new Date(ev.start_time));
    const ns = setMinutes(setHours(newDate, newHour), 0);
    const ne = addDays(ns, 0); ne.setMinutes(ne.getMinutes() + dur);
    await fetch(`/api/family/events/${ev.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ev, start_time: ns.toISOString(), end_time: ne.toISOString() }) });
    await fetchEvents();
  };

  const openAdd = (d?: Date, h?: number) => { setEditEvent(null); setModalDate(d); setModalHour(h); setShowModal(true); };
  const openEdit = (e: FamilyEvent) => { setEditEvent(e); setShowModal(true); };

  const getTitle = () => {
    if (view === 'day') return `${DAYS_HE[getDay(currentDate)]} ${format(currentDate, 'd/M')}`;
    if (view === 'week') return `${format(weekDates[0], 'd/M')} - ${format(weekDates[6], 'd/M')}`;
    return `${MONTHS_HE[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  };

  if (isMobile) {
    return (
      <div className="h-screen bg-white flex flex-col overflow-hidden family-schedule-root" dir="rtl">
        <style>{`.family-schedule-root button,.family-schedule-root a,.family-schedule-root [role="button"]{min-height:unset!important;min-width:unset!important;}`}</style>

        <div className="bg-white px-3 py-2 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900">{getTitle()}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentDate(new Date())} className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded">היום</button>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {(['day', 'week', 'month'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)} className={`px-2 py-0.5 rounded text-[10px] font-medium ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>
                  {v === 'day' ? 'יום' : v === 'week' ? 'שבוע' : 'חודש'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {view === 'day' && (
          <MobileWeekStrip weekDates={weekDates} currentDate={currentDate} onSelectDate={setCurrentDate} events={filteredEvents} />
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : (
          <>
            {view === 'day' && <MobileDayView events={filteredEvents} date={currentDate} conflicts={conflicts} onCellClick={openAdd} onEventClick={openEdit} minHour={hoursInfo.minHour} hours={hoursInfo.hours} />}
            {view === 'week' && (
              <div className="flex-1 overflow-auto">
                <WeekView events={filteredEvents} weekDates={weekDates} conflicts={conflicts} onCellClick={openAdd} onEventClick={openEdit} expandStart={expandStart} expandEnd={expandEnd} />
              </div>
            )}
            {view === 'month' && (
              <div className="flex-1 overflow-auto">
                <MonthView events={filteredEvents} currentDate={currentDate} conflicts={conflicts} onDayClick={d => { setCurrentDate(d); setView('day'); }} />
              </div>
            )}
          </>
        )}

        {view === 'day' && (
          <div className="bg-white border-t border-gray-100 px-4 py-2 flex items-center justify-between">
            <button onClick={navBack} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight size={24} className="text-gray-600" /></button>
            <span className="text-sm text-gray-500">{DAYS_HE[getDay(currentDate)]}</span>
            <button onClick={navForward} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft size={24} className="text-gray-600" /></button>
          </div>
        )}

        <button onClick={() => openAdd(currentDate)} className="fixed bottom-20 left-4 bg-blue-500 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center z-40">
          <Plus size={28} />
        </button>

        <EventModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={handleSave} onDelete={handleDelete} initialDate={modalDate} initialHour={modalHour} editEvent={editEvent} categories={categories} onAddCategory={addCustomCat} />
      </div>
    );
  }

  const conflictCount = Math.floor(conflicts.size / 2);

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden family-schedule-root" dir="rtl">
      <style>{`.family-schedule-root button,.family-schedule-root a,.family-schedule-root [role="button"]{min-height:unset!important;min-width:unset!important;}`}</style>

      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">לוז משפחתי</h1>
              {conflictCount > 0 && <span className="flex items-center gap-1 bg-red-50 text-red-600 px-2 py-0.5 rounded-full text-[10px] font-medium"><AlertTriangle size={10} /> {conflictCount} קונפליקטים</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAnnInput(true)} className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"><Megaphone size={14} /> הודעה</button>
              <button onClick={() => openAdd()} className="flex items-center gap-1.5 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 shadow-sm"><Plus size={16} /> אירוע חדש</button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                {(['day', 'week', 'month'] as ViewMode[]).map(v => (
                  <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {v === 'day' ? 'יום' : v === 'week' ? 'שבוע' : 'חודש'}
                  </button>
                ))}
              </div>
              <button onClick={navBack} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={16} className="text-gray-600" /></button>
              <button onClick={navForward} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={16} className="text-gray-600" /></button>
              <button onClick={() => setCurrentDate(new Date())} className="px-2 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50 rounded">היום</button>
              <span className="text-sm font-semibold text-gray-900">{getTitle()}</span>
            </div>
            <FilterBar selectedPeople={selectedPeople} onTogglePerson={togglePerson} />
          </div>
        </div>
      </div>

      {(announcements.length > 0 || showAnnInput) && (
        <div className="max-w-7xl w-full mx-auto px-6 pt-2">
          <div className="flex flex-wrap gap-2 items-center">
            {announcements.map(a => {
              const c = ANNOUNCEMENT_COLORS[a.color] || ANNOUNCEMENT_COLORS[0];
              return <div key={a.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${c.bg} ${c.text} ${c.border}`}><span>{a.text}</span><button onClick={() => delAnn(a.id)} className="hover:opacity-60"><X size={14} /></button></div>;
            })}
            {showAnnInput && (
              <div className="flex items-center gap-1.5">
                <input type="text" value={annText} onChange={e => setAnnText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAnn()} autoFocus className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none w-48" placeholder="כתבו הודעה..." />
                <button onClick={addAnn} className="px-2 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium">שמור</button>
                <button onClick={() => { setShowAnnInput(false); setAnnText(''); }}><X size={14} className="text-gray-400" /></button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex items-stretch relative">
        <button onClick={navBack} className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-white/80 hover:bg-white border border-gray-200 shadow-md rounded-l-lg p-2"><ChevronRight size={20} className="text-gray-600" /></button>
        <button onClick={navForward} className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-white/80 hover:bg-white border border-gray-200 shadow-md rounded-r-lg p-2"><ChevronLeft size={20} className="text-gray-600" /></button>

        <div className="flex-1 min-h-0 max-w-7xl w-full mx-auto flex flex-col">
          {!loading && view !== 'month' && hoursInfo.canExpandStart && (
            <div className="bg-white border-b border-gray-200 py-1.5 flex items-center justify-center rounded-t-lg">
              <button onClick={() => setExpandStart(s => s + 2)} className="bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs text-gray-700 font-medium"><ChevronUp size={16} /> הוסף שעות מוקדם יותר</button>
            </div>
          )}
          <div className="flex-1 min-h-0 bg-white border border-gray-200 shadow-sm overflow-hidden">
            {loading ? <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div> : (
              <>
                {view === 'week' && <WeekView events={filteredEvents} weekDates={weekDates} conflicts={conflicts} onCellClick={openAdd} onEventClick={openEdit} expandStart={expandStart} expandEnd={expandEnd} onEventDrop={handleDrop} />}
                {view === 'day' && <DesktopDayView events={filteredEvents} date={currentDate} conflicts={conflicts} onCellClick={openAdd} onEventClick={openEdit} expandStart={expandStart} expandEnd={expandEnd} onEventDrop={handleDrop} />}
                {view === 'month' && <MonthView events={filteredEvents} currentDate={currentDate} conflicts={conflicts} onDayClick={d => { setCurrentDate(d); setView('day'); }} />}
              </>
            )}
          </div>
          {!loading && view !== 'month' && hoursInfo.canExpandEnd && (
            <div className="bg-white border-t border-gray-200 py-1.5 flex items-center justify-center rounded-b-lg">
              <button onClick={() => setExpandEnd(s => s + 2)} className="bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs text-gray-700 font-medium"><ChevronDown size={16} /> הוסף שעות מאוחר יותר</button>
            </div>
          )}
        </div>
      </div>

      <EventModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={handleSave} onDelete={handleDelete} initialDate={modalDate} initialHour={modalHour} editEvent={editEvent} categories={categories} onAddCategory={addCustomCat} />
    </div>
  );
}
