import React, {useRef, useState, useEffect, useCallback, useMemo} from "react";
import {IMAGE_SIZE, sizedImage} from "@/src/lib/images";
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
import {Image} from "expo-image";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import {useRouter, useFocusEffect} from "expo-router";
import MapView, {Marker} from "react-native-maps";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useGreeting} from "@/components/home/Greeting";
import {newSeed, seededShuffle} from "@/src/lib/random";
import SaveButton from "@/components/ideas/SaveButton";
import {useUnseenCount} from "@/src/store/useNotificationStore";
import {useHiddenStore} from "@/src/store/useHiddenStore";
import {useBlockStore} from "@/src/store/useBlockStore";
import TabHeader, {
  HeaderIconButton,
  useTabHeader,
  useTabRefresh,
} from "@/components/ui/TabHeader";
import {supabase} from "@/src/supabase";
import {LinearGradient} from "expo-linear-gradient";
import {useLocationStore} from "@/src/store/useLocationStore";
import {getDistance} from "@/utils/geo";
import GlassSurface from "@/components/ui/GlassSurface";
import Avatar from "@/components/profile/Avatar";
import type {PublicProfile} from "@/types/profile";
import {useProfileStore} from "@/src/store/useProfileStore";
import {IDEA_STATUS} from "@/src/lib/ideas";
import {useStaffStore} from "@/src/store/useStaffStore";
import type {IdeaVisibility} from "@/types/ideas";
import {formatMoney} from "@/utils/money";

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
    return {longitude, latitude};
  } catch {
    return null;
  }
};

// --- BASE FROZEN PRICE PIN ---
// Locks texture after initial 400ms mount to guarantee sibling pins never vanish
interface PricePinProps {
  item: DateIdea;
  onSelect: (item: DateIdea) => void;
}

