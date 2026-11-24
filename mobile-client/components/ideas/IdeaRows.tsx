// components/ideas/IdeaRows.tsx
// Rows for the Profile tab's Bucket List and My Ideas.

import React from "react";
import {View, Text, Pressable} from "react-native";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";
import {router} from "expo-router";

import SaveButton from "@/components/ideas/SaveButton";
import {IDEA_STATUS, ideaDuration, ideaImage, ideaPrice} from "@/src/lib/ideas";
import type {IdeaSummary, IdeaVisibility} from "@/types/ideas";

export const openIdea = (ideaId: number) =>
  router.push({pathname: "/idea/[id]", params: {id: String(ideaId)}});

export function IdeaMeta({idea}: {idea: IdeaSummary}) {
  return (
    <Text className="text-zinc-400 text-sm" numberOfLines={1}>
      {ideaPrice(idea)} · {ideaDuration(idea)}
      {idea.modality === "GO_OUT" && idea.venues?.name
        ? ` · ${idea.venues.name}`
        : idea.modality === "STAY_IN"
          ? " · Stay in"
          : ""}
    </Text>
  );
}

/** Bucket List row: photo, title, price and time, and the bookmark. */
export function SavedIdeaRow({
  idea,
  label,
  labelColor,
  privacy,
  selection,
}: {
  idea: IdeaSummary;
  /** Who saved it, on a shared Bucket List (#35) */
  label?: string;
  labelColor?: string;
  /** Your save, with a partner: shared or private, and the switch */
  privacy?: {shared: boolean; onToggle: () => void};
  /** Select mode on Saved: tap ticks it, for "Plan a date with these" */
  selection?: {selected: boolean; onToggle: () => void};
}) {
  return (
    <Pressable
      onPress={selection ? selection.onToggle : () => openIdea(idea.idea_id)}
      accessibilityRole={selection ? "checkbox" : "button"}
      accessibilityState={selection ? {checked: selection.selected} : undefined}
      className="flex-row items-center bg-zinc-900 border border-zinc-800 rounded-3xl p-3 active:opacity-80"
    >
      <Image
        source={ideaImage(idea)}
        style={{width: 64, height: 64, borderRadius: 16}}
        contentFit="cover"
      />
      <View className="flex-1 ml-3 mr-1">
        <Text className="text-white font-bold text-base mb-0.5" numberOfLines={1}>
          {idea.title}
        </Text>
        <IdeaMeta idea={idea} />
        {label ? (
          <Text className="text-xs font-semibold mt-0.5" style={{color: labelColor ?? "#a1a1aa"}} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
      {selection ? (
        <View
          className={`w-7 h-7 mr-1.5 rounded-full border-2 items-center justify-center ${
            selection.selected ? "bg-blue-500 border-blue-500" : "border-zinc-600"
          }`}
        >
          {selection.selected && <Ionicons name="checkmark" size={17} color="white" />}
        </View>
      ) : (
        <>
          {privacy && <PrivacyButton shared={privacy.shared} onToggle={privacy.onToggle} />}
          <SaveButton ideaId={idea.idea_id} variant="plain" size={40} />
        </>
      )}
    </Pressable>
  );
}

/** On your saves with a partner: shared (people) or private (lock) */
function PrivacyButton({shared, onToggle}: {shared: boolean; onToggle: () => void}) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={shared ? "Shared with your person. Keep it private" : "Private. Share with your person"}
      className="w-9 h-9 rounded-full items-center justify-center bg-zinc-800 active:opacity-70"
    >
      <Ionicons name={shared ? "people" : "lock-closed"} size={16} color={shared ? "#f472b6" : "#a1a1aa"} />
    </Pressable>
  );
}

/** A small colored label for an idea's review state. */
export function StatusChip({visibility}: {visibility: IdeaVisibility}) {
  const status = IDEA_STATUS[visibility];
  return (
    <View
      className="flex-row items-center gap-1 self-start px-2 py-0.5 rounded-full"
      style={{backgroundColor: `${status.color}22`}}
    >
      <Ionicons name={status.icon} size={12} color={status.color} />
      <Text className="text-xs font-bold" style={{color: status.color}}>
        {status.label}
      </Text>
    </View>
  );
}

/** A small status icon pinned to the corner of an idea's photo. */
export function StatusBadge({visibility}: {visibility: IdeaVisibility}) {
  const status = IDEA_STATUS[visibility];
  return (
    <View
      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-black items-center justify-center"
      accessibilityLabel={status.label}
    >
      <Ionicons name={status.icon} size={18} color={status.color} />
    </View>
  );
}

/**
 * My Ideas row: photo (with a status icon), title, and the reviewer's note if
 * any. The list is grouped by status, so the group heading names it.
 * Tapping opens the idea; the ••• button opens its actions.
 */
export function MyIdeaRow({
  idea,
  onMore,
}: {
  idea: IdeaSummary;
  onMore: () => void;
}) {
  return (
    <Pressable
      onPress={() => openIdea(idea.idea_id)}
      className="bg-zinc-900 border border-zinc-800 rounded-3xl p-3 active:opacity-80"
    >
      <View className="flex-row items-center">
        <View>
          <Image
            source={ideaImage(idea)}
            style={{width: 64, height: 64, borderRadius: 16}}
            contentFit="cover"
          />
          <StatusBadge visibility={idea.visibility} />
        </View>
        <View className="flex-1 ml-3 gap-0.5">
          <Text className="text-white font-bold text-base" numberOfLines={1}>
            {idea.title}
          </Text>
          <IdeaMeta idea={idea} />
        </View>
        <Pressable
          onPress={onMore}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Options for ${idea.title}`}
          className="w-10 h-10 items-center justify-center rounded-full active:bg-zinc-800"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#a1a1aa" />
        </Pressable>
      </View>
      {idea.moderation_note &&
      (idea.visibility === "NEEDS_REVISION" || idea.visibility === "REJECTED") ? (
        <View className="mt-3 bg-black/40 rounded-2xl px-3 py-2.5 flex-row gap-2">
          <Ionicons name="chatbubble-ellipses-outline" size={14} color="#a1a1aa" style={{marginTop: 2}} />
          <Text className="text-zinc-300 text-sm flex-1">{idea.moderation_note}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
