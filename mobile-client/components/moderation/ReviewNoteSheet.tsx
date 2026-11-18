// components/moderation/ReviewNoteSheet.tsx
// The note a moderator sends with "Request changes" or "Reject" (#26). The
// creator sees it on their idea, so it's written to them. Quick picks fill
// in common reasons; they can be edited before sending.

import React, {useState} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";

import type {Decision} from "@/src/lib/moderation";

const NOTE_MAX = 1000;
/** Font size only (a line height pushes text off centre on iOS) */
const INPUT_TEXT = {fontSize: 16};

const COPY: Record<Exclude<Decision, "APPROVE">, {title: string; hint: string; send: string; color: string; picks: string[]}> = {
  REQUEST_CHANGES: {
    title: "Request changes",
    hint: "Tell them what to change. They can edit it and send it back.",
    send: "Send back",
    color: "#fb923c",
    picks: [
      "Add a clear cover photo of the place or activity.",
      "Add where it is so people can find it.",
      "Make this one activity. Post the others separately, or save them together as a mini.",
      "Check the price and how long it takes.",
      "Say what you actually do on the date.",
    ],
  },
  REJECT: {
    title: "Reject",
    hint: "Tell them why. It stays theirs to plan with, but won't be published.",
    send: "Reject",
    color: "#f87171",
    picks: [
      "This isn't really a date idea.",
      "This looks unsafe or against the law.",
      "It's an everyday chain visit. Those stay private unless there's something unusual about it.",
      "This is already on Venture.",
      "This doesn't follow the community guidelines.",
    ],
  },
};

export default function ReviewNoteSheet({
  decision,
  onClose,
  onSend,
}: {
  /** null: closed */
  decision: Exclude<Decision, "APPROVE"> | null;
  onClose: () => void;
  /** Resolves when sent; throws to keep the sheet open */
  onSend: (note: string) => Promise<void>;
}) {
  return (
    <Modal visible={!!decision} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {decision && <NoteForm key={decision} decision={decision} onClose={onClose} onSend={onSend} />}
    </Modal>
  );
}

function NoteForm({
  decision,
  onClose,
  onSend,
}: {
  decision: Exclude<Decision, "APPROVE">;
  onClose: () => void;
  onSend: (note: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const copy = COPY[decision];
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const canSend = note.trim().length > 0 && !sending;

  const pick = (text: string) =>
    setNote((prev) => {
      if (prev.includes(text)) return prev;
      const joined = prev.trim() ? `${prev.trim()} ${text}` : text;
      return joined.slice(0, NOTE_MAX);
    });

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(note.trim());
    } catch {
      // The caller shows the error; stay open so the note isn't lost
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-zinc-950"
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
    >
      {/* Cancel · title · send: the sides share the leftover width equally,
          so the title stays centred and "Send back" fits on one line */}
      <View className="flex-row items-center px-5 pt-5 pb-3 border-b border-zinc-900">
        <View className="flex-1 items-start">
          <Pressable onPress={onClose} hitSlop={10} disabled={sending} accessibilityRole="button">
            <Text className="text-zinc-400 font-semibold text-base" numberOfLines={1}>
              Cancel
            </Text>
          </Pressable>
        </View>
        <Text className="text-white font-bold text-base" numberOfLines={1}>
          {copy.title}
        </Text>
        <View className="flex-1 items-end">
          <Pressable onPress={send} hitSlop={10} disabled={!canSend} accessibilityRole="button">
            {sending ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text
                className="font-bold text-base"
                numberOfLines={1}
                style={{color: canSend ? copy.color : "#52525b"}}
              >
                {copy.send}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerClassName="px-5 pt-5 gap-5"
        contentContainerStyle={{paddingBottom: insets.bottom + 32}}
      >
        <Text className="text-zinc-400 text-sm">{copy.hint}</Text>

        <View className="gap-2">
          <View className="flex-row items-baseline justify-between mx-1">
            <Text className="text-zinc-400 text-sm font-bold">NOTE TO THEM</Text>
            <Text className="text-zinc-600 text-xs">{NOTE_MAX - note.length} left</Text>
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            autoFocus
            maxLength={NOTE_MAX}
            textAlignVertical="top"
            placeholder="Be kind and specific."
            placeholderTextColor="#71717a"
            className="min-h-32 px-4 pt-3.5 pb-3.5 text-white bg-zinc-900 border border-zinc-800 rounded-2xl"
            style={INPUT_TEXT}
          />
        </View>

        <View className="gap-2">
          <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider mx-1">Quick picks</Text>
          {copy.picks.map((text) => (
            <Pressable
              key={text}
              onPress={() => pick(text)}
              accessibilityRole="button"
              className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 active:opacity-70"
            >
              <Text className="text-zinc-200 text-sm">{text}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
