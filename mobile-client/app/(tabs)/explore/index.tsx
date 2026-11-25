import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { IMAGE_SIZE, sizedImage } from "@/src/lib/images";
import { ideaTile } from "@/src/lib/ideaTiles";
import {
  Pressable,
  View,
  Text,
  Animated,
  StatusBar,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import { useRouter, useFocusEffect } from "expo-router";
import MapView, { Marker, type Region } from "react-native-maps";
import type { LatLng } from "@/utils/timeline";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGreeting } from "@/components/home/Greeting";
import { newSeed } from "@/src/lib/random";
import SaveButton from "@/components/ideas/SaveButton";
import { useUnseenCount } from "@/src/store/useNotificationStore";
import { useHiddenStore } from "@/src/store/useHiddenStore";
import { useBlockStore } from "@/src/store/useBlockStore";
import TabHeader, {
  HeaderIconButton,
  useTabHeader,
  useTabRefresh,
} from "@/components/ui/TabHeader";
import { supabase } from "@/src/supabase";
import { LinearGradient } from "expo-linear-gradient";
import { useLocationStore } from "@/src/store/useLocationStore";
import { getDistance } from "@/utils/geo";
import { toPlanningDefaults } from "@/src/lib/profile";
import GlassSurface from "@/components/ui/GlassSurface";
import Avatar from "@/components/profile/Avatar";
import type { PublicProfile } from "@/types/profile";
import { useProfileStore } from "@/src/store/useProfileStore";
import { IDEA_STATUS } from "@/src/lib/ideas";
import { useStaffStore } from "@/src/store/useStaffStore";
import type { IdeaVisibility } from "@/types/ideas";
import { formatMoney } from "@/utils/money";

// Shape for the map's floating preview card (GlassSurface takes style, not className)
const glassStyles = StyleSheet.create({
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 24,
  },
});

// --- TYPES & CONSTANTS ---
interface DateIdea {
  idea_id: number;
  /** The creator (blocked creators' ideas stay out, #76) */
  user_id?: string | null;
  title: string;
  /** Your own ideas show here at any stage but "not approved" */
  visibility: IdeaVisibility;
  modality: "STAY_IN" | "GO_OUT";
  est_price_per_person: string | number;
  creator_username: string | null;
  creator: PublicProfile | null;
  latitude?: number | null;
  longitude?: number | null;
  image_urls: string[];
  image_url?: string;
  venues?: {
    name: string;
    address: string;
    coordinates: string | null;
  } | null;
}

/** The card's pills: the same see-through dark circle as the save button */
const CARD_PILL = {
  backgroundColor: "rgba(0,0,0,0.65)",
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(255,255,255,0.3)",
} as const;

const formatPrice = (priceString: string | number): string => {
  const price =
    typeof priceString === "number" ? priceString : parseFloat(priceString);
  return isNaN(price) || price === 0 ? "Free" : formatMoney(price);
};

