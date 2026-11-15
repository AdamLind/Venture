// src/app/builder.tsx
import * as Haptics from "expo-haptics";
import {BuilderActivity, TimeSlot} from "@/types/itinerary";
import {
  PlacedActivity,
  deriveSequentialTimeline,
  queryCandidates,
  evaluateContextAt,
} from "@/utils/itineraryEngine";
import {useLocalSearchParams, router} from "expo-router";
import {useState, useEffect, useMemo, useRef} from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  LayoutAnimation,
  Modal,
  type ScrollViewInstance,
  Alert,
} from "react-native";
import Toast from "react-native-toast-message";
import {Ionicons} from "@expo/vector-icons";
import {usePrefsStore} from "@/src/store/usePrefsStore";
import {useBuilderStore} from "@/src/store/useBuilderStore";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import {START_NOW_WINDOW_MS, autoTitle, formatWhen} from "@/src/lib/dates";
import {SafeAreaView, useSafeAreaInsets} from "react-native-safe-area-context";
import {Image} from "expo-image";
import {LinearGradient} from "expo-linear-gradient";
import GlassSurface from "@/components/ui/GlassSurface";
import {
  ActivityOptionCard,
  AddNode,
  AddStopCard,
  Connector,
  MarkerLabel,
  MarkerNode,
  PickCard,
  SmallNode,
  StatTile,
  StopCard,
  StopNode,
  TimelineRow,
  activityImage,
  formatMinutes,
} from "@/components/builder/BuilderParts";

