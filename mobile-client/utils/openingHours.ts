// utils/openingHours.ts
// Venue opening hours (#4, #7): is the place open for a stop? Pure.
//
// Hours are stored in OpenStreetMap's `opening_hours` format, e.g.
//   "Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off"
//   "Tu-Su 11:00-14:00,17:00-22:00"
//   "Fr-Sa 18:00-02:00"            (past midnight)
//   "24/7"
// This reads the common part of that format (days, day ranges, several
// times a day, past midnight, "off", "24/7", rules that override or add).
// Anything else (months, holidays, sunrise, comments) can't be read, and
// hours that can't be read count as unknown: a place is never called
// closed unless we're sure. (The full `opening_hours` library is LGPL and
// ~5 MB; this covers what venues actually use.)
//
// Times are the phone's local time (the date's places are nearby).

/** Minutes after midnight, per weekday (0 = Sunday); an end past 1440 runs into the next day */
export type WeekHours = [number, number][][];

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_RE = /^(Mo|Tu|We|Th|Fr|Sa|Su)$/;
const DAY_MS = 86_400_000;

/** "Mo-Fr" or "Su,Tu" or "Sa": the weekdays it names (null: not a day selector) */
function parseDays(selector: string): number[] | null {
  const days = new Set<number>();
  let named = false;
  for (const part of selector.split(",")) {
    const p = part.trim();
    if (p === "PH" || p === "SH") continue; // holidays: we can't know them, skip
    const range = p.split("-");
    if (range.length === 1 && DAY_RE.test(p)) {
      days.add(DAYS.indexOf(p));
      named = true;
    } else if (range.length === 2 && DAY_RE.test(range[0]) && DAY_RE.test(range[1])) {
      // (wraps: "Fr-Mo")
      for (let d = DAYS.indexOf(range[0]); ; d = (d + 1) % 7) {
        days.add(d);
        if (d === DAYS.indexOf(range[1])) break;
      }
      named = true;
    } else {
      return null;
    }
  }
  // Only holidays ("PH off"): a rule we skip
  return named ? [...days] : [];
}

const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const minutesOf = (t: string): number | null => {
  const m = TIME_RE.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 48) return null;
  return h * 60 + min;
};

/** "09:00-17:00,18:00-22:00" (null: not times) */
function parseTimes(selector: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const part of selector.split(",")) {
    const p = part.trim();
    // "18:00+": open end; count it as open until midnight
    if (p.endsWith("+")) {
      const start = minutesOf(p.slice(0, -1));
      if (start == null) return null;
      out.push([start, Math.max(start + 60, 24 * 60)]);
      continue;
    }
    const [a, b, extra] = p.split("-");
    if (extra !== undefined || b === undefined) return null;
    const start = minutesOf(a);
    let end = minutesOf(b);
    if (start == null || end == null || start >= 24 * 60) return null;
    // Past midnight: "18:00-02:00"
    if (end <= start) end += 24 * 60;
    out.push([start, end]);
  }
  return out;
}

type Rule = {days: number[] | "all"; times: [number, number][] | "off"; additional: boolean};

/** One rule: "Mo-Fr 09:00-17:00", "Su off", "10:00-18:00", "Mo-Sa" (null: can't read it) */
function parseRule(text: string, additional: boolean): Rule | null | "skip" {
  const t = text.trim();
  if (!t) return "skip";
  const space = t.indexOf(" ");
  const head = space === -1 ? t : t.slice(0, space);
  const tail = space === -1 ? "" : t.slice(space + 1).trim();

  const days = parseDays(head);
  if (days !== null) {
    if (days.length === 0) return "skip"; // holidays only
    if (!tail) return {days, times: [[0, 24 * 60]], additional}; // "Mo-Fr": all day
    if (tail === "off" || tail === "closed") return {days, times: "off", additional};
    const times = parseTimes(tail.replace(/\s+/g, ""));
    return times ? {days, times, additional} : null;
  }
  // No days: every day
  if (t === "off" || t === "closed") return {days: "all", times: "off", additional};
  const times = parseTimes(t.replace(/\s+/g, ""));
  return times ? {days: "all", times, additional} : null;
}

const cache = new Map<string, WeekHours | null>();

/** The week's hours, or null when there are none or they can't be read. */
export function parseOpeningHours(value: string | null | undefined): WeekHours | null {
  if (!value || typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;

  const result = (() => {
    if (text === "24/7") return DAYS.map(() => [[0, 24 * 60]] as [number, number][]);
    const week: WeekHours = DAYS.map(() => []);
    // Rules: ";" (or "||") starts one that replaces the days it names; ","
    // before a day name adds one ("Mo-Fr 08:00-12:00, We 14:00-18:00")
    for (const chunk of text.split(/;|\|\|/)) {
      const parts = chunk.split(/,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b)/);
      // (a day right after a day is a day list, "Mo,We 10:00-12:00" or
      // "Mo-We,Fr 10:00-12:00": join back)
      const rules: string[] = [];
      for (const part of parts) {
        const prev = rules[rules.length - 1];
        if (prev !== undefined && /(?:^|[,-])(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)$/.test(prev.trim())) {
          rules[rules.length - 1] = `${prev},${part}`;
        } else {
          rules.push(part);
        }
      }
      for (let i = 0; i < rules.length; i++) {
        const rule = parseRule(rules[i], i > 0);
        if (rule === null) return null;
        if (rule === "skip") continue;
        const days = rule.days === "all" ? [0, 1, 2, 3, 4, 5, 6] : rule.days;
        for (const d of days) {
          if (rule.times === "off") week[d] = [];
          else week[d] = rule.additional ? [...week[d], ...rule.times] : [...rule.times];
        }
      }
    }
    return week;
  })();

  cache.set(text, result);
  return result;
}

