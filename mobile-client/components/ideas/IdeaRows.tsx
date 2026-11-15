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
export function SavedIdeaRow({idea}: {idea: IdeaSummary}) {
  return (
    <Pressable
      onPress={() => openIdea(idea.idea_id)}
      className="flex-row items-center bg-zinc-900 border border-zinc-800 rounded-3xl p-3 active:opacity-80"
    >
      <Image
        source={{uri: ideaImage(idea)}}
        style={{width: 64, height: 64, borderRadius: 16}}
        contentFit="cover"
      />
      <View className="flex-1 ml-3 mr-1">
        <Text className="text-white font-bold text-base mb-0.5" numberOfLines={1}>
          {idea.title}
        </Text>
        <IdeaMeta idea={idea} />
      </View>
      <SaveButton ideaId={idea.idea_id} variant="plain" size={40} />
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
            source={{uri: ideaImage(idea)}}
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
