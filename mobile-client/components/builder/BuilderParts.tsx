// components/builder/BuilderParts.tsx
// Visual building blocks for the itinerary builder: the timeline track,
// stop cards, connectors, the "add a stop" card, stat tiles and activity cards.

import React from "react";
import {View, Text, Pressable} from "react-native";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";

import {useSavedStore} from "@/src/store/useSavedStore";
import {SAVED_COLOR} from "@/components/ideas/SaveButton";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=400&auto=format&fit=crop";

const TRACK_COLOR = "#27272a"; // zinc-800
const NODE_TOP = 14; // where the node sits within a row, so it lines up with card titles

// ─── Formatting ────────────────────────────────────────────────────────────────

export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function activityImage(activity: any): string {
  return activity?.image_urls?.[0] || activity?.image_url || FALLBACK_IMAGE;
}

const slotMinutes = (slot: {startTime: number; endTime: number}) =>
  (slot.endTime - slot.startTime) / 60_000;

const timeOfDay = (ms: number) =>
  new Date(ms).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});

// ─── Timeline track ────────────────────────────────────────────────────────────

/**
 * One row of the timeline: a node on a continuous vertical track, plus content.
 * The track runs through every row; it starts at the first node and ends at the last.
 */
export function TimelineRow({
  node,
  isFirst,
  isLast,
  children,
}: {
  node: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row">
      <View className="w-8 items-center">
        <View
          style={{
            position: "absolute",
            width: 2,
            backgroundColor: TRACK_COLOR,
            top: isFirst ? NODE_TOP + 6 : 0,
            ...(isLast ? {height: NODE_TOP + 6} : {bottom: 0}),
          }}
        />
        <View style={{marginTop: NODE_TOP - 2}}>{node}</View>
      </View>
      <View className="flex-1 pb-3 pl-1">{children}</View>
    </View>
  );
}

export function StopNode({index}: {index: number}) {
  return (
    <View className="w-6 h-6 rounded-full bg-blue-500 border-2 border-black items-center justify-center">
      <Text className="text-white text-[11px] font-extrabold">{index}</Text>
    </View>
  );
}

export function SmallNode() {
  return (
    <View style={{paddingVertical: 4}}>
      <View className="w-2.5 h-2.5 rounded-full bg-zinc-700 border-2 border-black" />
    </View>
  );
}

export function AddNode() {
  return (
    <View className="w-6 h-6 rounded-full bg-black border-2 border-blue-500 items-center justify-center">
      <Ionicons name="add" size={14} color="#3b82f6" />
    </View>
  );
}

export function MarkerNode({icon}: {icon: IconName}) {
  return (
    <View className="w-6 h-6 rounded-full bg-zinc-100 border-2 border-black items-center justify-center">
      <Ionicons name={icon} size={12} color="black" />
    </View>
  );
}

export function MarkerLabel({label, time}: {label: string; time: string}) {
  return (
    <View className="flex-row items-baseline gap-2" style={{paddingTop: NODE_TOP - 2}}>
      <Text className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
        {label}
      </Text>
      <Text className="text-white font-bold text-base">{time}</Text>
    </View>
  );
}

// ─── Row content ───────────────────────────────────────────────────────────────

