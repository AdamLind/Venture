// app/connections/add.tsx
// Add someone (#35): your QR code (they scan it with Venture or their
// camera), your link to send, scanning their code, or typing it. Every way
// sends a request they accept. Resetting your code stops old ones working.

import React, {useEffect, useRef, useState} from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  Pressable,
  type ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import {useRouter} from "expo-router";
import {Ionicons} from "@expo/vector-icons";
import {CameraView, useCameraPermissions} from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import Toast from "@/src/lib/toast";

import TabHeader, {useTabHeader} from "@/components/ui/TabHeader";
import {connectLink, formatCode, parseCode, resetProfileCode} from "@/src/lib/connections";
import {connectWithCode} from "@/src/lib/connectWithCode";
import {useProfileStore} from "@/src/store/useProfileStore";
import {showError} from "@/src/lib/notify";
import {confirm} from "@/src/lib/sheets";

/** Font size only (a line height pushes text off centre on iOS) */
const INPUT_TEXT = {fontSize: 16};

export default function AddConnectionScreen() {
  const router = useRouter();
  const username = useProfileStore((s) => s.profile?.username ?? "");
  const code = useProfileStore((s) => s.preferences?.profile_code ?? null);
  const [scanning, setScanning] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  // The tabs' header: large title, glass back button, blur as it collapses
  const header = useTabHeader({back: true});
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  // Typing a code: scroll to the bottom once, so the box and Connect sit
  // above the keyboard. Now if it's up already, else once it's up (it can
  // report "shown" more than once as it settles: only the first counts)
  const keyboardSub = useRef<{remove: () => void} | null>(null);
  const scrollToBox = () => {
    keyboardSub.current?.remove();
    if (Keyboard.isVisible()) {
      scrollRef.current?.scrollToEnd({animated: true});
      return;
    }
    keyboardSub.current = Keyboard.addListener("keyboardDidShow", () => {
      keyboardSub.current?.remove();
      keyboardSub.current = null;
      scrollRef.current?.scrollToEnd({animated: true});
    });
  };
  useEffect(() => () => keyboardSub.current?.remove(), []);

  const link = code ? connectLink(code) : null;

  // The code is random letters: copy it rather than read it out
  const copyCode = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    if (process.env.EXPO_OS === "ios") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Toast.show({type: "success", text1: "Code copied"});
  };

  const shareLink = () => {
    if (!link) return;
    Share.share({message: `Connect with me on Venture: ${link}`}).catch(() => {});
  };

  const submitTyped = async () => {
    const parsed = parseCode(typed);
    if (!parsed) {
      showError("That's not a code", "Codes look like AbCd eFgH iJkL");
      return;
    }
    setBusy(true);
    const ok = await connectWithCode(parsed);
    setBusy(false);
    if (ok) router.back();
  };

  const confirmReset = async () => {
    const ok = await confirm({
      title: "Get a new code?",
      message: "Your current QR code and link stop working. Anyone already connected stays connected.",
      confirmLabel: "New code",
      destructive: true,
      icon: "refresh-outline",
    });
    if (!ok) return;
    try {
      const fresh = await resetProfileCode();
      const prefs = useProfileStore.getState().preferences;
      if (prefs) useProfileStore.setState({preferences: {...prefs, profile_code: fresh}});
      Toast.show({type: "success", text1: "New code ready"});
    } catch (e) {
      showError("Couldn't reset it", e);
    }
  };

  return (
    // The scroll view is the screen's root, like the tabs (see TabHeader.tsx)
    <Animated.ScrollView
      ref={scrollRef}
      {...header.scrollProps}
      style={{flex: 1, backgroundColor: "#000"}}
      contentContainerStyle={{paddingBottom: 48}}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      // Room for the keyboard, so the code box can scroll above it
      automaticallyAdjustKeyboardInsets
    >
      <TabHeader header={header} title="Add someone" />
      <View className="px-6 pt-4 items-center">
          {/* YOUR CODE */}
          <View className="bg-white rounded-[32px] p-6 items-center" style={{width: 280}}>
            {link ? (
              <QRCode value={link} size={220} backgroundColor="white" color="black" />
            ) : (
              <View style={{width: 220, height: 220}} className="items-center justify-center">
                <ActivityIndicator color="black" />
              </View>
            )}
            <Text className="text-black font-extrabold text-lg mt-4">@{username}</Text>
          </View>
          <Text className="text-zinc-400 text-sm text-center mt-4 px-6">
            Have them scan this with Venture or their phone&apos;s camera. You&apos;ll connect once you both say yes.
          </Text>
          {code && (
            <Pressable
              onPress={copyCode}
              accessibilityRole="button"
              accessibilityLabel="Copy your code"
              hitSlop={6}
              className="flex-row items-center gap-1.5 mt-3 bg-zinc-900 border border-zinc-800 rounded-full px-3.5 py-1.5 active:opacity-70"
            >
              <Text className="text-zinc-400 text-xs">Your code</Text>
              <Text className="text-white text-sm font-semibold tracking-wider">{formatCode(code)}</Text>
              <Ionicons name="copy-outline" size={14} color="#a1a1aa" />
            </Pressable>
          )}

          {/* WAYS IN */}
          <View className="w-full gap-3 mt-8">
            <Pressable
              onPress={() => setScanning(true)}
              accessibilityRole="button"
              className="flex-row items-center justify-center gap-2 bg-white rounded-full py-4 active:opacity-80"
            >
              <Ionicons name="scan" size={20} color="black" />
              <Text className="text-black font-extrabold text-base">Scan their code</Text>
            </Pressable>
            <Pressable
              onPress={shareLink}
              disabled={!link}
              accessibilityRole="button"
              className="flex-row items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full py-4 active:opacity-80"
            >
              <Ionicons name="share-outline" size={20} color="white" />
              <Text className="text-white font-bold text-base">Send my link</Text>
            </Pressable>
          </View>

          {/* TYPE A CODE */}
          {typing ? (
            <View className="w-full mt-6 gap-3">
              <TextInput
                value={typed}
                onChangeText={setTyped}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Their code, like AbCd eFgH iJkL"
                placeholderTextColor="#71717a"
                returnKeyType="go"
                onSubmitEditing={submitTyped}
                onFocus={scrollToBox}
                className="bg-zinc-900 text-white px-4 py-3.5 rounded-2xl border border-zinc-800"
                style={INPUT_TEXT}
              />
              <Pressable
                onPress={submitTyped}
                disabled={busy || !typed.trim()}
                className={`rounded-full py-3.5 items-center ${typed.trim() ? "bg-white" : "bg-zinc-800"}`}
              >
                {busy ? (
                  <ActivityIndicator color="black" />
                ) : (
                  <Text className={`font-bold ${typed.trim() ? "text-black" : "text-zinc-500"}`}>Connect</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setTyping(true)} hitSlop={8} className="mt-6 py-2 active:opacity-60">
              <Text className="text-zinc-400 font-semibold">Type a code instead</Text>
            </Pressable>
          )}

          <Pressable onPress={confirmReset} hitSlop={8} className="mt-10 py-2 active:opacity-60">
            <Text className="text-zinc-600 text-sm">Get a new code</Text>
          </Pressable>
      </View>

      <Scanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onCode={async (scanned) => {
          setScanning(false);
          const ok = await connectWithCode(scanned);
          if (ok) router.back();
        }}
      />
    </Animated.ScrollView>
  );
}

