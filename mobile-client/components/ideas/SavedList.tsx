// components/ideas/SavedList.tsx
// Saved, on Profile (it was the Bucket List). With a partner (#35) it's in
// two parts: "Ours" (your shared saves and theirs, so you can plan a date
// from their list) and "Just me" (private: safe for planning a surprise).
// Each of your saves has a small switch between the two. Without a partner,
// one list. Ideas you've been on a date with show "Been there". Filters show
// just those (your favorites, found for you) or just the ones you haven't
// tried yet.
// Select picks a few to plan a date with: the builder puts them in order.

import React, {useMemo, useState} from "react";
import {Pressable, Text, View} from "react-native";
import {router} from "expo-router";
import {Ionicons} from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Toast from "@/src/lib/toast";

import {SavedIdeaRow} from "@/components/ideas/IdeaRows";
import {beenThereOn, formatShortDate} from "@/src/lib/dates";
import {useSavedStore} from "@/src/store/useSavedStore";
import {usePartner} from "@/src/store/useConnectionsStore";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import {MAX_SEEDS, usePlanSeedStore} from "@/src/store/usePlanSeedStore";
import {sizedImage} from "@/src/lib/images";
import type {IdeaSummary} from "@/types/ideas";
import {showInfo} from "@/src/lib/notify";

const PARTNER_COLOR = "#f472b6";
const BEEN_COLOR = "#4ade80";

type Row = {idea: IdeaSummary; mine: boolean; theirs: boolean; shared: boolean};
type Filter = "all" | "been" | "notYet";

const FILTER_LABEL: Record<Filter, string> = {all: "All", been: "Been there", notYet: "Not yet"};

