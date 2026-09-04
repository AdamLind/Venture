import React, {useEffect, useState, useRef} from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StatusBar,
  Animated,
  Modal,
  Dimensions,
} from "react-native";
import {Image} from "expo-image";
import {useRouter, useLocalSearchParams} from "expo-router";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import MapView, {Marker} from "react-native-maps";
import {LinearGradient} from "expo-linear-gradient";
import {supabase} from "@/src/supabase";
import {useLocationStore} from "@/src/store/useLocationStore";

const {width, height} = Dimensions.get("window");

export default function IdeaDetailScreen() {
  const router = useRouter();
  const {id} = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [idea, setIdea] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMapModalVisible, setIsMapModalVisible] = useState(false);

  const {hasPermission, requestLocation} = useLocationStore();

  // --- ANIMATION VALUES ---
  const scrollY = useRef(new Animated.Value(0)).current;

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
  useEffect(() => {
    const fetchIdeaDetails = async () => {
      try {
        const {data, error: dbError} = await supabase
          .from("activities")
          .select(
            `
            *,
            venues ( name, address, coordinates ),
            users!activities_user_id_fkey ( username ),
            activity_tags (
              tags ( name )
            )
          `,
          )
          .eq("idea_id", id)
          .single();

        if (dbError) throw dbError;
        setIdea(data);
        console.log(data);
      } catch (err: any) {
        console.error("Fetch Error:", err);
        setError(err.message || "Could not load date idea");
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchIdeaDetails();
  }, [id]);

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
              source={{uri: idea.image_urls?.[0]}}
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
        <View className="-mt-16 px-5 pb-20">
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

            <Text className="text-zinc-400 text-base font-medium">
              Curated by{" "}
              <Text className="text-white font-bold">
                @{idea.users?.username || "local_expert"}
              </Text>
            </Text>
          </View>

          {/* QUICK STATS GRID */}
          <View className="flex-row flex-wrap justify-between bg-zinc-900/80 rounded-3xl p-5 border border-zinc-800 mb-8">
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
                  : `$${idea.est_price_per_person}/pp`}
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

            <View className="w-[45%]">
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

            <View className="w-[45%]">
              <View className="flex-row items-center gap-2 mb-1">
                <Ionicons
                  name="partly-sunny-outline"
                  size={18}
                  color="#FF9D0A"
                />
                <Text className="text-zinc-400 text-xs font-bold">SETTING</Text>
              </View>
              <Text className="text-white font-bold text-lg capitalize">
                {idea.environment.toLowerCase()}
              </Text>
            </View>
          </View>

          {/* DESCRIPTION */}
          <View className="mb-8">
            <Text className="text-white text-lg leading-relaxed text-zinc-300">
              {idea.description}
            </Text>
          </View>

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
                    <Text className="text-zinc-400 mt-1">
                      {idea.venues.address}
                    </Text>
                  </View>
                  <View className="w-10 h-10 rounded-full bg-zinc-800 items-center justify-center border border-zinc-700">
                    <Ionicons name="expand-outline" size={18} color="#FF9D0A" />
                  </View>
                </View>

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
                      {join.tags?.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </Animated.ScrollView>
      {/* BACK BUTTON (Stays totally still while the image zooms!) */}
      <Pressable
        onPress={() => router.back()}
        className="absolute top-15 left-4 w-11 h-11 rounded-full bg-zinc-900/50 backdrop-blur-xl items-center justify-center border border-white/15 shadow-lg z-50"
      >
        <Ionicons name="chevron-back" size={24} color="white" />
      </Pressable>

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
