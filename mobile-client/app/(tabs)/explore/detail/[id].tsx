import React, {useCallback, useRef, useState} from "react";
import {IMAGE_SIZE, sizedImage} from "@/src/lib/images";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StatusBar,
  Animated,
  Modal,
  StyleSheet,
} from "react-native";
import {Image} from "expo-image";
import {useFocusEffect, useRouter, useLocalSearchParams} from "expo-router";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import MapView, {Marker} from "react-native-maps";
import {LinearGradient} from "expo-linear-gradient";
import {supabase} from "@/src/supabase";
import {useLocationStore} from "@/src/store/useLocationStore";
import {useProfileStore} from "@/src/store/useProfileStore";
import SaveButton from "@/components/ideas/SaveButton";
import GlassSurface from "@/components/ui/GlassSurface";
import {showIdeaMenu} from "@/src/lib/reportIdea";
import {usePlanSeedStore} from "@/src/store/usePlanSeedStore";
import {useBuilderStore} from "@/src/store/useBuilderStore";
import {StatusChip} from "@/components/ideas/IdeaRows";
import {IDEA_STATUS} from "@/src/lib/ideas";
import {WEATHER_NEEDS_OPTIONS} from "@/src/lib/weatherRules";
import {normalizeTimeOfDay, TIME_OF_DAY_LABEL} from "@/src/lib/timeOfDay";
import PlaceHours from "@/components/ideas/PlaceHours";
import EditPlaceSheet, {type EditablePlace} from "@/components/places/EditPlaceSheet";
import ReviewPanel from "@/components/moderation/ReviewPanel";
import {useStaffStore} from "@/src/store/useStaffStore";
import {RULE_BY_ID, isRuleId, type RuleId} from "@/src/lib/ideaGuidelines";
import {SAFETY_DISCLAIMER, needsSafetyLine, riskLabelsOf} from "@/src/lib/safety";
import {tagLabel} from "@/src/constants/tags";
import {formatMoney} from "@/utils/money";

