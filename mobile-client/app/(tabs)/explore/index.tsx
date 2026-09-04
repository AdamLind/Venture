import React, {useRef, useState, useEffect, useCallback} from "react";
import {
  Pressable,
  View,
  Text,
  FlatList,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import {Image} from "expo-image";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import {useRouter, useFocusEffect} from "expo-router";
import MapView, {Marker} from "react-native-maps";
import {useSafeAreaInsets, SafeAreaView} from "react-native-safe-area-context";
import Greeting from "@/components/home/Greeting";
import {supabase} from "@/src/supabase";
import {LinearGradient} from "expo-linear-gradient";
import {useLocationStore} from "@/src/store/useLocationStore";

// --- TYPES & CONSTANTS ---
interface DateIdea {
  idea_id: number;
  title: string;
  modality: "STAY_IN" | "GO_OUT";
  est_price_per_person: string | number;
  creator_username: string | null;
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

const formatPrice = (priceString: string | number): string => {
  const price =
    typeof priceString === "number" ? priceString : parseFloat(priceString);
  return isNaN(price) || price === 0 ? "Free" : `$${price.toFixed(2)}`;
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
  ({item, onSelect}: PricePinProps) => {
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
  const insets = useSafeAreaInsets();

  // --- ZUSTAND LOCATION STORE ---
  const {hasPermission, userLocation, requestLocation} = useLocationStore();

  // --- STATE & REFS ---
  const lastMarkerPress = useRef(0);
  const [ideas, setIdeas] = useState<DateIdea[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<DateIdea | null>(null);

  // Request location quietly on mount
  useEffect(() => {
    requestLocation();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const fetchIdeas = async () => {
        setIsLoading(true);
        setError(null);

        const {data, error: supabaseError} = await supabase
          .from("activities")
          .select(
            `
            *,
            venues ( name, address, coordinates ),
            users!activities_user_id_fkey ( username )
          `,
          )
          .order("created_at", {ascending: false});

        if (supabaseError) {
          console.error("Explore fetch error:", supabaseError);
          setError("Failed to load date ideas.");
          setIsLoading(false);
          return;
        }

        if (isActive) {
          const formatted = (data || []).map((row: any) => {
            const parsed = parseCoordinates(row.venues?.coordinates);
            return {
              ...row,
              creator_username: row.users?.username || null,
              latitude: parsed ? parsed.latitude : null,
              longitude: parsed ? parsed.longitude : null,
            };
          });

          setIdeas(formatted);
          setIsLoading(false);
          setIsInitialLoad(false);
        }
      };

      fetchIdeas();
      return () => {
        isActive = false;
      };
    }, []),
  );

  const handleSelectPin = useCallback((item: DateIdea) => {
    lastMarkerPress.current = Date.now();
    setSelectedIdea(item);
  }, []);

  // --- UI COMPONENTS ---
  const renderIdeaItem = ({item}: {item: DateIdea}) => {
    const displayImage =
      item.image_urls?.[0] ||
      item.image_url ||
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=800&auto=format&fit=crop";

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

          <View className="absolute top-4 left-4 flex-row gap-2">
            <View className="bg-zinc-950/85 px-3 py-1.5 rounded-full border border-zinc-500 shadow-md shadow-black">
              <Text className="text-white font-bold text-xs">
                {formatPrice(item.est_price_per_person)}
              </Text>
            </View>

            <View
              className={`px-3 py-1.5 rounded-full border bg-[rgba(0,0,0,0.85)] shadow-md shadow-black ${
                item.modality === "STAY_IN"
                  ? "border-amber-500/80"
                  : "border-emerald-500/80"
              }`}
            >
              <Text
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  item.modality === "STAY_IN"
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {(item.modality ?? "GO OUT").replace("_", " ")}
              </Text>
            </View>
          </View>

          <Pressable className="absolute top-4 right-4 w-9 h-9 rounded-full bg-[rgba(0,0,0,0.5)] backdrop-blur-md items-center justify-center border border-zinc-600 active:scale-[0.90] transition-transform">
            <Ionicons name="bookmark-outline" size={18} color="white" />
          </Pressable>

          <View className="absolute bottom-0 w-full p-5">
            <View className="flex-row justify-between items-end">
              <View className="flex-1 pr-4">
                <Text className="text-2xl font-extrabold text-white mb-1 shadow-black drop-shadow-md">
                  {item.title}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <Image
                    source={{
                      uri: "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=100&auto=format&fit=crop",
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#71717a",
                    }}
                    contentFit="cover"
                  />
                  <Text className="text-zinc-300 text-sm font-medium">
                    By @{item.creator_username || "local_expert"}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center gap-1 px-2 py-1">
                <Ionicons name="star" size={12} color="#FF9D0A" />
                <Text className="text-white font-bold text-xs">4.8</Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

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

  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" />

      {/* --- CUSTOM HEADER --- */}
      <SafeAreaView edges={["top"]} className="bg-zinc-950/90 z-10">
        <View className="px-6 pb-4">
          <View className="flex-row justify-between items-end">
            <Text className="text-white text-3xl font-bold tracking-tight">
              Discover
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => router.push("/create")}
                className="bg-zinc-900 w-12 h-12 rounded-full items-center justify-center border border-zinc-800 active:bg-zinc-800"
              >
                <Ionicons name="add" size={24} color="white" />
              </Pressable>

              <Pressable className="bg-zinc-900 w-12 h-12 rounded-full items-center justify-center border border-zinc-800 active:bg-zinc-800">
                <Ionicons
                  name="notifications-outline"
                  size={22}
                  color="white"
                />
                <View className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-zinc-900" />
              </Pressable>
            </View>
          </View>
          <Greeting />
        </View>
      </SafeAreaView>

      {/* --- CONTENT AREA --- */}
      <View className="flex-1 bg-black relative">
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
              onPress={() => {
                setIsLoading(true);
                setError(null);
              }}
              className="bg-red-500/20 px-8 py-3 rounded-full border border-red-500/30"
            >
              <Text className="text-red-300 font-bold">Try Again</Text>
            </Pressable>
          </View>
        ) : viewMode === "list" ? (
          isLoading && isInitialLoad ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerClassName="px-5 pt-4 pb-24"
            >
              {[1, 2, 3].map((i) => (
                <SkeletonIdea key={i} />
              ))}
            </ScrollView>
          ) : (
            <FlatList
              data={ideas}
              keyExtractor={(item) => `idea-${item.idea_id}`}
              renderItem={renderIdeaItem}
              ListEmptyComponent={renderEmptyState}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 60,
              }}
              showsVerticalScrollIndicator={false}
            />
          )
        ) : (
          /* MAP VIEW */
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
              <View className="absolute bottom-24 left-4 right-4 z-40">
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/explore/detail/[id]",
                      params: {id: selectedIdea.idea_id.toString()},
                    })
                  }
                  className="bg-zinc-900/95 border border-zinc-700/80 rounded-3xl p-3 flex-row items-center backdrop-blur-xl shadow-2xl shadow-black active:opacity-95"
                >
                  <Image
                    source={{
                      uri:
                        selectedIdea.image_urls?.[0] ||
                        selectedIdea.image_url ||
                        "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=800&auto=format&fit=crop",
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

                    <View className="flex-row items-center gap-1">
                      <Ionicons name="star" size={12} color="#FF9D0A" />
                      <Text className="text-zinc-300 text-xs font-semibold">
                        4.8
                      </Text>
                      <Text className="text-zinc-500 text-xs ml-1">
                        @{selectedIdea.creator_username || "local_expert"}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      setSelectedIdea(null);
                    }}
                    className="absolute top-3 right-3 w-7 h-7 rounded-full bg-zinc-800 items-center justify-center border border-zinc-700 active:opacity-70"
                  >
                    <Ionicons name="close" size={16} color="#a1a1aa" />
                  </Pressable>
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

        {/* --- FLOATING TOGGLE BUTTON --- */}
        {!error && (
          <View className="absolute bottom-6 self-center z-50">
            <Pressable
              onPress={() => {
                const nextMode = viewMode === "list" ? "map" : "list";
                if (nextMode === "map" && !hasPermission) {
                  requestLocation();
                }
                if (nextMode === "map") {
                  setSelectedIdea(null);
                }
                setViewMode(nextMode);
              }}
              className="bg-zinc-800/95 backdrop-blur-xl flex-row items-center justify-center px-6 py-3.5 rounded-full border border-zinc-600 shadow-2xl shadow-black active:scale-[0.95]"
            >
              <Text className="text-white font-bold text-sm mr-2 tracking-wide">
                {viewMode === "list" ? "Map" : "List"}
              </Text>
              <Ionicons
                name={viewMode === "list" ? "map" : "list"}
                size={18}
                color="white"
              />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
