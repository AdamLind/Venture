// components/dates/PhotoViewer.tsx
// A date's photos full screen (#43): swipe between them, see who took each
// and when, and delete your own (#45: the files go too).

import React, {useRef, useState} from "react";
import {FlatList, Modal, Pressable, Text, View, useWindowDimensions} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";

import Overlays from "@/components/sheets/Overlays";
import type {Capture} from "@/src/lib/captures";
import {useCaptureStore} from "@/src/store/useCaptureStore";
import {confirm} from "@/src/lib/sheets";
import {showDone, showError} from "@/src/lib/notify";

export default function PhotoViewer({
  photos,
  startAt,
  myUserId,
  nameOf,
  onClose,
}: {
  photos: Capture[];
  /** Which one to open on (null: closed) */
  startAt: number | null;
  myUserId: string | null;
  /** "You", "@sam" */
  nameOf: (userId: string) => string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const {width, height} = useWindowDimensions();
  const remove = useCaptureStore((s) => s.remove);
  const [index, setIndex] = useState(startAt ?? 0);
  const [deleting, setDeleting] = useState(false);
  const list = useRef<FlatList<Capture>>(null);

  const visible = startAt != null && photos.length > 0;
  // Opened on another photo: start there
  const [openedAt, setOpenedAt] = useState(startAt);
  if (startAt !== openedAt) {
    setOpenedAt(startAt);
    setIndex(startAt ?? 0);
  }

  const current = photos[Math.min(index, photos.length - 1)];
  const mine = !!current && current.user_id === myUserId;

  const askDelete = async () => {
    if (!current) return;
    const ok = await confirm({
      title: "Delete this photo?",
      message: "It's removed from the date for everyone, for good.",
      confirmLabel: "Delete",
      destructive: true,
      icon: "trash-outline",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const last = photos.length === 1;
      await remove(current);
      showDone("Photo deleted");
      if (last) onClose();
    } catch (e) {
      showError("Couldn't delete it", e);
    } finally {
      setDeleting(false);
    }
  };

  if (!visible) return null;
  const when = current
    ? new Date(current.created_at).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 bg-black">
        <FlatList
          ref={list}
          data={photos}
          keyExtractor={(p) => String(p.capture_id)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(startAt ?? 0, photos.length - 1)}
          getItemLayout={(_, i) => ({length: width, offset: width * i, index: i})}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({item}) => (
            <Image
              source={{uri: item.url ?? item.thumbUrl ?? undefined, cacheKey: item.storage_path}}
              placeholder={item.thumbUrl ? {uri: item.thumbUrl, cacheKey: item.thumb_path ?? undefined} : undefined}
              style={{width, height}}
              contentFit="contain"
              transition={150}
              accessibilityLabel={`Photo by ${nameOf(item.user_id)}`}
            />
          )}
        />

        {/* TOP: close, who and when, delete yours */}
        <View className="absolute left-0 right-0 flex-row items-center px-4 gap-3" style={{top: insets.top + 8}}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="w-10 h-10 rounded-full bg-black/60 items-center justify-center active:opacity-70"
          >
            <Ionicons name="close" size={22} color="white" />
          </Pressable>
          <View className="flex-1">
            {current && (
              <>
                <Text className="text-white font-bold" numberOfLines={1}>
                  {nameOf(current.user_id)}
                  {current.kind === "END" ? " · End of the date" : ""}
                </Text>
                <Text className="text-zinc-300 text-xs">{when}</Text>
              </>
            )}
          </View>
          {photos.length > 1 && (
            <Text className="text-zinc-300 text-sm font-semibold">
              {Math.min(index, photos.length - 1) + 1} / {photos.length}
            </Text>
          )}
          {mine && (
            <Pressable
              onPress={askDelete}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel="Delete this photo"
              className="w-10 h-10 rounded-full bg-black/60 items-center justify-center active:opacity-70"
            >
              <Ionicons name="trash-outline" size={19} color="#f87171" />
            </Pressable>
          )}
        </View>

        {/* "Delete this photo?" over the photo */}
        <Overlays />
      </View>
    </Modal>
  );
}
