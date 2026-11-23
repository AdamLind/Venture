// components/ideas/SaveTip.tsx
// The first time you save something with a partner (#35): tap saves to your
// shared Bucket List, long-press saves just for you (for planning a
// surprise). Offers to make the one you just saved private.

import React from "react";
import {Modal, Pressable, Text, View} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import Toast from "@/src/lib/toast";

import {SAVED_COLOR} from "@/components/ideas/SaveButton";
import {usePartner} from "@/src/store/useConnectionsStore";
import {useSaveTipStore} from "@/src/store/useSaveTipStore";
import {useSavedStore} from "@/src/store/useSavedStore";

const PARTNER_COLOR = "#f472b6";

export default function SaveTip() {
  const ideaId = useSaveTipStore((s) => s.ideaId);
  const close = useSaveTipStore((s) => s.close);
  const partner = usePartner();
  const name = partner ? `@${partner.username}` : "your person";

  const keepPrivate = async () => {
    const id = ideaId;
    close();
    if (id == null) return;
    try {
      await useSavedStore.getState().setShared(id, false);
      Toast.show({type: "success", text1: "Kept private", text2: `${name} won't see it`});
    } catch (e) {
      Toast.show({type: "error", text1: "Couldn't change that", text2: e instanceof Error ? e.message : undefined});
    }
  };

  return (
    <Modal visible={ideaId != null} transparent animationType="fade" onRequestClose={close}>
      <Pressable onPress={close} className="flex-1 bg-black/70 items-center justify-center px-6">
        <Pressable className="w-full bg-zinc-900 border border-zinc-800 rounded-[28px] p-6 gap-5" onPress={() => {}}>
          <View className="gap-1">
            <Text className="text-white font-extrabold text-xl">Saved</Text>
            <Text className="text-zinc-400 text-sm">There are two ways to save:</Text>
          </View>

          <View className="flex-row gap-3">
            <View className="w-11 h-11 rounded-full bg-zinc-800 items-center justify-center">
              <Ionicons name="bookmark" size={20} color={SAVED_COLOR} />
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold">Tap</Text>
              <Text className="text-zinc-400 text-sm">
                Saves to <Text style={{color: PARTNER_COLOR}}>Ours</Text>, so {name} sees it too. Great for planning
                a date from each other&apos;s lists.
              </Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="w-11 h-11 rounded-full bg-zinc-800 items-center justify-center">
              <Ionicons name="lock-closed" size={18} color="#d4d4d8" />
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold">Press and hold</Text>
              <Text className="text-zinc-400 text-sm">
                Saves just for you. {name} won&apos;t see it, so it&apos;s safe for planning a surprise.
              </Text>
            </View>
          </View>

          <View className="gap-2 mt-1">
            <Pressable onPress={close} className="bg-white rounded-full py-3.5 items-center active:opacity-80">
              <Text className="text-black font-bold">Got it</Text>
            </Pressable>
            <Pressable onPress={keepPrivate} className="py-2.5 items-center active:opacity-60">
              <Text className="text-zinc-400 font-semibold">Keep this one private</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
