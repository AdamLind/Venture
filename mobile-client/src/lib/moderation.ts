// src/lib/moderation.ts
// The moderation queue and decisions (#26). Reads go through RLS (staff see
// ideas submitted for review, never private ones); decisions go through
// review_idea() / resolve_reports(), which check the role and log who did it.

import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {useStaffStore} from "@/src/store/useStaffStore";
import type {IdeaVisibility} from "@/types/ideas";

export type Decision = "APPROVE" | "REQUEST_CHANGES" | "REJECT";
export type ReportReason = "INAPPROPRIATE" | "SPAM" | "UNSAFE" | "AGE_RATING" | "OTHER";

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  INAPPROPRIATE: "Inappropriate",
  UNSAFE: "Unsafe or illegal",
  SPAM: "Spam or misleading",
  AGE_RATING: "Wrong age rating",
  OTHER: "Something else",
};

export interface QueueIdea {
  idea_id: number;
  user_id: string | null;
  title: string;
  image_urls: string[] | null;
  visibility: IdeaVisibility;
  submitted_at: string | null;
  created_at: string;
  username: string | null;
  place: string | null;
}

export interface Report {
  reason: ReportReason;
  details: string | null;
  created_at: string;
}

export interface ReportedIdea extends Omit<QueueIdea, "submitted_at" | "place"> {
  reports: Report[];
}

