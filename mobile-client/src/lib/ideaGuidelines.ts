// src/lib/ideaGuidelines.ts
// What makes a good Venture idea (#85): the one source for the guidelines
// screen, the moderators' quick picks, and the rules a sent-back idea links
// to. Automated review (#75) should read the same list.
//
// Venture is for couples and group dates for now, so ideas are written for
// "two or a group", not "you and your partner". Private ideas can be
// anything: these are the rules for publishing to Discover.
//
// The rule ids are stored on sent-back ideas (activities.moderation_rules)
// and checked by review_idea(): keep the list in
// supabase/migrations/20261117050000_review_rules.sql in step.

import type {Ionicons} from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type RuleId =
  | "together"
  | "one-activity"
  | "experience"
  | "doable"
  | "honest"
  | "safe"
  | "audience"
  | "new"
  | "no-spam"
  | "place";

export type Rule = {
  id: RuleId;
  icon: IconName;
  title: string;
  body: string;
  /** Finer points and examples */
  points?: string[];
};

/** The short version, shown above the rules and in the post form */
export const GUIDELINES_SHORT =
  "One thing worth doing together, described well enough that someone else could do it next weekend.";

export const PRIVATE_NOTE = "Private ideas can be anything. These are the rules for publishing to Discover.";

/** A chain is a brand with more than 3 locations */
export const CHAIN_MIN_LOCATIONS = 4;

export const RULES: Rule[] = [
  {
    id: "together",
    icon: "people",
    title: "It's a date",
    body: "Something to do together, as a couple or a group, that you get something out of: time to talk, something new, a shared memory. Not an errand or an ad.",
  },
  {
    id: "one-activity",
    icon: "location",
    title: "One activity, one place",
    body: "“Grab shakes, then walk by the lake” is two ideas. Post them separately; you can still plan them on the same date. At-home ideas don't need a place.",
  },
  {
    id: "experience",
    icon: "sparkles",
    title: "An experience, not a listing",
    body: "The idea is what you do, not just where you go. Say what makes it worth it: the dish to order, the spot on the trail, the best time to go.",
    points: [
      "Local restaurants and cafés are welcome when you say what makes them special. “Dinner at a Thai place” on its own is a listing.",
      `Chains (more than ${CHAIN_MIN_LOCATIONS - 1} locations) only when it's something unusual: a blind taste test between two burrito chains counts, just getting shakes doesn't.`,
      "A chain in passing is fine. In a picnic at the lake with sandwiches grabbed on the way, the idea is the picnic.",
    ],
  },
  {
    id: "doable",
    icon: "map",
    title: "Someone else could do it",
    body: "Where it is, what you actually do, when it works (time of day, season, hours), and roughly how long it takes and what it costs.",
  },
  {
    id: "honest",
    icon: "checkmark-circle",
    title: "Honest",
    body: "Price, length, minimum age, weather and hours match reality. The cover photo shows the real place or activity, and it's yours or one you're allowed to use.",
  },
  {
    id: "safe",
    icon: "shield-checkmark",
    title: "Safe and legal",
    body: "Nothing illegal or unpermitted, and nothing dangerous without training. Risky but legal is fine: add its risk labels and a safety note.",
    points: [
      "Not allowed: trespassing, closed areas, cliff jumping where it's banned, fires where they're not allowed.",
      "Fine with a heads-up: hiking, kayaking, climbing, skiing. “The last half mile is a scramble; skip it after rain.”",
    ],
  },
  {
    id: "audience",
    icon: "eye",
    title: "Right for everyone who'll see it",
    body: "Set the minimum age to fit (anything with alcohol is 21+). Nothing sexual, hateful or degrading.",
  },
  {
    id: "place",
    icon: "pin",
    title: "A real, reachable place",
    body: "A new place goes public with its first idea, so it's reviewed too. The pin marks where you go or park, and anyone can get there.",
    points: [
      "Put the pin where people start: the trailhead, the pullout, the entrance. Not the middle of a lake.",
      "Public places only: not private property, someone's yard, or anywhere closed to the public.",
      "Use the place's real name, not an ad or a nickname only you know. Hours and how to get there should be right.",
    ],
  },
  {
    id: "new",
    icon: "copy",
    title: "New to Venture",
    body: "Not a copy of an idea that's already posted at that place.",
  },
  {
    id: "no-spam",
    icon: "ban",
    title: "No personal info or spam",
    body: "No phone numbers, personal social handles or promo codes. One useful link (tickets, menu, recipe) is fine.",
  },
];

