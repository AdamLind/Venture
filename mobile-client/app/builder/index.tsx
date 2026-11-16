// src/app/builder.tsx
import * as Haptics from "expo-haptics";
import {IMAGE_SIZE, sizedImage} from "@/src/lib/images";
import {BuilderActivity, TimeSlot} from "@/types/itinerary";
import {
  PlacedActivity,
  deriveSequentialTimeline,
  queryCandidates,
  fetchActivityForPlan,
  preferenceScore,
  evaluateContextAt,
} from "@/utils/itineraryEngine";
import {useFocusEffect, useLocalSearchParams, router} from "expo-router";
import {useCallback, useState, useEffect, useMemo, useRef} from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  LayoutAnimation,
  type ScrollViewInstance,
  Alert,
} from "react-native";
import Toast from "react-native-toast-message";
import {Ionicons} from "@expo/vector-icons";
import {usePrefsStore} from "@/src/store/usePrefsStore";
import {useBuilderStore} from "@/src/store/useBuilderStore";
import {usePlanSeedStore} from "@/src/store/usePlanSeedStore";
import {useHiddenStore} from "@/src/store/useHiddenStore";
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
import DraggableStop from "@/components/builder/DraggableStop";
import {useReorderDrag} from "@/components/builder/useReorderDrag";
import {evaluatePlan, warningsByStop} from "@/utils/planEvaluator";
import {bestPlacement, spotLabel} from "@/utils/bestPlacement";
import {smartOrder} from "@/utils/smartOrder";
import {
  drivingMiles,
  homeOf,
  isOpenEnded,
  stopMinutes,
  suggestedMinutes,
} from "@/utils/timeline";

/** How far out an open-ended date's timeline runs (it never fills up) */
const OPEN_ENDED_ROOM_MS = 48 * 3_600_000;
import StopLengthSheet from "@/components/builder/StopLengthSheet";
import SmartOrderCard from "@/components/builder/SmartOrderCard";
import PickerSheet from "@/components/builder/PickerSheet";
import {type DateWeather, conditionsAt, getDateWeather, weatherLookup} from "@/src/lib/weather";
import type {WeatherLookup} from "@/src/lib/weatherRules";
import WeatherStrip from "@/components/builder/WeatherStrip";
import Reanimated from "react-native-reanimated";
import {GestureDetector} from "react-native-gesture-handler";