// PostGIS EWKB Hex Parser
const parseCoordinates = (hex: string | null | undefined) => {
  if (!hex || typeof hex !== "string" || hex.length < 25) return null;
  try {
    const buffer = new Uint8Array(
      hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    const view = new DataView(buffer.buffer);
    const littleEndian = buffer[0] === 1;
    const longitude = view.getFloat64(9, littleEndian);
    const latitude = view.getFloat64(17, littleEndian);

    if (isNaN(longitude) || isNaN(latitude)) return null;
    return { longitude, latitude };
  } catch {
    return null;
  }
};

// --- PAGES ---
/** Ideas per page of the list */
const PAGE = 20;
/** Coming back to the tab reloads what you'd scrolled through, up to this many */
const MAX_RELOAD = 200;
/** The most places the map shows for the area on screen (nearest its middle) */
const MAP_LIMIT = 300;
/** Moving this far (or changing your home area) starts the list over */
const REFETCH_MILES = 5;

/** What a card needs: the idea, its place, its tags and who shared it */
const IDEA_COLUMNS = `
  *,
  venues ( name, address, coordinates ),
  activity_tags ( tags ( name ) ),
  users!activities_user_id_fkey ( username, profile_image_url )
`;

/** A row as the cards and pins use it */
const toIdea = (row: any): DateIdea => {
  const parsed = parseCoordinates(row.venues?.coordinates);
  return {
    ...row,
    creator_username: row.users?.username || null,
    creator: row.users ?? null,
    latitude: parsed ? parsed.latitude : null,
    longitude: parsed ? parsed.longitude : null,
  };
};

// --- BASE FROZEN PRICE PIN ---
// Locks texture after initial 400ms mount to guarantee sibling pins never vanish
interface PricePinProps {
  item: DateIdea;
  onSelect: (item: DateIdea) => void;
}

const PricePin = React.memo(
  function PricePin({ item, onSelect }: PricePinProps) {
    const [tracksViewChanges, setTracksViewChanges] = useState(true);

    useEffect(() => {
      const timer = setTimeout(() => {
        setTracksViewChanges(false);
      }, 400);
      return () => clearTimeout(timer);
    }, []);

    return (
      <Marker
        coordinate={{
          latitude: item.latitude!,
          longitude: item.longitude!,
        }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={tracksViewChanges}
        onPress={() => onSelect(item)}
      >
        <View
          style={{
            backgroundColor: "#18181b",
            borderColor: "#3f3f46",
            borderWidth: 2,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 9999,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.4,
            shadowRadius: 4,
            elevation: 4,
          }}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 12,
              fontWeight: "900",
            }}
          >
            {formatPrice(item.est_price_per_person)}
          </Text>
        </View>
      </Marker>
    );
  },
  (prev, next) =>
    prev.item.idea_id === next.item.idea_id &&
    prev.item.est_price_per_person === next.item.est_price_per_person &&
    prev.item.latitude === next.item.latitude &&
    prev.item.longitude === next.item.longitude,
);

// --- SKELETON COMPONENT ---
const SkeletonIdea = () => (
  <View className="mb-6 h-80 w-full rounded-3xl bg-zinc-900 border border-zinc-800 overflow-hidden">
    <View className="flex-1 bg-zinc-800/30" />
    <View className="absolute bottom-0 w-full p-5 bg-black/40">
      <View className="h-6 w-3/4 bg-zinc-700/50 rounded-md mb-3" />
      <View className="h-4 w-1/3 bg-zinc-800/50 rounded-md" />
    </View>
  </View>
);

