// components/moderation/ReviewNoteSheet.tsx
// The note a moderator sends with "Request changes" or "Reject" (#26). The
// creator sees it on their idea, so it's written to them. Quick picks fill
// in common reasons and cite the guideline they come from (#85); the creator's
// note links to the cited guidelines. Both can be edited before sending.
// Also the reason for suspending a creator (#76), which they see too.

import React, {useRef, useState} from "react";
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
import {useRevealAboveKeyboard} from "@/hooks/useRevealAboveKeyboard";

import {QUICK_PICKS, RULES, type NoteDecision, type RuleId} from "@/src/lib/ideaGuidelines";
import Overlays from "@/components/sheets/Overlays";

const NOTE_MAX = 1000;
/** Font size only (a line height pushes text off centre on iOS) */
const INPUT_TEXT = {fontSize: 16};

/** What the note is for: sending an idea back, rejecting it, or suspending its creator */
export type NoteKind = NoteDecision | "SUSPEND";

/** Quick reasons for a suspension (no guideline chips: it's about the account) */
const SUSPEND_PICKS = [
  "Repeatedly broke the idea guidelines.",
  "Posted spam or ads.",
  "Posted something unsafe or illegal.",
  "Posted sexual, hateful or degrading content.",
  "Harassed or targeted someone.",
];

const COPY: Record<NoteKind, {title: string; hint: string; send: string; color: string}> = {
  REQUEST_CHANGES: {
    title: "Request changes",
    hint: "Tell them what to change. They can edit it and send it back.",
    send: "Send back",
    color: "#fb923c",
  },
  REJECT: {
    title: "Reject",
    hint: "Tell them why. It stays theirs to plan with, but won't be published.",
    send: "Reject",
    color: "#f87171",
  },
  SUSPEND: {
    title: "Suspend",
    hint: "For repeat offenders. They can't publish or report, and their ideas leave Discover; they can still plan privately. They'll see this reason, and it's logged.",
    send: "Suspend",
    color: "#f87171",
  },
};

export default function ReviewNoteSheet({
  decision,
  title,
  hint,
  onClose,
  onSend,
}: {
  /** null: closed */
  decision: NoteKind | null;
  /** Instead of the usual title ("Suspend @sam") */
  title?: string;
  /** Instead of the usual explanation */
  hint?: string;
  onClose: () => void;
  /** Resolves when sent; throws to keep the sheet open */
  onSend: (note: string, rules: RuleId[]) => Promise<void>;
}) {
  return (
    <Modal visible={!!decision} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {decision && (
        <NoteForm
          key={decision}
          decision={decision}
          title={title}
          hint={hint}
          onClose={onClose}
          onSend={onSend}
        />
      )}

      {/* Pop-ups and toasts over this sheet (#86) */}
      <Overlays />
    </Modal>
  );
}

function NoteForm({
  decision,
  title,
  hint,
  onClose,
  onSend,
}: {
  decision: NoteKind;
  title?: string;
  hint?: string;
  onClose: () => void;
  onSend: (note: string, rules: RuleId[]) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  // A long note keeps its last line above the keyboard as it grows
  const {scrollRef, onScroll, reveal} = useRevealAboveKeyboard();
  const noteRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const copy = COPY[decision];
  const [note, setNote] = useState("");
  // The guidelines it breaks (a quick pick cites its own)
  const [rules, setRules] = useState<RuleId[]>([]);
  const [sending, setSending] = useState(false);
  const canSend = note.trim().length > 0 && !sending;

  const picks: {text: string; rule: RuleId | null}[] =
    decision === "SUSPEND" ? SUSPEND_PICKS.map((text) => ({text, rule: null})) : QUICK_PICKS[decision];

  const pick = ({text, rule}: {text: string; rule: RuleId | null}) => {
    setNote((prev) => {
      if (prev.includes(text)) return prev;
      const joined = prev.trim() ? `${prev.trim()} ${text}` : text;
      return joined.slice(0, NOTE_MAX);
    });
    if (rule) setRules((prev) => (prev.includes(rule) ? prev : [...prev, rule]));
  };
  const toggleRule = (rule: RuleId) =>
    setRules((prev) => (prev.includes(rule) ? prev.filter((r) => r !== rule) : [...prev, rule]));

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(note.trim(), rules);
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
          {title ?? copy.title}
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
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerClassName="px-5 pt-5 gap-5"
        contentContainerStyle={{paddingBottom: insets.bottom + 32}}
      >
        <Text className="text-zinc-400 text-sm">{hint ?? copy.hint}</Text>

        <View className="gap-2">
          <View className="flex-row items-baseline justify-between mx-1">
            <Text className="text-zinc-400 text-sm font-bold">NOTE TO THEM</Text>
            <Text className="text-zinc-600 text-xs">{NOTE_MAX - note.length} left</Text>
          </View>
          <TextInput
            ref={noteRef}
            onContentSizeChange={() => noteRef.current?.isFocused() && reveal(noteRef.current)}
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
          {picks.map((p) => (
            <Pressable
              key={p.text}
              onPress={() => pick(p)}
              accessibilityRole="button"
              className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 active:opacity-70"
            >
              <Text className="text-zinc-200 text-sm">{p.text}</Text>
            </Pressable>
          ))}
        </View>

        {/* Linked from their note, so they can read the rule itself */}
        {decision !== "SUSPEND" && (
          <View className="gap-2">
            <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider mx-1">
              Guidelines it breaks
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {RULES.map((rule) => {
                const on = rules.includes(rule.id);
                return (
                  <Pressable
                    key={rule.id}
                    onPress={() => toggleRule(rule.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{checked: on}}
                    className="rounded-full px-3 py-1.5 border active:opacity-70"
                    style={{
                      backgroundColor: on ? `${copy.color}22` : "#18181b",
                      borderColor: on ? copy.color : "#27272a",
                    }}
                  >
                    <Text className="text-sm font-semibold" style={{color: on ? copy.color : "#a1a1aa"}}>
                      {rule.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
