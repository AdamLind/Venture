// app/capture.tsx
// The live date camera (#40): one camera (flip between back and front), no
// photo library. Take it, look at it, then keep it or retake; once it's
// kept it's on the date (you can still delete it later, #45).
// Opened from the live date: its camera button, a "Time for a photo" prompt
// (a stop photo), or the wrap-up (the end-of-date photo).

import React, {useRef, useState} from "react";
import {ActivityIndicator, Linking, Pressable, StyleSheet, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {router, useLocalSearchParams} from "expo-router";
import {CameraView, useCameraPermissions, type CameraType} from "expo-camera";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import {type CaptureKind, savePhoto} from "@/src/lib/captures";
import {useCaptureStore} from "@/src/store/useCaptureStore";
import {useProfileStore} from "@/src/store/useProfileStore";
import {showDone, showError} from "@/src/lib/notify";

export default function CaptureScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{itineraryId: string; ideaId?: string; kind?: CaptureKind; label?: string}>();
  const itineraryId = Number(params.itineraryId);
  const ideaId = params.ideaId ? Number(params.ideaId) : null;
  const kind: CaptureKind = params.kind === "END" ? "END" : "STOP";
  const userId = useProfileStore((s) => s.userId);
  const add = useCaptureStore((s) => s.add);

  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("back");
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const take = async () => {
    if (!camera.current || taking) return;
    setTaking(true);
    try {
      const photo = await camera.current.takePictureAsync({quality: 0.85});
      if (photo?.uri) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setShot(photo.uri);
      }
    } catch (e) {
      showError("Couldn't take the photo", e);
    } finally {
      setTaking(false);
    }
  };

  const keep = async () => {
    if (!shot || !userId || !Number.isFinite(itineraryId)) return;
    setSaving(true);
    try {
      const saved = await savePhoto(shot, {userId, itineraryId, ideaId: kind === "STOP" ? ideaId : null, kind});
      add(saved);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showDone(kind === "END" ? "Saved to your memories" : "Photo saved", params.label || undefined);
      router.back();
    } catch (e) {
      setSaving(false);
      showError("Couldn't save the photo", e);
    }
  };

  const title = kind === "END" ? "One last photo" : params.label || "A photo of the date";

  return (
    <View style={styles.fill}>
      {!permission ? null : !permission.granted ? (
        <View className="flex-1 items-center justify-center px-10 gap-4">
          <Ionicons name="camera-outline" size={40} color="#a1a1aa" />
          <Text className="text-white font-bold text-lg text-center">Photos of your date</Text>
          <Text className="text-zinc-400 text-center">
            Take photos as the date happens. They&apos;re only seen by the people on it, and your person.
          </Text>
          <Pressable
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
            className="bg-white rounded-full px-6 py-3 mt-2 active:opacity-80"
          >
            <Text className="text-black font-bold">
              {permission.canAskAgain ? "Allow camera" : "Allow in Settings"}
            </Text>
          </Pressable>
        </View>
      ) : shot ? (
        // THE PHOTO: keep it or retake
        <Image source={{uri: shot}} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mirror={facing === "front"}
          onCameraReady={() => setReady(true)}
        />
      )}

      {/* TOP: close, and what it's of */}
      <View
        pointerEvents="box-none"
        className="absolute left-0 right-0 flex-row items-center px-4 gap-3"
        style={{top: insets.top + 8}}
      >
        <Pressable
          onPress={() => router.back()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="w-11 h-11 rounded-full bg-black/50 items-center justify-center active:opacity-70"
        >
          <Ionicons name="close" size={24} color="white" />
        </Pressable>
        <View className="flex-1 items-center pr-14">
          <Text className="text-white font-bold text-base bg-black/40 px-3 py-1 rounded-full" numberOfLines={1}>
            {title}
          </Text>
        </View>
      </View>

      {/* BOTTOM: the shutter and flip, or keep / retake */}
      {permission?.granted && (
        <View className="absolute left-0 right-0 items-center px-6" style={{bottom: insets.bottom + 24}}>
          {shot ? (
            <View className="flex-row gap-3 w-full">
              <Pressable
                onPress={() => setShot(null)}
                disabled={saving}
                accessibilityRole="button"
                className="flex-1 h-14 rounded-full bg-black/60 border border-white/20 flex-row items-center justify-center gap-2 active:opacity-70"
              >
                <Ionicons name="refresh" size={18} color="white" />
                <Text className="text-white font-bold text-base">Retake</Text>
              </Pressable>
              <Pressable
                onPress={keep}
                disabled={saving}
                accessibilityRole="button"
                className="flex-1 h-14 rounded-full bg-white flex-row items-center justify-center gap-2 active:opacity-80"
              >
                {saving ? (
                  <ActivityIndicator color="black" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="black" />
                    <Text className="text-black font-extrabold text-base">Use photo</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-center justify-center w-full">
              <View className="flex-1" />
              <Pressable
                onPress={take}
                disabled={!ready || taking}
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                className="w-20 h-20 rounded-full border-4 border-white items-center justify-center active:opacity-80"
              >
                <View className="w-16 h-16 rounded-full bg-white" style={{opacity: ready && !taking ? 1 : 0.5}} />
              </Pressable>
              <View className="flex-1 items-center">
                <Pressable
                  onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
                  accessibilityRole="button"
                  accessibilityLabel={facing === "back" ? "Use the front camera" : "Use the back camera"}
                  className="w-12 h-12 rounded-full bg-black/50 items-center justify-center active:opacity-70"
                >
                  <Ionicons name="camera-reverse-outline" size={24} color="white" />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1, backgroundColor: "#000"},
});
