import * as Location from "expo-location";
import React, {useState} from "react";
import {ActivityIndicator, Pressable, Text, View} from "react-native";

export default function LocationSelector() {
  const [location, setLocation] =
    useState<Location.LocationObjectCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Prompt location permission and then get current location
  // Sets error message if permission is denied
  const fetchLocation = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const {status} = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Permission to access location was denied");
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation(loc.coords);
    } catch (error) {
      setErrorMsg("Error fetching location");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Pressable
        onPress={fetchLocation}
        className="bg-gray-800 w-full h-[50px] rounded-lg border border-gray-500 text-white text-[20px] font-semibold justify-center"
      >
        {!loading && !errorMsg && (
          <Text className="w-full text-center text-[20px] text-gray-500 font-semibold">
            {!location ? "Leaving From..." : location.latitude + " " + location.longitude}
          </Text>
        )}

        {loading && <ActivityIndicator />}

        {errorMsg && (
          <Text className="text-red">{errorMsg}</Text>
        )}
      </Pressable>
    </View>
  );
}