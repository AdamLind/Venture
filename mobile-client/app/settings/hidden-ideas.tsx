// app/settings/hidden-ideas.tsx
// Ideas you marked "Not interested" (public.hidden_ideas), newest first.
// Unhiding puts an idea back in Discover and the builder.

import React, {useCallback, useState} from "react";
import {useFocusEffect} from "expo-router";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";
import Toast from "react-native-toast-message";

import ScreenHeader from "@/components/ui/ScreenHeader";
import {IdeaMeta, openIdea} from "@/components/ideas/IdeaRows";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {IDEA_SUMMARY_COLUMNS, ideaImage} from "@/src/lib/ideas";
import {useHiddenStore} from "@/src/store/useHiddenStore";
import {useProfileStore} from "@/src/store/useProfileStore";
import type {IdeaSummary} from "@/types/ideas";

type HiddenRow = {idea_id: number; idea: IdeaSummary | null};

export default function HiddenIdeasScreen() {
  const userId = useProfileStore((s) => s.userId);
  const unhide = useHiddenStore((s) => s.unhide);

  const [rows, setRows] = useState<HiddenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const {data, error: dbError} = await supabase
      .from("hidden_ideas")
      .select(`idea_id, created_at, activities ( ${IDEA_SUMMARY_COLUMNS} )`)
      .eq("user_id", userId)
      .order("created_at", {ascending: false});
    if (dbError) {
      setError(friendlyError(dbError));
      return;
    }
    setError(null);
    setRows(
      (data ?? []).map((row: any) => ({
        idea_id: row.idea_id,
        idea: row.activities ?? null,
      })),
    );
  }, [userId]);

  // On focus, so coming back from an idea's page stays current
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onUnhide = async (ideaId: number) => {
    setBusy(ideaId);
    try {
      await unhide(ideaId);
      setRows((prev) => prev?.filter((row) => row.idea_id !== ideaId) ?? prev);
      Toast.show({
        type: "success",
        text1: "It's back in Discover",
        position: "bottom",
      });
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Couldn't unhide it",
        text2: e instanceof Error ? e.message : undefined,
        position: "bottom",
      });
    } finally {
      setBusy(null);
    }
  };

  const visible = rows;

  return (
    <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
      <ScreenHeader title="Hidden ideas" />
      <ScrollView
        contentContainerStyle={{paddingHorizontal: 20, paddingTop: 8, paddingBottom: 64, gap: 12}}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a1a1aa" />
        }
      >
        <Text className="text-zinc-500 text-sm px-1 mb-1">
          Ideas you marked &quot;Not interested&quot;. They won&apos;t show up in
          Discover or when you plan a date.
        </Text>

        {visible === null ? (
          error ? (
            <View className="items-center py-10 gap-3">
              <Text className="text-zinc-400 text-center">{error}</Text>
              <Pressable onPress={load} className="bg-zinc-800 px-5 py-2.5 rounded-full">
                <Text className="text-white font-bold">Try again</Text>
              </Pressable>
            </View>
          ) : (
            <ActivityIndicator color="#a1a1aa" style={{marginTop: 40}} />
          )
        ) : visible.length === 0 ? (
          <View className="items-center py-12 gap-2">
            <Ionicons name="eye-off-outline" size={32} color="#52525b" />
            <Text className="text-white font-bold text-base">Nothing hidden</Text>
            <Text className="text-zinc-500 text-sm text-center">
              Use ••• on an idea and pick Not interested to hide it.
            </Text>
          </View>
        ) : (
          visible.map(({idea_id, idea}) => (
            <View
              key={idea_id}
              className="flex-row items-center bg-zinc-900 border border-zinc-800 rounded-3xl p-3"
            >
              <Pressable
                onPress={() => idea && openIdea(idea_id)}
                disabled={!idea}
                className="flex-1 flex-row items-center active:opacity-80"
              >
                {idea ? (
                  <Image
                    source={{uri: ideaImage(idea)}}
                    style={{width: 56, height: 56, borderRadius: 16}}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    className="bg-zinc-800 items-center justify-center"
                    style={{width: 56, height: 56, borderRadius: 16}}
                  >
                    <Ionicons name="image-outline" size={20} color="#52525b" />
                  </View>
                )}
                <View className="flex-1 ml-3 mr-2">
                  <Text className="text-white font-bold text-base mb-0.5" numberOfLines={1}>
                    {idea?.title ?? "No longer available"}
                  </Text>
                  {idea && <IdeaMeta idea={idea} />}
                </View>
              </Pressable>
              <Pressable
                onPress={() => onUnhide(idea_id)}
                disabled={busy === idea_id}
                accessibilityRole="button"
                accessibilityLabel={`Unhide ${idea?.title ?? "idea"}`}
                className="bg-zinc-800 rounded-full px-4 py-2 active:opacity-70"
              >
                {busy === idea_id ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-bold text-sm">Unhide</Text>
                )}
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
