// utils/occasions.ts
// Your own occasions (#87): your anniversary and your partner's birthday,
// for the date being planned. Pure. Like the holidays (utils/holidays.ts),
// an occasion's window is the week leading up to it (and the day after),
// since people celebrate on the nearest good evening.

export type OccasionId = "ANNIVERSARY" | "PARTNER_BIRTHDAY";

export type Occasion = {
  id: OccasionId;
  emoji: string;
  label: string;
  /** The vibes it's about (a one-tap preset), or null if none to offer */
  vibes: string[] | null;
  /** This year's (or the nearest) day of it */
  date: Date;
};

/** What anniversary dates are about */
export const ANNIVERSARY_VIBES = ["romantic", "upscale", "views"];

const DAYS_BEFORE = 6;
const DAYS_AFTER = 1;
const DAY = 86_400_000;

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
/** A month/day in a year (Feb 29 is Feb 28 in other years) */
const dayIn = (year: number, month: number, day: number) =>
  new Date(year, month - 1, month === 2 && day === 29 && !isLeap(year) ? 28 : day);
const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** The day of it whose window holds this date, or null */
export function occurrenceNear(month: number, day: number, date: Date): Date | null {
  const today = midnight(date).getTime();
  for (const year of [date.getFullYear() - 1, date.getFullYear(), date.getFullYear() + 1]) {
    const it = dayIn(year, month, day).getTime();
    if (today >= it - DAYS_BEFORE * DAY && today <= it + DAYS_AFTER * DAY) return new Date(it);
  }
  return null;
}

/** The next day of it on or after this date */
export function nextOccurrence(month: number, day: number, from: Date): Date {
  const today = midnight(from).getTime();
  const thisYear = dayIn(from.getFullYear(), month, day);
  return thisYear.getTime() >= today ? thisYear : dayIn(from.getFullYear() + 1, month, day);
}

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({1: "st", 2: "nd", 3: "rd"} as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};

type Known = {
  /** "YYYY-MM-DD" */
  anniversary: string | null;
  partnerBirthday: {month: number; day: number; year?: number} | null;
  partnerName: string | null;
  partnerVibes: string[] | null;
};

/** "@sam's 30th birthday" (or without the age, if the year isn't known) */
function birthdayLabel(known: Known, on: Date): string {
  const whose = known.partnerName ? `@${known.partnerName}'s` : "Their";
  const year = known.partnerBirthday?.year;
  const age = year ? on.getFullYear() - year : 0;
  return age > 0 ? `${whose} ${ordinal(age)} birthday` : `${whose} birthday`;
}

const parts = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return {year, month, day};
};

/** Your occasions around this date (the date being planned) */
export function occasionsOn(date: Date, known: Known): Occasion[] {
  const out: Occasion[] = [];
  if (known.anniversary) {
    const {year, month, day} = parts(known.anniversary);
    const near = occurrenceNear(month, day, date);
    if (near) {
      const years = near.getFullYear() - year;
      out.push({
        id: "ANNIVERSARY",
        emoji: "💍",
        label: years > 0 ? `Your ${ordinal(years)} anniversary` : "Your anniversary",
        vibes: ANNIVERSARY_VIBES,
        date: near,
      });
    }
  }
  if (known.partnerBirthday) {
    const near = occurrenceNear(known.partnerBirthday.month, known.partnerBirthday.day, date);
    if (near) {
      out.push({
        id: "PARTNER_BIRTHDAY",
        emoji: "🎂",
        label: birthdayLabel(known, near),
        vibes: known.partnerVibes,
        date: near,
      });
    }
  }
  return out;
}

/** The next occasion within `days` of today, for a gentle "plan something?" (null if none) */
export function upcomingOccasion(today: Date, known: Known, days = 14): Occasion | null {
  const start = midnight(today).getTime();
  const candidates: Occasion[] = [];
  if (known.anniversary) {
    const {year, month, day} = parts(known.anniversary);
    const next = nextOccurrence(month, day, today);
    const years = next.getFullYear() - year;
    candidates.push({
      id: "ANNIVERSARY",
      emoji: "💍",
      label: years > 0 ? `Your ${ordinal(years)} anniversary` : "Your anniversary",
      vibes: ANNIVERSARY_VIBES,
      date: next,
    });
  }
  if (known.partnerBirthday) {
    const next = nextOccurrence(known.partnerBirthday.month, known.partnerBirthday.day, today);
    candidates.push({
      id: "PARTNER_BIRTHDAY",
      emoji: "🎂",
      label: birthdayLabel(known, next),
      vibes: known.partnerVibes,
      date: next,
    });
  }
  return (
    candidates
      .filter((o) => o.date.getTime() - start <= days * DAY)
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null
  );
}
