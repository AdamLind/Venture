import {
  Pressable,
  TextInput,
  View,
  Text,
  FlatList,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import {useRef, useState, useEffect, useCallback} from "react";
import {useRouter, useFocusEffect} from "expo-router";
import MapView, {Marker, Callout} from "react-native-maps";

// --- TYPES & CONSTANTS ---
interface DateIdea {
  idea_id: number;
  title: string;
  modality: "STAY_IN" | "GO_OUT";
  est_price_per_person: string;
  creator_username: string | null;
  latitude?: string | null;
  longitude?: string | null;
}

interface Tag {
  tag_id: number;
  name: string;
}

const API_HOST = process.env.EXPO_PUBLIC_API_HOST;
const IDEA_URL = `${API_HOST}/api/ideas`;
const FILTER_URL = `${API_HOST}/api/ideas/filter`;
const TAGS_URL = `${API_HOST}/api/tags`;

const formatPrice = (priceString: string): string => {
  const price = parseFloat(priceString);
  return isNaN(price) || price === 0 ? "Free" : `$${price.toFixed(2)}`;
};

// --- SKELETON COMPONENT ---
const SkeletonIdea = () => (
  <View className="bg-zinc-900 p-5 rounded-2xl mb-4 border border-zinc-800">
    <View className="flex-row justify-between items-start mb-3">
      <View className="h-6 w-3/4 bg-zinc-800/50 rounded-md" />
      <View className="h-5 w-16 bg-zinc-800/50 rounded-full" />
    </View>
    <View className="flex-row justify-between items-center pt-3 border-t border-zinc-800">
      <View className="h-4 w-20 bg-zinc-800/50 rounded-md" />
    </View>
  </View>
);

export default function ExploreScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  // --- STATE ---
  const [ideas, setIdeas] = useState<DateIdea[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [query, setQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- FETCHING ---
  useEffect(() => {
    fetch(TAGS_URL)
      .then((res) => res.json())
      .then((data) => Array.isArray(data) && setAvailableTags(data))
      .catch((err) => console.log("Tag error:", err));
  }, []);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      const fetchIdeas = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const url =
            selectedTags.length > 0
              ? `${FILTER_URL}?tags=${selectedTags.join(",")}`
              : IDEA_URL;
          const response = await fetch(url, {signal: controller.signal});
          if (!response.ok) throw new Error("Server Error");
          const data = await response.json();
          setIdeas(Array.isArray(data) ? data : []);
        } catch (e: any) {
          if (e.name !== "AbortError") {
            setError(e.message);
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsLoading(false);
            setIsInitialLoad(false);
          }
        }
      };
      fetchIdeas();
      return () => controller.abort();
    }, [selectedTags]),
  );

  const toggleTag = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName],
    );
  };

  // --- UI COMPONENTS ---
  const renderIdeaItem = ({item}: {item: DateIdea}) => (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/detail/[id]",
          params: {id: item.idea_id.toString(), idea: JSON.stringify(item)},
        })
      }
      className="bg-zinc-900 p-5 rounded-2xl mb-4 border border-zinc-800 active:bg-zinc-800/80"
    >
      <View className="flex-row justify-between items-start mb-3">
        <Text className="text-lg font-bold text-white flex-shrink pr-2">
          {item.title}
        </Text>
        <View
          className={`px-3 py-1 rounded-full border ${
            item.modality === "STAY_IN"
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-emerald-500/10 border-emerald-500/30"
          }`}
        >
          <Text
            className={`text-[10px] font-bold uppercase ${
              item.modality === "STAY_IN"
                ? "text-amber-400"
                : "text-emerald-400"
            }`}
          >
            { (item.modality ?? "UNKNOWN").replace("_", " ") }
          </Text>
        </View>
      </View>
      <Text className="text-xs text-zinc-400">
        Cost:{" "}
        <Text className="font-bold text-zinc-200">
          {formatPrice(item.est_price_per_person)}
        </Text>
      </Text>
    </Pressable>
  );

  const renderEmptyState = () => {
    // If we are currently fetching data, show a spinner inside the empty area
    // instead of the "No Ideas Found" text.
    if (isLoading) {
      return (
        <View className="flex-1 justify-start items-center p-4 mt-10">
          <ActivityIndicator size="large" color="#71717a" />
          <Text className="text-zinc-500 text-sm mt-4">
            Updating results...
          </Text>
        </View>
      );
    }

    return (
      <View className="flex-1 justify-start items-center p-4 mt-10">
        <View className="bg-zinc-900 p-6 rounded-full mb-4 border border-zinc-800">
          <Ionicons name="search-outline" size={32} color="#71717a" />
        </View>
        <Text className="text-lg font-bold text-zinc-300 mt-2">
          No Ideas Found
        </Text>
      </View>
    );
  };

  const renderContent = () => {
    // 1. ERROR STATE (Keep this, usually fine to replace screen on error)
    if (error) {
      return (
        <View className="flex-1 justify-center items-center p-4">
          <Text className="text-red-400 mb-4">{error}</Text>
          <Pressable
            onPress={() => {
              setIsLoading(true);
              setError(null);
            }}
            className="bg-red-500/20 px-6 py-2 rounded-full"
          >
            <Text className="text-red-300 font-bold">Retry</Text>
          </Pressable>
        </View>
      );
    }

    // 2. MAP VIEW HANDLING
    if (viewMode === "map") {
      const mapMarkers = ideas
        .filter((i) => i.latitude && i.longitude && i.modality === "GO_OUT")
        .filter(
          (v, i, a) => a.findIndex((v2) => v2.idea_id === v.idea_id) === i,
        );

      return (
        <View className="flex-1 rounded-xl overflow-hidden border border-zinc-800 mb-24 relative">
          <MapView
            style={{flex: 1}}
            // Note: Use PROVIDER_GOOGLE if using Google Maps on iOS
            initialRegion={{
              latitude: 40.2312,
              longitude: -111.6614,
              latitudeDelta: 0.1,
              longitudeDelta: 0.1,
            }}
          >
            {mapMarkers.map((item, index) => (
              <Marker
                key={index}
                pinColor="#28cfecff"
                coordinate={{
                  latitude: parseFloat(item.latitude!),
                  longitude: parseFloat(item.longitude!),
                }}
              >
                <Callout
                  onPress={() =>
                    router.push({
                      pathname: "/detail/[id]",
                      params: {
                        id: item.idea_id.toString(),
                        idea: JSON.stringify(item),
                      },
                    })
                  }
                >
                  <View className="p-2 w-40">
                    <Text className="font-bold text-sm mb-1">{item.title}</Text>
                    <Text className="text-xs text-green-600 font-bold">
                      {Number(item.est_price_per_person) > 0
                        ? `$${item.est_price_per_person} per person`
                        : "Free!"}
                    </Text>
                    <Text className="text-xs text-indigo-600 font-bold">
                      Tap for more details
                    </Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>

          {/* LOADING OVERLAY - This sits ON TOP of the map without unmounting it */}
          {isLoading && (
            <View className="absolute inset-0 bg-black/40 justify-center items-center z-10">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}

          {/* NO RESULTS OVERLAY */}
          {!isLoading && ideas.length === 0 && (
            <View className="absolute top-5 self-center bg-zinc-900/90 px-6 py-2 rounded-full border border-zinc-700 z-10">
              <Text className="text-zinc-300 text-xs font-bold">
                No locations found
              </Text>
            </View>
          )}
        </View>
      );
    }

    // 3. LIST VIEW HANDLING
    // Here we DO want the skeleton loader when fetching
    if (isLoading && isInitialLoad) {
      return (
        <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonIdea key={i} />
          ))}
        </ScrollView>
      );
    }

    return (
      <View className="flex-1">
        <FlatList
          data={ideas}
          keyExtractor={(item) => `idea-${item.idea_id}`}
          renderItem={renderIdeaItem}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  };

  return (
    <View className="flex-1 bg-zinc-950 pt-12 px-5">
      <StatusBar barStyle="light-content" />

      {/* HEADER WITH LOADING SPINNER */}
      <View className="flex-row justify-between items-end mb-6">
        <View>
          <Text className="text-zinc-400 text-xs uppercase font-bold mb-1">
            Discover
          </Text>
          <View className="flex-row items-center">
            <Text className="text-3xl font-bold text-white mr-3">
              {selectedTags.length > 0 ? "Filtered" : "Explore"}
            </Text>
            {/* SUBTLE HEADER SPINNER */}
            {isLoading && <ActivityIndicator size="small" color="#71717a" />}
          </View>
        </View>

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => setViewMode(viewMode === "list" ? "map" : "list")}
            className="bg-zinc-800 h-10 px-4 rounded-full flex-row justify-center items-center border border-zinc-700"
          >
            <Ionicons
              name={viewMode === "list" ? "map-outline" : "list-outline"}
              size={18}
              color="white"
              style={{marginRight: 6}}
            />
            <Text className="text-white font-bold text-xs">
              {viewMode === "list" ? "MAP" : "LIST"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/create")}
            className="bg-indigo-600 h-10 w-10 rounded-full flex-row justify-center items-center active:bg-indigo-700"
          >
            <Ionicons name="add" size={24} color="white" />
          </Pressable>
        </View>
      </View>

      {/* SEARCH */}
      <Pressable
        onPress={() => inputRef.current?.focus()}
        className={`mb-4 rounded-xl bg-zinc-900 border ${
          isSearchFocused ? "border-zinc-700" : "border-zinc-800"
        } w-full h-14 px-4`}
      >
        <View className="flex flex-row items-center h-full gap-3">
          <Ionicons name="search" size={20} color="#a1a1aa" />
          <TextInput
            ref={inputRef}
            className="flex-1 text-white text-[16px]"
            placeholder="Search tags..."
            placeholderTextColor="#52525b"
            value={query}
            onChangeText={setQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
        </View>
      </Pressable>

      {/* TAGS */}
      {(isSearchFocused || availableTags.length > 0) && (
        <View className="w-full mb-6 h-9">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {availableTags
              .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
              .map((tag) => (
                <Pressable
                  key={tag.tag_id}
                  onPress={() => toggleTag(tag.name)}
                  className={`mr-2 px-4 py-1.5 rounded-full border ${
                    selectedTags.includes(tag.name)
                      ? "bg-indigo-500/20 border-indigo-500"
                      : "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  <Text
                    className={`text-sm font-bold ${
                      selectedTags.includes(tag.name)
                        ? "text-indigo-300"
                        : "text-zinc-400"
                    }`}
                  >
                    {tag.name}
                  </Text>
                </Pressable>
              ))}
          </ScrollView>
        </View>
      )}

      {/* CONTENT */}
      <View className="flex-1">{renderContent()}</View>
    </View>
  );
}