export default function BuilderScreen() {
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const {prefs: userPrefs, resetPrefs, setPrefs} = usePrefsStore();
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
  const closePicker = useCallback(() => setIsDrawerOpen(false), []);
  const [activeGapDuration, setActiveGapDuration] = useState(
    Math.round(Math.abs(endMs - startMs) / 60_000),
  );
  const [isFetchingFillers, setIsFetchingFillers] = useState(false);
  const [reviewingItinerary, setReviewingItinerary] = useState<boolean>(false);

  // ─── Derived Timeline (The Canvas) ────────────────────────────────────────────
  // Open-ended dates ("no end time", really a 12-hour window) are laid out
  // against a far-off end, so there's always room for another stop and
  // suggestions aren't limited to what's left of the 12 hours. Time-based
  // warnings (worn out, best in the evening) still say when a day runs long.
  const layoutPrefs = useMemo(() => {
    if (!isOpenEnded(userPrefs)) return userPrefs;
    const farEnd = new Date(userPrefs.startDate).getTime() + OPEN_ENDED_ROOM_MS;
    return {
      ...userPrefs,
      endDate: new Date(Math.max(farEnd, new Date(userPrefs.endDate).getTime())).toISOString(),
    };
  }, [userPrefs]);
  const timeline = useMemo(
    () => deriveSequentialTimeline(placed, layoutPrefs),
    [placed, layoutPrefs],
  );
  // How good this order is, and what's off about it (utils/planEvaluator.ts)
  // ─── The date's weather (src/lib/weather.ts) ─────────────────────────────────
  // Fetched once on open; suggestions wait briefly for it, and the plan
  // evaluator and the weather card use it once it's here.
  const weatherPlace = homeOf(userPrefs);
  const [weather, setWeather] = useState<DateWeather | null | undefined>(undefined);
  const weatherRequest = useRef<Promise<DateWeather | null> | null>(null);
  const weatherNow = useRef<DateWeather | null>(null);
  const requestWeather = () => {
    if (!weatherRequest.current) {
      weatherRequest.current = getDateWeather(
        weatherPlace,
        new Date(userPrefs.startDate).getTime(),
        new Date(userPrefs.endDate).getTime(),
      ).then((result) => {
        weatherNow.current = result;
        setWeather(result);
        return result;
      });
    }
    return weatherRequest.current;
  };
  // For suggestions (reads the latest without re-rendering)
  const weatherAt: WeatherLookup = (ms) => conditionsAt(weatherNow.current, ms);
  useEffect(() => {
    requestWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const evaluation = useMemo(
    () => evaluatePlan(placed, userPrefs, timeline, {weatherAt: weatherLookup(weather)}),
    [placed, userPrefs, timeline, weather],
  );
  const stopWarnings = useMemo(() => warningsByStop(evaluation), [evaluation]);
  const planNotes = evaluation.issues.filter((issue) => issue.stopId == null);
  // While a stop is lifted, the banners above the timeline hold still (one
  // appearing mid-drag would shove the timeline, and the stop, out from
  // under your finger). They catch up on drop; stop cards stay live.
  const latestPlanNotes = useRef(planNotes);
  useEffect(() => {
    latestPlanNotes.current = planNotes;
  });
  const [frozenPlanNotes, setFrozenPlanNotes] = useState<typeof planNotes | null>(null);

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
  // (minus ones you just marked "Not interested" on their full page)
  const hiddenIds = useHiddenStore((s) => s.ids);
  const availableActivities = useMemo(
    () =>
      activities.filter(
        (a) =>
          !placed.some((p) => p.activity.idea_id === a.idea_id) && !hiddenIds.has(a.idea_id),
      ),
    [activities, placed, hiddenIds],
  );

  const rankWeather = useMemo(() => weatherLookup(weather), [weather]);

  // Only while there's a list to show (the picker, or Top picks before the
  // first stop): each suggestion is tried in every slot of the plan, which
  // shouldn't run on every swap of a drag.
  const showingSuggestions = isDrawerOpen || placed.length === 0;
  const sortedActivities = useMemo(() => {
    if (!showingSuggestions) return [];
    const baseMiles = drivingMiles(placed, userPrefs);
    return availableActivities
      .map((activity) => {
        // Its best slot in the plan (#59): before, between or after the
        // stops, by the evaluator's rules (utils/bestPlacement.ts)
        const placement = bestPlacement(placed, activity, userPrefs, {
          weatherAt: rankWeather,
          baseMiles,
        });

        // Budget Math
        const totalCost =
          (Number(activity.est_price_per_person) || 0) * headCount;

        // The Strict Gatekeepers: still done (trip home included) by the end
        // time, and within budget
        let fitStatus = "FITS_NOW";
        if (!placement.fits) {
          fitStatus = "NO_FIT_TIME";
        } else if (totalCost > remainingBudget) {
          fitStatus = "OVER_BUDGET";
        }

        // How the plan scores with this in its best slot (the same rules as
        // the stop warnings), plus how well it matches what you asked for;
        // distance is the extra driving it adds there
        const planProblem =
          warningsByStop(placement.evaluation).get(activity.idea_id) ?? null;
        const rank =
          placement.evaluation.score - evaluation.score +
          preferenceScore(activity, userPrefs, placement.addedMiles);

        return {
          ...activity,
          fitStatus,
          totalCost,
          planProblem,
          rank,
          placeAt: placement.index,
          spot: placement.spot,
          addedMiles: placement.addedMiles,
        };
      })
      // What fits first, then the best fits at the top
      .sort((a, b) => {
        if (a.fitStatus !== b.fitStatus) return a.fitStatus === "FITS_NOW" ? -1 : 1;
        return b.rank - a.rank;
      });
  }, [
    showingSuggestions,
    availableActivities,
    remainingBudget,
    isInfinite,
    placed,
    userPrefs,
    evaluation.score,
    rankWeather,
  ]);

  // ─── Loading ideas ────────────────────────────────────────────────────────────

  const startWithIdea = async (ideaId: number) => {
    setLoading(true);
    const activity = await fetchActivityForPlan(ideaId, userPrefs);
    if (activity) {
      setPlaced([{activity}]);
      setLoading(false);
    } else {
      // Gone or unavailable: start the usual way
      Toast.show({
        type: "error",
        text1: "That idea isn't available anymore",
        position: "bottom",
      });
      loadInitialIdeas();
    }
  };

  const loadInitialIdeas = async () => {
    try {
      setLoading(true);
      // Give the weather a moment, so the first suggestions account for it
      await Promise.race([requestWeather(), new Promise((resolve) => setTimeout(resolve, 2500))]);
      // At the start of the day: 0 exhaustion, 0 satiation (hungry)
      const initialContext = {
        exhaustion: 0,
        satiation: 0,
        atMs: new Date(userPrefs.startDate).getTime(),
        weatherAt,
      };

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

  // Runs once on open (after the loaders above are declared)
  useEffect(() => {
    // "Plan a date with this": the idea goes in as the first stop
    const startWith = usePlanSeedStore.getState().take();
    if (startWith && placed.length === 0) {
      startWithIdea(startWith.idea_id);
      return;
    }
    // Only load initial ideas if we don't already have a draft in progress
    if (activities.length === 0 && placed.length === 0) {
      loadInitialIdeas();
    } else {
      setLoading(false); // Instantly show the saved draft!
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────────────────────
  const handleOpenGap = async (gapSlot: TimeSlot) => {
    // (no LayoutAnimation here: it would fight the sheet's slide)
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
          // The biological state, and when this stop would start
          {...currentContext, atMs: gapSlot.startTime, weatherAt},
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
        const initialContext = {exhaustion: 0, satiation: 0, atMs: gapSlot.startTime, weatherAt};
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

  const handlePlaceActivityRef = useRef<(activity: any) => void>(() => {});
  const handlePlaceActivity = (activity: any) => {
    if (activity.fitStatus !== "FITS_NOW") return;
    if (process.env.EXPO_OS === "ios")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    // In its best slot (#59); on the end when it wasn't ranked with one
    const at: number =
      typeof activity.placeAt === "number" ? activity.placeAt : Number.POSITIVE_INFINITY;
    setPlaced((prev) => [...prev.slice(0, at), {activity}, ...prev.slice(at)]);
    setIsDrawerOpen(false);

    if (activity.spot) {
      Toast.show({
        type: "success",
        text1: `Added ${spotLabel(activity.spot)}`,
        text2: "Hold and drag to move it",
        position: "bottom",
        visibilityTime: 2500,
      });
    } else {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({animated: true});
      }, 300);
    }
  };

  useEffect(() => {
    handlePlaceActivityRef.current = handlePlaceActivity;
  });

  // ─── An idea's full page, and back ───────────────────────────────────────────
  // From the picker (or Top picks) before adding it, or a stop's photo after.
  // The picker stays open underneath (it's part of this screen); "Add to
  // plan" on the page adds it on return.
  const sortedRef = useRef(sortedActivities);
  useEffect(() => {
    sortedRef.current = sortedActivities;
  });
  const viewIdea = (item: any) => {
    // A suggestion that fits can be added from its page (a placed stop can't)
    const canAdd =
      item.fitStatus === "FITS_NOW" &&
      !placed.some((p) => p.activity.idea_id === item.idea_id);
    router.push({
      pathname: "/idea/[id]",
      params: {id: String(item.idea_id), from: "builder", ...(canAdd ? {add: "1"} : {})},
    });
  };
  useFocusEffect(
    useCallback(() => {
      const addId = useBuilderStore.getState().takePendingAdd();
      const item = addId != null ? sortedRef.current.find((a) => a.idea_id === addId) : null;
      // Let the screen settle before the timeline animates
      if (item) setTimeout(() => handlePlaceActivityRef.current(item), 250);
    }, []),
  );

  // ─── Reordering (drag, or VoiceOver's Move earlier / later) ─────────────────
  // One long-press drag on the timeline container (rows move when the list
  // reorders, and iOS cancels a gesture whose view moves). While dragging, a
  // floating copy of the stop follows the finger on the UI thread (dragY);
  // the row stays behind as a faint placeholder, and `placed` reorders as
  // the copy crosses its neighbours, so times update live.
  // See components/builder/useReorderDrag.ts and DraggableStop.tsx.
  const {
    pan: reorderPan,
    drag,
    layouts: stopLayouts,
    ghostStyle,
  } = useReorderDrag({
    // Read fresh from the store (the drag outlives renders)
    order: () => useBuilderStore.getState().placed.map((p) => p.activity.idea_id as number),
    enabled: placed.length > 1 && !reviewingItinerary,
    onMove: (id, to) => moveStop(id, to),
    // Banners and the smart card hold still while a stop is lifted
    onLift: () => {
      setFrozenPlanNotes(latestPlanNotes.current);
      setFrozenSmart(latestSmart.current);
    },
    onDrop: () => {
      setFrozenPlanNotes(null);
      setFrozenSmart(null);
    },
  });

  // ─── Smart reorder (utils/smartOrder.ts) ─────────────────────────────────────
  // Re-checked whenever the plan changes (it's cheap); paused while a stop is
  // lifted, when the card holds still like the banners.
  const dragging = drag !== null;
  const smart = useMemo(
    () => (dragging ? null : smartOrder(placed, userPrefs, {weatherAt: rankWeather})),
    [placed, userPrefs, rankWeather, dragging],
  );
  const latestSmart = useRef(smart);
  useEffect(() => {
    if (smart) latestSmart.current = smart;
  });
  const [frozenSmart, setFrozenSmart] = useState<typeof smart>(null);
  const smartShown = dragging ? frozenSmart : smart;
  const stopTitle = (id: number | null) =>
    id == null ? null : placed.find((p) => p.activity.idea_id === id)?.activity.title ?? null;

  const applySmartOrder = () => {
    if (!smart?.improved) return;
    const previous = placed;
    if (process.env.EXPO_OS === "ios")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlaced(smart.order);
    Toast.show({
      type: "success",
      text1: "Reordered your plan",
      text2: "Tap to undo",
      position: "bottom",
      onPress: () => {
        Toast.hide();
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setPlaced(previous);
      },
    });
  };

  const moveStop = (ideaId: number, toIndex: number) => {
    setPlaced((prev) => {
      const from = prev.findIndex((p) => p.activity.idea_id === ideaId);
      const to = Math.max(0, Math.min(prev.length - 1, toIndex));
      if (from === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // ─── How long at each stop (tap a stop) ───────────────────────────────────────
  const [editingStopId, setEditingStopId] = useState<number | null>(null);
  const setStopLength = (ideaId: number, minutes: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlaced((prev) =>
      prev.map((p) =>
        p.activity.idea_id === ideaId
          ? {
              ...p,
              // Back at the suggestion counts as not changed
              durationMinutes: minutes === suggestedMinutes(p.activity) ? undefined : minutes,
            }
          : p,
      ),
    );
    setEditingStopId(null);
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
  // When the plan really finishes (trip home included), and whether that's late
  const lastBusyEnd = timeline
    .filter((slot) => slot.type === "OCCUPIED")
    .reduce((end, slot) => Math.max(end, slot.endTime), 0);
  const runsLate = !isInfinite && lastBusyEnd > new Date(userPrefs.endDate).getTime();
  const realEndTime = new Date(lastBusyEnd).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  // "Extend to 10:30 PM": move the date's end time to when the plan finishes
  // (next 15 minutes); the stops don't change
  const extendedEnd = new Date(Math.ceil(lastBusyEnd / (15 * 60_000)) * 15 * 60_000);
  const extendedEndLabel = extendedEnd.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
  const fitEndToPlan = () => {
    const previousEnd = userPrefs.endDate;
    const quarter = 15 * 60_000;
    const newEnd = new Date(Math.ceil(lastBusyEnd / quarter) * quarter);
    if (process.env.EXPO_OS === "ios")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPrefs({endDate: newEnd.toISOString()});
    Toast.show({
      type: "success",
      text1: `Your date now ends at ${newEnd.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}`,
      text2: "Tap to undo",
      position: "bottom",
      onPress: () => {
        Toast.hide();
        setPrefs({endDate: previousEnd});
      },
    });
  };
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

      const ideaId = slot.activity.idea_id as number;
      const index = stopNumber(slot.id) - 1;
      const canMove = editable && stopCount > 1;
      return (
        // Keyed by idea, so a stop keeps its row (and its drag) when it moves
        <DraggableStop
          key={`stop-${ideaId}`}
          id={ideaId}
          dragging={drag?.id === ideaId}
          layouts={stopLayouts}
        >
          <TimelineRow node={<StopNode index={index + 1} />}>
            <StopCard
              slot={slot}
              headCount={headCount}
              onRemove={editable ? () => handleRemoveActivity(ideaId) : undefined}
              onMoveEarlier={canMove && index > 0 ? () => moveStop(ideaId, index - 1) : undefined}
              onMoveLater={
                canMove && index < stopCount - 1 ? () => moveStop(ideaId, index + 1) : undefined
              }
              warning={stopWarnings.get(ideaId)}
              onView={() => viewIdea(slot.activity)}
              onEditLength={editable ? () => setEditingStopId(ideaId) : undefined}
              adjusted={placed.some((p) => p.activity.idea_id === ideaId && p.durationMinutes != null)}
            />
          </TimelineRow>
        </DraggableStop>
      );
    });

  // The floating copy of the stop being dragged (with its live times)
  const dragSlot = drag
    ? timeline.find((slot) => slot.activity?.idea_id === drag.id)
    : undefined;
  const dragGhost = drag && dragSlot && (
    <Reanimated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: drag.x,
          top: drag.y,
          width: drag.width,
          zIndex: 20,
          shadowColor: "#000",
          shadowOpacity: 0.55,
          shadowRadius: 18,
          shadowOffset: {width: 0, height: 10},
          elevation: 14,
        },
        ghostStyle,
      ]}
    >
      <TimelineRow node={<StopNode index={stopNumber(dragSlot.id)} />}>
        <StopCard
          slot={dragSlot}
          headCount={headCount}
          warning={stopWarnings.get(drag.id)}
          // (looks like the card it lifted, photo badge included)
          onView={() => {}}
          adjusted={placed.some((p) => p.activity.idea_id === drag.id && p.durationMinutes != null)}
        />
      </TimelineRow>
    </Reanimated.View>
  );

  const timelineView = (editable: boolean) => {
    const view = (
    <View className="px-4">
      <TimelineRow isFirst node={<MarkerNode icon={goingOut ? "home" : "play"} />}>
        <MarkerLabel label={goingOut ? "Leave" : "Start"} time={simpleStartTime} />
      </TimelineRow>
      {renderSlots(editable)}
      <TimelineRow isLast node={<MarkerNode icon="flag" />}>
        <MarkerLabel
          label={goingOut && stopCount > 0 ? "Ends at home" : "Ends"}
          time={isInfinite ? "Whenever" : runsLate ? realEndTime : simpleEndTime}
          late={runsLate}
          note={runsLate ? `planned ${simpleEndTime}` : undefined}
        />
      </TimelineRow>
      {editable && dragGhost}
    </View>
    );
    // The reorder drag lives on the container (it never moves)
    return editable ? <GestureDetector gesture={reorderPan}>{view}</GestureDetector> : view;
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={["top"]} style={screenStyle}>
      {header}

      <ScrollView
        ref={scrollViewRef}
        scrollEnabled={drag === null}
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

            {/* The day's weather, for context */}
            <WeatherStrip
              weather={weather}
              startMs={new Date(userPrefs.startDate).getTime()}
              endMs={
                isInfinite
                  ? new Date(userPrefs.startDate).getTime() + 12 * 3_600_000
                  : new Date(userPrefs.endDate).getTime()
              }
              place={weatherPlace}
            />

            {/* Smart reorder: only when a clearly better order exists */}
            <SmartOrderCard result={smartShown} onApply={applySmartOrder} titleOf={stopTitle} />

            {/* Notes about the whole plan (running late, backtracking) */}
            {(frozenPlanNotes ?? planNotes).map((note) => (
              <View
                key={note.kind}
                className="mx-5 mb-3 flex-row items-center gap-2.5 bg-orange-500/10 border border-orange-500/30 rounded-2xl px-4 py-3"
              >
                <Ionicons
                  name={note.kind === "BACKTRACK" ? "git-compare-outline" : "alert-circle-outline"}
                  size={18}
                  color="#fb923c"
                />
                <Text className="flex-1 text-orange-200 text-sm">
                  {note.message}.{" "}
                  {note.kind === "BACKTRACK"
                    ? "Try a different order to cut the driving."
                    : note.kind === "PAST_END"
                      ? "Make the date end later, or trim a stop."
                      : "Move or remove a stop to fit."}
                </Text>
                {note.kind === "PAST_END" && (
                  <Pressable
                    onPress={fitEndToPlan}
                    accessibilityRole="button"
                    accessibilityLabel={`Make the date end at ${extendedEndLabel}`}
                    accessibilityHint="Your stops stay as they are"
                    className="border border-orange-500/30 rounded-full px-3 py-1.5 active:opacity-70"
                  >
                    <Text className="text-orange-200 font-bold text-sm">Extend to {extendedEndLabel}</Text>
                  </Pressable>
                )}
              </View>
            ))}

            {timelineView(true)}

            {stopCount > 1 && (
              <Text className="text-zinc-600 text-xs text-center mt-1">
                Hold and drag a stop to reorder
              </Text>
            )}

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
                      onView={() => viewIdea(item)}
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
                  source={{uri: activityImage(stopSlots[0]?.activity, IMAGE_SIZE.full)}}
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
      {/* Part of the screen, not a Modal: an idea's full page slides over it
          and swiping back finds it still open (components/builder/PickerSheet) */}
      <PickerSheet
        visible={isDrawerOpen}
        onClose={closePicker}
        // The list scrolls inside the sheet (pull down at its top to close);
        // its end clears the home indicator
        contentContainerStyle={{paddingHorizontal: 20, paddingBottom: insets.bottom + 16, gap: 10}}
        // The title row drags the sheet down too (with the grabber)
        header={
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
        }
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
                    onView={() => viewIdea(item)}
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
      </PickerSheet>
      {/* How long at a stop (tap a stop card) */}
      <StopLengthSheet
        stop={(() => {
          const p = placed.find((x) => x.activity.idea_id === editingStopId);
          const slot = timeline.find((x) => x.activity?.idea_id === editingStopId);
          return p && slot
            ? {
                title: p.activity.title,
                startMs: slot.startTime,
                minutes: stopMinutes(p),
                suggested: suggestedMinutes(p.activity),
                fixed: (p.activity as any).is_duration_variable === false,
                // Free time before the end (the whole day shifts with this stop)
                roomMinutes: isInfinite
                  ? null
                  : Math.round(
                      (new Date(userPrefs.endDate).getTime() -
                        timeline
                          .filter((x) => x.type === "OCCUPIED")
                          .reduce((end, x) => Math.max(end, x.endTime), 0)) /
                        60_000,
                    ),
                endLabel: simpleEndTime,
              }
            : null;
        })()}
        onDone={(minutes) => editingStopId != null && setStopLength(editingStopId, minutes)}
        onClose={() => setEditingStopId(null)}
      />
    </SafeAreaView>
  );
}
