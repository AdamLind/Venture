import { create } from "zustand";
import * as Location from "expo-location";

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface LocationStore {
  hasPermission: boolean;
  userLocation: Coordinates | null;
  isLoading: boolean;
  requestLocation: () => Promise<boolean>;
}

export const useLocationStore = create<LocationStore>((set, get) => ({
  hasPermission: false,
  userLocation: null,
  isLoading: false,

  requestLocation: async () => {
    // Avoid re-requesting if already granted
    if (get().hasPermission && get().userLocation) {
      return true;
    }

    try {
      set({ isLoading: true });

      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === "granted";

      set({ hasPermission: granted });

      if (granted) {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        set({
          userLocation: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          isLoading: false,
        });

        return true;
      }

      set({ isLoading: false });
      return false;
    } catch (err) {
      console.warn("Location fetch error:", err);
      set({ isLoading: false, hasPermission: false });
      return false;
    }
  },
}));