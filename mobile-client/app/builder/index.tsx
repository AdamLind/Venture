// src/app/builder.tsx (or wherever this file lives)
import * as Haptics from "expo-haptics";
import {BuilderActivity, TimeSlot} from "@/types/itinerary";
import {
  PlacedActivity,
  deriveSequentialTimeline,
  queryAnchors,
  queryFillers,
  formatTime,
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
} from "react-native";
import {useActiveDateStore} from "@/store/activeDateStore";
import {Ionicons} from "@expo/vector-icons";
import {usePrefsStore} from "@/store/usePrefsStore";

export default function BuilderScreen() {
  const scrollViewRef = useRef<ScrollView>(null);
  const userPrefs = usePrefsStore((state) => state.prefs);
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
  const [placed, setPlaced] = useState<PlacedActivity[]>([]);

  // ─── UI State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [activeGapDuration, setActiveGapDuration] = useState(
    Math.round(Math.abs(endMs - startMs) / 60_000),
  );
  const [isFetchingFillers, setIsFetchingFillers] = useState(false);
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
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
    loadInitialIdeas();
  }, []);

  const loadInitialIdeas = async () => {
    try {
      setLoading(true);
      const result = await queryAnchors(userPrefs);
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

    if (placed.length > 0) {
      const origin = placed[placed.length - 1].activity;
      try {
        setIsFetchingFillers(true);
        const result = await queryFillers(
          userPrefs,
          gapDurationMins,
          userPrefs.budget,
          origin,
        );
        setActivities(result.data || []);
      } catch (error) {
        console.error("handleOpenGap fetch error:", error);
      } finally {
        setIsFetchingFillers(false);
      }
    }
  };

  const handlePlaceActivity = (activity: any) => {
    if (activity.fitStatus === "NO_FIT") return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlaced((prev) => [...prev, {activity}]);
    setIsDrawerOpen(false);

    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({animated: true});
    }, 300);
  };

  const handleRemoveActivity = (ideaId: number | string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlaced((prev) => prev.filter((p) => p.activity.idea_id !== ideaId));
  };

  const toggleSlotOptions = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSlotId((prev) => (prev === id ? null : id));
  };

  const closeDrawer = () => {
    if (expandedSlotId) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedSlotId(null);
    }
  };

  const startActiveDate = useActiveDateStore((state) => state.startActiveDate);

  if (loading) {
    return (
      <View className="flex-1 bg-zinc-950 justify-center items-center">
        <ActivityIndicator size="large" color="#ffffff" />
        <Text className="text-white mt-4 font-mono">
          Curating your ideas...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-zinc-950">
      <ScrollView
        ref={scrollViewRef}
        className="pb-10 bg-zinc-950"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={closeDrawer}
        scrollEnabled={!expandedSlotId}
      >
        {!reviewingItinerary ? (
          // ── PLANNING VIEW ──────────────────────────────────────────────────────
          <View className="flex-1 p-6 relative">
            <View className="mb-8 p-5 bg-zinc-900/50 border border-zinc-800 rounded-[24px]">
              {/* Header */}
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest">
                  Timeline
                </Text>
                <View className="flex-row gap-x-4">
                  <Text className="text-blue-400 font-mono text-xs">
                    ${remainingBudget} left
                  </Text>
                  {!isInfinite && (
                    <Text className="text-zinc-400 font-mono text-xs">
                      {Math.round(flexTime)} min left
                    </Text>
                  )}
                </View>
              </View>

              {/* Start Time Pill */}
              <View className="flex-row justify-center items-center my-2">
                <View className="flex-1 h-[1px] bg-violet-500/20" />
                <View className="mx-3 px-4 py-1.5 bg-violet-500/10 rounded-full border border-violet-500/20">
                  <Text className="text-violet-400 font-mono text-xs font-bold tracking-widest">
                    Start: {simpleStartTime}
                  </Text>
                </View>
                <View className="flex-1 h-[1px] bg-violet-500/20" />
              </View>

              {/* TIMELINE RENDER */}
              {timeline.map((slot, idx) => {
                const isTravel = !slot.activity && slot.type === "OCCUPIED";
                const isExpanded = expandedSlotId === slot.id;

                return (
                  <View
                    key={slot.id ?? idx}
                    className="flex-row items-start my-4"
                  >
                    {/* Vertical timeline track */}
                    <View className="items-center w-4 mr-4 mt-2">
                      <View
                        className={`w-2 h-2 rounded-full z-10 top-2 ${
                          slot.type === "BUFFER"
                            ? "border border-blue-500/50"
                            : slot.type === "AVAILABLE"
                              ? "bg-zinc-700"
                              : isTravel
                                ? "bg-green-500"
                                : "bg-blue-500"
                        }`}
                      />
                      {idx < timeline.length - 1 && (
                        <View
                          className={`absolute w-0 flex-1 border-l-[2px] border-zinc-800 -my-1 top-6 bottom-[-54px] ${
                            idx === timeline.length - 1 ? "border-dotted" : ""
                          }`}
                        />
                      )}
                    </View>

                    {/* Slot content */}
                    <View className="flex-1 flex-row justify-between pr-2">
                      {/* 1. AVAILABLE SLOT */}
                      {slot.type === "AVAILABLE" && (
                        <Pressable
                          onPress={() => handleOpenGap(slot)}
                          className={`flex-1 p-4 rounded-2xl border flex-row items-center justify-center ${
                            isDrawerOpen
                              ? "bg-blue-600/20 border-blue-500 shadow-sm"
                              : "bg-zinc-900/50 border-dashed border-blue-700 active:bg-zinc-800"
                          }`}
                        >
                          <Text
                            className={`font-bold ${isDrawerOpen ? "text-blue-400" : "text-blue-500"}`}
                          >
                            {isDrawerOpen
                              ? "Select an activity below..."
                              : `+ Add Next Activity`}
                          </Text>
                        </Pressable>
                      )}

                      {/* 2. BUFFER SLOT (Fixed!) */}
                      {slot.type === "BUFFER" && (
                        <View className="w-full h-10 bg-blue-500/20 border border-blue-500/20 rounded-xl flex items-center justify-center opacity-70">
                          <Text className="text-blue-500 font-medium text-sm">
                            {slot.title} (
                            {Math.round(
                              (slot.endTime - slot.startTime) / 60_000,
                            )}{" "}
                            min)
                          </Text>
                        </View>
                      )}

                      {/* 3. OCCUPIED SLOT */}
                      {slot.type === "OCCUPIED" && (
                        <View className="flex-1 flex-row justify-between items-center">
                          <View className="flex-1 pr-2">
                            <Text className="text-white font-semibold">
                              {slot.title}
                            </Text>
                            <View className="flex-row items-center mt-1">
                              <Text className="text-blue-400 text-xs font-mono font-bold mr-2">
                                {formatTime(slot.startTime)} –{" "}
                                {formatTime(slot.endTime)}
                              </Text>
                              <Text className="text-zinc-500 text-xs">
                                (
                                {Math.round(
                                  (slot.endTime - slot.startTime) / 60_000,
                                )}{" "}
                                min)
                              </Text>
                            </View>
                          </View>

                          {isTravel ? (
                            <View className="items-center justify-center">
                              <Ionicons
                                name="car-outline"
                                size={24}
                                color="#71717a"
                              />
                            </View>
                          ) : slot.activity ? (
                            <View className="justify-center bg-zinc-800/80 px-2 py-1 rounded-md border border-zinc-700/50">
                              <Text className="text-zinc-300 font-mono text-xs">
                                $
                                {(Number(slot.activity.est_price_per_person) ||
                                  0) * headCount}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      )}

                      {/* Ellipsis Menu Button */}
                      {slot.type === "OCCUPIED" && slot.activity && (
                        <Pressable
                          onPress={() => toggleSlotOptions(slot.id)}
                          className="p-2 -mr-2 rounded-full active:bg-zinc-700/50 z-10 ml-2"
                        >
                          <Ionicons
                            name={isExpanded ? "close" : "ellipsis-vertical"}
                            size={20}
                            color="#a1a1aa"
                          />
                        </Pressable>
                      )}
                    </View>

                    {/* Popover */}
                    {isExpanded && (
                      <>
                        <Pressable
                          className="absolute inset-0 top-[-2000px] bottom-[-2000px] left-[-2000px] right-[-2000px]"
                          onPress={closeDrawer}
                        />
                        <View className="absolute right-0 top-10 mt-4 border rounded-xl border-zinc-700/50 z-20 overflow-hidden">
                          <Pressable
                            className="bg-zinc-900 px-6 py-4 active:bg-zinc-700 border-b border-zinc-700/50 flex-row gap-3 items-center"
                            onPress={() => {
                              setExpandedSlotId(null);
                              handleRemoveActivity(slot.activity!.idea_id);
                            }}
                          >
                            <Ionicons
                              name={"trash-outline"}
                              size={20}
                              color="#ef4444"
                            />
                            <Text className="text-red-500 font-medium">
                              Remove
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                );
              })}

              {/* End Time Pill */}
              <View className="flex-row justify-center items-center my-2 mt-4">
                <View className="flex-1 h-[1px] bg-violet-500/20" />
                <View className="mx-3 px-4 py-1.5 bg-violet-500/10 rounded-full border border-violet-500/20">
                  <Text className="text-violet-400 font-mono text-xs font-bold tracking-widest">
                    {isInfinite ? "End: Whenever" : `End: ${simpleEndTime}`}
                  </Text>
                </View>
                <View className="flex-1 h-[1px] bg-violet-500/20" />
              </View>

              {/* Finish Button */}
              {placed.length > 0 && (
                <Pressable
                  onPress={() => {
                    if (process.env.EXPO_OS === "ios")
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setReviewingItinerary(true);
                  }}
                  className="w-full h-[50px] justify-center items-center rounded-[10px] mt-6 bg-blue-500 active:bg-blue-400"
                >
                  <Text className="text-white font-semibold text-[16px]">
                    Finish & Review
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          // ── COMPLETION VIEW (Restored!) ─────────────────────────────────────────
          <View className="flex-1 pt-4 pb-8 bg-zinc-950 px-6">
            <View className="mb-10 mt-2 flex-row items-center">
              <View className="bg-blue-500/10 w-12 h-12 rounded-full items-center justify-center mr-4">
                <Text className="text-2xl">✨</Text>
              </View>
              <View>
                <Text className="text-white text-3xl font-bold tracking-tight">
                  Perfect Night.
                </Text>
                <Text className="text-zinc-500 mt-1 font-medium">
                  Your plans are ready to go.
                </Text>
              </View>
            </View>

            {/* RESTORED: CONTINUOUS CALENDAR TIMELINE */}
            <View className="flex-1 mb-8">
              {timeline.map((slot, idx) => {
                const isAvailable =
                  slot.type === "AVAILABLE" || slot.type === "BUFFER";
                const isActivity = slot.type === "OCCUPIED" && !!slot.activity;
                const isTravel = slot.type === "OCCUPIED" && !slot.activity;

                return (
                  <View key={slot.id ?? idx} className="flex-row">
                    {/* 1. Time Column (Left) */}
                    <View className="w-16 items-end mr-3 pt-0.5">
                      {isActivity && (
                        <Text className="text-zinc-400 font-mono text-xs font-bold tracking-tight">
                          {formatTime(slot.startTime)}
                        </Text>
                      )}
                    </View>

                    {/* 2. Vertical Track (Middle) */}
                    <View className="items-center w-4 mr-4 relative">
                      <View
                        className={`rounded-full mt-1.5 z-10 ${
                          isActivity
                            ? "w-2.5 h-2.5 bg-blue-500 shadow-sm"
                            : isAvailable
                              ? "w-1.5 h-1.5 bg-transparent border border-zinc-500/50"
                              : "w-1.5 h-1.5 bg-green-700"
                        }`}
                      />
                      {idx < timeline.length - 1 && (
                        <View
                          className={`absolute top-4 bottom-0 w-0 border-l-[2px] ${
                            isAvailable
                              ? "border-zinc-500/50"
                              : isTravel
                                ? "border-green-700/60"
                                : "border-blue-800"
                          }`}
                        />
                      )}
                    </View>

                    {/* 3. Content Column (Right) */}
                    <View className={`flex-1 pb-5`}>
                      {isActivity ? (
                        <View>
                          <Text className="text-white text-lg font-bold leading-tight">
                            {slot.title}
                          </Text>
                          <Text className="text-zinc-500 text-xs mt-1 font-medium">
                            {Math.round(
                              (slot.endTime - slot.startTime) / 60_000,
                            )}{" "}
                            min
                          </Text>
                        </View>
                      ) : isTravel ? (
                        <View className="flex-row items-center mt-0.5">
                          <Ionicons
                            name="car-outline"
                            size={14}
                            color="#71717a"
                          />
                          <Text className="text-zinc-500 text-xs ml-2 font-medium">
                            {Math.round(
                              (slot.endTime - slot.startTime) / 60_000,
                            )}{" "}
                            min travel
                            {idx === timeline.length - 1 ? " home" : ""}
                          </Text>
                        </View>
                      ) : !isInfinite ? (
                        <View className="flex-row items-center mt-0.5">
                          <Ionicons
                            name="hourglass-outline"
                            size={14}
                            color="#71717a"
                          />
                          <Text className="text-zinc-600 text-xs ml-2 font-medium italic">
                            {Math.round(
                              (slot.endTime - slot.startTime) / 60_000,
                            )}{" "}
                            min free time
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* RESTORED: FOOTER & ACTIONS */}
            <View className="mt-auto pt-6 border-t border-zinc-800/80">
              <View className="flex-row justify-between mb-6 px-2">
                <View>
                  <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1">
                    Total Spent
                  </Text>
                  <Text className="text-white text-xl font-mono">
                    ${spentBudget}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1">
                    Flex Time
                  </Text>
                  <Text className="text-white text-xl font-mono">
                    {isInfinite ? "∞" : `${Math.round(flexTime)}m`}
                  </Text>
                </View>
              </View>

              <Pressable
                className="bg-blue-600 py-5 rounded-2xl items-center mb-3 active:bg-blue-700"
                onPress={() => {
                  startActiveDate(timeline, userPrefs);
                  router.push("/active-date");
                }}
              >
                <Text className="text-white font-bold text-lg">
                  Finalize Itinerary
                </Text>
              </Pressable>
              <Pressable
                className="py-4 rounded-2xl items-center active:bg-zinc-800/50"
                onPress={() => {
                  setPlaced([]);
                  setIsDrawerOpen(false);
                  setReviewingItinerary(false);
                  loadInitialIdeas();
                }}
              >
                <Text className="text-zinc-500 font-semibold">Start Over</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* --- NEW NATIVE SLIDE-UP MODAL DRAWER --- */}
      <Modal visible={isDrawerOpen} animationType="slide" transparent={true}>
        {/* Dark blurred background backdrop */}
        <View className="flex-1 justify-end bg-black/60">
          <Pressable
            className="absolute inset-0"
            onPress={() => setIsDrawerOpen(false)}
          />

          <View className="bg-zinc-900 rounded-t-[32px] p-6 max-h-[85%] border-t border-zinc-700 shadow-2xl">
            {/* Drawer Handle / Header (Fixed Alignment!) */}
            <View className="flex-row justify-between items-start mb-6">
              <View>
                <Text className="text-white text-3xl font-bold mb-1">
                  {placed.length === 0 ? "First Stop" : "Up Next"}
                </Text>
                <Text className="text-zinc-500 text-base">
                  {placed.length === 0
                    ? `Let's get this ${userPrefs.socialType.toLowerCase()} started.`
                    : "What's the next move?"}
                </Text>
              </View>
              <Pressable
                onPress={() => setIsDrawerOpen(false)}
                className="pt-2"
              >
                <Text className="text-zinc-500 font-bold uppercase text-xs">
                  Cancel
                </Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} className="mb-4">
              {isFetchingFillers ? (
                <View className="py-12 items-center justify-center">
                  <ActivityIndicator size="large" color="#3b82f6" />
                  <Text className="text-blue-400 mt-4 font-mono text-xs uppercase tracking-widest">
                    Mapping nearby options...
                  </Text>
                </View>
              ) : sortedActivities.length > 0 ? (
                sortedActivities.map((item: any) => {
                  const disabled = item.fitStatus !== "FITS_NOW";
                  const isOverBudget = item.fitStatus === "OVER_BUDGET";

                  return (
                    <Pressable
                      key={item.idea_id}
                      disabled={disabled}
                      onPress={() => handlePlaceActivity(item)}
                      className={`p-5 rounded-2xl mb-4 border ${
                        disabled
                          ? "bg-zinc-950 border-zinc-900 opacity-50"
                          : "bg-zinc-800 border-zinc-700 active:border-white"
                      }`}
                    >
                      <View className="flex-row justify-between">
                        <Text className="text-white text-xl font-bold flex-1 pr-4">
                          {item.title}
                        </Text>
                        <Text className="text-zinc-500">
                          {userPrefs.modality === "GO_OUT"
                            ? `${(item.distance || 0).toFixed(1)} mi`
                            : "Anywhere!"}
                        </Text>
                      </View>

                      <Text className="text-zinc-400 mt-2" numberOfLines={2}>
                        {item.description}
                      </Text>

                      <View className="flex-row mt-4 justify-between">
                        <Text
                          className={`font-mono ${isOverBudget ? "text-red-500 font-bold" : "text-blue-400"}`}
                        >
                          ${item.totalCost} for {headCount}
                          {isOverBudget && " (Over Budget)"}
                        </Text>

                        <Text className="text-zinc-500">
                          {Math.floor(item.est_duration_minutes / 60)}hr{" "}
                          {item.est_duration_minutes % 60}min
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <Text className="text-zinc-500 text-center mt-10 pb-10">
                  Nothing fits the remaining time and budget!
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
