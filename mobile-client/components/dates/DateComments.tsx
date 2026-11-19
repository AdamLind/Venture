// components/dates/DateComments.tsx
// Comments on a shared date (#36). Each stop has its own thread, opened from
// the comment bubble on its card; the whole date has one too, above People.
// Not a chat: for a real conversation, Message them hands off to iMessage.
// Long-press your own comment (or any, as the owner) to delete it.

import React, {useRef, useState} from "react";
import {ActivityIndicator, Alert, Pressable, Share, Text, TextInput, View} from "react-native";
import {Ionicons} from "@expo/vector-icons";

import Avatar from "@/components/profile/Avatar";
import type {Measurable} from "@/hooks/useRevealAboveKeyboard";
import {
  COMMENT_MAX,
  type DateComment,
  type DateMember,
  addComment,
  deleteComment,
  memberName,
} from "@/src/lib/sharedDates";
import {formatWhen} from "@/src/lib/dates";
import type {Itinerary} from "@/types/dates";

/** Font size only (a line height pushes text off centre on iOS), with even
 *  padding and the send button's height, so one line sits centred */
const INPUT_TEXT = {fontSize: 16, minHeight: 40, paddingTop: 10, paddingBottom: 10};

/** "now", "5m", "3h", "2d", or a date */
function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString([], {month: "short", day: "numeric"});
}

type ThreadProps = {
  itineraryId: number;
  /** null: the whole date */
  stopId: number | null;
  /** This thread's comments, oldest first */
  comments: DateComment[];
  members: DateMember[] | null;
  myUserId: string | null;
  canComment: boolean;
  isOwner: boolean;
  onChanged: () => void;
  /** The comment box got focus: keep it above the keyboard */
  onInputFocus?: (input: Measurable | null) => void;
};

/** One thread: its comments, then "Leave a comment" */
export function CommentThread({
  itineraryId,
  stopId,
  comments,
  members,
  myUserId,
  canComment,
  isOwner,
  onChanged,
  onInputFocus,
}: ThreadProps) {
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const memberOf = (userId: string) => members?.find((m) => m.user_id === userId) ?? null;

  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await addComment(itineraryId, draft, stopId);
      setDraft("");
      onChanged();
    } catch (e) {
      Alert.alert("Couldn't post that", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSending(false);
    }
  };

  const confirmDelete = (c: DateComment) =>
    Alert.alert("Delete this comment?", undefined, [
      {text: "Cancel", style: "cancel"},
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteComment(c.comment_id);
            onChanged();
          } catch (e) {
            Alert.alert("Couldn't delete it", e instanceof Error ? e.message : "Please try again.");
          }
        },
      },
    ]);

  return (
    <View>
      {comments.length === 0 && !canComment ? (
        <Text className="text-zinc-500 text-sm px-4 py-3">No comments yet.</Text>
      ) : null}
      {comments.map((c, i) => {
        const author = memberOf(c.user_id);
        const mine = c.user_id === myUserId;
        return (
          <Pressable
            key={c.comment_id}
            onLongPress={mine || isOwner ? () => confirmDelete(c) : undefined}
            className={`flex-row gap-3 px-4 py-3 ${i > 0 ? "border-t border-zinc-800" : ""}`}
          >
            <Avatar
              profile={
                author && !author.masked
                  ? {username: author.username ?? "?", profile_image_url: author.profile_image_url}
                  : null
              }
              size={28}
              small
            />
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text className="text-white font-semibold text-sm" numberOfLines={1}>
                  {mine ? "You" : memberName(author)}
                </Text>
                <Text className="text-zinc-600 text-xs">{ago(c.created_at)}</Text>
              </View>
              <Text className="text-zinc-200 text-[15px] leading-5">{c.body}</Text>
            </View>
          </Pressable>
        );
      })}

      {canComment && (
        <View className={`flex-row items-end gap-2 px-3 py-3 ${comments.length ? "border-t border-zinc-800" : ""}`}>
          <TextInput
            ref={inputRef}
            onFocus={() => onInputFocus?.(inputRef.current)}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={COMMENT_MAX}
            placeholder="Leave a comment"
            placeholderTextColor="#71717a"
            textAlignVertical="center"
            className="flex-1 bg-zinc-950 text-white px-4 rounded-2xl border border-zinc-800 max-h-32"
            style={INPUT_TEXT}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            className={`w-10 h-10 rounded-full items-center justify-center ${draft.trim() ? "bg-blue-500" : "bg-zinc-800"}`}
          >
            {sending ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Ionicons name="arrow-up" size={20} color={draft.trim() ? "white" : "#52525b"} />
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** The whole date's thread, above People */
export default function DateComments({
  itinerary,
  comments,
  ...thread
}: Omit<ThreadProps, "itineraryId" | "stopId" | "comments"> & {
  itinerary: Itinerary;
  /** null while loading; every comment on the date (this shows the whole-date ones) */
  comments: DateComment[] | null;
}) {
  // A real conversation belongs in Messages, not here
  const messageThem = () =>
    Share.share({message: `${itinerary.title} · ${formatWhen(itinerary.starts_at)}`}).catch(() => {});

  return (
    <View className="mt-8 gap-2">
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider">About the date</Text>
        <Pressable onPress={messageThem} hitSlop={8} className="flex-row items-center gap-1 active:opacity-60">
          <Ionicons name="chatbubbles-outline" size={15} color="#60a5fa" />
          <Text className="text-blue-400 font-semibold text-sm">Message them</Text>
        </Pressable>
      </View>
      <View className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
        {comments === null ? (
          <ActivityIndicator color="#a1a1aa" style={{margin: 16}} />
        ) : (
          <CommentThread
            itineraryId={itinerary.itinerary_id}
            stopId={null}
            comments={comments.filter((c) => c.stop_id == null)}
            {...thread}
          />
        )}
      </View>
    </View>
  );
}
