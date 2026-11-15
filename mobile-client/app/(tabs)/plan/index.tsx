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
  Alert,
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

import {ActivityLocation} from "@/types/itinerary";
import {SimpleLocation} from "@/types/activities";
import {usePrefsStore} from "@/src/store/usePrefsStore";
import {useActiveDateStore} from "@/src/store/activeDateStore";
import {useBuilderStore} from "@/src/store/useBuilderStore";
import {useProfileStore} from "@/src/store/useProfileStore";
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
  DATE_ACTIVITY_CLASS,
} from "@/src/constants/tags";

export default function PlanScreen() {
  const router = useRouter();
  const {prefs, setPrefs, resetPrefs, draftUpdatedAt} = usePrefsStore();
  const timeline = useActiveDateStore((state) => state.timeline);
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

  const [budgetTier, setBudgetTier] = useState<number>(
    defaultIsTier ? defaults.default_budget : 50,
  );
  const [isCustomBudget, setIsCustomBudget] = useState<boolean>(
    !defaultIsTier,
  );
  const [customBudget, setCustomBudget] = useState<number | null>(
    defaultIsTier ? null : defaults.default_budget,
  );
  const budgetRef = useRef<TextInput | null>(null);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState<number>(0);

  const resetLocalForm = () => {
    const roundedNow = getRoundedDate(new Date());
    setSocialType("Date");
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

  // Safely grab the first 3 base classes, and swap the 4th based on socialType
  const activityClasses = [
    ...BASE_ACTIVITY_CLASSES.slice(0, 3),
    socialType === "Date" ? DATE_ACTIVITY_CLASS : BASE_ACTIVITY_CLASSES[3],
  ];

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
            Alert.alert(
              "Location Required",
              "Allow location access, or set a home area in Settings, to find nearby activities.",
            );
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
          Alert.alert(
            "Location Error",
            "Could not determine your location. Please check your settings.",
          );
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
    const computedHeadCount =
      socialType === "Date" ? 2 : socialType === "Solo" ? 1 : 4;
    const finalBudget = isCustomBudget ? customBudget || 0 : budgetTier;

    // Save configuration to Zustand
    setPrefs({
      socialType,
      modality: modality === ActivityLocation.GoOut ? "GO_OUT" : "STAY_IN",
      startDate: startDate.toISOString(),
      endDate: computedEndDate.toISOString(),
      currentLocation: activeLocation,
      travelDistance: defaults.default_travel_miles,
      budget: finalBudget,
      vibes: selectedTags,
      headCount: computedHeadCount,
    });

    resetLocalForm();

    // PUSH to builder
    router.push("/builder");
  };

  // ─── Display helpers ─────────────────────────────────────────────────────────
  const goingOut = modality === ActivityLocation.GoOut;
  const budgetSummary = isCustomBudget
    ? customBudget != null
      ? `$${customBudget}`
      : "Exact budget"
    : (BUDGET_TIERS.find((tier) => tier.value === budgetTier)?.label ??
      `$${budgetTier}`);
  const planSummary = [
    socialType === "Group-Date" ? "Group date" : socialType,
    goingOut ? "Going out" : "Staying in",
    durationHours === null ? "Open-ended" : `${durationHours}h`,
    budgetSummary,
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

          {/* --- WHO --- */}
          <Section icon="people-outline" title="Who's coming">
            <SocialSelector type={socialType} setType={setSocialType} />
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
          <Section icon="wallet-outline" title="Budget" hint="Total for the outing">
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
          </Section>

          {/* --- VIBES (the tag selector, unchanged) --- */}
          <Section icon="sparkles-outline" title="Vibes" hint="Tap • Hold to refine">
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
                  onChange={handleDateChange}
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