export const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<RuleId, Rule>;

export const isRuleId = (id: string): id is RuleId => id in RULE_BY_ID;

/** Not required, but what makes an idea great */
export const GREAT_TIPS = [
  "Specific details: what to order, where to park, the bench with the view",
  "A tip from someone who's been: what to bring, what to skip, when it gets crowded",
  "A good cover photo of the real thing",
  "A cheap version, or room for different budgets",
  "Something you'd tell a friend about",
];

/** What people agree to when they submit an idea for review (#81) */
export const POSTER_PROMISE = "This is legal to do here, and I've noted any risks.";

// ─── Moderators ──────────────────────────────────────────────────────────────

export const MOD_DECISIONS: {label: string; color: string; when: string}[] = [
  {label: "Approve", color: "#34d399", when: "It meets every rule."},
  {
    label: "Request changes",
    color: "#fb923c",
    when: "It's fixable: missing details, more than one activity, a wrong price, length or age, a weak photo, unclear wording. Say exactly what to change.",
  },
  {
    label: "Reject",
    color: "#f87171",
    when: "Not a date, a plain chain visit, unsafe or illegal, already on Venture, sexual, hateful or spam. It stays private for them to plan with.",
  },
];

export const MOD_PRINCIPLES = [
  "Judge the idea, not your taste. “I wouldn't do this” isn't a reason.",
  "If it's fixable, send it back rather than rejecting it.",
  "Be kind and specific. They read your note: say what to change.",
  "Dismiss reports when the idea meets the rules.",
  "Unsure? Leave it for an admin.",
];

export type NoteDecision = "REQUEST_CHANGES" | "REJECT";

/** Quick picks for the note to the creator; each one cites a rule */
export const QUICK_PICKS: Record<NoteDecision, {rule: RuleId; text: string}[]> = {
  REQUEST_CHANGES: [
    {rule: "doable", text: "Add where it is so people can find it."},
    {rule: "doable", text: "Say what you actually do there."},
    {rule: "experience", text: "Say what makes it worth going: a dish to order, a view, the best time to go."},
    {rule: "one-activity", text: "Make this one activity. Post the others as separate ideas; they can still go on the same date."},
    {rule: "honest", text: "Check the price and how long it takes."},
    {rule: "honest", text: "Add a clear cover photo of the real place or activity."},
    {rule: "safe", text: "Add risk labels and a safety note so people know what they're getting into."},
    {rule: "audience", text: "Check the minimum age. Anything with alcohol is 21+."},
    {rule: "no-spam", text: "Take out the phone number, social handles or promo codes."},
    {rule: "place", text: "Move the pin to where you go or park: the trailhead, the pullout, the entrance."},
    {rule: "place", text: "Use the place's real name."},
    {rule: "place", text: "Check the place's hours and how to get there."},
  ],
  REJECT: [
    {rule: "together", text: "This isn't really a date idea."},
    {rule: "experience", text: "It's an everyday chain visit. Those stay private unless there's something unusual about it."},
    {rule: "safe", text: "This looks unsafe or against the law."},
    {rule: "new", text: "This is already on Venture."},
    {rule: "audience", text: "This isn't right for everyone who'll see it."},
    {rule: "no-spam", text: "This looks like an ad or spam."},
    {rule: "place", text: "This place is private property or closed to the public."},
  ],
};
