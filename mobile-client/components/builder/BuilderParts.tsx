// components/builder/BuilderParts.tsx
// Visual building blocks for the itinerary builder: the timeline track,
// stop cards, connectors, the "add a stop" card, stat tiles and activity cards.

import React from "react";
import {IMAGE_SIZE, sizedImage} from "@/src/lib/images";
import {View, Text, Pressable} from "react-native";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";

import {useSavedStore} from "@/src/store/useSavedStore";
import {SAVED_COLOR} from "@/components/ideas/SaveButton";
import {spotLabel} from "@/utils/bestPlacement";
import type {TravelLeg} from "@/types/itinerary";

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

/** The idea's photo, sized for `displayWidth` points (default: a thumbnail). */
export function activityImage(activity: any, displayWidth: number = IMAGE_SIZE.thumb): string {
  return sizedImage(activity?.image_urls?.[0] || activity?.image_url || FALLBACK_IMAGE, displayWidth);
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

export function MarkerLabel({
  label,
  time,
  late = false,
  note,
}: {
  label: string;
  time: string;
  /** Running past the planned time: the time shows in orange */
  late?: boolean;
  /** e.g. "planned 10:00 PM" */
  note?: string;
}) {
  return (
    <View className="flex-row items-baseline gap-2" style={{paddingTop: NODE_TOP - 2}}>
      <Text className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
        {label}
      </Text>
      <Text className={`font-bold text-base ${late ? "text-orange-400" : "text-white"}`}>{time}</Text>
      {note ? <Text className="text-zinc-500 text-xs">{note}</Text> : null}
    </View>
  );
}

// ─── Row content ───────────────────────────────────────────────────────────────

/** A placed activity: photo, timing, venue and price. */
function StopCardView({
  slot,
  headCount,
  onRemove,
  onMoveEarlier,
  onMoveLater,
  warning,
  onEditLength,
  onView,
  adjusted = false,
  stretchedBy,
}: {
  slot: {startTime: number; endTime: number; activity?: any};
  headCount: number;
  onRemove?: () => void;
  /** Tap the photo to see the idea's full page */
  onView?: () => void;
  /** Tap the card to change how long the stop lasts */
  onEditLength?: () => void;
  /** You changed its length from the idea's suggestion */
  adjusted?: boolean;
  /** Minutes added to fit the plan better (utils/stretch.ts) */
  stretchedBy?: number;
  /** The plan evaluator's most serious note for this stop */
  warning?: {message: string; severity: "hard" | "soft"} | null;
  /** Reordering without dragging (VoiceOver / TalkBack actions) */
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
}) {
  const activity = slot.activity;
  const price = (Number(activity?.est_price_per_person) || 0) * headCount;

  const moveActions = [
    ...(onMoveEarlier ? [{name: "moveEarlier", label: "Move earlier"}] : []),
    ...(onMoveLater ? [{name: "moveLater", label: "Move later"}] : []),
    ...(onView ? [{name: "viewIdea", label: "See the full idea"}] : []),
  ];

  return (
    <View className="bg-zinc-900 border border-zinc-800 rounded-2xl p-2.5 flex-row items-center">
      <Pressable
        onPress={onEditLength}
        disabled={!onEditLength}
        className="flex-1 flex-row items-center active:opacity-70"
        accessible
        accessibilityRole={onEditLength ? "button" : undefined}
        accessibilityLabel={`${activity?.title ?? "Stop"}, ${timeOfDay(slot.startTime)} to ${timeOfDay(slot.endTime)}${
          stretchedBy ? `, ${stretchedBy} minutes longer to fit the plan` : ""
        }`}
        accessibilityHint={
          [onEditLength ? "Tap to change how long" : null, moveActions.length ? "hold and drag to reorder" : null]
            .filter(Boolean)
            .join(", ") || undefined
        }
        accessibilityActions={moveActions}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "moveEarlier") onMoveEarlier?.();
          if (e.nativeEvent.actionName === "moveLater") onMoveLater?.();
          if (e.nativeEvent.actionName === "viewIdea") onView?.();
        }}
      >
      <Pressable onPress={onView} disabled={!onView} className="active:opacity-70">
        <Image
          source={{uri: activityImage(activity)}}
          style={{width: 64, height: 64, borderRadius: 14}}
          contentFit="cover"
          // Kept in memory: reordering re-attaches the photo, which otherwise
          // decoded it from disk again
          cachePolicy="memory-disk"
          recyclingKey={String(activity?.idea_id)}
        />
        {onView && <ViewBadge />}
      </Pressable>
      <View className="flex-1 ml-3 pr-1">
        <Text className="text-white font-bold text-base" numberOfLines={1}>
          {activity?.title}
        </Text>
        <View className="flex-row items-center gap-1 mt-0.5">
          <Text className="text-zinc-400 text-sm shrink" numberOfLines={1}>
            {timeOfDay(slot.startTime)} – {timeOfDay(slot.endTime)} ·{" "}
            {formatMinutes(slotMinutes(slot))}
          </Text>
          {stretchedBy ? (
            // Longer than suggested so what follows lands at a better time
            <Text className="text-zinc-500 text-xs" numberOfLines={1}>
              +{stretchedBy}m to fit
            </Text>
          ) : (
            adjusted && <Ionicons name="pencil" size={11} color="#a1a1aa" />
          )}
        </View>
        {warning ? (
          <View className="flex-row items-center gap-1 mt-0.5">
            <Ionicons
              name={warning.severity === "hard" ? "alert-circle" : "alert-circle-outline"}
              size={12}
              color={warning.severity === "hard" ? "#f87171" : "#fb923c"}
            />
            <Text
              className={`text-xs font-semibold flex-1 ${warning.severity === "hard" ? "text-red-400" : "text-orange-400"}`}
              numberOfLines={1}
            >
              {warning.message}
            </Text>
          </View>
        ) : activity?.modality === "STAY_IN" && !activity?.venues?.name ? (
          <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
            At home
          </Text>
        ) : activity?.venues?.name ? (
          <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
            {activity.venues.name}
          </Text>
        ) : (
          // Same height as a venue or warning line (cards never resize mid-drag)
          <Text className="text-xs mt-0.5"> </Text>
        )}
      </View>
      </Pressable>
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

