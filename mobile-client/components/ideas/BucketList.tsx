// components/ideas/BucketList.tsx
// The Bucket List on Profile. With a partner (#35) it's in two parts:
// "Ours" (your shared saves and theirs, so you can plan a date from their
// list) and "Just me" (private: safe for planning a surprise). Each of your
// saves has a small switch between the two. Without a partner, one list.

import React from "react";
import {Text, View} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Toast from "react-native-toast-message";

import {SavedIdeaRow} from "@/components/ideas/IdeaRows";
import {useSavedStore} from "@/src/store/useSavedStore";
import {usePartner} from "@/src/store/useConnectionsStore";
import type {IdeaSummary} from "@/types/ideas";

const PARTNER_COLOR = "#f472b6";

type Row = {idea: IdeaSummary; mine: boolean; theirs: boolean; shared: boolean};

export default function BucketList() {
  const items = useSavedStore((s) => s.items);
  const partnerItems = useSavedStore((s) => s.partnerItems);
  const setShared = useSavedStore((s) => s.setShared);
  const partner = usePartner();

  const mine = items.flatMap((item) => (item.idea ? [{...item, idea: item.idea}] : []));

  if (!partner) {
    return (
      <View className="gap-3">
        {mine.map(({idea}) => (
          <SavedIdeaRow key={idea.idea_id} idea={idea} />
        ))}
      </View>
    );
  }

  const partnerName = `@${partner.username}`;

  // Ours: your shared saves and your partner's, once each
  const ours = new Map<number, Row>();
  for (const item of mine) {
    if (item.shared) ours.set(item.activity_id, {idea: item.idea, mine: true, theirs: false, shared: true});
  }
  for (const item of partnerItems) {
    if (!item.idea) continue;
    const row = ours.get(item.activity_id);
    if (row) row.theirs = true;
    else {
      // You might have it saved privately too: still theirs to share
      const yours = mine.find((m) => m.activity_id === item.activity_id);
      ours.set(item.activity_id, {idea: item.idea, mine: !!yours, theirs: true, shared: !!yours?.shared});
    }
  }
  const justMe = mine.filter((item) => !item.shared && !partnerItems.some((p) => p.activity_id === item.activity_id));

  const flip = async (ideaId: number, shared: boolean) => {
    if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
    try {
      await setShared(ideaId, shared);
      Toast.show({
        type: "success",
        text1: shared ? `Shared with ${partnerName}` : "Kept private",
        position: "bottom",
      });
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Couldn't change that",
        text2: e instanceof Error ? e.message : undefined,
        position: "bottom",
      });
    }
  };

  const whoLabel = (row: Row) =>
    row.mine && row.theirs ? "You both" : row.theirs ? `Saved by ${partnerName}` : "You";

  return (
    <View className="gap-6">
      {/* OURS */}
      <View className="gap-3">
        <View className="flex-row items-center gap-2 px-1">
          <Ionicons name="heart" size={14} color={PARTNER_COLOR} />
          <Text className="text-white font-bold text-base">Ours</Text>
          <Text className="text-zinc-500 text-sm flex-1">with {partnerName}</Text>
        </View>
        {ours.size === 0 ? (
          <Text className="text-zinc-500 text-sm px-1">
            Ideas you both want to try show up here. Save something, or ask {partnerName} to.
          </Text>
        ) : (
          [...ours.values()].map((row) => (
            <SavedIdeaRow
              key={row.idea.idea_id}
              idea={row.idea}
              label={whoLabel(row)}
              labelColor={row.theirs ? PARTNER_COLOR : undefined}
              privacy={row.mine && row.shared ? {shared: true, onToggle: () => flip(row.idea.idea_id, false)} : undefined}
            />
          ))
        )}
      </View>

      {/* JUST ME */}
      <View className="gap-3">
        <View className="flex-row items-center gap-2 px-1">
          <Ionicons name="lock-closed" size={13} color="#a1a1aa" />
          <Text className="text-white font-bold text-base">Just me</Text>
          <Text className="text-zinc-500 text-sm flex-1">{partnerName} can&apos;t see these</Text>
        </View>
        {justMe.length === 0 ? (
          <Text className="text-zinc-500 text-sm px-1">
            Planning a surprise? Long-press the bookmark to save an idea privately.
          </Text>
        ) : (
          justMe.map((item) => (
            <SavedIdeaRow
              key={item.idea.idea_id}
              idea={item.idea}
              privacy={{shared: false, onToggle: () => flip(item.idea.idea_id, true)}}
            />
          ))
        )}
      </View>
    </View>
  );
}
