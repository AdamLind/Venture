// src/lib/connectWithCode.ts
// Send a request with someone's code (scanned, typed, or from their link),
// and say how it went (#35).

import {Alert} from "react-native";
import * as Haptics from "expo-haptics";
import Toast from "react-native-toast-message";

import {connectByCode} from "@/src/lib/connections";
import {useConnectionsStore} from "@/src/store/useConnectionsStore";

/** Connect with a code, and say how it went. True when it worked. */
export async function connectWithCode(code: string): Promise<boolean> {
  try {
    const result = await connectByCode(code);
    const who = result.username ? `@${result.username}` : "them";
    if (process.env.EXPO_OS === "ios") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Toast.show({
      type: "success",
      text1:
        result.status === "CONNECTED"
          ? `You and ${who} are connected`
          : result.status === "ALREADY"
            ? `You're already connected with ${who}`
            : `Request sent to ${who}`,
      text2: result.status === "REQUESTED" ? "You'll be connected when they accept." : undefined,
      position: "bottom",
    });
    useConnectionsStore.getState().reload();
    return true;
  } catch (e) {
    Alert.alert("Couldn't connect", e instanceof Error ? e.message : "Please try again.");
    return false;
  }
}