type StopCardProps = React.ComponentProps<typeof StopCardView>;

/**
 * Re-renders only when what the card shows changes. Its callbacks are
 * recreated on every builder render but always do the same thing for the
 * same stop, so only whether each one exists matters.
 */
export const StopCard = React.memo(StopCardView, (a: StopCardProps, b: StopCardProps) =>
  a.slot.startTime === b.slot.startTime &&
  a.slot.endTime === b.slot.endTime &&
  a.slot.activity === b.slot.activity &&
  a.headCount === b.headCount &&
  a.warning?.message === b.warning?.message &&
  a.warning?.severity === b.warning?.severity &&
  !a.onRemove === !b.onRemove &&
  !a.onMoveEarlier === !b.onMoveEarlier &&
  !a.onMoveLater === !b.onMoveLater &&
  !a.onEditLength === !b.onEditLength &&
  !a.onView === !b.onView &&
  a.adjusted === b.adjusted &&
  a.stretchedBy === b.stretchedBy,
);

/** Travel legs, flex time and the trip home, drawn slim between stop cards. */
export function Connector({
  slot,
}: {
  slot: {id: string; title: string; type: string; startTime: number; endTime: number; travel?: TravelLeg};
}) {
  const minutes = formatMinutes(slotMinutes(slot));
  const miles = slot.travel
    ? slot.travel.roadMiles.toFixed(1)
    : slot.title.match(/\(([\d.]+) mi\)/)?.[1];

  let icon: IconName = "car-outline";
  let text = `${minutes} travel${miles ? ` · ${miles} mi` : ""}`;
  if (slot.id === "return-journey" || slot.id.startsWith("home-")) {
    icon = "home-outline";
    text = `Head home · ${minutes}${miles ? ` · ${miles} mi` : ""}`;
  } else if (slot.type === "BUFFER") {
    icon = "cafe-outline";
    text = `${minutes} of breathing room`;
  }

  // What's inside the block (#48): the drive, parking, and the time to spare
  const leg = slot.travel;
  const spare = leg ? leg.lingerMinutes + leg.bufferMinutes : 0;
  const inside = leg
    ? [
        `${formatMinutes(leg.driveMinutes)} drive${leg.parkingMinutes ? " + parking" : ""}`,
        spare >= 5 ? `${formatMinutes(spare)} to spare` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <View className="flex-row items-start gap-2" style={{paddingTop: NODE_TOP - 6}}>
      <Ionicons name={icon} size={14} color="#71717a" style={{marginTop: 3}} />
      <View className="shrink">
        <Text className="text-zinc-500 text-sm font-medium">{text}</Text>
        {inside && <Text className="text-zinc-600 text-xs">{inside}</Text>}
      </View>
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

// Full class names (NativeWind only styles classes it finds written out)
const CHIP_TONES = {
  default: {box: "bg-zinc-800", icon: "#a1a1aa", text: "text-zinc-300"},
  warn: {box: "bg-orange-500/10", icon: "#fb923c", text: "text-orange-400"},
  danger: {box: "bg-red-500/15", icon: "#f87171", text: "text-red-300"},
};

function Chip({
  icon,
  text,
  tone = "default",
}: {
  icon: IconName;
  text: string;
  tone?: keyof typeof CHIP_TONES;
}) {
  const t = CHIP_TONES[tone];
  return (
    // Never wider than the card: a long note ("Best in the morning,
    // afternoon, evening") wraps inside the chip instead of running off it
    <View className={`flex-row items-center gap-1 px-2 py-1 rounded-lg max-w-full ${t.box}`}>
      <Ionicons name={icon} size={11} color={t.icon} />
      <Text className={`text-xs font-semibold shrink ${t.text}`}>{text}</Text>
    </View>
  );
}

/** An icon for each kind of plan problem (utils/planEvaluator.ts) */
export const PROBLEM_ICON: Record<string, IconName> = {
  PAST_END: "flag-outline",
  BACKTRACK: "git-compare-outline",
  SHORTENED: "timer-outline",
  CLOSED: "lock-closed-outline",
  PART_CLOSED: "time-outline",
  TOO_COLD: "snow-outline",
  TOO_HOT: "sunny-outline",
  RAIN: "rainy-outline",
  WIND: "cloud-outline",
  NO_SNOW: "snow-outline",
  OFF_HOURS: "partly-sunny-outline",
  AFTER_DARK: "moon-outline",
  BACK_TO_BACK_MEALS: "restaurant-outline",
  STILL_FULL: "restaurant-outline",
  ODD_MEAL_TIME: "restaurant-outline",
  TREAT_BEFORE_MEAL: "ice-cream-outline",
  BACK_TO_BACK_ACTIVE: "fitness-outline",
  WORN_OUT: "fitness-outline",
  ACTIVE_AFTER_MEAL: "fitness-outline",
};

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
      {goingOut &&
        (item.modality === "STAY_IN" ? (
          <Chip icon="home-outline" text="At home" />
        ) : (
          <Chip
            icon="navigate-outline"
            // Before or between stops: the extra driving it adds; on the
            // end: how far it is from the last stop
            text={
              item.spot
                ? `+${(item.addedMiles || 0).toFixed(1)} mi`
                : `${(item.distance || 0).toFixed(1)} mi`
            }
          />
        ))}
      {/* The plan evaluator's verdict if you add it here (same as the stop card's) */}
      {item.planProblem && (
        <Chip
          icon={PROBLEM_ICON[item.planProblem.kind] ?? "alert-circle-outline"}
          text={item.planProblem.message}
          tone={item.planProblem.severity === "hard" ? "danger" : "warn"}
        />
      )}
    </View>
  );
}