export default function IdeaDetailScreen() {
  const router = useRouter();
  // `from=builder`: opened from the date builder to look before (or after)
  // adding it. Then the bottom button adds it to that plan (`add=1`), or
  // there's none (already in the plan, or it doesn't fit); never "Plan a
  // date with this", which would start a different plan.
  // `review=1`: staff reviewing it (from the queue, or "Review as staff")
  const {id, from, add, review: reviewParam} = useLocalSearchParams<{
    id: string;
    from?: string;
    add?: string;
    review?: string;
  }>();
  const fromBuilder = from === "builder";
  const requestAdd = useBuilderStore((s) => s.requestAdd);

  const [idea, setIdea] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMapModalVisible, setIsMapModalVisible] = useState(false);
  // Editing a place you added (#6)
  const [editingPlace, setEditingPlace] = useState<EditablePlace | null>(null);

  const {hasPermission, requestLocation} = useLocationStore();
  const myUserId = useProfileStore((s) => s.userId);
  // Staff (#26): the review panel, from the queue or with Staff tools on
  const staffRole = useStaffStore((s) => s.role);
  const staffToolsOn = useStaffStore((s) => s.toolsOn);
  const reportCount = useStaffStore((s) => s.reportedIdeas.get(Number(id)) ?? 0);
  const setPlanSeed = usePlanSeedStore((s) => s.setSeed);
  const insets = useSafeAreaInsets();

  // --- ANIMATION VALUES ---
  const [scrollY] = useState(() => new Animated.Value(0));

  // 1. The Math: To perfectly fill the gap, scaling must match the 480px height.
  // If you pull down 480px, the image must exactly double in size (scale: 2)
  const imageScale = scrollY.interpolate({
    inputRange: [-300, 0],
    outputRange: [2, 1],
    extrapolateRight: "clamp",
  });

  // 2. The Math: To keep the top edge "glued" to the screen, we translate it up
  // by exactly half the distance you scrolled.
  const imageTranslate = scrollY.interpolate({
    inputRange: [-300, 0],
    outputRange: [-150, 0],
    extrapolateRight: "clamp",
  });

  // --- FETCH DATA ---
  // On focus, so coming back from editing the idea shows the new version
  const loadedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
    const fetchIdeaDetails = async () => {
      try {
        const {data, error: dbError} = await supabase
          .from("activities")
          .select(
            `
            *,
            venues ( venue_id, created_by, name, address, coordinates, opening_hours, hours_checked_at, access_note,
              pinned_by:users ( username ) ),
            users!activities_user_id_fkey ( username ),
            activity_tags (
              tags ( name )
            )
          `,
          )
          .eq("idea_id", id)
          .single();

        // Gone since you opened it (you deleted it from the edit form): leave
        if (dbError?.code === "PGRST116" && loadedOnce.current) {
          router.back();
          return;
        }
        if (dbError) throw dbError;
        loadedOnce.current = true;
        setIdea(data);
      } catch (err: any) {
        console.error("Fetch Error:", err);
        setError(err.message || "Could not load date idea");
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchIdeaDetails();
    }, [id, router]),
  );

  const handleOpenMap = async () => {
    setIsMapModalVisible(true);
    await requestLocation();
  };

  // Helper to parse PostGIS WKB hex strings (e.g. "0101000020E6100000...") into lat/lng
  const parseCoordinates = (hex: string) => {
    if (!hex || typeof hex !== "string" || hex.length < 25) return null;
    try {
      const buffer = new Uint8Array(
        hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
      );
      const view = new DataView(buffer.buffer);

      // Byte 0: Endianness (1 = little endian)
      const littleEndian = buffer[0] === 1;

      // PostGIS EWKB with SRID stores X (Longitude) at byte 9 and Y (Latitude) at byte 17
      const longitude = view.getFloat64(9, littleEndian);
      const latitude = view.getFloat64(17, littleEndian);

      if (isNaN(longitude) || isNaN(latitude)) return null;
      return {longitude, latitude};
    } catch (e) {
      console.error("WKB Parse Error:", e);
      return null;
    }
  };

  // --- LOADING / ERROR STATES ---
  if (isLoading) {
    return (
      <View className="flex-1 bg-black justify-center items-center">
        <ActivityIndicator size="large" color="#FF9D0A" />
      </View>
    );
  }

  if (error || !idea) {
    return (
      <View className="flex-1 bg-black justify-center items-center p-6">
        <Ionicons
          name="alert-circle"
          size={48}
          color="#ef4444"
          className="mb-4"
        />
        <Text className="text-white text-lg font-bold mb-6 text-center">
          {error || "Date idea not found"}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="bg-zinc-800 px-6 py-3 rounded-full"
        >
          <Text className="text-white font-bold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const coords = idea.venues?.coordinates
    ? parseCoordinates(idea.venues.coordinates)
    : null;
  // Your own idea: say where it stands, and offer to edit it
  const isMine = !!myUserId && idea.user_id === myUserId;
  // Staff review: asked for (queue / menu), or tools on and it needs a look
  // (in review, sent back, rejected, or reported). Never on private ideas
  const showReview =
    !!staffRole &&
    idea.visibility !== "PRIVATE" &&
    (reviewParam === "1" ||
      (staffToolsOn && (idea.visibility !== "PUBLISHED" || reportCount > 0)));
  // Someone else's unpublished idea (staff only see these): nothing to plan
  const canPlan = isMine || idea.visibility === "PUBLISHED";
  // After a verdict: what the reviewer said (kept for reference if you
  // withdrew it to private)
  const review = !isMine
    ? null
    : idea.visibility === "NEEDS_REVISION"
      ? {title: "What to change", color: "#fb923c", canResubmit: true}
      : idea.visibility === "REJECTED"
        ? {title: "Why it wasn't approved", color: "#f87171", canResubmit: true}
        : idea.visibility === "PRIVATE" && idea.moderation_note
          ? {title: "From the last review", color: "#a1a1aa", canResubmit: false}
          : null;
  // The guidelines the last review cited (#85), known ids only
  const citedRules: RuleId[] = review
    ? ((idea.moderation_rules ?? []) as string[]).filter(isRuleId)
    : [];
  // What weather it needs (null: the default for its environment), and when it's best
  const weatherLabel =
    WEATHER_NEEDS_OPTIONS.find(
      (o) => o.value === (idea.weather_needs ?? (idea.environment === "INDOOR" ? "ANY" : "NICE")),
    )?.label ?? "Any weather";
  const timeWindows = normalizeTimeOfDay(idea.time_of_day);
  const bestTime = timeWindows.length
    ? timeWindows.map((t) => TIME_OF_DAY_LABEL[t]).join(", ")
    : "Any time";
  const editIdea = () =>
    router.push({pathname: "/create", params: {ideaId: String(idea.idea_id)}});
  // Off to the Plan tab, with this idea as the date's first stop
  const planWithThis = () => {
    setPlanSeed({
      idea_id: idea.idea_id,
      title: idea.title,
      image: sizedImage(idea.image_urls?.[0], 56),
      modality: idea.modality,
      est_price_per_person: Number(idea.est_price_per_person) || 0,
      est_duration_minutes: idea.est_duration_minutes ?? null,
      time_of_day: idea.time_of_day ?? null,
    });
    router.navigate("/(tabs)/plan");
  };

  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" />

      {/* CHANGED TO ANIMATED.SCROLLVIEW */}
      <Animated.ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16} // Super fast 60fps tracking
        onScroll={Animated.event(
          [{nativeEvent: {contentOffset: {y: scrollY}}}],
          {useNativeDriver: true}, // Uses the native iOS UI thread for zero lag
        )}
      >
        {/* HERO SECTION: FULLY INTEGRATED + OVERSCROLL ZOOM */}
        <View className="relative w-full bg-black">
          <Animated.View
            style={{
              width: "100%",
              height: 300, // Forces the h-96 height
              transform: [{scale: imageScale}, {translateY: imageTranslate}],
            }}
          >
            <Image
              source={{uri: sizedImage(idea.image_urls?.[0], IMAGE_SIZE.full) ?? undefined}}
              style={{width: "100%", height: "100%"}}
              contentFit="cover" // Edge-to-edge immersive fit
            />

            {/* DOUBLE GRADIENT: Bleeds to black at top (notch) AND bottom */}
            <LinearGradient
              colors={[
                "rgba(0,0,0,0.9)",
                "transparent",
                "transparent",
                "#000000",
              ]}
              locations={[0, 0.15, 0.85, 1]}
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                top: 0,
              }}
            />
          </Animated.View>
        </View>

        {/* CONTENT CONTAINER */}
        <View className="-mt-16 px-5" style={{paddingBottom: 120 + insets.bottom}}>
          {/* HEADER */}
          <View className="mb-6">
            <View className="flex-row gap-2 mb-3">
              <View className="bg-zinc-800/80 px-3 py-1 rounded-full border border-zinc-700">
                <Text className="text-zinc-300 text-xs font-bold uppercase tracking-wider">
                  {idea.modality.replace("_", " ")}
                </Text>
              </View>
              {idea.activity_type !== "OTHER" && (
                <View className="bg-zinc-800/80 px-3 py-1 rounded-full border border-zinc-700">
                  <Text className="text-zinc-300 text-xs font-bold uppercase tracking-wider">
                    {idea.activity_type}
                  </Text>
                </View>
              )}
            </View>

            <Text className="text-4xl font-extrabold text-white mb-2">
              {idea.title}
            </Text>

            {idea.users?.username ? (
              <Text className="text-zinc-400 text-base font-medium">
                Curated by <Text className="text-white font-bold">@{idea.users.username}</Text>
              </Text>
            ) : (
              <Text className="text-zinc-400 text-base font-medium">Shared by a Venture member</Text>
            )}
          </View>

          {/* STAFF REVIEW */}
          {showReview && (
            <ReviewPanel
              idea={idea}
              onDecided={(visibility, note, rules) => {
                setIdea((prev: any) =>
                  prev
                    ? {...prev, visibility, moderation_note: note, moderation_rules: rules, held_at: null}
                    : prev,
                );
                // From the queue: straight back to it for the next one
                if (from === "queue") router.back();
              }}
            />
          )}

          {isMine && (
            <View className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 mb-6 gap-2">
              <StatusChip visibility={idea.visibility} />
              <Text className="text-zinc-300 text-sm">
                {IDEA_STATUS[idea.visibility as keyof typeof IDEA_STATUS]?.detail}
              </Text>
              {/* Reported a few times: out of Discover until a moderator looks */}
              {idea.visibility === "PUBLISHED" && idea.held_at && (
                <View className="flex-row gap-2 bg-amber-500/10 rounded-2xl px-3 py-2.5 mt-1">
                  <Ionicons name="eye-off" size={14} color="#fcd34d" style={{marginTop: 2}} />
                  <Text className="text-amber-100/80 text-sm flex-1">
                    Hidden from Discover for now: it was reported a few times, and a moderator will take a
                    look soon. People who saved it can still see it.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* REVIEWER'S NOTES (your idea, after a verdict) */}
          {review && (
            <View
              className="rounded-3xl p-4 mb-6 border gap-2"
              style={{backgroundColor: `${review.color}14`, borderColor: `${review.color}55`}}
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="chatbubble-ellipses" size={16} color={review.color} />
                <Text className="font-bold text-base" style={{color: review.color}}>
                  {review.title}
                </Text>
              </View>
              <Text className="text-zinc-200 text-[15px] leading-6">
                {idea.moderation_note || "The reviewer didn't leave a note."}
              </Text>
              {/* The guidelines the review cited, each opening the rule itself */}
              {citedRules.length > 0 && (
                <View className="flex-row flex-wrap gap-2 mt-1">
                  {citedRules.map((ruleId) => (
                    <Pressable
                      key={ruleId}
                      onPress={() => router.push({pathname: "/guidelines", params: {rules: citedRules.join(",")}})}
                      accessibilityRole="link"
                      accessibilityHint="Opens the idea guidelines"
                      className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5 bg-black/40 active:opacity-70"
                    >
                      <Ionicons name={RULE_BY_ID[ruleId].icon} size={13} color={review.color} />
                      <Text className="text-zinc-200 text-sm font-semibold">{RULE_BY_ID[ruleId].title}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Pressable
                onPress={() =>
                  router.push(
                    citedRules.length
                      ? {pathname: "/guidelines", params: {rules: citedRules.join(",")}}
                      : "/guidelines",
                  )
                }
                hitSlop={6}
                accessibilityRole="link"
                className="self-start flex-row items-center gap-1 active:opacity-70"
              >
                <Text className="text-sm font-semibold" style={{color: review.color}}>
                  What makes a good idea
                </Text>
                <Ionicons name="chevron-forward" size={14} color={review.color} />
              </Pressable>
              {review.canResubmit && (
                <Pressable
                  onPress={editIdea}
                  className="mt-2 bg-white rounded-2xl py-3 items-center active:opacity-80"
                >
                  <Text className="text-black font-bold">Edit and resubmit</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* QUICK STATS GRID */}
          <View className="flex-row flex-wrap justify-between bg-zinc-900/80 rounded-3xl p-5 border border-zinc-800 mb-8">
            {/* Opening hours first (#8): whether it's open is one of the
                first things to know. Nothing when the hours aren't known */}
            {idea.modality === "GO_OUT" && idea.venues && (
              <PlaceHours
                hours={idea.venues.opening_hours}
                checkedAt={idea.venues.hours_checked_at}
                url={idea.url}
                at={coords}
                className="w-full mb-4 pb-4 border-b border-zinc-800"
              />
            )}
            <View className="w-[45%] mb-4">
              <View className="flex-row items-center gap-2 mb-1">
                <Ionicons name="cash-outline" size={18} color="#FF9D0A" />
                <Text className="text-zinc-400 text-xs font-bold">
                  EST. COST
                </Text>
              </View>
              <Text className="text-white font-bold text-lg">
                {idea.est_price_per_person === 0
                  ? "Free"
                  : `${formatMoney(idea.est_price_per_person)}/pp`}
              </Text>
            </View>

            <View className="w-[45%] mb-4">
              <View className="flex-row items-center gap-2 mb-1">
                <Ionicons name="time-outline" size={18} color="#FF9D0A" />
                <Text className="text-zinc-400 text-xs font-bold">
                  DURATION
                </Text>
              </View>
              <Text className="text-white font-bold text-lg">
                {idea.est_duration_minutes} min{" "}
                {idea.is_duration_variable ? "+" : ""}
              </Text>
            </View>

            <View className="w-[45%] mb-4">
              <View className="flex-row items-center gap-2 mb-1">
                <Ionicons name="people-outline" size={18} color="#FF9D0A" />
                <Text className="text-zinc-400 text-xs font-bold">
                  GROUP SIZE
                </Text>
              </View>
              <Text className="text-white font-bold text-lg">
                {idea.min_people} - {idea.max_people} people
              </Text>
            </View>

            <View className="w-[45%] mb-4">
              <View className="flex-row items-center gap-2 mb-1">
                <Ionicons name="leaf-outline" size={18} color="#FF9D0A" />
                <Text className="text-zinc-400 text-xs font-bold">SETTING</Text>
              </View>
              <Text className="text-white font-bold text-lg capitalize">
                {idea.environment.toLowerCase()}
              </Text>
            </View>

            <View className="w-[45%]">
              <View className="flex-row items-center gap-2 mb-1">
                <Ionicons name="partly-sunny-outline" size={18} color="#FF9D0A" />
                <Text className="text-zinc-400 text-xs font-bold">WEATHER</Text>
              </View>
              <Text className="text-white font-bold text-lg">{weatherLabel}</Text>
              {!idea.weather_needs && (
                <Text className="text-zinc-500 text-xs">Default for {idea.environment.toLowerCase()}</Text>
              )}
            </View>

            <View className="w-[45%]">
              <View className="flex-row items-center gap-2 mb-1">
                <Ionicons name="time-outline" size={18} color="#FF9D0A" />
                <Text className="text-zinc-400 text-xs font-bold">BEST TIME</Text>
              </View>
              <Text className="text-white font-bold text-lg">{bestTime}</Text>
            </View>
          </View>

          {/* DESCRIPTION */}
          <View className="mb-8">
            <Text className="text-white text-lg leading-relaxed text-zinc-300">
              {idea.description}
            </Text>
          </View>

          {/* GOOD TO KNOW (#81): its risks, the creator's heads-up, and (outdoor
              or risky ideas only) that we don't verify safety */}
          {(riskLabelsOf(idea).length > 0 || idea.safety_note || needsSafetyLine(idea)) && (
            <View className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-4 mb-8 gap-3">
              <Text className="text-zinc-400 text-sm font-bold">GOOD TO KNOW</Text>
              {riskLabelsOf(idea).length > 0 && (
                <View className="flex-row flex-wrap gap-2">
                  {riskLabelsOf(idea).map((risk) => (
                    <View
                      key={risk.value}
                      className="flex-row items-center gap-1.5 bg-amber-500/15 rounded-full px-3 py-1.5"
                      accessibilityLabel={`${risk.label}: ${risk.hint}`}
                    >
                      <Ionicons name={risk.icon} size={14} color="#fbbf24" />
                      <Text className="text-amber-200 text-sm font-semibold">{risk.label}</Text>
                    </View>
                  ))}
                </View>
              )}
              {idea.safety_note ? (
                <View className="flex-row gap-2.5">
                  <Ionicons name="alert-circle-outline" size={18} color="#fbbf24" style={{marginTop: 1}} />
                  <Text className="flex-1 text-zinc-200 text-[15px] leading-6">{idea.safety_note}</Text>
                </View>
              ) : null}
              {needsSafetyLine(idea) && (
                <Text className="text-zinc-500 text-xs leading-5">{SAFETY_DISCLAIMER}</Text>
              )}
            </View>
          )}

          {/* VENUE & MAP */}
          {idea.modality === "GO_OUT" && idea.venues && (
            <View className="mb-8">
              <Text className="text-xl font-bold text-white mb-4">
                Location
              </Text>
              {/* TAPPING THIS CARD OPENS THE FULL INTERACTIVE MAP MODAL */}
              <Pressable
                onPress={handleOpenMap}
                className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden active:opacity-90"
              >
                <View className="p-5 border-b border-zinc-800 flex-row justify-between items-center">
                  <View className="flex-1 mr-3">
                    <Text className="text-white font-bold text-lg">
                      {idea.venues.name}
                    </Text>
                    {idea.venues.address ? (
                      <Text className="text-zinc-400 mt-1">
                        {idea.venues.address}
                      </Text>
                    ) : null}
                    {/* A community-added place (#78): who put it on the map */}
                    {idea.venues.pinned_by?.username ? (
                      <Text className="text-zinc-500 text-xs mt-1.5">
                        Pinned by @{idea.venues.pinned_by.username}
                      </Text>
                    ) : null}
                    {/* You added this place and it's still private: change its name,
                        directions or hours (#6). Once anything here is published,
                        changes are suggested and checked (#10) */}
                    {myUserId && idea.venues.created_by === myUserId && idea.visibility !== "PUBLISHED" ? (
                      <Pressable
                        onPress={() =>
                          setEditingPlace({
                            venueId: idea.venues.venue_id,
                            name: idea.venues.name,
                            accessNote: idea.venues.access_note ?? null,
                            openingHours: idea.venues.opening_hours ?? null,
                          })
                        }
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Edit this place"
                        className="flex-row items-center gap-1 self-start mt-2 active:opacity-70"
                      >
                        <Ionicons name="pencil-outline" size={13} color="#60a5fa" />
                        <Text className="text-blue-400 text-sm font-semibold">Edit place</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View className="w-10 h-10 rounded-full bg-zinc-800 items-center justify-center border border-zinc-700">
                    <Ionicons name="expand-outline" size={18} color="#FF9D0A" />
                  </View>
                </View>

                {/* How to get there (places that aren't on any map) */}
                {idea.venues.access_note ? (
                  <View className="px-5 py-4 border-b border-zinc-800 flex-row gap-2.5">
                    <Ionicons name="trail-sign-outline" size={16} color="#FF9D0A" style={{marginTop: 2}} />
                    <Text className="flex-1 text-zinc-300 text-sm leading-5">{idea.venues.access_note}</Text>
                  </View>
                ) : null}

                {coords && (
                  <View className="h-48 w-full pointer-events-none">
                    <MapView
                      style={{flex: 1}}
                      initialRegion={{
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }}
                      userInterfaceStyle="dark"
                      pitchEnabled={false}
                      scrollEnabled={false}
                    >
                      <Marker coordinate={coords} pinColor="#FF9D0A" />
                    </MapView>
                  </View>
                )}
              </Pressable>
              {/* Outdoor places: keep them the way you found them (#78) */}
              {idea.environment === "OUTDOOR" && (
                <View className="flex-row gap-2.5 mt-3 px-1">
                  <Ionicons name="leaf-outline" size={15} color="#4ade80" style={{marginTop: 1}} />
                  <Text className="flex-1 text-zinc-400 text-xs leading-5">
                    Leave no trace: pack out what you bring, stay on the trail, and leave it the way you found it.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* TAGS */}
          {idea.activity_tags && idea.activity_tags.length > 0 && (
            <View className="mb-8">
              <Text className="text-xl font-bold text-white mb-4">
                Vibe & Tags
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {idea.activity_tags.map((join: any, index: number) => (
                  <View
                    key={index}
                    className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-full"
                  >
                    <Text className="text-zinc-300 font-medium">
                      {join.tags?.name ? tagLabel(join.tags.name) : null}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </Animated.ScrollView>
      {/* BACK BUTTON (Stays totally still while the image zooms!) */}
      <View className="absolute top-15 left-4 z-50">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="active:opacity-70"
        >
          <GlassSurface style={styles.glassButton}>
            <Ionicons name="chevron-back" size={24} color="white" />
          </GlassSurface>
        </Pressable>
      </View>

      {/* TOP RIGHT: save, then edit (your own ideas) or ••• (anyone else's)
          in the corner */}
      <View className="absolute top-15 right-4 z-50 flex-row gap-2">
        <SaveButton ideaId={idea.idea_id} size={44} variant="glass" />
        {isMine ? (
          <Pressable
            onPress={editIdea}
            accessibilityRole="button"
            accessibilityLabel="Edit idea"
            className="active:opacity-70"
          >
            <GlassSurface style={styles.glassButton}>
              {/* Plain pencil: "create-outline" (pencil + square) is lopsided
                  and reads off-center even when it's centered */}
              <Ionicons name="pencil-outline" size={20} color="white" />
            </GlassSurface>
          </Pressable>
        ) : (
          // Someone else's idea: a menu (Report for now; Share fits here later)
          <Pressable
            onPress={() =>
              // After "Not interested", leave: it's gone from Discover
              showIdeaMenu(idea.idea_id, {
                onHidden: () => router.back(),
                creator: idea.user_id ? {id: idea.user_id, username: idea.users?.username ?? null} : null,
                onReview:
                  staffRole && staffToolsOn && !showReview
                    ? () => router.setParams({review: "1"})
                    : undefined,
              })
            }
            accessibilityRole="button"
            accessibilityLabel="More options"
            className="active:opacity-70"
          >
            <GlassSurface style={styles.glassButton}>
              <Ionicons name="ellipsis-horizontal" size={20} color="white" />
            </GlassSurface>
          </Pressable>
        )}
      </View>

      {/* PLAN A DATE WITH THIS (or, from the builder, ADD TO PLAN): the
          page's main action, pinned to the bottom */}
      {canPlan && (!fromBuilder || add === "1") && (
      <View
        pointerEvents="box-none"
        style={{position: "absolute", left: 0, right: 0, bottom: 0}}
      >
        <LinearGradient
          pointerEvents="none"
          colors={["transparent", "rgba(0,0,0,0.85)", "#000"]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{paddingHorizontal: 20, paddingTop: 28, paddingBottom: insets.bottom + 12}}>
          {fromBuilder ? (
            <Pressable
              onPress={() => {
                // The builder adds it (in its best spot) when it's back on screen
                requestAdd(idea.idea_id);
                router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel="Add to your plan"
              className="bg-white rounded-full flex-row items-center justify-center gap-2 active:opacity-80"
              style={{height: 56}}
            >
              <Ionicons name="add" size={22} color="black" />
              <Text className="text-black font-extrabold text-lg">Add to plan</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={planWithThis}
              accessibilityRole="button"
              accessibilityLabel="Plan a date with this idea"
              className="bg-white rounded-full flex-row items-center justify-center gap-2 active:opacity-80"
              style={{height: 56}}
            >
              <Ionicons name="calendar" size={20} color="black" />
              <Text className="text-black font-extrabold text-lg">Plan a date with this</Text>
            </Pressable>
          )}
        </View>
      </View>
      )}

      {/* EDIT A PLACE YOU ADDED */}
      <EditPlaceSheet
        place={editingPlace}
        onClose={() => setEditingPlace(null)}
        onSaved={(saved) => {
          setIdea((prev: any) =>
            prev
              ? {
                  ...prev,
                  venues: {
                    ...prev.venues,
                    name: saved.name,
                    access_note: saved.accessNote,
                    opening_hours: saved.openingHours,
                    hours_checked_at: saved.hoursCheckedAt,
                  },
                }
              : prev,
          );
          setEditingPlace(null);
        }}
      />

      {/* FULL-SCREEN INTERACTIVE MAP MODAL */}
      <Modal
        visible={isMapModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsMapModalVisible(false)}
      >
        <View className="flex-1 bg-black">
          {/* 1. Full-Bleed Map */}
          {coords && (
            <MapView
              style={{flex: 1}}
              initialRegion={{
                latitude: coords.latitude,
                longitude: coords.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }}
              userInterfaceStyle="dark"
              showsUserLocation={hasPermission}
              showsMyLocationButton={true}
            >
              <Marker
                coordinate={coords}
                pinColor="#FF9D0A"
                title={idea.venues.name}
              />
            </MapView>
          )}

          {/* 2. Top Gesture / Grab Zone */}
          <View className="absolute top-0 left-0 right-0 h-20 pt-5 items-center z-40">
            {/* Soft transparent gradient so the bar and button stay visible */}
            <LinearGradient
              colors={["rgba(0,0,0,0.65)", "transparent"]}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "100%",
              }}
              pointerEvents="none"
            />

            {/* iOS Sheet Grabber Bar */}
            <View className="w-10 h-1.5 rounded-full bg-white/40" />

            {/* Close Button */}
            <Pressable
              onPress={() => setIsMapModalVisible(false)}
              className="absolute right-5 top-5 w-9 h-9 rounded-full bg-zinc-900/70 backdrop-blur-xl items-center justify-center border border-white/15 active:opacity-75"
            >
              <Ionicons name="close" size={20} color="white" />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// The top buttons: tinted Liquid Glass circles, like the tab headers'
// (GlassSurface takes style, not className)
const styles = StyleSheet.create({
  glassButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
