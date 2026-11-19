// src/lib/connections.ts
// Connections and the partner link (#35). People find each other only by
// QR code or link (your private profile code), never a search. Scanning
// sends a request the other person accepts. The database does the checks
// (supabase/migrations/20261118040000_connections.sql).

import * as Linking from "expo-linking";

import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";

export interface Connection {
  user_id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  profile_image_url: string | null;
  connected_at: string;
  is_partner: boolean;
}

export interface ConnectionRequest {
  request_id: number;
  kind: "CONNECT" | "PARTNER";
  created_at: string;
  /** The other person (who asked you, or who you asked) */
  other: {user_id: string; username: string | null; profile_image_url: string | null};
}

/** "Sam Lee", or "@sam" without a name */
export const connectionName = (c: Pick<Connection, "first_name" | "last_name" | "username">) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || `@${c.username}`;

// ─── Your code: in the QR code and the link ──────────────────────────────────

/** The link in your QR code. Opens the app's connect screen (an Expo Go link while developing). */
export const connectLink = (code: string) => Linking.createURL(`connect/${code}`);

/** "AbCd eFgH iJkL": easier to read out or type */
export const formatCode = (code: string) => code.replace(/(.{4})(?=.)/g, "$1 ");

/** The code from a scanned QR code, an opened link, or typed text (null if none) */
export function parseCode(text: string): string | null {
  const trimmed = text.trim();
  const fromLink = trimmed.match(/connect\/([A-Za-z0-9_-]{8,})/);
  if (fromLink) return fromLink[1];
  const typed = trimmed.replace(/\s+/g, "");
  return /^[A-Za-z0-9_-]{8,20}$/.test(typed) ? typed : null;
}

// ─── Reading ──────────────────────────────────────────────────────────────────

export async function fetchConnections(): Promise<Connection[]> {
  const {data, error} = await supabase.rpc("my_connections");
  if (error) throw new Error(friendlyError(error));
  return (data ?? []) as Connection[];
}

/** Requests to you and from you, newest first */
export async function fetchRequests(
  me: string,
): Promise<{incoming: ConnectionRequest[]; outgoing: ConnectionRequest[]}> {
  const {data, error} = await supabase
    .from("connection_requests")
    .select(
      `request_id, kind, created_at, from_user, to_user,
       sender:users!connection_requests_from_user_fkey ( user_id, username, profile_image_url ),
       recipient:users!connection_requests_to_user_fkey ( user_id, username, profile_image_url )`,
    )
    .order("created_at", {ascending: false});
  if (error) throw new Error(friendlyError(error));

  const incoming: ConnectionRequest[] = [];
  const outgoing: ConnectionRequest[] = [];
  for (const row of (data ?? []) as any[]) {
    const mine = row.from_user === me;
    const other = mine ? row.recipient : row.sender;
    const request: ConnectionRequest = {
      request_id: row.request_id,
      kind: row.kind,
      created_at: row.created_at,
      other: {
        user_id: mine ? row.to_user : row.from_user,
        username: other?.username ?? null,
        profile_image_url: other?.profile_image_url ?? null,
      },
    };
    (mine ? outgoing : incoming).push(request);
  }
  return {incoming, outgoing};
}

// ─── Actions (each throws a readable Error) ───────────────────────────────────

const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const {data, error} = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message || friendlyError(error));
  return data as T;
};

/** REQUESTED: they'll see your request; CONNECTED: they'd asked you; ALREADY: you were */
export const connectByCode = (code: string) =>
  rpc<{status: "REQUESTED" | "CONNECTED" | "ALREADY"; username: string | null}>("connect_by_code", {
    p_code: code,
  });

export const respondToRequest = (requestId: number, accept: boolean) =>
  rpc<void>("respond_to_request", {p_request_id: requestId, p_accept: accept});

export const cancelRequest = (requestId: number) => rpc<void>("cancel_request", {p_request_id: requestId});

/** REQUESTED, or LINKED if they'd already asked you */
export const requestPartner = (userId: string) => rpc<"REQUESTED" | "LINKED">("request_partner", {p_user_id: userId});

export const endPartner = () => rpc<void>("end_partner");

export const forgetConnection = (userId: string, block: boolean) =>
  rpc<void>("forget_connection", {p_user_id: userId, p_block: block});

/** A new code: your old QR code and link stop working */
export const resetProfileCode = () => rpc<string>("reset_profile_code");
