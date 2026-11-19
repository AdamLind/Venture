// app/connect/[code].tsx
// Opening someone's Venture link (or scanning their QR code with the phone's
// camera) lands here (#35): send them a request, then show Connections.

import React, {useEffect, useRef} from "react";
import {ActivityIndicator, View} from "react-native";
import {useLocalSearchParams, useRouter} from "expo-router";

import {connectWithCode} from "@/src/lib/connectWithCode";
import {parseCode} from "@/src/lib/connections";

export default function ConnectLinkScreen() {
  const router = useRouter();
  const {code} = useLocalSearchParams<{code: string}>();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const parsed = parseCode(String(code ?? ""));
    (async () => {
      if (parsed) await connectWithCode(parsed);
      router.replace("/connections");
    })();
  }, [code, router]);

  return (
    <View className="flex-1 bg-black items-center justify-center">
      <ActivityIndicator color="white" />
    </View>
  );
}