/** A placed activity: photo, timing, venue and price. */
export function StopCard({
  slot,
  headCount,
  onRemove,
}: {
  slot: {startTime: number; endTime: number; activity?: any};
  headCount: number;
  onRemove?: () => void;
}) {
  const activity = slot.activity;
  const price = (Number(activity?.est_price_per_person) || 0) * headCount;

  return (
    <View className="bg-zinc-900 border border-zinc-800 rounded-2xl p-2.5 flex-row items-center">
      <Image
        source={{uri: activityImage(activity)}}
        style={{width: 64, height: 64, borderRadius: 14}}
        contentFit="cover"
      />
      <View className="flex-1 ml-3 pr-1">
        <Text className="text-white font-bold text-base" numberOfLines={1}>
          {activity?.title}
        </Text>
        <Text className="text-zinc-400 text-sm mt-0.5" numberOfLines={1}>
          {timeOfDay(slot.startTime)} – {timeOfDay(slot.endTime)} ·{" "}
          {formatMinutes(slotMinutes(slot))}
        </Text>
        {activity?.venues?.name ? (
          <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
            {activity.venues.name}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-2">
        <View className="bg-zinc-800 px-2 py-1 rounded-lg">
          <Text className="text-zinc-200 text-xs font-bold">
            {price === 0 ? "Free" : `$${price}`}
          </Text>
        </View>
        {onRemove && (
          <Pressable
            onPress={onRemove}
            hitSlop={10}
            accessibilityLabel={`Remove ${activity?.title ?? "stop"}`}
            className="w-7 h-7 rounded-full bg-zinc-800 items-center justify-center active:bg-zinc-700"
          >
            <Ionicons name="close" size={14} color="#a1a1aa" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Travel legs, flex time and the trip home, drawn slim between stop cards. */
export function Connector({
  slot,
}: {
  slot: {id: string; title: string; type: string; startTime: number; endTime: number};
}) {
  const minutes = formatMinutes(slotMinutes(slot));
  const miles = slot.title.match(/\(([\d.]+) mi\)/)?.[1];

  let icon: IconName = "car-outline";
  let text = `${minutes} travel${miles ? ` · ${miles} mi` : ""}`;
  if (slot.id === "return-journey") {
    icon = "home-outline";
    text = `Head home · ${minutes}${miles ? ` · ${miles} mi` : ""}`;
  } else if (slot.type === "BUFFER") {
    icon = "cafe-outline";
    text = `${minutes} of breathing room`;
  }

  return (
    <View className="flex-row items-center gap-2" style={{paddingTop: NODE_TOP - 6}}>
      <Ionicons name={icon} size={14} color="#71717a" />
      <Text className="text-zinc-500 text-sm font-medium">{text}</Text>
    </View>
  );
}

/** The open gap: tap to pick the next activity. */
export function AddStopCard({
  first,
  subtitle,
  onPress,
}: {
  first: boolean;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="border-2 border-dashed border-blue-500/40 bg-blue-500/5 rounded-2xl px-4 py-4 flex-row items-center active:bg-blue-500/10"
    >
      <View className="w-10 h-10 rounded-full bg-blue-500 items-center justify-center mr-3">
        <Ionicons name="add" size={22} color="white" />
      </View>
      <View className="flex-1">
        <Text className="text-white font-bold text-base">
          {first ? "Pick your first stop" : "Add a stop"}
        </Text>
        <Text className="text-blue-200/60 text-sm mt-0.5">{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#60a5fa" />
    </Pressable>
  );
}

/** Summary tile at the top of the builder. */
export function StatTile({
  icon,
  label,
  value,
  sub,
  progress,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub: string;
  progress?: number;
}) {
  return (
    <View className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
      <View className="flex-row items-center gap-1.5 mb-1.5">
        <Ionicons name={icon} size={12} color="#a1a1aa" />
        <Text className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider">
          {label}
        </Text>
      </View>
      <Text className="text-white font-extrabold text-lg" numberOfLines={1}>
        {value}
      </Text>
      <Text className="text-zinc-500 text-xs" numberOfLines={1}>
        {sub}
      </Text>
      {progress !== undefined && (
        <View className="h-1 bg-zinc-800 rounded-full mt-2 overflow-hidden">
          <View
            className="h-1 bg-blue-500 rounded-full"
            style={{width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`}}
          />
        </View>
      )}
    </View>
  );
}

function Chip({icon, text, tone = "default"}: {icon: IconName; text: string; tone?: "default" | "danger"}) {
  const danger = tone === "danger";
  return (
    <View
      className={`flex-row items-center gap-1 px-2 py-1 rounded-lg ${danger ? "bg-red-500/15" : "bg-zinc-800"}`}
    >
      <Ionicons name={icon} size={11} color={danger ? "#f87171" : "#a1a1aa"} />
      <Text className={`text-xs font-semibold ${danger ? "text-red-300" : "text-zinc-300"}`}>
        {text}
      </Text>
    </View>
  );
}

function ActivityChips({
  item,
  headCount,
  goingOut,
}: {
  item: any;
  headCount: number;
  goingOut: boolean;
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      <Chip
        icon="wallet-outline"
        text={item.totalCost === 0 ? "Free" : `$${item.totalCost} for ${headCount}`}
        tone={item.fitStatus === "OVER_BUDGET" ? "danger" : "default"}
      />
      <Chip
        icon="time-outline"
        text={formatMinutes(Number(item.est_duration_minutes) || 0)}
        tone={item.fitStatus === "NO_FIT_TIME" ? "danger" : "default"}
      />
      {goingOut && (
        <Chip icon="navigate-outline" text={`${(item.distance || 0).toFixed(1)} mi`} />
      )}
    </View>
  );
}

/** Title with a bookmark when the idea is in your Bucket List. */
function IdeaTitle({item}: {item: any}) {
  const saved = useSavedStore((s) => s.ids.has(item.idea_id));
  return (
    <View className="flex-row items-center gap-1.5">
      {saved && (
        <Ionicons
          name="bookmark"
          size={13}
          color={SAVED_COLOR}
          accessibilityLabel="In your bucket list"
        />
      )}
      <Text className="text-white font-bold text-base flex-1" numberOfLines={1}>
        {item.title}
      </Text>
    </View>
  );
}

const FIT_REASON: Record<string, string> = {
  NO_FIT_TIME: "Too long for the time left",
  OVER_BUDGET: "Over your remaining budget",
};

/** A suggestion in the activity picker. */
export function ActivityOptionCard({
  item,
  headCount,
  goingOut,
  onPress,
}: {
  item: any;
  headCount: number;
  goingOut: boolean;
  onPress: () => void;
}) {
  const disabled = item.fitStatus !== "FITS_NOW";

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`rounded-2xl border p-3 flex-row ${
        disabled
          ? "bg-zinc-950 border-zinc-900"
          : "bg-zinc-900 border-zinc-800 active:border-zinc-500"
      }`}
    >
      <Image
        source={{uri: activityImage(item)}}
        style={{width: 84, height: 84, borderRadius: 14, opacity: disabled ? 0.4 : 1}}
        contentFit="cover"
      />
      <View className={`flex-1 ml-3 ${disabled ? "opacity-60" : ""}`}>
        <IdeaTitle item={item} />
        {item.description ? (
          <Text className="text-zinc-400 text-sm mt-0.5 mb-2" numberOfLines={2}>
            {item.description}
          </Text>
        ) : (
          <View className="h-2" />
        )}
        <ActivityChips item={item} headCount={headCount} goingOut={goingOut} />
        {disabled && FIT_REASON[item.fitStatus] && (
          <Text className="text-red-300/80 text-xs font-semibold mt-2">
            {FIT_REASON[item.fitStatus]}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** A photo card in the "Top picks" carousel before the first stop. */
export function PickCard({
  item,
  headCount,
  goingOut,
  onPress,
}: {
  item: any;
  headCount: number;
  goingOut: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="w-56 bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden active:opacity-80"
    >
      <Image
        source={{uri: activityImage(item)}}
        style={{width: "100%", height: 120}}
        contentFit="cover"
      />
      <View className="p-3 gap-2">
        <IdeaTitle item={item} />
        <ActivityChips item={item} headCount={headCount} goingOut={goingOut} />
      </View>
      <View className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/60 items-center justify-center">
        <Ionicons name="add" size={18} color="white" />
      </View>
    </Pressable>
  );
}
