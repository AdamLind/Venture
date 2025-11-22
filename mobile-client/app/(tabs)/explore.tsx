import {
  Pressable,
  TextInput,
  View,
  Text,
  FlatList,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from "react-native";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import {useRef, useState, useEffect, useCallback} from "react";
import {useRouter, useNavigation} from "expo-router";

// --- INTERFACES ---
interface DateIdea {
  idea_id: number;
  title: string;
  activity_type: "STAY_IN" | "GO_OUT";
  est_price_per_person: string;
  creator_username: string | null;
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

export default function ExploreScreen() {
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [ideas, setIdeas] = useState<DateIdea[]>([]);

  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const navigation = useNavigation();

  // --- 1. Fetch Available Tags on Mount ---
  useEffect(() => {
    const fetchTags = async () => {
      try {
        const response = await fetch(TAGS_URL);
        const data = await response.json();
        setAvailableTags(data);
      } catch (e) {
        console.log("Error fetching tags", e);
      }
    };
    fetchTags();
  }, []);

  // --- 2. Modified Fetch Logic ---
  const fetchIdeas = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let url = IDEA_URL;

      if (selectedTags.length > 0) {
        const tagString = selectedTags.join(",");
        url = `${FILTER_URL}?tags=${tagString}`;
      }

      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`HTTP error! Status: ${response.status}`);

      const data = await response.json();
      setIdeas(data);
    } catch (e: any) {
      console.error("Failed to fetch ideas:", e);
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTags]);

  // --- 3. Toggle Tag Selection ---
  const toggleTag = (tagName: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tagName)) {
        return prev.filter((t) => t !== tagName);
      } else {
        return [...prev, tagName];
      }
    });
  };

  // Refetch when screen focuses OR when tags change
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", fetchIdeas);
    fetchIdeas();
    return unsubscribe;
  }, [navigation, fetchIdeas]);

  // --- Render Functions ---
  const renderIdea = ({item}: {item: DateIdea}) => (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/detail/[id]",
          params: {
            id: item.idea_id.toString(),
            idea: JSON.stringify(item),
          },
        })
      }
      className="bg-zinc-900 p-5 rounded-2xl mb-4 border border-zinc-800 active:bg-zinc-800/80"
    >
      <View className="flex-row justify-between items-start mb-3">
        <Text className="text-lg font-bold text-white flex-shrink pr-2 leading-tight">
          {item.title}
        </Text>
        {/* Styled Badge matching the Detail Screen aesthetics */}
        <View
          className={`px-3 py-1 rounded-full border ${
            item.activity_type === "STAY_IN"
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-emerald-500/10 border-emerald-500/30"
          }`}
        >
          <Text
            className={`text-[10px] font-bold uppercase tracking-wider ${
              item.activity_type === "STAY_IN"
                ? "text-amber-400"
                : "text-emerald-400"
            }`}
          >
            {item.activity_type.replace("_", " ")}
          </Text>
        </View>
      </View>

      <View className="flex-row justify-between items-center pt-3 border-t border-zinc-800">
        <View className="flex-row items-center">
          <Ionicons
            name="wallet-outline"
            size={14}
            color="#71717a"
            style={{marginRight: 4}}
          />
          <Text className="text-xs text-zinc-400">
            Cost:{" "}
            <Text className="font-bold text-zinc-200">
              {formatPrice(item.est_price_per_person)}
            </Text>
          </Text>
        </View>

        <View className="flex-row items-center">
          <Ionicons
            name="person-outline"
            size={14}
            color="#71717a"
            style={{marginRight: 4}}
          />
          <Text className="text-xs text-zinc-400">
            By{" "}
            <Text className="font-semibold text-zinc-300">
              {item.creator_username || "System"}
            </Text>
          </Text>
        </View>
      </View>
    </Pressable>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <View className="flex-1 justify-center items-center p-4">
          <ActivityIndicator size="large" color="#6366f1" />
          <Text className="text-zinc-500 mt-4 text-sm tracking-wide uppercase font-bold">
            Loading ideas...
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View className="flex-1 justify-start items-center p-4 bg-red-500/10 border border-red-500/20 rounded-xl m-4">
          <Text className="text-lg font-bold text-red-400 mb-2">
            Connection Error
          </Text>
          <Text className="text-sm text-red-300/80 text-center">{error}</Text>
        </View>
      );
    }

    if (ideas.length === 0) {
      return (
        <View className="flex-1 justify-start items-center p-4">
          <View className="bg-zinc-900 p-6 rounded-full mb-4 border border-zinc-800">
            <Ionicons name="file-tray-outline" size={32} color="#71717a" />
          </View>
          <Text className="text-lg font-bold text-zinc-300 mt-2">
            No Ideas Found
          </Text>
          <Text className="text-sm text-zinc-500 text-center mt-2 px-6">
            Try adjusting your filters or be the first to add a new idea!
          </Text>
          {/* Helper button to clear filters if result is empty */}
          {selectedTags.length > 0 && (
            <Pressable
              onPress={() => setSelectedTags([])}
              className="mt-6 bg-zinc-800 px-6 py-3 rounded-full active:bg-zinc-700"
            >
              <Text className="text-zinc-300 font-semibold text-sm">
                Clear Filters
              </Text>
            </Pressable>
          )}
        </View>
      );
    }

    return (
      <View className="flex-1">
        <FlatList
          data={ideas}
          keyExtractor={(item) => `idea-${item.idea_id}`}
          renderItem={renderIdea}
          onRefresh={fetchIdeas}
          refreshing={isLoading}
          contentContainerStyle={{paddingBottom: 100}}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  };

  const showTags = isSearchFocused || availableTags.length > 0;

  return (
    <View className="flex-1 bg-zinc-950 pt-12 px-5">
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View className="flex-row justify-between items-end mb-6">
        <View>
          <Text className="text-zinc-400 text-xs uppercase tracking-widest font-bold mb-1">
            Discover
          </Text>
          <Text className="text-3xl font-bold text-white">
            {selectedTags.length > 0 ? "Filtered" : "Explore"}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/create")}
          className="bg-indigo-600 h-10 w-10 rounded-full flex-row justify-center items-center shadow-lg shadow-indigo-900/30 active:bg-indigo-700"
        >
          <Ionicons name="add" size={24} color="white" />
        </Pressable>
      </View>

      {/* Search Bar UI */}
      <Pressable
        onPress={() => inputRef.current?.focus()}
        className={`mb-4 rounded-xl bg-zinc-900 border ${
          isSearchFocused ? "border-zinc-700" : "border-zinc-800"
        } w-full h-14 px-4`}
      >
        {/* Parent has 'items-center', which vertically centers the children */}
        <View className="flex flex-row items-center h-full gap-3">
          <Ionicons name="search" size={20} color="#a1a1aa" />
          <TextInput
            ref={inputRef}
            // 1. REMOVE 'h-full'
            // 2. REMOVE 'leading-tight' (let iOS calculate natural line height)
            // 3. KEEP 'py-0' to strip any default browser/webview padding
            className="flex-1 py-0 text-white text-[16px]"
            placeholder="Search tags..."
            placeholderTextColor="#52525b"
            value={query}
            onChangeText={setQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
        </View>
      </Pressable>

      {/* --- TAGS SECTION (Horizontal Scroll) --- */}
      {showTags && (
        <View className="w-full mb-6 h-9">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {availableTags
              // Optional: Filter tags in UI based on search query
              .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
              .map((tag) => {
                const isSelected = selectedTags.includes(tag.name);
                return (
                  <Pressable
                    key={tag.tag_id}
                    onPress={() => toggleTag(tag.name)}
                    className={`mr-2 px-4 py-1.5 justify-center items-center rounded-full border ${
                      isSelected
                        ? "bg-indigo-500/20 border-indigo-500"
                        : "bg-zinc-900 border-zinc-800"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? "text-indigo-300" : "text-zinc-400"
                      }`}
                    >
                      {tag.name}
                    </Text>
                  </Pressable>
                );
              })}
          </ScrollView>
        </View>
      )}

      {/* List Content */}
      <View className="flex-1">{renderContent()}</View>
    </View>
  );
}