export default function ExploreScreen() {
  const router = useRouter();
  // Staff tools on (#26): flag reported ideas on their cards
  const reportedIdeas = useStaffStore((s) =>
    s.role && s.toolsOn ? s.reportedIdeas : null,
  );
  const insets = useSafeAreaInsets();
  const header = useTabHeader({ eyebrow: true });
  // iOS: the screen runs under the floating tab bar, whose height is in the
  // bottom safe-area inset. Android: the screen already ends above the bar.
  const floatingBottom = Platform.OS === "ios" ? insets.bottom + 12 : 24;
  const greeting = useGreeting();
  const unseenCount = useUnseenCount();

  // --- ZUSTAND LOCATION STORE ---
  const { hasPermission, userLocation, requestLocation } = useLocationStore();

  // --- STATE & REFS ---
  const lastMarkerPress = useRef(0);
  // The list, a page at a time (explore_ideas: what you may see, within
  // reach, shuffled by a seed), and the map's places in the area on screen
  // (map_ideas). Hidden and blocked are filtered by the server too; here
  // they also drop out right away (and come back on undo)
  const [allIdeas, setIdeas] = useState<DateIdea[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Rows the server has given for this shuffle (the next page starts here) */
  const fetched = useRef(0);
  const [mapPlaces, setMapPlaces] = useState<DateIdea[]>([]);
  /** Go-out ideas anywhere, and within reach ("Nothing near you yet") */
  const [reach, setReach] = useState<{
    anywhere: boolean;
    near: boolean;
  } | null>(null);
  const hiddenIds = useHiddenStore((s) => s.ids);
  const blockedIds = useBlockStore((s) => s.ids);
  const notHidden = useCallback(
    (idea: DateIdea) =>
      !hiddenIds.has(idea.idea_id) &&
      !(idea.user_id && blockedIds.has(idea.user_id)),
    [hiddenIds, blockedIds],
  );
  // The map shows every place in the area on screen: you pan to where you're
  // going (a road trip)
  const mapIdeas = useMemo(
    () => mapPlaces.filter(notHidden),
    [mapPlaces, notHidden],
  );
  // The list: go-out ideas near you or your home area; stay-in ideas
  // everywhere (utils/reach.ts, applied by the server). Your own ideas always
  // show: this is where you see them
  const preferences = useProfileStore((s) => s.preferences);
  const homeArea = useMemo(() => {
    const { home_lat, home_lng } = toPlanningDefaults(preferences);
    return home_lat != null && home_lng != null
      ? { latitude: home_lat, longitude: home_lng }
      : null;
  }, [preferences]);
  const ideas = useMemo(
    () => allIdeas.filter(notHidden),
    [allIdeas, notHidden],
  );
  // There are places to go, just none near you (Venture isn't in your city yet)
  const nothingNearby =
    (userLocation != null || homeArea != null) &&
    !!reach?.anywhere &&
    !reach.near;
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<DateIdea | null>(null);

  // Request location quietly on mount
  useEffect(() => {
    requestLocation();
  }, []);

  // The shuffle order for the list. Picked when the screen opens and kept
  // while you move around the app (the list refetches every time you come
  // back to the tab); only pull-to-refresh picks a new one.
  const shuffleSeed = useRef(newSeed());

  // Bumped whenever a newer fetch starts, so a slow older one can't
  // overwrite fresher results (or update the screen after it's left)
  const fetchGeneration = useRef(0);

  // Where reach is measured from, as last fetched (moving far refetches)
  const fetchedFrom = useRef<{
    here: LatLng | null;
    home: LatLng | null;
  } | null>(null);
  const centerArgs = () => ({
    p_lat: userLocation?.latitude ?? null,
    p_lng: userLocation?.longitude ?? null,
    p_home_lat: homeArea?.latitude ?? null,
    p_home_lng: homeArea?.longitude ?? null,
  });

  /** One page of the list (`offset`: rows already given for this shuffle) */
  const fetchPage = (offset: number, limit: number) =>
    supabase
      .rpc("explore_ideas", {
        p_seed: shuffleSeed.current,
        ...centerArgs(),
        p_limit: limit,
        p_offset: offset,
      })
      .select(IDEA_COLUMNS);

  // `quiet`: pull-to-refresh shows its own spinner, so skip the loading state.
  // `keep`: coming back to the tab reloads as many as you'd scrolled through
  // (so the list doesn't jump back to its first page)
  const fetchIdeas = async ({ quiet = false, keep = false } = {}) => {
    const generation = ++fetchGeneration.current;
    if (!quiet) setIsLoading(true);
    setError(null);
    fetchedFrom.current = { here: userLocation ?? null, home: homeArea };

    const limit = keep
      ? Math.min(MAX_RELOAD, Math.max(PAGE, fetched.current))
      : PAGE;
    const [{ data, error: supabaseError }, reachResult] = await Promise.all([
      fetchPage(0, limit),
      supabase.rpc("explore_reach", centerArgs()),
    ]);

    if (generation !== fetchGeneration.current) return;

    if (supabaseError) {
      console.error("Explore fetch error:", supabaseError);
      setError("Failed to load date ideas.");
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as any[];
    fetched.current = rows.length;
    setHasMore(rows.length === limit);
    setIdeas(rows.map(toIdea));
    if (!reachResult.error)
      setReach(reachResult.data as { anywhere: boolean; near: boolean });
    setIsLoading(false);
    setIsInitialLoad(false);
  };

  /** The next page, as you near the end of the list */
  const loadMore = async () => {
    if (!hasMore || loadingMore || isLoading) return;
    const generation = fetchGeneration.current;
    setLoadingMore(true);
    const { data, error: pageError } = await fetchPage(fetched.current, PAGE);
    setLoadingMore(false);
    // (a refresh started meanwhile: its pages win)
    if (generation !== fetchGeneration.current || pageError) return;
    const rows = (data ?? []) as any[];
    fetched.current += rows.length;
    setHasMore(rows.length === PAGE);
    setIdeas((prev) => {
      const seen = new Set(prev.map((idea) => idea.idea_id));
      return [
        ...prev,
        ...rows.map(toIdea).filter((idea) => !seen.has(idea.idea_id)),
      ];
    });
  };

  // Every time the tab comes back (it may have changed meanwhile)
  const refetchOnFocus = useRef(fetchIdeas);
  useEffect(() => {
    refetchOnFocus.current = fetchIdeas;
  });
  useFocusEffect(
    useCallback(() => {
      refetchOnFocus.current({ quiet: fetched.current > 0, keep: true });
      return () => {
        // Leaving the tab: ignore whatever is still in flight
        fetchGeneration.current++;
      };
    }, []),
  );

  // Your location arrives (or you move far, or change your home area): what's
  // within reach changed, so the list starts over from there
  useEffect(() => {
    const last = fetchedFrom.current;
    if (!last) return;
    const moved = (a: LatLng | null, b: LatLng | null) =>
      (a == null) !== (b == null) ||
      (a != null && b != null && getDistance(a, b) > REFETCH_MILES);
    if (moved(last.here, userLocation ?? null) || moved(last.home, homeArea))
      refetchOnFocus.current({ quiet: true });
  }, [userLocation, homeArea]);

  // Pull-to-refresh: new shuffle, so you get a fresh set of options up top
  const refresh = useTabRefresh(() => {
    shuffleSeed.current = newSeed();
    return fetchIdeas({ quiet: true });
  });

  // The map: the places in the area on screen (once it settles after a move)
  const mapStart = useMemo(
    () => ({
      latitude: userLocation?.latitude ?? homeArea?.latitude ?? 40.2312,
      longitude: userLocation?.longitude ?? homeArea?.longitude ?? -111.6614,
      latitudeDelta: 0.15,
      longitudeDelta: 0.15,
    }),
    // (where it opens: not moved by later location updates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewMode],
  );
  const mapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapGeneration = useRef(0);
  const loadMapArea = (region: Region) => {
    if (mapTimer.current) clearTimeout(mapTimer.current);
    mapTimer.current = setTimeout(async () => {
      const generation = ++mapGeneration.current;
      const { data, error: mapError } = await supabase
        .rpc("map_ideas", {
          p_min_lat: region.latitude - region.latitudeDelta / 2,
          p_min_lng: region.longitude - region.longitudeDelta / 2,
          p_max_lat: region.latitude + region.latitudeDelta / 2,
          p_max_lng: region.longitude + region.longitudeDelta / 2,
          p_limit: MAP_LIMIT,
        })
        .select(IDEA_COLUMNS);
      if (generation !== mapGeneration.current || mapError) return;
      setMapPlaces(((data ?? []) as any[]).map(toIdea));
    }, 250);
  };
  useEffect(
    () => () => {
      if (mapTimer.current) clearTimeout(mapTimer.current);
    },
    [],
  );

  const toggleViewMode = () => {
    const nextMode = viewMode === "list" ? "map" : "list";
    if (nextMode === "map" && !hasPermission) {
      requestLocation();
    }
    if (nextMode === "map") {
      setSelectedIdea(null);
    }
    setViewMode(nextMode);
  };

  const handleSelectPin = useCallback((item: DateIdea) => {
    lastMarkerPress.current = Date.now();
    setSelectedIdea(item);
  }, []);

  // --- UI COMPONENTS ---
  // How far a go-out idea is from you ("2.3 mi"); "Go out" without your location
  const whereLabel = (item: DateIdea): string => {
    if (!userLocation || item.latitude == null || item.longitude == null)
      return "Go out";
    const miles = getDistance(userLocation, {
      latitude: item.latitude,
      longitude: item.longitude,
    });
    if (miles < 0.2) return "Nearby";
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  };

  const renderIdeaItem = ({ item }: { item: DateIdea }) => {
    // Its photo, or its kind's tile (src/lib/ideaTiles.ts)
    const photo = item.image_urls?.[0] || item.image_url;
    const displayImage = photo
      ? sizedImage(photo, IMAGE_SIZE.full)
      : ideaTile(item);

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/(tabs)/explore/detail/[id]",
            params: { id: item.idea_id.toString() },
          })
        }
        className="mb-6 active:opacity-95 shadow-xl shadow-black"
      >
        <View className="h-80 w-full rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 relative">
          <Image
            source={displayImage}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.9)"]}
            locations={[0.5, 1]}
            style={{ position: "absolute", width: "100%", height: "100%" }}
          />

          {/* Price, how far (or at home), and for your own unpublished ideas a
              status icon: same height, same look as the save button */}
          <View className="absolute top-4 left-4 flex-row items-center gap-2">
            <View
              className="h-7 justify-center px-3 rounded-full"
              style={CARD_PILL}
            >
              <Text className="text-white font-bold text-xs">
                {formatPrice(item.est_price_per_person)}
              </Text>
            </View>

            {/* Where: stay-in ideas are at home; go-out ones say how far */}
            <View
              className="h-7 flex-row items-center gap-1 px-3 rounded-full"
              style={CARD_PILL}
              accessible
              accessibilityLabel={
                item.modality === "STAY_IN"
                  ? "Stay in, at home"
                  : `Go out, ${whereLabel(item)}`
              }
            >
              <Ionicons
                name={item.modality === "STAY_IN" ? "home" : "navigate"}
                size={11}
                color={item.modality === "STAY_IN" ? "#fbbf24" : "#34d399"}
              />
              <Text className="text-white font-bold text-xs">
                {item.modality === "STAY_IN" ? "Home" : whereLabel(item)}
              </Text>
            </View>

            {/* Yours and not public: a small icon in the same row (only you see
                this card), out of the way of the photo */}
            {item.visibility !== "PUBLISHED" &&
              IDEA_STATUS[item.visibility] && (
                <View
                  className="h-7 w-7 items-center justify-center rounded-full"
                  style={CARD_PILL}
                  accessible
                  accessibilityLabel={
                    item.visibility === "PRIVATE"
                      ? "Only you can see this"
                      : `${IDEA_STATUS[item.visibility].label}. Only you can see this`
                  }
                >
                  <Ionicons
                    name={IDEA_STATUS[item.visibility].icon}
                    size={13}
                    color={IDEA_STATUS[item.visibility].color}
                    // (the glyphs sit a hair left of their box)
                    style={{ marginLeft: 1 }}
                  />
                </View>
              )}

            {/* Staff tools on: open reports on this idea */}
            {reportedIdeas?.get(item.idea_id) ? (
              <View
                className="h-7 flex-row items-center gap-1 px-2.5 rounded-full"
                style={CARD_PILL}
                accessible
                accessibilityLabel={`${reportedIdeas.get(item.idea_id)} open reports`}
              >
                <Ionicons name="flag" size={11} color="#f87171" />
                <Text className="text-white font-bold text-xs">
                  {reportedIdeas.get(item.idea_id)}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="absolute top-4 right-4">
            <SaveButton ideaId={item.idea_id} />
          </View>

          <View className="absolute bottom-0 w-full p-5">
            <View className="flex-row justify-between items-end">
              <View className="flex-1 pr-4">
                <Text className="text-2xl font-extrabold text-white mb-1 shadow-black drop-shadow-md">
                  {item.title}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <Avatar profile={item.creator} size={24} small />
                  <Text className="text-zinc-300 text-sm font-medium">
                    {item.creator_username
                      ? `By @${item.creator_username}`
                      : "Shared by a Venture member"}
                  </Text>
                </View>
              </View>
              {/* No star rating until there are real ones (#19) */}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  // A fresh list starts at the top, so the header should too
  const { reset: resetHeader } = header;
  const showingSkeleton = isLoading && isInitialLoad;
  useEffect(() => {
    resetHeader();
  }, [viewMode, showingSkeleton, resetHeader]);

  // Above the list when nothing to go out to is near you: the stay-in ideas
  // below still work, and you can be the one to add a place
  const renderNothingNearby = () => (
    <View className="mb-6 flex-row gap-3 p-4 rounded-3xl bg-zinc-900 border border-zinc-800">
      <Ionicons
        name="home"
        size={18}
        color="#fbbf24"
        style={{ marginTop: 1 }}
      />
      <View className="flex-1">
        <Text className="text-white font-bold text-base">
          No places near you yet
        </Text>
        <Text className="text-zinc-400 text-sm mt-1 leading-5">
          Venture is starting in Provo and Salt Lake City. Until it reaches you,
          these stay-in ideas work anywhere.
        </Text>
        <Pressable
          onPress={() => router.push("/create")}
          accessibilityRole="button"
          className="self-start mt-3 active:opacity-70"
          hitSlop={8}
        >
          <Text className="text-amber-400 font-semibold text-sm">
            Share a place you love
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderEmptyState = () => {
    if (isLoading) return null;
    return (
      <View className="flex-1 justify-center items-center py-20">
        <View className="bg-zinc-900 p-6 rounded-full mb-4 border border-zinc-800">
          <Ionicons name="search-outline" size={32} color="#71717a" />
        </View>
        <Text className="text-xl font-bold text-zinc-300 mt-2">
          No Ideas Found
        </Text>
        <Text className="text-zinc-500 mt-2 text-center px-10">
          Try adjusting your filters or checking back soon.
        </Text>
      </View>
    );
  };

  // --- HEADER ---
  const renderHeader = (floating: boolean) => (
    <TabHeader
      header={header}
      title="Discover"
      eyebrow={greeting}
      // Floating over the map or an error there's nothing to scroll, so it
      // stays in the slim bar
      floating={floating}
      collapsed={floating}
      refreshing={refresh.headerSpinner}
      right={
        <>
          <HeaderIconButton
            icon="search"
            label="Search ideas"
            onPress={() => router.push("/search")}
          />
          {!error && (
            <HeaderIconButton
              icon={viewMode === "list" ? "map-outline" : "list"}
              label={viewMode === "list" ? "Show map" : "Show list"}
              onPress={toggleViewMode}
            />
          )}
          <HeaderIconButton
            icon="add"
            label="Share an idea"
            onPress={() => router.push("/create")}
          />
          <HeaderIconButton
            icon={unseenCount > 0 ? "notifications" : "notifications-outline"}
            label={
              unseenCount > 0
                ? `Notifications, ${unseenCount} new`
                : "Notifications"
            }
            onPress={() => router.push("/notifications")}
            badgeColor={unseenCount > 0 ? "#f59e0b" : undefined}
          />
        </>
      }
    />
  );

  // List: the list is the screen's ROOT view (a Fragment adds no view), so
  // iOS can find it for the tab bar's shrink-on-scroll (see TabHeader.tsx).
  // The header is the list's first, sticky child.
  if (!error && viewMode === "list") {
    return (
      <>
        <StatusBar barStyle="light-content" />
        {isLoading && isInitialLoad ? (
          <Animated.ScrollView
            {...header.scrollProps}
            style={{ flex: 1, backgroundColor: "#000" }}
            contentContainerStyle={{ paddingBottom: 96 }}
            showsVerticalScrollIndicator={false}
          >
            {renderHeader(false)}
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              {[1, 2, 3].map((i) => (
                <SkeletonIdea key={i} />
              ))}
            </View>
          </Animated.ScrollView>
        ) : (
          <Animated.FlatList
            {...header.scrollProps}
            style={{ flex: 1, backgroundColor: "#000" }}
            ListHeaderComponent={renderHeader(false)}
            data={ideas}
            keyExtractor={(item) => `idea-${item.idea_id}`}
            renderItem={(info) => (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingTop: info.index === 0 ? 8 : 0,
                }}
              >
                {info.index === 0 && nothingNearby && renderNothingNearby()}
                {renderIdeaItem(info)}
              </View>
            )}
            ListEmptyComponent={renderEmptyState}
            refreshControl={refresh.control}
            // The next page as you near the end
            onEndReached={loadMore}
            onEndReachedThreshold={0.6}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator
                  color="#FF9D0A"
                  style={{ marginVertical: 24 }}
                />
              ) : undefined
            }
            contentContainerStyle={{ paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </>
    );
  }

  // Map (or an error): nothing to scroll, so the header floats on top
  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" />
      {error ? (
        <View className="flex-1 justify-center items-center p-4">
          <Ionicons
            name="alert-circle"
            size={48}
            color="#ef4444"
            className="mb-4"
          />
          <Text className="text-red-400 font-bold mb-6">{error}</Text>
          <Pressable
            onPress={() => fetchIdeas()}
            className="bg-red-500/20 px-8 py-3 rounded-full border border-red-500/30"
          >
            <Text className="text-red-300 font-bold">Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-1">
          <MapView
            style={{ flex: 1 }}
            initialRegion={mapStart}
            userInterfaceStyle="dark"
            showsUserLocation={hasPermission}
            showsMyLocationButton={hasPermission}
            // The places in the area on screen (as it opens, and after each move)
            onMapReady={() => loadMapArea(mapStart)}
            onRegionChangeComplete={loadMapArea}
            onPress={() => {
              if (Date.now() - lastMarkerPress.current < 250) return;
              setSelectedIdea(null);
            }}
          >
            {/* 1. Base markers (dim gray border, frozen in GPU memory) */}
            {mapIdeas
              .filter(
                (i) => i.latitude && i.longitude && i.modality === "GO_OUT",
              )
              .map((item) => (
                <PricePin
                  key={`pin-${item.idea_id}`}
                  item={item}
                  onSelect={handleSelectPin}
                />
              ))}

            {/* 2. Active overlay pin (pure white border, dark background, elevated zIndex) */}
            {selectedIdea?.latitude && selectedIdea?.longitude && (
              <Marker
                key={`active-white-border-${selectedIdea.idea_id}`}
                coordinate={{
                  latitude: selectedIdea.latitude,
                  longitude: selectedIdea.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={999}
                tracksViewChanges={true}
                onPress={() => {
                  lastMarkerPress.current = Date.now();
                  setSelectedIdea(null);
                }}
              >
                <View
                  style={{
                    backgroundColor: "#18181b",
                    borderColor: "#FFFFFF",
                    borderWidth: 2,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 9999,
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.6,
                    shadowRadius: 5,
                    elevation: 8,
                  }}
                >
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 12,
                      fontWeight: "900",
                    }}
                  >
                    {formatPrice(selectedIdea.est_price_per_person)}
                  </Text>
                </View>
              </Marker>
            )}
          </MapView>

          {/* FLOATING AIRBNB-STYLE PREVIEW CARD */}
          {selectedIdea && (
            <View
              className="absolute left-4 right-4 z-40"
              style={{ bottom: floatingBottom }}
            >
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/explore/detail/[id]",
                    params: { id: selectedIdea.idea_id.toString() },
                  })
                }
                className="active:opacity-90"
              >
                <GlassSurface style={glassStyles.previewCard}>
                  <Image
                    source={
                      selectedIdea.image_urls?.[0] || selectedIdea.image_url
                        ? sizedImage(
                            selectedIdea.image_urls?.[0] ||
                              selectedIdea.image_url,
                            84,
                          )
                        : ideaTile(selectedIdea)
                    }
                    style={{ width: 84, height: 84, borderRadius: 18 }}
                    contentFit="cover"
                  />

                  <View className="flex-1 ml-3.5 pr-6">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Text className="text-amber-400 font-bold text-xs">
                        {formatPrice(selectedIdea.est_price_per_person)}
                      </Text>
                      <Text className="text-zinc-500 text-xs">•</Text>
                      <Text className="text-zinc-400 font-medium text-xs uppercase tracking-wider">
                        {selectedIdea.modality.replace("_", " ")}
                      </Text>
                    </View>

                    <Text
                      numberOfLines={1}
                      className="text-white font-bold text-base mb-1"
                    >
                      {selectedIdea.title}
                    </Text>

                    {/* No star rating until there are real ones (#19) */}
                    <Text className="text-zinc-500 text-xs">
                      {selectedIdea.creator_username
                        ? `@${selectedIdea.creator_username}`
                        : "A Venture member"}
                    </Text>
                  </View>

                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      setSelectedIdea(null);
                    }}
                    hitSlop={8}
                    accessibilityLabel="Close preview"
                    className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/10 items-center justify-center border border-white/15 active:opacity-70"
                  >
                    <Ionicons name="close" size={16} color="#d4d4d8" />
                  </Pressable>
                </GlassSurface>
              </Pressable>
            </View>
          )}

          {isLoading && (
            <View className="absolute inset-0 bg-black/40 justify-center items-center">
              <ActivityIndicator size="large" color="#FF9D0A" />
            </View>
          )}
        </View>
      )}
      {renderHeader(true)}
    </View>
  );
}