export default function BuilderScreen() {
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const {prefs: userPrefs, resetPrefs} = usePrefsStore();
  const clearBuilder = useBuilderStore((state) => state.clearBuilder);
  const headCount = userPrefs.headCount;

  // Format the visual boundaries of the date
  const simpleStartTime = new Date(userPrefs.startDate).toLocaleTimeString(
    "en-US",
    {hour: "numeric", minute: "2-digit"},
  );
  const simpleEndTime = new Date(userPrefs.endDate).toLocaleTimeString(
    "en-US",
    {hour: "numeric", minute: "2-digit"},
  );

  const startMs = new Date(userPrefs.startDate || Date.now()).getTime();
  const endMs = new Date(userPrefs.endDate || startMs + 4 * 3600000).getTime();

  // ─── Source of Truth ──────────────────────────────────────────────────────────
  const {placed, setPlaced, activities, setActivities} = useBuilderStore();

  // ─── UI State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeGapDuration, setActiveGapDuration] = useState(
    Math.round(Math.abs(endMs - startMs) / 60_000),
  );
  const [isFetchingFillers, setIsFetchingFillers] = useState(false);
  const [reviewingItinerary, setReviewingItinerary] = useState<boolean>(false);

  // ─── Derived Timeline (The Canvas) ────────────────────────────────────────────
  const timeline = useMemo(
    () => deriveSequentialTimeline(placed, userPrefs),
    [placed, userPrefs],
  );

  // ─── Derived Budget & Time ────────────────────────────────────────────────────
  const totalPlannedHours =
    (new Date(userPrefs.endDate).getTime() -
      new Date(userPrefs.startDate).getTime()) /
    (1000 * 60 * 60);
  const isInfinite = totalPlannedHours >= 12;

  const availableBudget: number = userPrefs.budget;

  const spentBudget = useMemo(
    () =>
      timeline.reduce((total, slot) => {
        if (slot.activity)
          return total + Number(slot.activity.est_price_per_person) * headCount;
        return total;
      }, 0),
    [timeline, headCount],
  );

  const remainingBudget = availableBudget - spentBudget;

  const flexTime = useMemo(
    () =>
      timeline
        .filter((slot) => slot.type === "AVAILABLE" || slot.type === "BUFFER")
        .reduce(
          (total, slot) => total + (slot.endTime - slot.startTime) / 60_000,
          0,
        ),
    [timeline],
  );

  // ─── Activity Feed ────────────────────────────────────────────────────────────
  const availableActivities = useMemo(
    () =>
      activities.filter(
        (a) => !placed.some((p) => p.activity.idea_id === a.idea_id),
      ),
    [activities, placed],
  );

  const sortedActivities = useMemo(() => {
    return availableActivities
      .map((activity) => {
        // Time Math
        const activityDuration = Number(activity.est_duration_minutes) || 0;
        let travelMins = 0;
        if (userPrefs.modality === "GO_OUT" && activity.distance > 0) {
          const remainder = (activity.distance * 3 + 5) % 15;
          const raw = activity.distance * 3 + 5;
          travelMins =
            remainder <= 3 ? raw - remainder : raw + (15 - remainder);
        }

        const totalRequiredTime = activityDuration + travelMins;

        // Budget Math
        const totalCost =
          (Number(activity.est_price_per_person) || 0) * headCount;

        // The Strict Gatekeepers
        let fitStatus = "FITS_NOW";
        if (totalRequiredTime > activeGapDuration && !isInfinite) {
          fitStatus = "NO_FIT_TIME";
        } else if (totalCost > remainingBudget) {
          fitStatus = "OVER_BUDGET";
        }

        return {...activity, fitStatus, travelMins, totalCost};
      })
      .sort((a, b) => {
        if (a.fitStatus === b.fitStatus) return 0;
        return a.fitStatus === "FITS_NOW" ? -1 : 1;
      });
  }, [
    availableActivities,
    activeGapDuration,
    userPrefs.modality,
    remainingBudget,
    isInfinite,
  ]);

  // ─── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Only load initial ideas if we don't already have a draft in progress
    if (activities.length === 0 && placed.length === 0) {
      loadInitialIdeas();
    } else {
      setLoading(false); // Instantly show the saved draft!
    }
  }, []);

  const loadInitialIdeas = async () => {
    try {
      setLoading(true);
      // At the start of the day: 0 exhaustion, 0 satiation (hungry)
      const initialContext = {exhaustion: 0, satiation: 0};

      const result = await queryCandidates(
        userPrefs,
        999, // Infinite duration for the first anchor
        userPrefs.budget,
        userPrefs, // Origin is their starting location
        initialContext,
      );

      if (result.success) {
        setActivities(result.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────────
  const handleOpenGap = async (gapSlot: TimeSlot) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDrawerOpen(true);

    const gapDurationMins = Math.round(
      (gapSlot.endTime - gapSlot.startTime) / 60_000,
    );
    setActiveGapDuration(gapDurationMins);

    // Calculate how tired/hungry they are at the moment this gap starts
    const currentContext = evaluateContextAt(timeline, gapSlot.startTime);

    if (placed.length > 0) {
      const origin = placed[placed.length - 1].activity;
      try {
        setIsFetchingFillers(true);
        const result = await queryCandidates(
          userPrefs,
          gapDurationMins,
          remainingBudget,
          origin,
          currentContext, // <-- Pass the biological state!
        );
        setActivities(result.data || []);
      } catch (error) {
        console.error("handleOpenGap fetch error:", error);
      } finally {
        setIsFetchingFillers(false);
      }
    } else {
      // If they deleted everything and are back to the start
      try {
        setIsFetchingFillers(true);
        const initialContext = {exhaustion: 0, satiation: 0};
        const result = await queryCandidates(
          userPrefs,
          999,
          userPrefs.budget,
          userPrefs,
          initialContext,
        );
        if (result.success) {
          setActivities(result.data || []);
        }
      } catch (error) {
        console.error("handleOpenGap anchor fetch error:", error);
      } finally {
        setIsFetchingFillers(false);
      }
    }
  };

  const handlePlaceActivity = (activity: any) => {
    if (activity.fitStatus !== "FITS_NOW") return;
    if (process.env.EXPO_OS === "ios")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlaced((prev) => [...prev, {activity}]);
    setIsDrawerOpen(false);

    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({animated: true});
    }, 300);
  };

  const handleRemoveActivity = (ideaId: number | string) => {
    if (process.env.EXPO_OS === "ios")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlaced((prev) => prev.filter((p) => p.activity.idea_id !== ideaId));
  };

  const createItinerary = useItineraryStore((state) => state.createItinerary);
  const startDate = useItineraryStore((state) => state.startDate);
  const [isSaving, setIsSaving] = useState(false);
  const insets = useSafeAreaInsets();

  // Clears the draft so the "Continue Planning" banner goes away
  const clearDraft = () => {
    resetPrefs();
    clearBuilder();
  };

  const handleFinalize = async () => {
    if (isSaving) return;

    const activitySlots = timeline.filter((slot) => slot.activity);
    if (activitySlots.length === 0) {
      Alert.alert(
        "Add a stop first",
        "Your plan needs at least one activity before you can save it.",
      );
      return;
    }

    // The date runs from leaving (first travel leg or stop) to getting home
    const occupied = timeline.filter((slot) => slot.type === "OCCUPIED");
    const startsAt = new Date(occupied[0].startTime);
    const endsAt = new Date(occupied[occupied.length - 1].endTime);

    // 1. Save it
    setIsSaving(true);
    let itineraryId: number;
    try {
      itineraryId = await createItinerary({
        title: autoTitle(activitySlots.map((slot) => slot.activity!.title)),
        startsAt,
        endsAt,
        stops: activitySlots.map((slot) => ({
          activity_id: slot.activity!.idea_id,
          starts_at: new Date(slot.startTime).toISOString(),
          ends_at: new Date(slot.endTime).toISOString(),
        })),
        prefsSnapshot: userPrefs,
      });
    } catch (e) {
      setIsSaving(false);
      Alert.alert(
        "Couldn't save your date",
        e instanceof Error ? e.message : "Please try again.",
      );
      return;
    }
    setIsSaving(false);

    // 2. Starting soon? Offer to start it. Otherwise file it under Upcoming.
    const goToUpcoming = () => {
      clearDraft();
      router.dismissTo("/(tabs)/activity");
    };

    if (startsAt.getTime() - Date.now() <= START_NOW_WINDOW_MS) {
      Alert.alert("Your date is saved", "It starts soon. Start it now?", [
        {text: "Later", style: "cancel", onPress: goToUpcoming},
        {
          text: "Start now",
          onPress: async () => {
            try {
              await startDate(itineraryId);
              clearDraft();
              router.replace("/active-date");
            } catch (e) {
              Alert.alert(
                "Couldn't start your date",
                e instanceof Error ? e.message : "Please try again.",
              );
              goToUpcoming();
            }
          },
        },
      ]);
    } else {
      Toast.show({
        type: "success",
        text1: "Date saved",
        text2: `It's in Upcoming for ${formatWhen(startsAt)}.`,
        position: "bottom",
      });
      goToUpcoming();
    }
  };

  // ─── Display helpers ─────────────────────────────────────────────────────────
  const goingOut = userPrefs.modality === "GO_OUT";
  const SOCIAL_NOUN: Record<string, string> = {
    Date: "date",
    "Group-Date": "group date",
    Activity: "plan",
  };
  const socialNoun = SOCIAL_NOUN[userPrefs.socialType] ?? "plan";
  const dayLabel = new Date(userPrefs.startDate).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeRange = isInfinite
    ? `${simpleStartTime} onward`
    : `${simpleStartTime} – ${simpleEndTime}`;
  const stopSlots = timeline.filter((slot) => slot.activity);
  const stopCount = stopSlots.length;
  const stopsLabel = `${stopCount} ${stopCount === 1 ? "stop" : "stops"}`;
  const budgetLeftLabel = `$${Math.max(0, remainingBudget)} left`;
  const firstPicks =
    placed.length === 0
      ? sortedActivities.filter((a) => a.fitStatus === "FITS_NOW").slice(0, 8)
      : [];
  const gapSubtitle = (slot: TimeSlot) =>
    isInfinite
      ? budgetLeftLabel
      : `${formatMinutes((slot.endTime - slot.startTime) / 60_000)} free · ${budgetLeftLabel}`;

  const goToReview = () => {
    if (process.env.EXPO_OS === "ios")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReviewingItinerary(true);
    scrollViewRef.current?.scrollTo({y: 0, animated: false});
  };

  const startOver = () => {
    setPlaced([]);
    setIsDrawerOpen(false);
    setReviewingItinerary(false);
    loadInitialIdeas();
  };

  // Stop numbers in timeline order
  const stopNumber = (slotId: string) =>
    stopSlots.findIndex((s) => s.id === slotId) + 1;

  const screenStyle = {flex: 1, backgroundColor: "#000"} as const;

  if (loading) {
    return (
      <View style={{...screenStyle, alignItems: "center", justifyContent: "center"}}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text className="text-white font-bold text-lg mt-5">
          Finding ideas that fit
        </Text>
        <Text className="text-zinc-500 mt-1">
          {goingOut ? "Going out" : "Staying in"} · {timeRange}
        </Text>
      </View>
    );
  }

  // ─── Shared pieces ───────────────────────────────────────────────────────────
  const header = (
    <View className="flex-row items-center px-3 pt-1 pb-4">
      <Pressable
        onPress={() =>
          reviewingItinerary ? setReviewingItinerary(false) : router.back()
        }
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={reviewingItinerary ? "Back to editing" : "Back"}
        className="w-10 h-10 rounded-full items-center justify-center active:bg-zinc-900"
      >
        <Ionicons name="chevron-back" size={24} color="white" />
      </Pressable>
      <View className="flex-1 ml-1">
        <Text className="text-white font-extrabold text-2xl tracking-tight">
          {reviewingItinerary ? "Review your plan" : `Build your ${socialNoun}`}
        </Text>
        <Text className="text-zinc-400 text-sm mt-0.5">
          {dayLabel} · {timeRange} · {goingOut ? "Going out" : "Staying in"}
        </Text>
      </View>
    </View>
  );

  /** Timeline rows for every slot (planning shows add cards; review doesn't). */
  const renderSlots = (editable: boolean) =>
    timeline.map((slot) => {
      if (slot.type === "AVAILABLE") {
        if (!editable) {
          return isInfinite ? null : (
            <TimelineRow key={slot.id} node={<SmallNode />}>
              <Connector slot={{...slot, type: "BUFFER", title: slot.title}} />
            </TimelineRow>
          );
        }
        return (
          <TimelineRow key={slot.id} node={<AddNode />}>
            <AddStopCard
              first={placed.length === 0}
              subtitle={gapSubtitle(slot)}
              onPress={() => handleOpenGap(slot)}
            />
          </TimelineRow>
        );
      }

      if (slot.type === "BUFFER" || !slot.activity) {
        return (
          <TimelineRow key={slot.id} node={<SmallNode />}>
            <Connector slot={slot} />
          </TimelineRow>
        );
      }

      return (
        <TimelineRow key={slot.id} node={<StopNode index={stopNumber(slot.id)} />}>
          <StopCard
            slot={slot}
            headCount={headCount}
            onRemove={
              editable
                ? () => handleRemoveActivity(slot.activity!.idea_id)
                : undefined
            }
          />
        </TimelineRow>
      );
    });

  const timelineView = (editable: boolean) => (
    <View className="px-4">
      <TimelineRow isFirst node={<MarkerNode icon={goingOut ? "home" : "play"} />}>
        <MarkerLabel label={goingOut ? "Leave" : "Start"} time={simpleStartTime} />
      </TimelineRow>
      {renderSlots(editable)}
      <TimelineRow isLast node={<MarkerNode icon="flag" />}>
        <MarkerLabel label="Ends" time={isInfinite ? "Whenever" : simpleEndTime} />
      </TimelineRow>
    </View>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={["top"]} style={screenStyle}>
      {header}

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingBottom: insets.bottom + 120}}
      >
        {!reviewingItinerary ? (
          // ── PLANNING VIEW ──────────────────────────────────────────────────
          <>
            <View className="flex-row gap-2.5 px-5 mb-6">
              <StatTile
                icon="wallet-outline"
                label="Budget"
                value={`$${Math.max(0, remainingBudget)}`}
                sub={`left of $${availableBudget}`}
                progress={availableBudget > 0 ? spentBudget / availableBudget : 0}
              />
              <StatTile
                icon="time-outline"
                label="Free time"
                value={isInfinite ? "Open" : formatMinutes(flexTime)}
                sub={isInfinite ? "no end time" : `until ${simpleEndTime}`}
              />
              <StatTile
                icon="flag-outline"
                label="Stops"
                value={String(stopCount)}
                sub={stopCount ? "planned" : "none yet"}
              />
            </View>

            {timelineView(true)}

            {/* Before the first stop: tap-to-add suggestions */}
            {firstPicks.length > 0 && (
              <View className="mt-6">
                <View className="flex-row items-end justify-between px-5 mb-3">
                  <View>
                    <Text className="text-white font-bold text-lg">Top picks</Text>
                    <Text className="text-zinc-500 text-sm">
                      Tap one to start your {socialNoun}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      const gap = timeline.find((s) => s.type === "AVAILABLE");
                      if (gap) handleOpenGap(gap);
                    }}
                    hitSlop={8}
                  >
                    <Text className="text-blue-400 font-semibold">See all</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{paddingHorizontal: 20, gap: 12}}
                >
                  {firstPicks.map((item) => (
                    <PickCard
                      key={item.idea_id}
                      item={item}
                      headCount={headCount}
                      goingOut={goingOut}
                      onPress={() => handlePlaceActivity(item)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        ) : (
          // ── REVIEW VIEW ────────────────────────────────────────────────────
          <>
            {/* Summary hero */}
            <View className="mx-5 mb-6 rounded-3xl overflow-hidden border border-zinc-800 bg-zinc-900">
              <View style={{height: 170}}>
                <Image
                  source={{uri: activityImage(stopSlots[0]?.activity)}}
                  style={{width: "100%", height: "100%"}}
                  contentFit="cover"
                />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.85)"]}
                  locations={[0.35, 1]}
                  style={{position: "absolute", top: 0, left: 0, right: 0, bottom: 0}}
                />
                <View className="absolute bottom-4 left-4 right-4">
                  <Text className="text-white font-extrabold text-2xl" numberOfLines={2}>
                    {autoTitle(stopSlots.map((s) => s.activity!.title))}
                  </Text>
                  <Text className="text-zinc-300 text-sm mt-1">
                    {dayLabel} · {timeRange}
                  </Text>
                </View>
              </View>
              <View className="flex-row border-t border-zinc-800">
                {[
                  {label: "Stops", value: String(stopCount)},
                  {label: "Total", value: `$${spentBudget}`},
                  {
                    label: "Flex time",
                    value: isInfinite ? "∞" : formatMinutes(flexTime),
                  },
                ].map((stat, i) => (
                  <View
                    key={stat.label}
                    className={`flex-1 py-3.5 items-center ${i > 0 ? "border-l border-zinc-800" : ""}`}
                  >
                    <Text className="text-white font-extrabold text-lg">
                      {stat.value}
                    </Text>
                    <Text className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mt-0.5">
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {timelineView(false)}

            <View className="px-5 mt-6 gap-2">
              <Pressable
                onPress={() => setReviewingItinerary(false)}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl h-12 items-center justify-center active:bg-zinc-800"
              >
                <Text className="text-white font-bold">Keep editing</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Start over?",
                    "This clears every stop in this plan.",
                    [
                      {text: "Cancel", style: "cancel"},
                      {text: "Start over", style: "destructive", onPress: startOver},
                    ],
                  )
                }
                className="h-11 items-center justify-center"
              >
                <Text className="text-zinc-500 font-semibold">Start over</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── FLOATING ACTION BAR ───────────────────────────────────────────── */}
      <View
        pointerEvents="box-none"
        style={{position: "absolute", left: 16, right: 16, bottom: insets.bottom + 8}}
      >
        <GlassSurface
          style={{
            borderRadius: 26,
            padding: 8,
            paddingLeft: 18,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View className="flex-1 pr-3">
            <Text className="text-white font-extrabold text-base">
              ${spentBudget}
              <Text className="text-zinc-400 font-semibold text-sm">
                {" "}
                total · {stopsLabel}
              </Text>
            </Text>
            <Text className="text-zinc-400 text-xs" numberOfLines={1}>
              {reviewingItinerary
                ? "Saves to your Upcoming dates"
                : stopCount
                  ? budgetLeftLabel
                  : "Add a stop to continue"}
            </Text>
          </View>
          {reviewingItinerary ? (
            <Pressable
              onPress={handleFinalize}
              disabled={isSaving}
              className={`rounded-[20px] px-6 h-12 items-center justify-center ${
                isSaving ? "bg-zinc-300" : "bg-white active:opacity-80"
              }`}
            >
              {isSaving ? (
                <ActivityIndicator color="black" />
              ) : (
                <Text className="text-black font-extrabold">Finalize</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={goToReview}
              disabled={stopCount === 0}
              className={`rounded-[20px] px-6 h-12 items-center justify-center ${
                stopCount ? "bg-white active:opacity-80" : "bg-zinc-700"
              }`}
            >
              <Text
                className={`font-extrabold ${stopCount ? "text-black" : "text-zinc-400"}`}
              >
                Review
              </Text>
            </Pressable>
          )}
        </GlassSurface>
      </View>

      {/* ── ACTIVITY PICKER ───────────────────────────────────────────────── */}
      <Modal
        visible={isDrawerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsDrawerOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <Pressable
            className="absolute inset-0"
            onPress={() => setIsDrawerOpen(false)}
            accessibilityLabel="Close"
          />

          <View
            className="bg-zinc-950 rounded-t-[32px] border-t border-zinc-800"
            style={{maxHeight: "85%", paddingBottom: insets.bottom + 8}}
          >
            <View className="items-center pt-3">
              <View className="w-10 h-1.5 rounded-full bg-zinc-700" />
            </View>

            <View className="flex-row justify-between items-start px-6 pt-4 pb-4">
              <View className="flex-1 pr-4">
                <Text className="text-white text-2xl font-extrabold tracking-tight">
                  {placed.length === 0 ? "First stop" : "Up next"}
                </Text>
                <Text className="text-zinc-400 mt-1">
                  {isInfinite
                    ? budgetLeftLabel
                    : `${formatMinutes(activeGapDuration)} free · ${budgetLeftLabel}`}
                </Text>
              </View>
              <Pressable
                onPress={() => setIsDrawerOpen(false)}
                hitSlop={8}
                accessibilityLabel="Close"
                className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#a1a1aa" />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 12, gap: 10}}
            >
              {isFetchingFillers ? (
                <View className="py-14 items-center justify-center">
                  <ActivityIndicator size="large" color="#3b82f6" />
                  <Text className="text-zinc-400 mt-4">Finding what fits…</Text>
                </View>
              ) : sortedActivities.length > 0 ? (
                sortedActivities.map((item: any) => (
                  <ActivityOptionCard
                    key={item.idea_id}
                    item={item}
                    headCount={headCount}
                    goingOut={goingOut}
                    onPress={() => handlePlaceActivity(item)}
                  />
                ))
              ) : (
                <View className="py-12 items-center px-6">
                  <Ionicons name="search-outline" size={28} color="#52525b" />
                  <Text className="text-white font-bold text-base mt-3">
                    Nothing fits this gap
                  </Text>
                  <Text className="text-zinc-500 text-center mt-1">
                    Try removing a stop, or start over with a bigger budget or
                    more time.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
