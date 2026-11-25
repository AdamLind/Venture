// app/search.tsx
// Search every idea, near or far (the magnifier in Discover). Discover's list
// only shows go-out ideas near you (utils/reach.ts); this is how you find
// one somewhere else, like snowboarding at Nordic Valley for a day trip.
// Matches as you type (src/lib/ideaSearch.ts), best match first, then the
// closest.

import React, {useEffect, useMemo, useState} from "react";
import {ActivityIndicator, FlatList, Keyboard, Pressable, Text, TextInput, View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useRouter} from "expo-router";
import {Ionicons} from "@expo/vector-icons";

import {SavedIdeaRow} from "@/components/ideas/IdeaRows";
import {supabase} from "@/src/supabase";
import {searchScore, searchWords} from "@/src/lib/ideaSearch";
import {useProfileStore} from "@/src/store/useProfileStore";
import {useHiddenStore} from "@/src/store/useHiddenStore";
import {useBlockStore} from "@/src/store/useBlockStore";
import {useLocationStore} from "@/src/store/useLocationStore";
import {toPlanningDefaults} from "@/src/lib/profile";
import {parseCoordinates} from "@/utils/timeline";
import {getDistance} from "@/utils/geo";
import type {IdeaSummary} from "@/types/ideas";

type SearchIdea = IdeaSummary & {
  description: string | null;
  user_id: string | null;
  venues: {name: string; address: string | null; coordinates: string | null} | null;
  activity_tags: {tags: {name: string} | null}[] | null;
  latitude: number | null;
  longitude: number | null;
};

/** Font size only (a line height pushes text off centre on iOS) */
const INPUT_TEXT = {fontSize: 16};

export default function SearchScreen() {
  const router = useRouter();
  const myId = useProfileStore((s) => s.userId);
  const preferences = useProfileStore((s) => s.preferences);
  const hiddenIds = useHiddenStore((s) => s.ids);
  const blockedIds = useBlockStore((s) => s.ids);
  const userLocation = useLocationStore((s) => s.userLocation);

  const [query, setQuery] = useState("");
  const [ideas, setIdeas] = useState<SearchIdea[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The same ideas as Discover (published, plus yours that weren't rejected),
  // with what search reads: description, place and tags
  useEffect(() => {
    let live = true;
    (async () => {
      const visible = myId
        ? `and(visibility.eq.PUBLISHED,held_at.is.null),and(user_id.eq.${myId},visibility.neq.REJECTED)`
        : "and(visibility.eq.PUBLISHED,held_at.is.null)";
      const {data, error: dbError} = await supabase
        .from("activities")
        .select(
          `idea_id, title, description, image_urls, est_price_per_person, est_duration_minutes,
           modality, visibility, moderation_note, created_at, time_of_day, user_id,
           venues ( name, address, coordinates ),
           activity_tags ( tags ( name ) )`,
        )
        .or(visible);
      if (!live) return;
      if (dbError) {
        console.error("Search fetch error:", dbError);
        setError("Couldn't load ideas. Go back and try again.");
        return;
      }
      setIdeas(
        (data ?? []).map((row: any) => {
          const at = parseCoordinates(row.venues?.coordinates);
          return {...row, latitude: at?.latitude ?? null, longitude: at?.longitude ?? null};
        }),
      );
    })();
    return () => {
      live = false;
    };
  }, [myId]);

  // Distances from you, or from your home area when location is off
  const from = useMemo(() => {
    if (userLocation) return userLocation;
    const {home_lat, home_lng} = toPlanningDefaults(preferences);
    return home_lat != null && home_lng != null ? {latitude: home_lat, longitude: home_lng} : null;
  }, [userLocation, preferences]);
  const milesTo = (idea: SearchIdea): number | null =>
    from && idea.modality === "GO_OUT" && idea.latitude != null && idea.longitude != null
      ? getDistance(from, {latitude: idea.latitude, longitude: idea.longitude})
      : null;

  const words = searchWords(query);
  const results = useMemo(() => {
    if (!ideas || !words.length) return [];
    return ideas
      .filter((idea) => !hiddenIds.has(idea.idea_id) && !(idea.user_id && blockedIds.has(idea.user_id)))
      .map((idea) => ({idea, score: searchScore(idea, words), miles: milesTo(idea)}))
      .filter((hit): hit is typeof hit & {score: number} => hit.score != null)
      .sort((a, b) => b.score - a.score || (a.miles ?? 0) - (b.miles ?? 0));
    // `words` is derived from query; milesTo from `from`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideas, query, hiddenIds, blockedIds, from]);

  const distanceLabel = (miles: number | null) =>
    miles == null
      ? undefined
      : miles < 0.2
        ? "Nearby"
        : `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;

  return (
    <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
      <View className="flex-row items-center gap-2 px-4 py-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-10 h-10 rounded-full items-center justify-center active:bg-zinc-900"
        >
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
        <View className="flex-1 flex-row items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 h-11">
          <Ionicons name="search" size={16} color="#71717a" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="Snowboarding, tacos, a town…"
            placeholderTextColor="#71717a"
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search ideas"
            className="flex-1 text-white"
            style={INPUT_TEXT}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color="#71717a" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {error ? (
        <Text className="text-red-400 text-center mt-16 px-10">{error}</Text>
      ) : !ideas ? (
        <ActivityIndicator className="mt-16" color="#a1a1aa" />
      ) : !words.length ? (
        <View className="items-center mt-16 px-10">
          <Ionicons name="search-outline" size={28} color="#52525b" />
          <Text className="text-zinc-400 text-center mt-3 leading-5">
            Search every idea, near or far: an activity, a place or a town.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(hit) => `search-${hit.idea.idea_id}`}
          keyboardShouldPersistTaps="handled"
          // (the last results can scroll up above the keyboard)
          automaticallyAdjustKeyboardInsets
          onScrollBeginDrag={Keyboard.dismiss}
          contentContainerStyle={{paddingHorizontal: 20, paddingTop: 8, paddingBottom: 64, gap: 10}}
          renderItem={({item: hit}) => (
            <SavedIdeaRow idea={hit.idea} label={distanceLabel(hit.miles)} />
          )}
          ListEmptyComponent={
            <View className="items-center mt-16 px-10">
              <Text className="text-white font-bold text-base">Nothing matches “{query.trim()}”</Text>
              <Text className="text-zinc-500 text-center mt-1 leading-5">
                Try another word, or share it as an idea.
              </Text>
              <Pressable
                onPress={() => router.push("/create")}
                accessibilityRole="button"
                className="mt-3 active:opacity-70"
                hitSlop={8}
              >
                <Text className="text-amber-400 font-semibold text-sm">Share an idea</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