/** Title with a bookmark when you saved it, a heart when your partner did (#35) */
function IdeaTitle({item}: {item: any}) {
  const saved = useSavedStore((s) => s.ids.has(item.idea_id));
  const partnerSaved = useSavedStore((s) => s.partnerItems.some((p) => p.activity_id === item.idea_id));
  return (
    <View className="flex-row items-center gap-1.5">
      {saved && (
        <Ionicons
          name="bookmark"
          size={13}
          color={SAVED_COLOR}
          accessibilityLabel="In your saved ideas"
        />
      )}
      {partnerSaved && (
        <Ionicons name="heart" size={13} color="#f472b6" accessibilityLabel="Your person saved this" />
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
  CLOSED: "Closed then",
};

/** A suggestion in the activity picker. */
export function ActivityOptionCard({
  item,
  headCount,
  goingOut,
  onPress,
  onView,
}: {
  item: any;
  headCount: number;
  goingOut: boolean;
  onPress: () => void;
  /** Tap the photo to see the idea's full page */
  onView?: () => void;
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
      {/* Fills the card's height (taller cards with the extra rows), at
          least square; inline: expo-image is a third-party view */}
      <Pressable
        onPress={onView}
        disabled={!onView}
        accessibilityRole="button"
        accessibilityLabel={`See ${item.title}`}
        className="self-stretch active:opacity-70"
      >
        <Image
          // Card size: a taller crop of a wide photo needs more pixels than a thumbnail
          source={{uri: activityImage(item, IMAGE_SIZE.card)}}
          style={{
            width: 84,
            minHeight: 84,
            flex: 1,
            borderRadius: 14,
            opacity: disabled ? 0.4 : 1,
          }}
          contentFit="cover"
        />
        {onView && <ViewBadge />}
      </Pressable>
      <View className={`flex-1 ml-3 ${disabled ? "opacity-60" : ""}`}>
        <IdeaTitle item={item} />
        {item.description ? (
          <Text className="text-zinc-400 text-sm mt-0.5 mb-2" numberOfLines={2}>
            {item.description}
          </Text>
        ) : (
          <View className="h-2" />
        )}
        {/* Where it'll go, unless it's the end (before or between stops) */}
        {item.spot && !disabled && (
          <View className="flex-row items-center gap-1 mb-2">
            <Ionicons name="swap-vertical" size={12} color="#60a5fa" />
            <Text className="text-blue-400 text-xs font-semibold shrink" numberOfLines={1}>
              Fits best {spotLabel(item.spot)}
            </Text>
          </View>
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
  onView,
}: {
  item: any;
  headCount: number;
  goingOut: boolean;
  onPress: () => void;
  onView?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="w-56 bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden active:opacity-80"
    >
      <Image
        source={{uri: activityImage(item, IMAGE_SIZE.card)}}
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
      {onView && (
        <Pressable
          onPress={onView}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`See ${item.title}`}
          className="absolute top-2.5 left-2.5 w-8 h-8 rounded-full bg-black/60 items-center justify-center active:opacity-70"
        >
          <Ionicons name="expand-outline" size={15} color="white" />
        </Pressable>
      )}
    </Pressable>
  );
}

/** The corner mark on a photo that opens the idea's full page. */
function ViewBadge() {
  return (
    <View
      pointerEvents="none"
      className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/60 items-center justify-center"
    >
      <Ionicons name="expand-outline" size={11} color="white" />
    </View>
  );
}