export default function SavedList() {
  const items = useSavedStore((s) => s.items);
  const partnerItems = useSavedStore((s) => s.partnerItems);
  const setShared = useSavedStore((s) => s.setShared);
  const itineraries = useItineraryStore((s) => s.itineraries);
  const partner = usePartner();
  const [filter, setFilter] = useState<Filter>("all");
  // Select mode: the ideas ticked, in the order you picked them
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Map<number, IdeaSummary>>(new Map());

  const toggle = (idea: IdeaSummary) => {
    const next = new Map(picked);
    if (next.has(idea.idea_id)) next.delete(idea.idea_id);
    else if (next.size >= MAX_SEEDS) {
      showInfo(`Up to ${MAX_SEEDS} ideas`, "Add more in the builder");
      return;
    } else next.set(idea.idea_id, idea);
    if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
    setPicked(next);
  };
  const selectionFor = (idea: IdeaSummary) =>
    selecting ? {selected: picked.has(idea.idea_id), onToggle: () => toggle(idea)} : undefined;

  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Map());
  };
  // Off to Plan with them; the builder puts them in the best order
  const planWithThese = () => {
    usePlanSeedStore.getState().setSeeds(
      [...picked.values()].map((idea) => ({
        idea_id: idea.idea_id,
        title: idea.title,
        image: sizedImage(idea.image_urls?.[0], 56),
        modality: idea.modality,
        est_price_per_person: Number(idea.est_price_per_person) || 0,
        est_duration_minutes: idea.est_duration_minutes ?? null,
        time_of_day: idea.time_of_day ?? null,
      })),
    );
    stopSelecting();
    router.navigate("/(tabs)/plan");
  };

  // When you last went: idea id → that date's start
  const been = useMemo(() => beenThereOn(itineraries), [itineraries]);
  const beenLabel = (ideaId: number) => {
    const when = been.get(ideaId);
    return when ? `✓ Been there · ${formatShortDate(when)}` : undefined;
  };
  const shown = (ideaId: number) => filter === "all" || (filter === "been") === been.has(ideaId);

  const mine = items.flatMap((item) => (item.idea ? [{...item, idea: item.idea}] : []));
  const anyBeen = mine.some((m) => been.has(m.activity_id)) || partnerItems.some((p) => been.has(p.activity_id));

  const filterChips = anyBeen ? (
    <View className="flex-row gap-2 flex-1">
      {(["all", "been", "notYet"] as Filter[]).map((f) => {
        const on = filter === f;
        return (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            accessibilityRole="button"
            accessibilityState={{selected: on}}
            className={`flex-row items-center gap-1 px-3.5 py-1.5 rounded-full border ${
              on ? "bg-zinc-800 border-zinc-600" : "border-zinc-800"
            }`}
          >
            {f === "been" && <Ionicons name="checkmark-circle" size={13} color={on ? BEEN_COLOR : "#71717a"} />}
            {f === "notYet" && <Ionicons name="sparkles" size={12} color={on ? "#fbbf24" : "#71717a"} />}
            <Text className={`text-sm font-semibold ${on ? "text-white" : "text-zinc-400"}`}>{FILTER_LABEL[f]}</Text>
          </Pressable>
        );
      })}
    </View>
  ) : (
    <View className="flex-1" />
  );

  // Filters, Select / Cancel, and (while selecting) the plan button
  const filters = (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        {filterChips}
        <Pressable
          onPress={selecting ? stopSelecting : () => setSelecting(true)}
          hitSlop={8}
          accessibilityRole="button"
          className="px-1 py-1.5 active:opacity-60"
        >
          <Text className="text-blue-400 font-semibold text-sm">{selecting ? "Cancel" : "Select"}</Text>
        </Pressable>
      </View>
      {selecting && (
        <Pressable
          onPress={planWithThese}
          disabled={picked.size === 0}
          accessibilityRole="button"
          className={`flex-row items-center justify-center gap-2 rounded-full py-3.5 ${
            picked.size ? "bg-white active:opacity-80" : "bg-zinc-900 border border-zinc-800"
          }`}
        >
          <Ionicons name="sparkles" size={16} color={picked.size ? "black" : "#71717a"} />
          <Text className={`font-extrabold ${picked.size ? "text-black" : "text-zinc-500"}`}>
            {picked.size === 0
              ? "Pick ideas to plan a date with"
              : picked.size === 1
                ? "Plan a date with this"
                : `Plan a date with these ${picked.size}`}
          </Text>
        </Pressable>
      )}
    </View>
  );

  if (!partner) {
    const list = mine.filter((m) => shown(m.activity_id));
    return (
      <View className="gap-3">
        {filters}
        {list.map(({idea}) => (
          <SavedIdeaRow
            key={idea.idea_id}
            idea={idea}
            label={beenLabel(idea.idea_id)}
            labelColor={BEEN_COLOR}
            selection={selectionFor(idea)}
          />
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
  const oursRows = [...ours.values()].filter((row) => shown(row.idea.idea_id));
  const justMeRows = justMe.filter((item) => shown(item.activity_id));

  const flip = async (ideaId: number, shared: boolean) => {
    if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
    try {
      await setShared(ideaId, shared);
      Toast.show({
        type: "success",
        text1: shared ? `Shared with ${partnerName}` : "Kept private",
      });
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Couldn't change that",
        text2: e instanceof Error ? e.message : undefined,
      });
    }
  };

  // "Been there" says the most; otherwise who saved it
  const label = (row: Row) =>
    beenLabel(row.idea.idea_id) ??
    (row.mine && row.theirs ? "You both" : row.theirs ? `Saved by ${partnerName}` : "You");
  const labelColor = (row: Row) =>
    been.has(row.idea.idea_id) ? BEEN_COLOR : row.theirs ? PARTNER_COLOR : undefined;

  return (
    <View className="gap-6">
      {filters}

      {/* OURS */}
      <View className="gap-3">
        <View className="flex-row items-center gap-2 px-1">
          <Ionicons name="heart" size={14} color={PARTNER_COLOR} />
          <Text className="text-white font-bold text-base">Ours</Text>
          <Text className="text-zinc-500 text-sm flex-1">with {partnerName}</Text>
        </View>
        {oursRows.length === 0 ? (
          <Text className="text-zinc-500 text-sm px-1">
            {filter === "been"
              ? "Nothing here you've been to yet."
              : filter === "notYet"
                ? "You've been to everything here. Time to save something new."
                : `Ideas you both want to try show up here. Save something, or ask ${partnerName} to.`}
          </Text>
        ) : (
          oursRows.map((row) => (
            <SavedIdeaRow
              key={row.idea.idea_id}
              idea={row.idea}
              label={label(row)}
              labelColor={labelColor(row)}
              privacy={row.mine && row.shared ? {shared: true, onToggle: () => flip(row.idea.idea_id, false)} : undefined}
              selection={selectionFor(row.idea)}
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
        {justMeRows.length === 0 ? (
          <Text className="text-zinc-500 text-sm px-1">
            {filter === "been"
              ? "Nothing here you've been to yet."
              : filter === "notYet"
                ? "You've been to everything here."
                : "Planning a surprise? Press and hold the bookmark to save an idea privately."}
          </Text>
        ) : (
          justMeRows.map((item) => (
            <SavedIdeaRow
              key={item.idea.idea_id}
              idea={item.idea}
              label={beenLabel(item.idea.idea_id)}
              labelColor={BEEN_COLOR}
              privacy={{shared: false, onToggle: () => flip(item.idea.idea_id, true)}}
              selection={selectionFor(item.idea)}
            />
          ))
        )}
      </View>
    </View>
  );
}
