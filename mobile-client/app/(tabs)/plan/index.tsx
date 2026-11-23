import ActivityTagsSelector from "@/components/home/ActivityTagsSelector";
import BudgetInput from "@/components/home/BudgetInput";
import InOrOutSelector from "@/components/home/InOrOutSelector";
import SocialSelector from "@/components/home/SocialSelector";
import React, {useEffect, useRef, useState, useCallback} from "react";
import {
  Pressable,
  Animated,
  Text,
  View,
  TextInput,
  Platform,
  StatusBar,
  Modal,
  ActivityIndicator,
} from "react-native";
import {useFocusEffect, useLocalSearchParams, useRouter} from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import {Ionicons} from "@expo/vector-icons";
import * as Location from "expo-location";
import {Image} from "expo-image";

import {ActivityLocation} from "@/types/itinerary";
import {SimpleLocation} from "@/types/activities";
import {type UserPrefs, usePrefsStore} from "@/src/store/usePrefsStore";
import {fetchActivityForPlan} from "@/utils/itineraryEngine";
import {bestStartTime} from "@/utils/bestStart";
import {getDateWeather, weatherLookup} from "@/src/lib/weather";
import {homeOf} from "@/utils/timeline";
import {useBuilderStore} from "@/src/store/useBuilderStore";
import {useProfileStore} from "@/src/store/useProfileStore";
import {usePlanSeedStore} from "@/src/store/usePlanSeedStore";
import {usePartner} from "@/src/store/useConnectionsStore";
import SurpriseRow from "@/components/dates/SurpriseRow";
import {ideaDuration} from "@/src/lib/ideas";
import {bestTimeLabel, nextGoodStart} from "@/src/lib/timeOfDay";
import * as Haptics from "expo-haptics";
import {holidayPreset, holidaysOn} from "@/utils/holidays";
import {occasionsOn, upcomingOccasion} from "@/utils/occasions";
import {usePartnerDatesStore} from "@/src/store/usePartnerDatesStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {SEASONS, SEASON_COLORS, SEASON_ICONS, seasonOn} from "@/utils/seasons";
import {IN_SEASON} from "@/utils/vibes";
import TabHeader, {useTabHeader, useTabRefresh} from "@/components/ui/TabHeader";
import {
  BUDGET_TIERS,
  parseLocalDate,
  toPlanningDefaults,
} from "@/src/lib/profile";

// IMPORT SHARED CONSTANTS
import {
  TAG_TAXONOMY,
  BASE_ACTIVITY_CLASSES,
  tagLabel,
} from "@/src/constants/tags";
import {showError, showInfo} from "@/src/lib/notify";
import {formatMoney} from "@/utils/money";