export type HoursCheck =
  | {status: "unknown"}
  | {status: "open"}
  /** Opens after you arrive, or closes before you leave */
  | {status: "partly"; opensAt: number | null; closesAt: number | null; openShare: number}
  /** `closedAt`: when it closed earlier that day (null: not open that day before then) */
  | {status: "closed"; nextOpen: number | null; closedAt: number | null};

/** Open spans (ms) from the day before `fromMs` through `days` days after `toMs`, merged. */
function openSpans(week: WeekHours, fromMs: number, toMs: number, days = 1): [number, number][] {
  const spans: [number, number][] = [];
  const first = new Date(fromMs - DAY_MS);
  for (
    let day = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    day.getTime() <= toMs + days * DAY_MS;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  ) {
    for (const [s, e] of week[day.getDay()]) {
      // (built from the date, so daylight saving changes land right)
      spans.push([
        new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, s).getTime(),
        new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, e).getTime(),
      ]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}

/** Whether a place with these hours is open for a stop from `startMs` to `endMs`. */
export function checkHours(hours: string | null | undefined, startMs: number, endMs: number): HoursCheck {
  const week = parseOpeningHours(hours);
  if (!week) return {status: "unknown"};
  const spans = openSpans(week, startMs, endMs, 7);
  const length = Math.max(1, endMs - startMs);
  const openFor = spans.reduce(
    (sum, [a, b]) => sum + Math.max(0, Math.min(b, endMs) - Math.max(a, startMs)),
    0,
  );
  if (openFor >= length) return {status: "open"};
  if (openFor <= 0) {
    const next = spans.find(([a]) => a >= startMs);
    const before = spans.filter(([, b]) => b <= startMs && sameDay(b, startMs)).pop();
    return {status: "closed", nextOpen: next ? next[0] : null, closedAt: before ? before[1] : null};
  }
  const covering = spans.find(([a, b]) => a <= startMs && startMs < b);
  const opening = spans.find(([a]) => a > startMs && a < endMs);
  return {
    status: "partly",
    opensAt: covering ? null : (opening?.[0] ?? null),
    closesAt: covering && covering[1] < endMs ? covering[1] : null,
    openShare: openFor / length,
  };
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Within this of closing counts as "closes soon" */
const SOON_MS = 60 * 60_000;

export type OpenNow = {
  open: boolean;
  /** Open, but closing within the hour */
  soon: boolean;
  /** "Open now · closes 9:00 PM", "Closed · opens tomorrow 10:00 AM" */
  label: string;
};

/** Whether the place is open at `nowMs`, for the idea page (null: hours unknown). */
export function openNow(hours: string | null | undefined, nowMs: number): OpenNow | null {
  const week = parseOpeningHours(hours);
  if (!week) return null;
  const spans = openSpans(week, nowMs, nowMs, 7);
  const covering = spans.find(([a, b]) => a <= nowMs && nowMs < b);
  if (covering) {
    // Open all week (24/7, or every day all day)
    if (covering[1] - nowMs > 6 * DAY_MS) return {open: true, soon: false, label: "Open 24 hours"};
    const soon = covering[1] - nowMs <= SOON_MS;
    return {
      open: true,
      soon,
      label: soon ? `Closes soon · ${clock(covering[1])}` : `Open now · closes ${clock(covering[1])}`,
    };
  }
  const next = spans.find(([a]) => a > nowMs);
  if (!next) return {open: false, soon: false, label: "Closed"};
  const tomorrow = sameDay(next[0], nowMs + DAY_MS);
  const when = sameDay(next[0], nowMs)
    ? clock(next[0])
    : tomorrow
      ? `tomorrow ${clock(next[0])}`
      : `${new Date(next[0]).toLocaleDateString([], {weekday: "short"})} ${clock(next[0])}`;
  return {open: false, soon: false, label: `Closed · opens ${when}`};
}

/** "7:00 AM – 3:00 PM" for minutes after midnight (an end past midnight wraps) */
const span = ([s, e]: [number, number]) => {
  if (s === 0 && e >= 24 * 60) return "Open 24 hours";
  const at = (m: number) =>
    new Date(2000, 0, 1, 0, m % (24 * 60)).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
  return `${at(s)} – ${at(e)}`;
};

/** The week's hours, Monday first, for the idea page (null: hours unknown). */
export function weekLines(
  hours: string | null | undefined,
  nowMs: number,
): {day: string; text: string; today: boolean}[] | null {
  const week = parseOpeningHours(hours);
  if (!week) return null;
  const today = new Date(nowMs).getDay();
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    // A known Sunday (Jan 2 2000) + d, so the name is in the phone's language
    day: new Date(2000, 0, 2 + d).toLocaleDateString([], {weekday: "short"}),
    text: week[d].length ? [...week[d]].sort((a, b) => a[0] - b[0]).map(span).join(", ") : "Closed",
    today: d === today,
  }));
}

/** "Closed then · opens 5:00 PM", "Closes at 9:00 PM", "Opens at 10:00 AM" (null: fine or unknown) */
export function hoursMessage(check: HoursCheck, startMs: number): string | null {
  switch (check.status) {
    case "closed":
      if (check.nextOpen && sameDay(check.nextOpen, startMs)) {
        return `Closed then · opens ${clock(check.nextOpen)}`;
      }
      if (check.closedAt) return `Closed by then · closes ${clock(check.closedAt)}`;
      return "Closed that day";
    case "partly":
      if (check.closesAt) return `Closes at ${clock(check.closesAt)}`;
      if (check.opensAt) return `Opens at ${clock(check.opensAt)}`;
      return "Closed part of the time";
    default:
      return null;
  }
}
