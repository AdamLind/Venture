// src/lib/safety.ts
// Risk labels, the safety note, and the "we don't verify safety" line (#81).
// Risky but legal is fine, as long as people know what they're getting into.
// The ids are checked by the database (activities_risk_labels_check, in
// supabase/migrations/20261118020000_risk_labels.sql): keep them in step.

import type {Ionicons} from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type RiskLabel = "STRENUOUS" | "HEIGHTS" | "WATER" | "REMOTE" | "PERMIT" | "GUIDE";

export const RISK_LABELS: {value: RiskLabel; label: string; icon: IconName; hint: string}[] = [
  {value: "STRENUOUS", label: "Strenuous", icon: "barbell-outline", hint: "Hard physical effort"},
  {value: "HEIGHTS", label: "Heights", icon: "trending-up-outline", hint: "Drop-offs, ledges or climbing"},
  // (Not "Water": that's a tag for lakes and paddleboarding; this is the risk)
  {value: "WATER", label: "Swimming or boats", icon: "water-outline", hint: "Swimming, boats or cold water"},
  {value: "REMOTE", label: "Remote", icon: "cellular-outline", hint: "Little or no phone signal"},
  {value: "PERMIT", label: "Permit or fee", icon: "ticket-outline", hint: "Book or pay ahead"},
  {value: "GUIDE", label: "Guide recommended", icon: "compass-outline", hint: "Safer with someone who knows it"},
];

const BY_VALUE = Object.fromEntries(RISK_LABELS.map((r) => [r.value, r]));

/** Known labels only, in the usual order */
export function riskLabelsOf(idea: {risk_labels?: string[] | null}) {
  const set = new Set(idea.risk_labels ?? []);
  return RISK_LABELS.filter((r) => set.has(r.value));
}

export const riskLabelText = (value: string) => BY_VALUE[value]?.label ?? value;

export const SAFETY_NOTE_MAX = 300;

/** Shown where it matters (outdoor or risky ideas), not on every idea, so it isn't tuned out */
export const SAFETY_DISCLAIMER = "We don't verify safety or conditions. Check before you go and use your judgment.";

/** The line for one idea: a user's idea says so; Venture's own (official) ones don't */
export const safetyDisclaimer = (official: boolean) =>
  official
    ? "Conditions change. Check before you go and use your judgment."
    : `Shared by a Venture user. ${SAFETY_DISCLAIMER}`;

/**
 * Outdoors when going out, or labeled risky: the disclaimer applies. (Not a
 * night in the backyard: there's nowhere to "check before you go".)
 */
export const needsSafetyLine = (idea: {
  environment?: string | null;
  modality?: string | null;
  risk_labels?: string[] | null;
}) => (idea.environment === "OUTDOOR" && idea.modality !== "STAY_IN") || (idea.risk_labels?.length ?? 0) > 0;

/** Worth telling someone where you'll be: remote, or outdoors */
export const worthSharingPlan = (idea: {environment?: string | null; risk_labels?: string[] | null}) =>
  idea.environment === "OUTDOOR" || (idea.risk_labels ?? []).includes("REMOTE");
