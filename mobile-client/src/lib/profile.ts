// src/lib/profile.ts
// Small helpers shared by the profile, onboarding and settings screens.

import type {
  PlanningDefaults,
  PublicProfile,
  UserPreferences,
  UserProfile,
} from "@/types/profile";
import {formatMoney} from "@/utils/money";

export const MIN_AGE = 18; // keep in sync with private.user_preferences_guard()

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

// Placeholder usernames created by the signup trigger: 'user_' + 8 hex chars
const PLACEHOLDER_USERNAME = /^user_[0-9a-f]{8}$/;

export const BUDGET_TIERS = [
  {label: "$", value: 20},
  {label: "$$", value: 50},
  {label: "$$$", value: 150},
] as const;

export const TRAVEL_DISTANCES = [5, 10, 25, 50] as const;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "");
}

/** Returns an error message, or null when the username is valid. */
export function validateUsername(username: string): string | null {
  if (username.length < 3) return "Usernames need at least 3 characters.";
  if (username.length > 30) return "Usernames can be at most 30 characters.";
  if (!USERNAME_PATTERN.test(username)) {
    return "Use lowercase letters, numbers, _ or . only.";
  }
  return null;
}

export function isPlaceholderUsername(username: string | null | undefined) {
  return !!username && PLACEHOLDER_USERNAME.test(username);
}

export function displayName(profile: UserProfile | null): string {
  if (!profile) return "";
  const name = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || profile.username;
}

export function initials(profile: PublicProfile | null): string {
  if (!profile) return "?";
  const source = profile.first_name || profile.username || "?";
  const second = profile.last_name?.[0] ?? "";
  return (source[0] + second).toUpperCase();
}

export function budgetLabel(budget: number): string {
  const tier = BUDGET_TIERS.find((t) => t.value === budget);
  return tier ? tier.label : formatMoney(budget);
}

/** Whole years between a "YYYY-MM-DD" birthdate (or Date) and today. */
export function ageFrom(birthdate: string | Date): number {
  const b =
    typeof birthdate === "string" ? parseLocalDate(birthdate) : birthdate;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const hadBirthday =
    today.getMonth() > b.getMonth() ||
    (today.getMonth() === b.getMonth() && today.getDate() >= b.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

/** Date -> "YYYY-MM-DD" using the LOCAL calendar day (toISOString would shift it). */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" -> Date at local midnight. */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatBirthdate(value: string): string {
  return parseLocalDate(value).toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const FALLBACK_DEFAULTS: PlanningDefaults = {
  default_modality: "GO_OUT",
  default_budget: 50,
  default_travel_miles: 10,
  home_label: null,
  home_lat: null,
  home_lng: null,
};

export function toPlanningDefaults(
  prefs: UserPreferences | null,
): PlanningDefaults {
  if (!prefs) return FALLBACK_DEFAULTS;
  return {
    default_modality: prefs.default_modality,
    default_budget: prefs.default_budget,
    default_travel_miles: prefs.default_travel_miles,
    home_label: prefs.home_label,
    home_lat: prefs.home_lat,
    home_lng: prefs.home_lng,
  };
}

export function hasHomeArea(prefs: UserPreferences | null): boolean {
  return prefs?.home_lat != null && prefs?.home_lng != null;
}

/** Turns Supabase/Postgres errors into something a person can read. */
export function friendlyError(error: unknown): string {
  const err = error as {code?: string; message?: string} | null;
  if (!err) return "Something went wrong. Please try again.";
  if (err.code === "23505") return "That username is already taken.";
  if (err.code === "23514") {
    // Our own trigger messages are written for people; constraint names aren't
    if (err.message && !err.message.includes("constraint")) return err.message;
    if (err.message?.includes("username")) {
      return "Use 3–30 lowercase letters, numbers, _ or .";
    }
    return "Some of those values aren't allowed.";
  }
  if (err.message?.toLowerCase().includes("network")) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return err.message || "Something went wrong. Please try again.";
}