export interface LogEntry {
  action_id: number;
  action: string;
  idea_id: number | null;
  idea_title: string | null;
  moderator: string | null;
  note: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const IDEA_COLUMNS = `
  idea_id, user_id, title, image_urls, visibility, submitted_at, created_at,
  venues ( name ),
  users!activities_user_id_fkey ( username )
`;

function toQueueIdea(row: any): QueueIdea {
  return {
    idea_id: row.idea_id,
    user_id: row.user_id,
    title: row.title,
    image_urls: row.image_urls,
    visibility: row.visibility,
    submitted_at: row.submitted_at,
    created_at: row.created_at,
    username: row.users?.username ?? null,
    place: row.venues?.name ?? null,
  };
}

/** Ideas waiting for review, oldest first. */
export async function fetchToReview(): Promise<QueueIdea[]> {
  const {data, error} = await supabase
    .from("activities")
    .select(IDEA_COLUMNS)
    .eq("visibility", "PENDING_REVIEW")
    .order("submitted_at", {ascending: true, nullsFirst: true})
    .limit(200);
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map(toQueueIdea);
}

/** Ideas with open reports, most reported first. */
export async function fetchReported(): Promise<ReportedIdea[]> {
  const {data, error} = await supabase
    .from("idea_reports")
    .select(
      `reason, details, created_at,
       activities ( idea_id, user_id, title, image_urls, visibility, created_at,
         users!activities_user_id_fkey ( username ) )`,
    )
    .eq("status", "OPEN")
    .order("created_at", {ascending: false})
    .limit(500);
  if (error) throw new Error(friendlyError(error));

  const byIdea = new Map<number, ReportedIdea>();
  for (const row of (data ?? []) as any[]) {
    const idea = row.activities;
    // Its owner made it private since: nothing public left to review
    if (!idea) continue;
    let entry = byIdea.get(idea.idea_id);
    if (!entry) {
      entry = {
        idea_id: idea.idea_id,
        user_id: idea.user_id,
        title: idea.title,
        image_urls: idea.image_urls,
        visibility: idea.visibility,
        created_at: idea.created_at,
        username: idea.users?.username ?? null,
        reports: [],
      };
      byIdea.set(idea.idea_id, entry);
    }
    entry.reports.push({reason: row.reason, details: row.details, created_at: row.created_at});
  }
  return [...byIdea.values()].sort((a, b) => b.reports.length - a.reports.length);
}

const LOG_COLUMNS = `
  action_id, action, idea_id, note, detail, created_at,
  moderator:users!moderation_actions_moderator_id_fkey ( username ),
  idea:activities ( title )
`;

function toLogEntry(row: any): LogEntry {
  return {
    action_id: row.action_id,
    action: row.action,
    idea_id: row.idea_id,
    idea_title: row.idea?.title ?? null,
    moderator: row.moderator?.username ?? null,
    note: row.note,
    detail: row.detail,
    created_at: row.created_at,
  };
}

/** Recent decisions (moderators: on ideas; admins: everything). */
export async function fetchLog(): Promise<LogEntry[]> {
  const {data, error} = await supabase
    .from("moderation_actions")
    .select(LOG_COLUMNS)
    .order("created_at", {ascending: false})
    .limit(100);
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map(toLogEntry);
}

/** One idea's open reports and its review history, for the review panel. */
export async function fetchIdeaReview(ideaId: number): Promise<{reports: Report[]; history: LogEntry[]}> {
  const [reports, history] = await Promise.all([
    supabase
      .from("idea_reports")
      .select("reason, details, created_at")
      .eq("idea_id", ideaId)
      .eq("status", "OPEN")
      .order("created_at", {ascending: false}),
    supabase
      .from("moderation_actions")
      .select(LOG_COLUMNS)
      .eq("idea_id", ideaId)
      .order("created_at", {ascending: false})
      .limit(20),
  ]);
  if (reports.error) throw new Error(friendlyError(reports.error));
  if (history.error) throw new Error(friendlyError(history.error));
  return {
    reports: (reports.data ?? []) as Report[],
    history: (history.data ?? []).map(toLogEntry),
  };
}

/** Approve, send back or reject. Throws a readable Error. */
export async function reviewIdea(ideaId: number, decision: Decision, note?: string) {
  const {error} = await supabase.rpc("review_idea", {
    p_idea_id: ideaId,
    p_decision: decision,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message || friendlyError(error));
  useStaffStore.getState().refreshCounts();
}

/** Close an idea's open reports: acted on, or nothing wrong. */
export async function resolveReports(ideaId: number, outcome: "RESOLVED" | "DISMISSED", note?: string) {
  const {error} = await supabase.rpc("resolve_reports", {
    p_idea_id: ideaId,
    p_outcome: outcome,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message || friendlyError(error));
  useStaffStore.getState().refreshCounts();
}

const ACTION_LABEL: Record<string, string> = {
  APPROVE: "approved",
  REQUEST_CHANGES: "asked for changes on",
  REJECT: "rejected",
  RESOLVE_REPORTS: "resolved reports on",
  DISMISS_REPORTS: "dismissed reports on",
  ADD_STAFF: "added a staff member",
  CHANGE_STAFF: "changed a staff role",
  REMOVE_STAFF: "removed a staff member",
};

/** On one idea's page, where the idea goes without saying */
const HISTORY_LABEL: Record<string, string> = {
  APPROVE: "approved it",
  REQUEST_CHANGES: "asked for changes",
  REJECT: "rejected it",
  RESOLVE_REPORTS: "resolved its reports",
  DISMISS_REPORTS: "dismissed its reports",
};

const whoDid = (entry: LogEntry, myUsername?: string | null) =>
  entry.moderator
    ? entry.moderator === myUsername
      ? "You"
      : `@${entry.moderator}`
    : "A moderator";

/** "You asked for changes" */
export function historyLine(entry: LogEntry, myUsername?: string | null) {
  return `${whoDid(entry, myUsername)} ${HISTORY_LABEL[entry.action] ?? entry.action.toLowerCase()}`;
}

/** "@sam approved “Sunset kayak”" */
export function logLine(entry: LogEntry, myUsername?: string | null) {
  const who = whoDid(entry, myUsername);
  const what = ACTION_LABEL[entry.action] ?? entry.action.toLowerCase();
  const onIdea = entry.idea_id
    ? ` “${entry.idea_title ?? "a private idea"}”`
    : "";
  return `${who} ${what}${entry.action.endsWith("_STAFF") ? "" : onIdea}`;
}

/** "3m", "2h", "4d" since a time */
export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
