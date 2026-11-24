import * as Haptics from "expo-haptics";
import {Dispatch, SetStateAction, useState, useEffect} from "react";
import {
  Pressable,
  Text,
  View,
  Linking,
  AppState,
  ActivityIndicator,
} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import {ActivityLocation} from "@/types/itinerary";
import type {SimpleLocation} from "@/types/activities";
import * as Location from "expo-location";
import Toast from "@/src/lib/toast";
import {confirm} from "@/src/lib/sheets";

export default function InOrOutSelector({
  inOrOut,
  setInOrOut,
  setLocation,
  onNoLocation,
}: {
  inOrOut: ActivityLocation;
  setInOrOut: Dispatch<SetStateAction<ActivityLocation>>;
  setLocation: Dispatch<React.SetStateAction<SimpleLocation | null>>;
  /** There's a home area to plan from: going out works without your
   *  location (off, or can't be found), starting from home */
  onNoLocation?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  // 1. Extract the 3rd function: getPermission (used to silently refresh status)
  const [permissionResponse, requestPermission, getPermission] =
    Location.useForegroundPermissions();

  // 2. Add an AppState listener to refresh permissions when coming back from Settings
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        getPermission(); // Silently updates `permissionResponse` when they return!
      }
    });

    return () => subscription.remove();
  }, [getPermission]);

  const locations: {label: string; value: ActivityLocation}[] = [
    {label: "Stay In", value: ActivityLocation.StayIn},
    {label: "Go Out", value: ActivityLocation.GoOut},
  ];

  const fetchLocation = async (): Promise<boolean> => {
    setLoading(true);

    try {
      if (!permissionResponse?.granted) {
        // Off for good, with a home area to fall back on: don't ask again
        if (permissionResponse && !permissionResponse.canAskAgain && onNoLocation) return false;
        const result = await requestPermission();
        if (!result.granted) {
          if (onNoLocation) return false;
          Toast.show({
            type: "error",
            text1: "Location is off",
            text2: "Needed to find places nearby",
          });
          return false;
        }
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      return true;
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Couldn't find you",
        text2: "Check your location settings",
      });
      console.error(error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handlePress = async (value: ActivityLocation) => {
    if (value !== inOrOut) {
      if (process.env.EXPO_OS === "ios") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (value === ActivityLocation.StayIn) {
        setLocation(null);
      } else if (value === ActivityLocation.GoOut) {
        // 3. Pro UX: Send them to settings if they permanently denied it
        if (
          permissionResponse?.status === Location.PermissionStatus.DENIED &&
          !permissionResponse.canAskAgain &&
          !onNoLocation
        ) {
          const open = await confirm({
            title: "Location is off",
            message: "Venture needs your location to find places nearby. You can turn it on in your phone's settings.",
            confirmLabel: "Open Settings",
            icon: "location-outline",
          });
          if (open) Linking.openSettings();
          return;
        }

        const success = await fetchLocation();
        if (!success) {
          // No location: plan from the home area, if there is one
          if (!onNoLocation) return;
          onNoLocation();
        }
      }

      setInOrOut(value);
    }
  };

  return (
    <View className="flex-row bg-zinc-900 rounded-2xl border border-zinc-800 p-1.5">
      {locations.map((loc) => {
        const isActive = inOrOut === loc.value;
        const isGoOut = loc.value === ActivityLocation.GoOut;

        const isPermanentlyDenied =
          isGoOut &&
          !onNoLocation &&
          permissionResponse?.status === Location.PermissionStatus.DENIED;

        return (
          <Pressable
            key={loc.value}
            onPress={() => handlePress(loc.value)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{selected: isActive}}
            className={`flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl ${
              isActive ? "bg-zinc-700" : ""
            } ${isPermanentlyDenied ? "opacity-50" : ""}`}
          >
            {loading && isGoOut ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons
                name={
                  isGoOut
                    ? isActive
                      ? "walk"
                      : "walk-outline"
                    : isActive
                      ? "home"
                      : "home-outline"
                }
                size={16}
                color={isActive ? "white" : "#71717a"}
              />
            )}
            <Text
              className={`font-bold ${isActive ? "text-white" : "text-zinc-500"}`}
            >
              {loc.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
