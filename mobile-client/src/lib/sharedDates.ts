// src/lib/sharedDates.ts
// Sharing a date (#36): who's on it and their roles, invites, and comments
// (on the whole date or one stop). The database checks every change
// (supabase/migrations/20261118050000_shared_dates.sql).

import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import type {DateRole, InviteStatus} from "@/types/dates";

export const ROLE_LABEL: Record<DateRole, string> = {
  OWNER: "Owner",
  EDITOR: "Can edit",
  COMMENTER: "Can comment",
  VIEWER: "Can view",
};

export const ROLE_HINT: Record<Exclude<DateRole, "OWNER">, string> = {
  EDITOR: "Rename it, change the time, start it and adjust it live",
  COMMENTER: "See it and comment",
  VIEWER: "See it",
};

/** Roles the owner can give */
export const INVITE_ROLES: Exclude<DateRole, "OWNER">[] = ["EDITOR", "COMMENTER", "VIEWER"];

export interface DateMember {
  user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_image_url: string | null;
  role: DateRole;
  invite_status: InviteStatus;
  /** Someone either of you forgot: no name or photo */
  masked: boolean;
}

export interface DateComment {
  comment_id: number;
  stop_id: number | null;
  user_id: string;
  body: string;
  created_at: string;
}

/** "Sam Lee", "@sam", or "Someone" (forgotten, or no longer on the date) */
export function memberName(m: Pick<DateMember, "first_name" | "last_name" | "username" | "masked"> | null | undefined) {
  if (!m || m.masked) return "Someone";
  return [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || (m.username ? `@${m.username}` : "Someone");
}

const fail = (error: {message?: string} & object) => new Error(error.message || friendlyError(error as any));

export async function fetchMembers(itineraryId: number): Promise<DateMember[]> {
  const {data, error} = await supabase.rpc("date_members", {p_itinerary_id: itineraryId});
  if (error) throw fail(error);
  return (data ?? []) as DateMember[];
}

/** Invite connections (owner only). role null: the date's default (Can comment). */
export async function inviteToDate(itineraryId: number, userIds: string[], role: DateRole | null) {
  const {data, error} = await supabase.rpc("invite_to_date", {
    p_itinerary_id: itineraryId,
    p_user_ids: userIds,
    p_role: role,
  });
  if (error) throw fail(error);
  return (data ?? 0) as number;
}

export async function setDateRole(itineraryId: number, userId: string, role: DateRole) {
  const {error} = await supabase.rpc("set_date_role", {
    p_itinerary_id: itineraryId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw fail(error);
}

/** The owner takes someone off the date, or you leave it */
export async function removeFromDate(itineraryId: number, userId: string) {
  const {error} = await supabase
    .from("itinerary_users")
    .delete()
    .eq("itinerary_id", itineraryId)
    .eq("user_id", userId);
  if (error) throw fail(error);
}

export async function fetchComments(itineraryId: number): Promise<DateComment[]> {
  const {data, error} = await supabase
    .from("itinerary_comments")
    .select("comment_id, stop_id, user_id, body, created_at")
    .eq("itinerary_id", itineraryId)
    .order("created_at", {ascending: true})
    .limit(500);
  if (error) throw fail(error);
  return (data ?? []) as DateComment[];
}

export const COMMENT_MAX = 1000;

export async function addComment(itineraryId: number, body: string, stopId: number | null) {
  const trimmed = body.trim().slice(0, COMMENT_MAX);
  if (!trimmed) throw new Error("Write something first.");
  const {error} = await supabase
    .from("itinerary_comments")
    .insert({itinerary_id: itineraryId, stop_id: stopId, body: trimmed});
  if (error) throw fail(error);
}

export async function deleteComment(commentId: number) {
  const {error} = await supabase.from("itinerary_comments").delete().eq("comment_id", commentId);
  if (error) throw fail(error);
}

// ─── What you've read (comment_reads) ───────────────────────────────────────

/** A thread's key: 0 for the whole date, otherwise the stop */
export const threadKey = (stopId: number | null) => stopId ?? 0;

/** The newest comment you've seen in each thread (by threadKey) */
export async function fetchReads(itineraryId: number): Promise<Map<number, number>> {
  const {data, error} = await supabase
    .from("comment_reads")
    .select("stop_id, last_seen_id")
    .eq("itinerary_id", itineraryId);
  if (error) throw fail(error);
  return new Map((data ?? []).map((r: any) => [Number(r.stop_id), Number(r.last_seen_id)]));
}

/** You've seen a thread up to its newest comment */
export async function markRead(itineraryId: number, stopId: number | null, lastSeenId: number) {
  const {error} = await supabase
    .from("comment_reads")
    .upsert(
      {itinerary_id: itineraryId, stop_id: threadKey(stopId), last_seen_id: lastSeenId, updated_at: new Date().toISOString()},
      {onConflict: "user_id,itinerary_id,stop_id"},
    );
  if (error) throw fail(error);
}