/** The camera, looking for a Venture QR code */
function Scanner({
  visible,
  onClose,
  onCode,
}: {
  visible: boolean;
  onClose: () => void;
  onCode: (code: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);
  const [notOurs, setNotOurs] = useState(false);

  const onScanned = ({data}: {data: string}) => {
    if (handled) return;
    const code = parseCode(data);
    if (!code) {
      setNotOurs(true);
      return;
    }
    setHandled(true);
    onCode(code);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      onShow={() => {
        setHandled(false);
        setNotOurs(false);
      }}
    >
      <View className="flex-1 bg-black">
        {permission?.granted ? (
          <CameraView
            style={{flex: 1}}
            facing="back"
            barcodeScannerSettings={{barcodeTypes: ["qr"]}}
            onBarcodeScanned={handled ? undefined : onScanned}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-10 gap-4">
            <Ionicons name="camera-outline" size={40} color="#a1a1aa" />
            <Text className="text-white font-bold text-lg text-center">Scan their code</Text>
            <Text className="text-zinc-400 text-center">
              Venture uses the camera only to read the code. Nothing is recorded.
            </Text>
            <Pressable
              onPress={requestPermission}
              className="bg-white rounded-full px-6 py-3 mt-2 active:opacity-80"
            >
              <Text className="text-black font-bold">
                {permission && !permission.canAskAgain ? "Allow in Settings" : "Allow camera"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* The frame, and a note when the code isn't a Venture one */}
        {permission?.granted && (
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View className="w-64 h-64 rounded-[32px] border-4 border-white/80" />
            <Text className="text-white font-semibold mt-6 bg-black/50 px-4 py-2 rounded-full">
              {notOurs ? "That's not a Venture code" : "Point at their Venture code"}
            </Text>
          </View>
        )}

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="absolute left-5 w-11 h-11 rounded-full bg-black/60 items-center justify-center"
          style={{top: insets.top + 8}}
        >
          <Ionicons name="close" size={24} color="white" />
        </Pressable>
      </View>
    </Modal>
  );
}