const PricePin = React.memo(
  function PricePin({item, onSelect}: PricePinProps) {
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
        anchor={{x: 0.5, y: 0.5}}
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
            shadowOffset: {width: 0, height: 2},
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
  const reportedIdeas = useStaffStore((s) => (s.role && s.toolsOn ? s.reportedIdeas : null));
  const insets = useSafeAreaInsets();
  const header = useTabHeader({eyebrow: true});
  // iOS: the screen runs under the floating tab bar, whose height is in the
  // bottom safe-area inset. Android: the screen already ends above the bar.
  const floatingBottom = Platform.OS === "ios" ? insets.bottom + 12 : 24;
  const greeting = useGreeting();
  const unseenCount = useUnseenCount();

  // --- ZUSTAND LOCATION STORE ---
  const {hasPermission, userLocation, requestLocation} = useLocationStore();

  // --- STATE & REFS ---
  const lastMarkerPress = useRef(0);
  const [allIdeas, setIdeas] = useState<DateIdea[]>([]);
  // "Not interested" ideas drop out right away, and come back on undo
  const hiddenIds = useHiddenStore((s) => s.ids);
  const blockedIds = useBlockStore((s) => s.ids);
  const ideas = useMemo(
    () =>
      allIdeas.filter(
        (idea) => !hiddenIds.has(idea.idea_id) && !(idea.user_id && blockedIds.has(idea.user_id)),
      ),
    [allIdeas, hiddenIds, blockedIds],
  );
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

  // `quiet`: pull-to-refresh shows its own spinner, so skip the loading state
  const fetchIdeas = useCallback(async ({quiet = false} = {}) => {
    const generation = ++fetchGeneration.current;
    if (!quiet) setIsLoading(true);
    setError(null);

    const {data, error: supabaseError} = await supabase
      .from("activities")
      .select(
        `
        *,
        venues ( name, address, coordinates ),
        users!activities_user_id_fkey ( username, profile_image_url )
      `,
      )
      // Everyone's published ideas, plus all of yours except the ones that
      // weren't approved (those stay in Profile > My Ideas, with the note):
      // a private or in-review idea shows here too, marked "only you can
      // see this", since Explore is where people spend their time. Held
      // ideas (enough reports, #76) are out until a moderator looks; you
      // still see them if you saved one, just not here
      .or(
        (() => {
          const me = useProfileStore.getState().userId;
          return me
            ? `and(visibility.eq.PUBLISHED,held_at.is.null),and(user_id.eq.${me},visibility.neq.REJECTED)`
            : "and(visibility.eq.PUBLISHED,held_at.is.null)";
        })(),
      )
      // A fixed order going in, so the same seed always shuffles the same way
      .order("idea_id", {ascending: true});

    if (generation !== fetchGeneration.current) return;

    if (supabaseError) {
      console.error("Explore fetch error:", supabaseError);
      setError("Failed to load date ideas.");
      setIsLoading(false);
      return;
    }

    const formatted = (data || []).map((row: any) => {
      const parsed = parseCoordinates(row.venues?.coordinates);
      return {
        ...row,
        creator_username: row.users?.username || null,
        creator: row.users ?? null,
        latitude: parsed ? parsed.latitude : null,
        longitude: parsed ? parsed.longitude : null,
      };
    });

    setIdeas(seededShuffle(formatted, shuffleSeed.current));
    setIsLoading(false);
    setIsInitialLoad(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchIdeas();
      return () => {
        // Leaving the tab: ignore whatever is still in flight
        fetchGeneration.current++;
      };
    }, [fetchIdeas]),
  );

  // Pull-to-refresh: new shuffle, so you get a fresh set of options up top
  const refresh = useTabRefresh(() => {
    shuffleSeed.current = newSeed();
    return fetchIdeas({quiet: true});
  });

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
    if (!userLocation || item.latitude == null || item.longitude == null) return "Go out";
    const miles = getDistance(userLocation, {latitude: item.latitude, longitude: item.longitude});
    if (miles < 0.2) return "Nearby";
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  };

  const renderIdeaItem = ({item}: {item: DateIdea}) => {
    const displayImage = sizedImage(
      item.image_urls?.[0] ||
        item.image_url ||
        "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=800&auto=format&fit=crop",
      IMAGE_SIZE.full,
    );

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/(tabs)/explore/detail/[id]",
            params: {id: item.idea_id.toString()},
          })
        }
        className="mb-6 active:opacity-95 shadow-xl shadow-black"
      >
        <View className="h-80 w-full rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 relative">
          <Image
            source={{uri: displayImage}}
            style={{width: "100%", height: "100%"}}
            contentFit="cover"
          />

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.9)"]}
            locations={[0.5, 1]}
            style={{position: "absolute", width: "100%", height: "100%"}}
          />

          {/* Price, how far (or at home), and for your own unpublished ideas a
              status icon: same height, same look as the save button */}
          <View className="absolute top-4 left-4 flex-row items-center gap-2">
            <View className="h-7 justify-center px-3 rounded-full" style={CARD_PILL}>
              <Text className="text-white font-bold text-xs">
                {formatPrice(item.est_price_per_person)}
              </Text>
            </View>

            {/* Where: stay-in ideas are at home; go-out ones say how far */}
            <View
              className="h-7 flex-row items-center gap-1 px-3 rounded-full"
              style={CARD_PILL}
              accessible
              accessibilityLabel={item.modality === "STAY_IN" ? "Stay in, at home" : `Go out, ${whereLabel(item)}`}
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
            {item.visibility !== "PUBLISHED" && IDEA_STATUS[item.visibility] && (
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
                  style={{marginLeft: 1}}
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
                <Text className="text-white font-bold text-xs">{reportedIdeas.get(item.idea_id)}</Text>
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
                    {item.creator_username ? `By @${item.creator_username}` : "Shared by a Venture member"}
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
  const {reset: resetHeader} = header;
  const showingSkeleton = isLoading && isInitialLoad;
  useEffect(() => {
    resetHeader();
  }, [viewMode, showingSkeleton, resetHeader]);

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
            style={{flex: 1, backgroundColor: "#000"}}
            contentContainerStyle={{paddingBottom: 96}}
            showsVerticalScrollIndicator={false}
          >
            {renderHeader(false)}
            <View style={{paddingHorizontal: 20, paddingTop: 8}}>
              {[1, 2, 3].map((i) => (
                <SkeletonIdea key={i} />
              ))}
            </View>
          </Animated.ScrollView>
        ) : (
          <Animated.FlatList
            {...header.scrollProps}
            style={{flex: 1, backgroundColor: "#000"}}
            ListHeaderComponent={renderHeader(false)}
            data={ideas}
            keyExtractor={(item) => `idea-${item.idea_id}`}
            renderItem={(info) => (
              <View
                style={{paddingHorizontal: 20, paddingTop: info.index === 0 ? 8 : 0}}
              >
                {renderIdeaItem(info)}
              </View>
            )}
            ListEmptyComponent={renderEmptyState}
            refreshControl={refresh.control}
            contentContainerStyle={{paddingBottom: 60}}
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
            style={{flex: 1}}
            initialRegion={{
              latitude: userLocation?.latitude ?? 40.2312,
              longitude: userLocation?.longitude ?? -111.6614,
              latitudeDelta: 0.15,
              longitudeDelta: 0.15,
            }}
            userInterfaceStyle="dark"
            showsUserLocation={hasPermission}
            showsMyLocationButton={hasPermission}
            onPress={() => {
              if (Date.now() - lastMarkerPress.current < 250) return;
              setSelectedIdea(null);
            }}
          >
            {/* 1. Base markers (dim gray border, frozen in GPU memory) */}
            {ideas
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
                anchor={{x: 0.5, y: 0.5}}
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
                    shadowOffset: {width: 0, height: 3},
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
              style={{bottom: floatingBottom}}
            >
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/explore/detail/[id]",
                    params: {id: selectedIdea.idea_id.toString()},
                  })
                }
                className="active:opacity-90"
              >
                <GlassSurface style={glassStyles.previewCard}>
                  <Image
                    source={{
                      uri: sizedImage(
                        selectedIdea.image_urls?.[0] ||
                          selectedIdea.image_url ||
                          "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=800&auto=format&fit=crop",
                        84,
                      ),
                    }}
                    style={{width: 84, height: 84, borderRadius: 18}}
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
                      {selectedIdea.creator_username ? `@${selectedIdea.creator_username}` : "A Venture member"}
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