export default function PlanScreen() {
  const router = useRouter();
  const {prefs, setPrefs, resetPrefs, draftUpdatedAt} = usePrefsStore();
  const clearBuilder = useBuilderStore((state) => state.clearBuilder);

  // Saved planning defaults (Settings > Planning defaults) seed the form
  const preferences = useProfileStore((state) => state.preferences);
  const firstName = useProfileStore((state) => state.profile?.first_name);
  const header = useTabHeader({subtitle: true});
  // Pulls the latest planning defaults (e.g. changed on another device);
  // the form re-applies them when they change
  const refresh = useTabRefresh(useProfileStore((state) => state.reload));
  const defaults = toPlanningDefaults(preferences);
  const defaultModality =
    defaults.default_modality === "GO_OUT"
      ? ActivityLocation.GoOut
      : ActivityLocation.StayIn;
  const defaultIsTier = BUDGET_TIERS.some(
    (tier) => tier.value === defaults.default_budget,
  );
  const homeLocation: SimpleLocation | null =
    defaults.home_lat != null && defaults.home_lng != null
      ? {latitude: defaults.home_lat, longitude: defaults.home_lng}
      : null;

  // If there is a timestamp, they have an active draft!
  const hasActiveDraft = !!draftUpdatedAt;

  const getRoundedDate = (date = new Date()) => {
    const minutes = 15;
    const ms = 1000 * 60 * minutes;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  };

  // --- STALE DATA CHECK ---
  useFocusEffect(
    useCallback(() => {
      const storedEndDate = new Date(prefs.endDate);
      if (storedEndDate < new Date()) {
        resetPrefs();
      }
    }, [prefs.endDate, resetPrefs]),
  );

  // --- LOCAL FORM STATE ---
  const [socialType, setSocialType] = useState("Date");
  // A surprise for your partner (#35): the date is hidden from them
  const [surprise, setSurprise] = useState(false);
  const partner = usePartner();
  const [modality, setModality] = useState<ActivityLocation>(defaultModality);
  const [location, setLocation] = useState<SimpleLocation | null>(null);

  const [startDate, setStartDate] = useState(getRoundedDate(new Date()));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(
    getRoundedDate(new Date()),
  );

  // Activity tab's "Plan for this day" passes ?startsOn=YYYY-MM-DD.
  // Start at 7 PM that day (or the next 15-minute mark if that's already passed),
  // then clear the param so coming back to the tab doesn't re-apply it.
  const {startsOn} = useLocalSearchParams<{startsOn?: string}>();
  const [appliedStartsOn, setAppliedStartsOn] = useState<string | undefined>();
  if (startsOn !== appliedStartsOn) {
    // Adjusting state during render (rather than in an effect) avoids a flash
    setAppliedStartsOn(startsOn);
    if (startsOn && /^\d{4}-\d{2}-\d{2}$/.test(startsOn)) {
      const evening = parseLocalDate(startsOn);
      evening.setHours(19, 0, 0, 0);
      const rounded = getRoundedDate(new Date());
      const start = evening > rounded ? evening : rounded;
      setStartDate(start);
      setTempStartDate(start);
    }
  }
  useEffect(() => {
    if (startsOn) router.setParams({startsOn: undefined});
  }, [startsOn, router]);

  const [durationHours, setDurationHours] = useState<number | null>(4);

  // "Plan a date with this" (an idea's page) or "with these" (Saved): show
  // them as the date's starting ideas, and match the form to them (in or
  // out; long enough to fit them all, with time to get between them)
  const seeds = usePlanSeedStore((state) => state.seeds);
  const removeSeed = usePlanSeedStore((state) => state.removeSeed);
  const commitSeed = usePlanSeedStore((state) => state.commit);
  // Which ideas (not their order: the search below puts them in the best order)
  const seedKey = seeds
    .map((x) => x.idea_id)
    .sort((a, b) => a - b)
    .join(",");
  const [appliedSeedKey, setAppliedSeedKey] = useState("");
  if (seedKey !== appliedSeedKey) {
    // Adjusting state during render (like startsOn above) avoids a flash
    setAppliedSeedKey(seedKey);
    if (seeds.length) {
      setModality(
        seeds.some((x) => x.modality === "GO_OUT") ? ActivityLocation.GoOut : ActivityLocation.StayIn,
      );
      const needsMinutes =
        seeds.reduce((sum, x) => sum + (x.est_duration_minutes ?? 0), 0) + 30 * (seeds.length - 1);
      const needsHours = needsMinutes / 60;
      if (durationHours !== null && durationHours < needsHours) {
        setDurationHours([2, 4, 6].find((h) => h >= needsHours) ?? null);
      }
      // Start when they're best (e.g. stargazing: the evening)
      const timed = seeds.find((x) => x.time_of_day?.length);
      const goodStart = nextGoodStart(timed?.time_of_day ?? null, startDate);
      if (goodStart.getTime() !== startDate.getTime()) {
        setStartDate(goodStart);
        setTempStartDate(goodStart);
      }
    }
  }
  const headCountFor = (type: string) =>
    type === "Date" ? 2 : type === "Solo" ? 1 : 4;
  // The budget you pick is for the rest of the date, on top of these
  const seedCost = seeds.reduce((sum, x) => sum + x.est_price_per_person * headCountFor(socialType), 0);

  // The best start for the ideas you're starting with: the builder's rules
  // over the next few days (utils/bestStart.ts). Set for you, with a note;
  // picking a time yourself clears the note
  // The start it picked (for the note), until you pick one yourself
  const [timeNote, setTimeNote] = useState<Date | null>(null);
  // Still working them out until the search has finished for these ideas
  const [foundFor, setFoundFor] = useState<string | null>(null);
  const findingTime = seeds.length > 0 && foundFor !== seedKey;
  useEffect(() => {
    if (!seeds.length) return;
    let active = true;
    (async () => {
      const hours = durationHours ?? 12;
      const prefsNow: UserPrefs = {
        userId: null,
        socialType,
        modality: modality === ActivityLocation.GoOut ? "GO_OUT" : "STAY_IN",
        startDate: startDate.toISOString(),
        endDate: new Date(startDate.getTime() + hours * 3_600_000).toISOString(),
        currentLocation: location ?? homeLocation,
        homeLocation,
        travelDistance: defaults.default_travel_miles,
        budget: Number.MAX_SAFE_INTEGER,
        vibes: [],
        headCount: headCountFor(socialType),
      };
      const activities = (
        await Promise.all(seeds.map((x) => fetchActivityForPlan(x.idea_id, prefsNow)))
      ).filter((a): a is NonNullable<typeof a> => !!a);
      if (!active) return;
      if (!activities.length) {
        setFoundFor(seedKey);
        return;
      }
      // The forecast over the days searched (no wait past a couple of
      // seconds: without it, the search just skips the weather rules)
      const DAYS = 3;
      const from = new Date(startDate);
      from.setHours(0, 0, 0, 0);
      const weather = await Promise.race([
        getDateWeather(homeOf(prefsNow), from.getTime(), from.getTime() + DAYS * 86_400_000 + hours * 3_600_000),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
      if (!active) return;
      // Let "Finding the best time" draw before the search runs
      await new Promise((resolve) => setTimeout(resolve, 30));
      const best = bestStartTime({
        activities,
        prefs: prefsNow,
        durationMinutes: hours * 60,
        currentMs: startDate.getTime(),
        nowMs: Date.now(),
        days: DAYS,
        weatherAt: weather ? weatherLookup(weather) : null,
      });
      if (!active) return;
      setFoundFor(seedKey);
      // The ideas in the order that fits that time best (the builder starts from it)
      const rank = (id: number) => best.order.indexOf(id);
      const current = usePlanSeedStore.getState().seeds;
      usePlanSeedStore.getState().setSeeds([...current].sort((a, b) => rank(a.idea_id) - rank(b.idea_id)));
      if (best.changed) {
        const start = new Date(best.startMs);
        setStartDate(start);
        setTempStartDate(start);
        setTimeNote(start);
      } else {
        setTimeNote(null);
      }
    })().catch(() => active && setFoundFor(seedKey));
    return () => {
      active = false;
    };
    // The form as it is when the ideas change (not on every edit after)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const [budgetTier, setBudgetTier] = useState<number>(
    defaultIsTier ? defaults.default_budget : 50,
  );
  const [isCustomBudget, setIsCustomBudget] = useState<boolean>(
    !defaultIsTier,
  );
  const [customBudget, setCustomBudget] = useState<number | null>(
    defaultIsTier ? null : defaults.default_budget,
  );
  const budgetRef = useRef<React.ComponentRef<typeof TextInput> | null>(null);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState<number>(0);

  // Occasions around the date being planned: your anniversary and your
  // partner's birthday (#87, utils/occasions.ts), and a holiday
  // (utils/holidays.ts). Each is a one-tap chip that picks the vibes its
  // dates are about. Nothing changes unless it's tapped
  const partnerDates = usePartnerDatesStore();
  const loadPartnerDates = usePartnerDatesStore((s) => s.load);
  useFocusEffect(
    useCallback(() => {
      loadPartnerDates(partner?.user_id ?? null);
    }, [partner?.user_id, loadPartnerDates]),
  );
  const known = {
    anniversary: partnerDates.anniversary,
    partnerBirthday: partnerDates.partnerBirthday,
    partnerName: partner?.username ?? null,
    partnerVibes: partnerDates.partnerVibes,
  };
  const occasions = partner ? occasionsOn(startDate, known) : [];
  const holiday = holidayPreset(startDate);
  const vibeChips = [
    ...occasions.flatMap((o) => (o.vibes?.length ? [{key: o.id, emoji: o.emoji, label: o.label, vibes: o.vibes}] : [])),
    ...(holiday?.vibes ? [{key: holiday.id, emoji: holiday.emoji, label: holiday.label, vibes: holiday.vibes}] : []),
  ];
  const chipOn = (vibes: string[]) => vibes.every((tag) => selectedTags.includes(tag));
  const toggleChip = (vibes: string[]) => {
    if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const on = chipOn(vibes);
    setSelectedTags((prev) => (on ? prev.filter((tag) => !vibes.includes(tag)) : Array.from(new Set([...prev, ...vibes]))));
    // The tiles show the new picks
    setResetKey((prev) => prev + 1);
  };

  // A quiet "plan something?" two weeks before your anniversary or your
  // partner's birthday (dismissed for the year)
  const [today] = useState(() => new Date());
  const upcoming = partner ? upcomingOccasion(today, known) : null;
  const upcomingKey = upcoming ? `venture.occasionNudge.${upcoming.id}.${upcoming.date.getFullYear()}` : null;
  const [dismissedNudges, setDismissedNudges] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!upcomingKey) return;
    let active = true;
    AsyncStorage.getItem(upcomingKey)
      .then((seen) => active && setDismissedNudges((prev) => (seen ? new Set([...(prev ?? []), upcomingKey]) : (prev ?? new Set()))))
      .catch(() => active && setDismissedNudges((prev) => prev ?? new Set()));
    return () => {
      active = false;
    };
  }, [upcomingKey]);
  const planningForIt = !!upcoming && occasions.some((o) => o.id === upcoming.id);
  const showNudge = !!upcoming && !!upcomingKey && !!dismissedNudges && !dismissedNudges.has(upcomingKey) && !planningForIt;
  const dismissNudge = () => {
    if (!upcomingKey) return;
    setDismissedNudges((prev) => new Set([...(prev ?? []), upcomingKey]));
    AsyncStorage.setItem(upcomingKey, "1").catch(() => {});
  };
  const planForUpcoming = () => {
    if (!upcoming) return;
    // That day, at the time the form has now
    const at = new Date(upcoming.date);
    at.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
    setStartDate(at);
    setTempStartDate(at);
    if (upcoming.vibes?.length) {
      const vibes = upcoming.vibes;
      setSelectedTags((prev) => Array.from(new Set([...prev, ...vibes])));
      setResetKey((prev) => prev + 1);
    }
    dismissNudge();
  };

  // "In season" (#22): ideas made for the time of year of the date being
  // planned (seasonal ones in their months, holiday ones around it)
  const season = seasonOn(startDate, homeLocation?.latitude);
  const seasonHoliday = holidaysOn(startDate)[0] ?? null;
  const inSeasonOn = selectedTags.includes(IN_SEASON);
  const toggleInSeason = () => {
    if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTags((prev) => (inSeasonOn ? prev.filter((tag) => tag !== IN_SEASON) : [...prev, IN_SEASON]));
    setResetKey((prev) => prev + 1);
  };

  const resetLocalForm = () => {
    const roundedNow = getRoundedDate(new Date());
    setSocialType("Date");
    setSurprise(false);
    setModality(defaultModality);
    setLocation(null);
    setStartDate(roundedNow);
    setTempStartDate(roundedNow);
    setDurationHours(4);
    setBudgetTier(defaultIsTier ? defaults.default_budget : 50);
    setIsCustomBudget(!defaultIsTier);
    setCustomBudget(defaultIsTier ? null : defaults.default_budget);
    setSelectedTags([]);
    setResetKey((prev) => prev + 1); // <-- Add this to force child remount
  };

  // Re-apply the form defaults when they're edited in Settings
  // (tabs stay mounted, so the initial useState values alone would go stale)
  const defaultsVersion = preferences?.updated_at;
  const lastDefaultsVersion = useRef(defaultsVersion);
  useEffect(() => {
    if (lastDefaultsVersion.current === defaultsVersion) return;
    lastDefaultsVersion.current = defaultsVersion;
    resetLocalForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsVersion]);

  // The four vibe groups ("Close" for dates and group dates alike)
  const activityClasses = BASE_ACTIVITY_CLASSES;

  const formatStartDisplay = (date: Date) => {
    const today = new Date();
    const isToday =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
    const timeStr = date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    if (isToday) return `Today, ${timeStr}`;
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      date.getDate() === tomorrow.getDate() &&
      date.getMonth() === tomorrow.getMonth() &&
      date.getFullYear() === tomorrow.getFullYear();
    if (isTomorrow) return `Tomorrow, ${timeStr}`;
    return `${date.toLocaleDateString([], {month: "short", day: "numeric"})}, ${timeStr}`;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    const dateToUse =
      selectedDate instanceof Date
        ? selectedDate
        : event instanceof Date
          ? event
          : undefined;

    if (dateToUse) {
      if (Platform.OS === "android") {
        setShowStartPicker(false);
        setStartDate(dateToUse);
        setTimeNote(null);
      } else {
        setTempStartDate(dateToUse);
      }
    }
  };

  const handleDismiss = () => {
    if (Platform.OS === "android") {
      setShowStartPicker(false);
    }
  };

  const handleDiscard = () => {
    resetPrefs(); // Clears dates/budget/banner
    clearBuilder(); // Clears the half-built itinerary
  };

  const handleGenerate = async () => {
    if (
      isCustomBudget &&
      customBudget !== 0 &&
      !customBudget &&
      budgetRef.current
    ) {
      budgetRef.current.focus();
      return;
    }

    handleDiscard();

    let activeLocation = location;

    // Just-in-Time Location Fetching if modality is GO_OUT and location is missing
    if (modality === ActivityLocation.GoOut && !activeLocation) {
      setIsLocating(true);
      try {
        const {status} = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (!homeLocation) {
            showInfo("Where are you?", "Allow location, or set a home area");
            setIsLocating(false);
            return;
          }
          // Location is off: plan around their saved home area instead
          activeLocation = homeLocation;
        } else {
          const currentPosition = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          activeLocation = {
            latitude: currentPosition.coords.latitude,
            longitude: currentPosition.coords.longitude,
          };
        }

        setLocation(activeLocation);
      } catch (error) {
        console.error("Location fetch error:", error);
        if (!homeLocation) {
          showError("Couldn't find you", "Turn on location for Venture");
          setIsLocating(false);
          return;
        }
        activeLocation = homeLocation;
        setLocation(activeLocation);
      } finally {
        setIsLocating(false);
      }
    }

    const hoursToPlan = durationHours === null ? 12 : durationHours;
    const computedEndDate = new Date(
      startDate.getTime() + hoursToPlan * 60 * 60 * 1000,
    );
    const computedHeadCount = headCountFor(socialType);
    // Plus the starting idea's cost: the picked budget is for everything else
    const finalBudget =
      (isCustomBudget ? customBudget || 0 : budgetTier) + seedCost;

    // Save configuration to Zustand
    setPrefs({
      socialType,
      modality: modality === ActivityLocation.GoOut ? "GO_OUT" : "STAY_IN",
      startDate: startDate.toISOString(),
      endDate: computedEndDate.toISOString(),
      currentLocation: activeLocation,
      homeLocation,
      travelDistance: defaults.default_travel_miles,
      budget: finalBudget,
      vibes: selectedTags,
      headCount: computedHeadCount,
      surprise: !!partner && surprise,
    });

    resetLocalForm();
    // Hand the "Starting with" idea to the builder, which places it first
    commitSeed();

    // PUSH to builder
    router.push("/builder");
  };

  // ─── Display helpers ─────────────────────────────────────────────────────────
  const goingOut = modality === ActivityLocation.GoOut;
  const budgetSummary = isCustomBudget
    ? customBudget != null
      ? formatMoney(customBudget)
      : "Exact budget"
    : (BUDGET_TIERS.find((tier) => tier.value === budgetTier)?.label ??
      formatMoney(budgetTier));
  const planSummary = [
    socialType === "Group-Date" ? "Group date" : socialType,
    goingOut ? "Going out" : "Staying in",
    durationHours === null ? "Open-ended" : `${durationHours}h`,
    seedCost > 0 ? `${budgetSummary} + ${formatMoney(seedCost)}` : budgetSummary,
  ].join(" · ");
  const locationHint = location
    ? "Using your current location"
    : homeLocation
      ? `We'll use your location, or ${defaults.home_label ?? "your home area"} if it's off`
      : "We'll ask for your location when you start";

  return (
    // Fragment, so the scroll view is the screen's root view (see
    // TabHeader.tsx). StatusBar renders nothing and the Modals render nothing
    // while hidden, so the scroll view stays the only view at the root.
    <>
      <StatusBar barStyle="light-content" />

      <Animated.ScrollView
        {...header.scrollProps}
        style={{flex: 1, backgroundColor: "#000"}}
        contentContainerStyle={{paddingBottom: 64}}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refresh.control}
      >
        <TabHeader
          header={header}
          title="Plan"
          refreshing={refresh.headerSpinner}
          subtitle={firstName ? `What's the plan, ${firstName}?` : "What's the plan?"}
        />
        <View className="gap-4" style={{paddingHorizontal: 20, paddingTop: 8}}>
          {/* --- DRAFT IN PROGRESS --- */}
          {hasActiveDraft && (
            <View className="bg-blue-600/10 border border-blue-500/30 rounded-3xl p-4">
              <View className="flex-row items-center mb-4">
                <View className="w-10 h-10 rounded-full bg-blue-500/20 items-center justify-center mr-3">
                  <Ionicons name="construct-outline" size={18} color="#60a5fa" />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-bold text-base">
                    Continue planning
                  </Text>
                  <Text className="text-blue-200/70 text-sm">
                    {prefs.socialType === "Group-Date"
                      ? "Group date"
                      : prefs.socialType}{" "}
                    · {prefs.modality === "GO_OUT" ? "Going out" : "Staying in"}
                  </Text>
                </View>
                <Pressable onPress={handleDiscard} hitSlop={8}>
                  <Text className="text-zinc-400 font-semibold">Discard</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => router.push("/builder")}
                className="bg-white rounded-2xl py-3.5 items-center active:opacity-80"
              >
                <Text className="text-black font-extrabold text-base">
                  Resume draft
                </Text>
              </Pressable>
            </View>
          )}

          {/* --- YOUR ANNIVERSARY / THEIR BIRTHDAY IS COMING UP (#87) --- */}
          {showNudge && upcoming && (
            <View className="flex-row items-center gap-3 bg-pink-500/10 border border-pink-500/30 rounded-3xl pl-4 pr-2 py-3">
              <Text className="text-xl">{upcoming.emoji}</Text>
              <View className="flex-1">
                <Text className="text-white font-bold" numberOfLines={1}>
                  {upcoming.label} is {upcoming.date.toLocaleDateString([], {month: "short", day: "numeric"})}
                </Text>
                <Pressable onPress={planForUpcoming} hitSlop={6} accessibilityRole="button">
                  <Text className="text-pink-300 text-sm font-semibold">Plan something for it</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={dismissNudge}
                hitSlop={8}
                accessibilityLabel="Dismiss"
                className="w-8 h-8 rounded-full items-center justify-center active:bg-zinc-800"
              >
                <Ionicons name="close" size={16} color="#a1a1aa" />
              </Pressable>
            </View>
          )}

          {/* --- STARTING WITH ("Plan a date with this / these") --- */}
          {seeds.length > 0 && (
            <View className="bg-zinc-900 border border-zinc-800 rounded-3xl p-3 gap-3">
              <View className="flex-row items-center justify-between px-1">
                <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">
                  {seeds.length > 1 ? `Starting with ${seeds.length} ideas` : "Starting with"}
                </Text>
                {/* Still working out their best order (and time). A native
                    spinner: it keeps turning while the search runs */}
                {findingTime && (
                  <View className="flex-row items-center gap-1.5" accessibilityLiveRegion="polite">
                    <Text className="text-zinc-500 text-[11px]">{seeds.length > 1 ? "Finding the best order" : "Finding the best time"}</Text>
                    <ActivityIndicator size="small" color="#a1a1aa" style={{transform: [{scale: 0.8}]}} />
                  </View>
                )}
              </View>
              {seeds.map((x) => {
                // Just when it's best: the builder judges the order and times
                const bestTime = bestTimeLabel(x.time_of_day);
                return (
                  <View key={x.idea_id} className="flex-row items-center gap-3">
                    <Image
                      source={x.image ? {uri: x.image} : undefined}
                      style={{width: 52, height: 52, borderRadius: 14, backgroundColor: "#27272a"}}
                      contentFit="cover"
                    />
                    <View className="flex-1">
                      <Text className="text-white font-bold text-base" numberOfLines={1}>
                        {x.title}
                      </Text>
                      <Text className="text-zinc-400 text-sm" numberOfLines={1}>
                        {[
                          x.est_price_per_person > 0 ? `${formatMoney(x.est_price_per_person)}/person` : "Free",
                          x.est_duration_minutes
                            ? ideaDuration({est_duration_minutes: x.est_duration_minutes})
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                      {bestTime && (
                        <Text className="text-xs mt-0.5 text-zinc-500" numberOfLines={1}>
                          {bestTime}
                        </Text>
                      )}
                    </View>
                    <Pressable
                      onPress={() => removeSeed(x.idea_id)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Don't start with ${x.title}`}
                      className="w-8 h-8 rounded-full bg-zinc-800 items-center justify-center active:opacity-70"
                    >
                      <Ionicons name="close" size={16} color="#a1a1aa" />
                    </Pressable>
                  </View>
                );
              })}
              {seeds.length > 1 && (
                <Text className="text-zinc-500 text-xs px-1">
                  The builder puts them in the best order, then you add anything else.
                </Text>
              )}
            </View>
          )}

          {/* --- WHO --- */}
          <Section icon="people-outline" title="Who's coming">
            <SocialSelector type={socialType} setType={setSocialType} />
            {partner && <SurpriseRow partnerName={partner.username} value={surprise} onChange={setSurprise} />}
          </Section>

          {/* --- WHERE --- */}
          <Section icon="location-outline" title="Where">
            <InOrOutSelector
              inOrOut={modality}
              setInOrOut={setModality}
              setLocation={setLocation}
            />
            {goingOut && (
              <Text className="text-zinc-500 text-xs px-1">{locationHint}</Text>
            )}
          </Section>

          {/* --- WHEN --- */}
          <Section icon="calendar-outline" title="When">
            <Pressable
              onPress={() => {
                setTempStartDate(startDate);
                setShowStartPicker(true);
              }}
              className="bg-zinc-900 rounded-2xl px-4 py-3.5 border border-zinc-800 flex-row items-center active:bg-zinc-800"
            >
              <View className="flex-1">
                <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                  Starts
                </Text>
                <Text className="text-white font-bold text-base" numberOfLines={1}>
                  {formatStartDisplay(startDate)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#71717a" />
            </Pressable>
            {/* Starting with ideas: the time that suits them best */}
            {seeds.length > 0 && (findingTime || timeNote) && (
              <View className="flex-row items-center gap-1.5 px-1">
                {findingTime ? (
                  <ActivityIndicator size="small" color="#a1a1aa" />
                ) : (
                  <Ionicons name="sparkles" size={13} color="#a78bfa" />
                )}
                <Text className="text-zinc-400 text-xs flex-1">
                  {findingTime
                    ? "Finding the best time for your ideas…"
                    : `Start time set to ${formatStartDisplay(timeNote!)} for the best fit with your ideas. Change it anytime.`}
                </Text>
              </View>
            )}

            <View className="flex-row bg-zinc-900 rounded-2xl border border-zinc-800 p-1.5">
              {[2, 4, 6, null].map((val) => {
                const active = durationHours === val;
                return (
                  <Pressable
                    key={val === null ? "inf" : val}
                    onPress={() => setDurationHours(val)}
                    accessibilityRole="button"
                    accessibilityLabel={val === null ? "Open-ended" : `${val} hours`}
                    accessibilityState={{selected: active}}
                    className={`flex-1 py-3 rounded-xl items-center ${active ? "bg-zinc-700" : ""}`}
                  >
                    <Text
                      className={`font-bold ${active ? "text-white" : "text-zinc-500"}`}
                    >
                      {val === null ? "∞" : `${val}h`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          {/* --- BUDGET --- */}
          <Section
            icon="wallet-outline"
            title="Budget"
            hint={seedCost > 0 ? (seeds.length > 1 ? "On top of your ideas" : "On top of your first stop") : "Total for the outing"}
          >
            <View className="flex-row bg-zinc-900 rounded-2xl border border-zinc-800 p-1.5">
              {BUDGET_TIERS.map((tier) => {
                const active = !isCustomBudget && budgetTier === tier.value;
                return (
                  <Pressable
                    key={tier.label}
                    onPress={() => {
                      setIsCustomBudget(false);
                      setBudgetTier(tier.value);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{selected: active}}
                    className={`flex-1 py-3 rounded-xl items-center ${active ? "bg-zinc-700" : ""}`}
                  >
                    <Text
                      className={`font-bold ${active ? "text-white" : "text-zinc-500"}`}
                    >
                      {tier.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => {
                  setIsCustomBudget(true);
                  setTimeout(() => budgetRef.current?.focus(), 50);
                }}
                accessibilityRole="button"
                accessibilityState={{selected: isCustomBudget}}
                className={`flex-1 py-3 rounded-xl items-center ${isCustomBudget ? "bg-zinc-700" : ""}`}
              >
                <Text
                  className={`font-bold ${isCustomBudget ? "text-white" : "text-zinc-500"}`}
                >
                  Exact
                </Text>
              </Pressable>
            </View>
            {isCustomBudget && (
              <View className="flex-row items-center justify-center">
                <BudgetInput
                  budget={customBudget}
                  setBudget={setCustomBudget}
                  ref={budgetRef}
                />
              </View>
            )}
            {seedCost > 0 && (
              <Text className="text-zinc-500 text-xs px-1">
                {seeds.length > 1 ? `Your ${seeds.length} ideas are` : `${seeds[0].title} is`} ${seedCost} for{" "}
                {headCountFor(socialType)}. That&apos;s covered, so this is for the rest of the date.
              </Text>
            )}
          </Section>

          {/* --- VIBES (the tag selector, unchanged) --- */}
          <Section icon="sparkles-outline" title="Vibes" hint="Tap • Hold to refine">
            {vibeChips.length > 0 && (
              <View className="items-center gap-2">
                {vibeChips.map((chip) => {
                  const on = chipOn(chip.vibes);
                  return (
                    <Pressable
                      key={chip.key}
                      onPress={() => toggleChip(chip.vibes)}
                      accessibilityRole="button"
                      accessibilityState={{selected: on}}
                      accessibilityLabel={`${chip.label}: ${chip.vibes.map(tagLabel).join(", ")}`}
                      accessibilityHint={on ? "Clears these vibes" : "Picks these vibes"}
                      className={`flex-row items-center gap-2 px-4 py-2 rounded-full border active:opacity-70 ${
                        on ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
                      }`}
                    >
                      <Text>{chip.emoji}</Text>
                      <Text className={`font-bold text-sm ${on ? "text-white" : "text-zinc-300"}`}>{chip.label}</Text>
                      <Text className="text-zinc-500 text-xs shrink" numberOfLines={1}>
                        {chip.vibes.map(tagLabel).join(" · ")}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <View className="pt-1">
              <ActivityTagsSelector
                key={resetKey}
                mode="plan"
                taxonomy={TAG_TAXONOMY}
                classes={activityClasses}
                initialActiveTags={selectedTags}
                onTagsChange={(newTags) => setSelectedTags(newTags)}
              />
            </View>
            <Pressable
              onPress={toggleInSeason}
              accessibilityRole="button"
              accessibilityState={{selected: inSeasonOn}}
              accessibilityLabel={`In season: ${seasonHoliday ? `${seasonHoliday.label} season` : SEASONS.find((s) => s.value === season)?.label}`}
              accessibilityHint="Ideas made for this time of year"
              // On: the season's color (same size either way: nothing shifts)
              className="self-center flex-row items-center gap-2 px-4 py-2 mt-1 rounded-full border active:opacity-70"
              style={
                inSeasonOn
                  ? {backgroundColor: `${SEASON_COLORS[season]}26`, borderColor: SEASON_COLORS[season]}
                  : {backgroundColor: "#18181b", borderColor: "#27272a"}
              }
            >
              {seasonHoliday ? (
                <Text>{seasonHoliday.emoji}</Text>
              ) : (
                <Ionicons
                  name={SEASON_ICONS[season] as any}
                  size={15}
                  color={inSeasonOn ? SEASON_COLORS[season] : "#a1a1aa"}
                />
              )}
              <Text className="font-bold text-sm" style={{color: inSeasonOn ? SEASON_COLORS[season] : "#d4d4d8"}}>
                In season
              </Text>
              <Text className="text-xs" style={{color: inSeasonOn ? `${SEASON_COLORS[season]}b3` : "#71717a"}}>
                {seasonHoliday ? seasonHoliday.label : SEASONS.find((s) => s.value === season)?.label}
              </Text>
            </Pressable>
          </Section>

          {/* --- START --- */}
          <View className="gap-3 mt-2">
            <Pressable
              onPress={handleGenerate}
              disabled={isLocating}
              className={`h-14 rounded-2xl items-center justify-center ${
                isLocating ? "bg-zinc-300" : "bg-white active:opacity-80"
              }`}
            >
              {isLocating ? (
                <ActivityIndicator color="black" />
              ) : (
                <Text className="text-black font-extrabold text-[17px]">
                  Start planning
                </Text>
              )}
            </Pressable>
            <Text className="text-zinc-500 text-center text-sm">
              {planSummary}
            </Text>
          </View>
        </View>
      </Animated.ScrollView>

      {/* iOS Date Picker Modal (Prevents hiding under Bottom Tabs) */}
      {Platform.OS === "ios" && (
        <Modal visible={showStartPicker} transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/60">
            <Pressable
              className="absolute inset-0"
              onPress={() => setShowStartPicker(false)}
            />
            <View className="bg-zinc-950 border-t border-zinc-800 p-6 pb-12 rounded-t-3xl shadow-2xl">
              <View className="flex-row justify-between items-center mb-6">
                <Pressable onPress={() => setShowStartPicker(false)}>
                  <Text className="text-zinc-400 font-semibold text-base">
                    Cancel
                  </Text>
                </Pressable>
                <Text className="text-white font-bold text-lg">Plan Ahead</Text>
                <Pressable
                  onPress={() => {
                    setStartDate(tempStartDate);
                    setTimeNote(null);
                    setShowStartPicker(false);
                  }}
                >
                  <Text className="text-white font-bold text-base">Done</Text>
                </Pressable>
              </View>
              <View className="h-[220px] w-full justify-center">
                <DateTimePicker
                  value={tempStartDate}
                  mode="datetime"
                  display="spinner"
                  minimumDate={new Date()}
                  minuteInterval={15}
                  onValueChange={handleDateChange}
                  textColor="white"
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Android Date Picker */}
      {Platform.OS === "android" && showStartPicker && (
        <DateTimePicker
          value={tempStartDate}
          mode="datetime"
          display="spinner"
          minimumDate={new Date()}
          minuteInterval={15}
          onValueChange={handleDateChange} // <-- Changed from onChange
          onDismiss={handleDismiss} // <-- Added this
          textColor="white"
        />
      )}
    </>
  );
}

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** A titled card that groups one planning question. */
function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="bg-zinc-950 border border-zinc-900 rounded-3xl p-4 gap-3">
      <View className="flex-row items-center justify-between px-1">
        <View className="flex-row items-center gap-2">
          <Ionicons name={icon} size={16} color="#a1a1aa" />
          <Text className="text-white font-bold text-base">{title}</Text>
        </View>
        {hint ? (
          <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
