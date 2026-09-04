import React, {useState, useEffect, useRef} from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import MapView, {Region, Marker} from "react-native-maps";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import * as Location from "expo-location";
import {useSafeAreaInsets} from "react-native-safe-area-context";

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
}

interface MapPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (data: LocationData) => void;
  initialAddress?: string;
  initialCoords?: {lat: number; lng: number} | null;
}

export default function MapPickerModal({
  visible,
  onClose,
  onSelectLocation,
  initialAddress,
  initialCoords,
}: MapPickerModalProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [region, setRegion] = useState<Region>({
    latitude: 40.2312,
    longitude: -111.6614,
    latitudeDelta: 0.002,
    longitudeDelta: 0.002,
  });

  const [isConfirming, setIsConfirming] = useState(false);

  // When the modal becomes visible, fly to the typed address or existing pin
  useEffect(() => {
    // 1. If modal is hidden, or if we ALREADY have exact coordinates, stop here.
    // onMapReady is handling the exact coordinates flawlessly.
    if (!visible || initialCoords) return;

    const syncMapLocation = async () => {
      // 2. Only run this if they typed a text address but have no exact coordinates
      if (initialAddress && initialAddress.trim() !== "") {
        try {
          const geocoded = await Location.geocodeAsync(initialAddress);
          if (geocoded && geocoded.length > 0) {
            const newRegion = {
              latitude: geocoded[0].latitude,
              longitude: geocoded[0].longitude,
              latitudeDelta: 0.002, // Kept this at your preferred zoom level!
              longitudeDelta: 0.002,
            };
            setRegion(newRegion);
            mapRef.current?.animateToRegion(newRegion, 500);
          }
        } catch (e) {
          console.warn("Could not geocode typed address for map init");
        }
      }
    };

    syncMapLocation();
  }, [visible, initialAddress, initialCoords]);

  const handleRegionChangeComplete = (newRegion: Region) => {
    setRegion(newRegion);
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const geocodeResult = await Location.reverseGeocodeAsync({
        latitude: region.latitude,
        longitude: region.longitude,
      });

      let address = `${region.latitude.toFixed(4)}, ${region.longitude.toFixed(4)}`;

      if (geocodeResult && geocodeResult.length > 0) {
        const place = geocodeResult[0];
        const name = place.name || place.street || "";
        const city = place.city || "";
        address = [name, city].filter(Boolean).join(", ");
      }

      onSelectLocation({
        latitude: region.latitude,
        longitude: region.longitude,
        address: address,
      });
    } catch (error) {
      console.error("Reverse geocoding failed:", error);
      Alert.alert("Error", "Could not get address for this location.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black">
        {/* HEADER */}
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-zinc-800 bg-black z-10">
          <Pressable
            onPress={onClose}
            className="w-10 h-10 items-center justify-center rounded-full bg-zinc-900 active:scale-[0.95]"
          >
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
          <Text className="text-white font-bold text-lg">Drop a Pin</Text>
          <View className="w-10" />
        </View>

        {/* MAP & OVERLAYS */}
        <View className="flex-1 relative">
          <MapView
            ref={mapRef}
            style={{flex: 1}}
            initialRegion={region}
            // THE FIX: Wait for the native padding to apply, then instantly snap to center
            onMapReady={() => {
              if (initialCoords) {
                mapRef.current?.animateToRegion(
                  {
                    latitude: initialCoords.lat,
                    longitude: initialCoords.lng,
                    latitudeDelta: 0.002,
                    longitudeDelta: 0.002,
                  },
                  0,
                ); // 0 duration = instant snap, no flying animation
              }
            }}
            onRegionChangeComplete={handleRegionChangeComplete}
            showsUserLocation={true}
            userInterfaceStyle="dark"
            mapPadding={{
              top: 60 + insets.bottom,
              right: 0,
              bottom: 60,
              left: 0,
            }}
          />

          {/* FIXED CENTER PIN */}
          {/* Zero manual padding. Zero offsets. Pure dead-center layout. */}
          <View className="absolute inset-0 justify-center items-center pointer-events-none">
            {/* NativeWind shifts the icon up by exactly 24px so the tip hits the center */}
            <View className="-translate-y-6 pb-6">
              <Ionicons name="pin-outline" size={48} color="#ffffff" />
            </View>

            {/* The Dot: Naturally rests perfectly on the map's coordinates */}
            <View className="absolute w-2 h-2 bg-black rounded-full" />
          </View>

          {/* FLOATING FOOTER */}
          <View className="absolute bottom-0 w-full px-6 pb-8">
            <Pressable
              onPress={handleConfirm}
              disabled={isConfirming}
              className={`w-full py-4 rounded-full items-center shadow-xl shadow-black ${
                isConfirming
                  ? "bg-zinc-800"
                  : "bg-white active:scale-[0.98] active:opacity-90"
              }`}
            >
              {isConfirming ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-black font-black text-lg">
                  Confirm Location
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
