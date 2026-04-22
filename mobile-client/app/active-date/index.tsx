import React, {useState, useRef, useEffect} from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
  Platform,
  Alert,
} from "react-native";
import MapView, {Marker, Polyline} from "react-native-maps";
import {formatTime} from "@/utils/itineraryEngine";
import {Activity, TimeSlot} from "@/types/itinerary";
import Ionicons from "@expo/vector-icons/Ionicons";
import {useActiveDateStore} from "@/store/activeDateStore";
import {router} from "expo-router";

export default function ActiveModeScreen() {
  // =========================================================================
  // ZONE 1: ALL HOOKS
  // Absolutely no `if` statements or `returns` are allowed above this section!
  // =========================================================================
  const timeline = useActiveDateStore((state) => state.timeline);
  const userPrefs = useActiveDateStore((state) => state.userPrefs);
  const endActiveDate = useActiveDateStore((state) => state.endActiveDate);

  const mapRef = useRef<MapView>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // We must safely calculate locations BEFORE the early return so the useEffect
  // has valid data to look at. The `|| []` prevents crashes if timeline is null!
  const safeTimeline = timeline || [];
  const locations = safeTimeline
    .filter(
      (slot: TimeSlot) => slot.type === "OCCUPIED" && slot.activity?.latitude,
    )
    .map(
      (slot: TimeSlot) =>
        slot.activity as Activity & {latitude: number; longitude: number},
    );

  useEffect(() => {
    if (locations.length > 0 && mapRef.current) {
      const activeLoc = locations[currentStepIndex] || locations[0];
      mapRef.current.animateToRegion(
        {
          latitude: activeLoc.latitude,
          longitude: activeLoc.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        1000,
      );
    }
  }, [currentStepIndex, locations]);

  // =========================================================================
  // ZONE 2: EARLY RETURNS
  // Now that React has registered every hook, we can safely bail out if needed.
  // =========================================================================
  if (!timeline || !userPrefs) {
    return (
      <View className="flex-1 bg-zinc-950 justify-center items-center">
        <Text className="text-zinc-500">No active date in progress.</Text>
      </View>
    );
  }

  // =========================================================================
  // ZONE 3: HANDLERS
  // =========================================================================
  const handleNavigate = (lat: number, lng: number, title: string) => {
    const url = Platform.select({
      ios: `maps://app?daddr=${lat},${lng}&dirflg=d`,
      android: `google.navigation:q=${lat},${lng}`,
    });

    if (url) {
      Linking.openURL(url).catch((err) =>
        console.error("Failed to open maps:", err),
      );
    }
  };

  const handleEndDate = () => {
    Alert.alert(
      "End Date",
      "Are you sure you want to end your current itinerary?",
      [
        {text: "Cancel", style: "cancel"},
        {
          text: "End Date",
          style: "destructive",
          onPress: () => {
            endActiveDate();
            router.replace("/");
          },
        },
      ],
    );
  };

  // =========================================================================
  // ZONE 4: THE MAIN RENDER
  // =========================================================================
  return (
    <View className="flex-1 bg-zinc-950">
      {/* ─── TOP HALF: THE MAP ────────────────────────────────────── */}
      <View className="flex-1 overflow-hidden">
        <MapView
          ref={mapRef}
          style={{flex: 1}}
          userInterfaceStyle="dark"
          showsUserLocation={locations.length > 0}
          initialRegion={
            locations.length > 0
              ? {
                  latitude: locations[0].latitude,
                  longitude: locations[0].longitude,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }
              : undefined
          }
        >
          {locations.map((loc: Activity, idx: number) => {
            const isActive = idx === currentStepIndex;

            if (!loc.latitude || !loc.longitude) return null;

            return (
              <Marker
                key={loc.idea_id ?? idx}
                coordinate={{latitude: loc.latitude, longitude: loc.longitude}}
              >
                <View
                  className={`p-2 rounded-full border-2 ${
                    isActive
                      ? "bg-blue-500 border-white"
                      : "bg-zinc-800 border-zinc-600"
                  }`}
                >
                  <Text className="text-white font-bold">{idx + 1}</Text>
                </View>
              </Marker>
            );
          })}

          <Polyline
            coordinates={locations.map((loc: Activity) => ({
              latitude: loc.latitude!,
              longitude: loc.longitude!,
            }))}
            strokeColor="#3b82f6"
            strokeWidth={3}
            lineDashPattern={[5, 5]}
          />
        </MapView>
      </View>

      {/* ─── BOTTOM HALF: THE ITINERARY ───────────────────────────── */}
      <View className="flex-1 pt-6 px-6">
        <View className="flex-row justify-between items-end mb-4">
          <Text className="text-white text-2xl font-bold">Up Next</Text>
          <Text className="text-blue-400 font-mono text-sm">
            {formatTime(Date.now())}
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {timeline.map((slot: TimeSlot, idx: number) => {
            if (slot.type === "AVAILABLE") return null;

            const isTravel = !slot.activity;
            const isPast = slot.endTime < Date.now();
            const isCurrent =
              Date.now() >= slot.startTime && Date.now() <= slot.endTime;

            return (
              <Pressable
                key={slot.id ?? idx}
                onPress={() => {
                  if (!isTravel) {
                    const locIdx = locations.findIndex(
                      (l: Activity) => l.idea_id === slot.activity?.idea_id,
                    );
                    if (locIdx !== -1) setCurrentStepIndex(locIdx);
                  }
                }}
                className={`mb-4 p-4 rounded-2xl border ${
                  idx == 0
                    ? "bg-zinc-900/50 border-zinc-800 opacity-50"
                    : idx === 1
                      ? // We are at idx 0! Give it the blue highlight, AND check if it's also travel!
                        `border-blue-500 bg-blue-950 ${isTravel ? "border-dashed" : ""}`
                      : isTravel
                        ? "bg-zinc-900 border-dashed border-zinc-700"
                        : "bg-zinc-800 border-zinc-700"
                }`}
              >
                <View className="flex-row justify-between items-center">
                  <View className="flex-1">
                    {idx == 1 ? (
                      <Text
                        className={`text-xs ${isPast ? "text-zinc-600" : "text-blue-400"}`}
                      >
                        IN PROGRESS
                      </Text>
                    ) : null}
                    <Text
                      className={`font-bold text-lg ${isPast ? "text-zinc-500" : "text-white"}`}
                    >
                      {slot.title}
                    </Text>
                    <Text
                      className={`text-xs mt-1 ${isPast ? "text-zinc-600" : "text-blue-400"}`}
                    >
                      {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                    </Text>
                  </View>

                  {!isPast && isTravel && (
                    <Pressable
                      className="bg-blue-600 px-4 py-4 rounded-lg active:bg-blue-700"
                      onPress={() => {
                        if (slot.id === "return-journey") {
                          if (
                            userPrefs.currentLocation.latitude &&
                            userPrefs.currentLocation.longitude
                          ) {
                            handleNavigate(
                              userPrefs.currentLocation.latitude,
                              userPrefs.currentLocation.longitude,
                              "Home",
                            );
                          }
                          return;
                        }

                        const destination = timeline[idx + 1]?.activity;
                        if (destination?.latitude && destination?.longitude) {
                          handleNavigate(
                            destination.latitude,
                            destination.longitude,
                            destination.title,
                          );
                        }
                      }}
                    >
                      <Ionicons name="navigate" size={18} color="white" />
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          })}

          {/* ─── END DATE BUTTON ─── */}
          <Pressable
            onPress={handleEndDate}
            className="mt-4 mb-10 py-4 bg-red-500/10 border border-red-500/30 rounded-2xl items-center active:bg-red-500/20"
          >
            <Text className="text-red-400 font-bold text-base">End Date</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}
