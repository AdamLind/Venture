// src/lib/connectWithCode.ts
// Send a request with someone's code (scanned, typed, or from their link),
// and say how it went (#35).

import * as Haptics from "expo-haptics";
import Toast from "@/src/lib/toast";

import {connectByCode} from "@/src/lib/connections";
import {useConnectionsStore} from "@/src/store/useConnectionsStore";
import {showError} from "@/src/lib/notify";

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
    });
    useConnectionsStore.getState().reload();
    return true;
  } catch (e) {
    showError("Couldn't connect", e);
    return false;
  }
}
