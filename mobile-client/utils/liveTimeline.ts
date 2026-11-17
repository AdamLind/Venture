// utils/liveTimeline.ts
// A live date's timeline as it's really going: the saved plan, moved by
// when you tapped "I'm here" and "Done". Pure; the live screen and the
// reorder editor read it (src/store/activeDateStore.ts useLiveTimeline).
//
//   - Arriving early at a flexible stop (a park, dinner): you get the extra
//     time there and it still ends when planned, so nothing after it moves.
//     Up to MAX_STRETCH times its planned length; arrive earlier than that
//     and the rest is free time before the next stop (the live screen
//     offers to move the rest up, see aheadOf)
//   - Arriving early at a fixed-length stop (a climbing session, a tour:
//     the idea's length doesn't vary): it starts when you get there and
//     takes exactly its length (no stretching), so you're ahead after it.
//     (A stop with a set start time, like a movie or a reservation, will
//     wait for its time once stops can be locked, #57)
//   - Arriving late: the stop takes its planned length from when you got
//     there, and everything after it moves later
//   - "Done": it ends then (early or late)
//   - Later stops never move earlier on their own: they keep their planned
//     times until you tap "I'm here" there, or move the rest up (a place
//     might not be open yet, or someone's meeting you then). The travel to
//     them starts when you leave, so you'd simply get there early
//
// It stays on this phone, like the taps themselves; the saved date only
// changes when you reorder, skip or move the rest up.

import type {TimeSlot} from "@/types/itinerary";

/** An early arrival stretches a flexible stop to at most this times its planned length */
export const MAX_STRETCH = 1.5;
/** "You're ahead" is worth offering from this much (minutes) */
export const AHEAD_MINUTES = 20;

export type LiveTimes = {
  /** When you tapped "I'm here", by idea id */
  arrivedAt: Record<number, number>;
  /** When you tapped "Done", by idea id */
  doneAt: Record<number, number>;
};

/** A stop whose length can't change (a climbing session, a tour) */
const isFixedLength = (slot: TimeSlot) => (slot.activity as any)?.is_duration_variable === false;
/**
 * A stop that starts at a set time (a movie, a reservation): locking a
 * stop's time is #57, so nothing is locked yet
 */
const isLockedTime = (_slot: TimeSlot) => false;

export function liveTimeline(timeline: TimeSlot[] | null, times: LiveTimes): TimeSlot[] | null {
  if (!timeline) return timeline;
  const {arrivedAt, doneAt} = times;
  if (Object.keys(arrivedAt).length === 0 && Object.keys(doneAt).length === 0) return timeline;

  const out: TimeSlot[] = [];
  // When the last thing really ended (nothing can start before it)
  let cursor = -Infinity;
  for (const slot of timeline) {
    const length = slot.endTime - slot.startTime;
    if (!slot.activity) {
      if (slot.type === "AVAILABLE") {
        // Free time to the date's end: it starts later if you're late, but
        // the end doesn't move
        const start = Math.max(slot.startTime, cursor);
        out.push({...slot, startTime: start, endTime: Math.max(slot.endTime, start)});
        continue;
      }
      // Travel (and the trip home): from when you left the last stop (in the
      // plan, a leg starts right when the stop before it ends)
      const start = cursor > -Infinity ? cursor : slot.startTime;
      out.push({...slot, startTime: start, endTime: start + length});
      cursor = start + length;
      continue;
    }

    const id = slot.activity.idea_id as number;
    const arrived = arrivedAt[id];
    // When it would start with nothing tapped: as planned, or later if
    // you're running behind
    const expected = Math.max(slot.startTime, cursor);
    let start = expected;
    let end = expected + length;
    if (arrived != null) {
      if (arrived >= expected || isFixedLength(slot)) {
        // On time, late, or early for something that takes exactly its
        // length: its planned length from when you got there
        start = arrived;
        end = arrived + length;
      } else if (!isLockedTime(slot)) {
        // Early, flexible: more time there, still ending when planned (up
        // to MAX_STRETCH times as long)
        start = arrived;
        end = Math.max(arrived + length, Math.min(expected + length, arrived + length * MAX_STRETCH));
      }
      // (early for a set start time: it starts when it starts; you're just early)

      // The travel into it ended when you got there
      for (let k = out.length - 1; k >= 0 && !out[k].activity; k--) {
        if (out[k].type === "AVAILABLE") continue;
        out[k] = {
          ...out[k],
          startTime: Math.min(out[k].startTime, arrived),
          endTime: Math.min(out[k].endTime, arrived),
        };
      }
    }
    const done = doneAt[id];
    if (done != null) end = Math.max(start, done);
    out.push({...slot, startTime: start, endTime: end});
    cursor = end;
  }
  return out;
}

/**
 * How far ahead of the plan you are (minutes), when the next stop you
 * haven't reached could start sooner: the gap between when you could be
 * there and when it's planned. Null when you aren't ahead by
 * AHEAD_MINUTES, or when the next stop starts at a set time (a movie starts
 * when it starts).
 */
export function aheadOf(
  timeline: TimeSlot[],
  now: number,
  isAhead: (slot: TimeSlot) => boolean,
): {minutes: number; stop: TimeSlot} | null {
  const index = timeline.findIndex((slot) => slot.activity && isAhead(slot));
  if (index <= 0) return null;
  const stop = timeline[index];
  if (isLockedTime(stop)) return null;
  // When you could be there: once the travel before it is done (and not
  // before now)
  const couldArrive = Math.max(timeline[index - 1].endTime, now);
  const minutes = Math.floor((stop.startTime - couldArrive) / 60_000);
  return minutes >= AHEAD_MINUTES ? {minutes, stop} : null;
}
