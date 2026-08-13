import * as Haptics from "expo-haptics";
import {Dispatch, SetStateAction, useState, useEffect} from "react";
import {Pressable, Text, View, Alert, Linking, AppState} from "react-native";
import {ActivityLocation, SimpleLocation} from "../../types/itinerary";
import * as Location from "expo-location";
import Toast from "react-native-toast-message";

export default function InOrOutSelector({
  inOrOut,
  setInOrOut,
  setLocation,
}: {
  inOrOut: ActivityLocation;
  setInOrOut: Dispatch<SetStateAction<ActivityLocation>>;
  setLocation: Dispatch<React.SetStateAction<SimpleLocation | null>>;
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
        const result = await requestPermission();
        if (!result.granted) {
          Toast.show({
            type: "error",
            text1: "Location Required",
            text2: "We need your location to find nearby activities.",
            position: "bottom",
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
        text1: "Location Error",
        text2: "Could not fetch your current location.",
        position: "bottom",
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
          !permissionResponse.canAskAgain
        ) {
          Alert.alert(
            "Location Disabled",
            "We need your location to find nearby activities. You can enable it in your phone's settings.",
            [
              {text: "Cancel", style: "cancel"},
              {text: "Open Settings", onPress: () => Linking.openSettings()},
            ],
          );
          return;
        }

        const success = await fetchLocation();
        if (!success) {
          return;
        }
      }

      setInOrOut(value);
    }
  };

  return (
    <View className="flex flex-row items-center justify-center gap-[34px] w-full">
      {locations.map((loc) => {
        const isActive = inOrOut === loc.value;

        const isPermanentlyDenied =
          loc.value === ActivityLocation.GoOut &&
          permissionResponse?.status === Location.PermissionStatus.DENIED;

        return (
          <Pressable
            key={loc.value}
            onPress={() => handlePress(loc.value)}
            className={`flex-grow p-[13px] m-auto border rounded-[10px] bg-zinc-900 ${
              isActive ? "border-white" : "border-zinc-700"
            } ${isPermanentlyDenied ? "opacity-50" : "opacity-100"}`}
          >
            <Text
              className={`h-6 text-[18px] text-center ${
                isActive ? "text-white font-semibold" : "text-zinc-200"
              }`}
            >
              {loc.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
