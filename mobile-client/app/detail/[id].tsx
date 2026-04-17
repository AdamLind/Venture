import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {useRouter, useLocalSearchParams} from "expo-router";
import {useState, useMemo, useEffect} from "react";
import Ionicons from "@expo/vector-icons/build/Ionicons";

interface DateIdea {
  idea_id: number;
  title: string;
  description: string | null;
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
const TAGS_URL = `${API_HOST}/api/tags`;

export default function IdeaDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const initialIdea: DateIdea = useMemo(() => {
    try {
      if (params.idea && typeof params.idea === "string") {
        return JSON.parse(params.idea) as DateIdea;
      }
      router.back();
      return {
        idea_id: -1,
        title: "",
        description: "",
        modality: "GO_OUT",
        est_price_per_person: "0",
        creator_username: null,
      };
    } catch (e) {
      console.error("Failed to parse idea param:", e);
      router.back();
      return {
        idea_id: -1,
        title: "",
        description: "",
        modality: "GO_OUT",
        est_price_per_person: "0",
        creator_username: null,
      };
    }
  }, [params.idea, router]);

  const [title, setTitle] = useState(initialIdea.title);
  const [price, setPrice] = useState(initialIdea.est_price_per_person);
  const [description, setDescription] = useState(initialIdea.description || "");
  const [type, setType] = useState<"STAY_IN" | "GO_OUT">(initialIdea.modality);

  const [latitude, setLatitude] = useState(initialIdea.latitude || "");
  const [longitude, setLongitude] = useState(initialIdea.longitude || "");
  const [isLoading, setIsLoading] = useState(false);

  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  useEffect(() => {
    // Load in the tags and set the correct state using that data
    const loadData = async () => {
      try {
        const tagsResponse = await fetch(TAGS_URL);
        const tagsData = await tagsResponse.json();
        setAvailableTags(tagsData);

        if (initialIdea.idea_id !== -1) {
          const currentTagsRes = await fetch(
            `${IDEA_URL}/${initialIdea.idea_id}/tags`,
          );
          if (currentTagsRes.ok) {
            const currentIds = await currentTagsRes.json();
            setSelectedTagIds(currentIds);
          }
        }
      } catch (e) {
        console.log("Error loading tags:", e);
      }
    };
    loadData();
  }, [initialIdea.idea_id]);

  // Set the state for a specific tag to be pushed to the database
  const toggleTag = (id: number) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(id)) return prev.filter((tagId) => tagId !== id);
      return [...prev, id];
    });
  };

  // Format the price input to match US currency
  const formatInputPrice = (value: string): string => {
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      return `${parts[0]}.${parts.slice(1).join("")}`;
    }
    return cleaned;
  };

  // Logic to handle a save on the frontend and update data on the database
  const handleSave = async () => {
    if (initialIdea.idea_id === -1) return Alert.alert("Error", "Invalid ID.");

    let finalLatitude = null;
    let finalLongitude = null;

    if (type === "GO_OUT") {
      finalLatitude = latitude.trim() || null;
      finalLongitude = longitude.trim() || null;

      if (!finalLatitude || !finalLongitude) {
        Alert.alert(
          "Missing Location",
          "Please enter both Latitude and Longitude for a 'GO OUT' activity.",
        );
        return;
      }
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${IDEA_URL}/${initialIdea.idea_id}`, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          title,
          description,
          est_price_per_person: price,
          modality: type,
          latitude: finalLatitude,
          longitude: finalLongitude,
          tags: selectedTagIds,
        }),
      });

      if (!response.ok) throw new Error("Failed to update idea");

      Alert.alert("Success", "Date idea updated!");
      router.back();
    } catch (e) {
      console.error("Save failed:", e);
      Alert.alert("Error", "Could not save changes. Check API.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle a delete on the frontend and update the backend accordingly
  const handleDelete = () => {
    if (initialIdea.idea_id === -1)
      return Alert.alert("Error", "Invalid idea ID.");

    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to delete "${initialIdea.title}"?`,
      [
        {text: "Cancel", style: "cancel"},
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsLoading(true);
            try {
              const response = await fetch(
                `${IDEA_URL}/${initialIdea.idea_id}`,
                {
                  method: "DELETE",
                },
              );

              if (!response.ok) throw new Error("Failed to delete idea");

              Alert.alert("Deleted", "Date idea removed!");
              router.back();
            } catch (e) {
              console.error("Delete failed:", e);
              Alert.alert("Error", "Could not delete idea. Check API.");
            } finally {
              setIsLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-zinc-950"
    >
      <ScrollView
        className="flex-1 px-5 pt-6"
        contentContainerStyle={{paddingBottom: 40}}
      >
        <View className="flex-row justify-between items-end mb-8">
          <View>
            <Text className="text-zinc-400 text-xs uppercase tracking-widest font-bold mb-1">
              Edit Mode
            </Text>
            <Text className="text-3xl font-bold text-white">Details</Text>
          </View>
          {/* Subtle Creator Badge */}
          <View className="bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
            <Text className="text-xs text-zinc-500">
              By {initialIdea.creator_username || "System"}
            </Text>
          </View>
        </View>

        {/* SECTION: Core Info */}
        <View className="gap-5 mb-8">
          <View>
            <Text className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-2 ml-1">
              Title
            </Text>
            <TextInput
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white text-[16px]"
              value={title}
              onChangeText={setTitle}
              placeholder="E.g., Dinner and a Movie"
              placeholderTextColor="#52525b" // zinc-600
            />
          </View>

          <View>
            <Text className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-2 ml-1">
              Price Per Person
            </Text>
            <View className="relative">
              <Text className="absolute left-4 top-4 text-zinc-500 text-lg">
                $
              </Text>
              <TextInput
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 pl-6 text-white text-[16px] font-mono"
                keyboardType="numeric"
                value={price}
                onChangeText={(text) => setPrice(formatInputPrice(text))}
                placeholder="0.00"
                placeholderTextColor="#52525b"
              />
            </View>
          </View>
          <View>
            <Text className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-2 ml-1">
              Description
            </Text>
            <View className="relative">
              <TextInput
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 pl-6 text-white text-[16px] font-mono min-h-[100px] max-h-[200px]"
                keyboardType="default"
                value={description}
                onChangeText={(text) => setDescription(text)}
                placeholder="Brief Description"
                placeholderTextColor="#52525b"
                multiline={true}
                textAlignVertical="top"
              />
            </View>
          </View>
        </View>

        {/* SECTION: Activity Type */}
        <View className="mb-8">
          <Text className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-3 ml-1">
            Activity Type
          </Text>
          <View className="flex-row gap-4">
            <Pressable
              onPress={() => setType("STAY_IN")}
              className={`flex-1 py-4 rounded-xl border-2 flex-row justify-center items-center ${
                type === "STAY_IN"
                  ? "bg-amber-500/10 border-amber-500"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <Ionicons
                name="home-outline"
                size={18}
                color={type === "STAY_IN" ? "#fbbf24" : "#a1a1aa"}
                style={{marginRight: 6}}
              />
              <Text
                className={`font-bold ${
                  type === "STAY_IN" ? "text-amber-400" : "text-zinc-400"
                }`}
              >
                Stay In
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setType("GO_OUT")}
              className={`flex-1 py-4 rounded-xl border-2 flex-row justify-center items-center ${
                type === "GO_OUT"
                  ? "bg-emerald-500/10 border-emerald-500"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <Ionicons
                name="walk-outline"
                size={18}
                color={type === "GO_OUT" ? "#34d399" : "#a1a1aa"}
                style={{marginRight: 6}}
              />
              <Text
                className={`font-bold ${
                  type === "GO_OUT" ? "text-emerald-400" : "text-zinc-400"
                }`}
              >
                Go Out
              </Text>
            </Pressable>
          </View>
        </View>

        {/* SECTION: Tags */}
        <View className="mb-8">
          <Text className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-3 ml-1">
            Tags
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {availableTags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.tag_id);
              return (
                <Pressable
                  key={tag.tag_id}
                  onPress={() => toggleTag(tag.tag_id)}
                  className={`px-4 py-2 rounded-full border ${
                    isSelected
                      ? "bg-indigo-500/20 border-indigo-500"
                      : "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      isSelected ? "text-indigo-300" : "text-zinc-400"
                    }`}
                  >
                    {tag.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* SECTION: Location (Conditional) */}
        {type === "GO_OUT" && (
          <View className="mb-8 bg-zinc-900/50 border border-dashed border-zinc-700 p-5 rounded-2xl">
            <View className="flex-row items-center mb-4">
              <Ionicons name="location-sharp" size={16} color="#e4e4e7" />
              <Text className="text-zinc-200 text-sm font-bold ml-2">
                Location Coordinates
              </Text>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-zinc-500 text-xs mb-1 ml-1">
                  LATITUDE
                </Text>
                <TextInput
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-white text-[14px]"
                  keyboardType="numeric"
                  value={latitude}
                  onChangeText={setLatitude}
                  placeholder="34.0522"
                  placeholderTextColor="#52525b"
                />
              </View>
              <View className="flex-1">
                <Text className="text-zinc-500 text-xs mb-1 ml-1">
                  LONGITUDE
                </Text>
                <TextInput
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-white text-[14px]"
                  keyboardType="numeric"
                  value={longitude}
                  onChangeText={setLongitude}
                  placeholder="-118.2437"
                  placeholderTextColor="#52525b"
                />
              </View>
            </View>
          </View>
        )}

        {/* SECTION: Actions */}
        <View className="mt-2 mb-10">
          {isLoading ? (
            <ActivityIndicator size="large" color="#6366f1" />
          ) : (
            <View className="gap-4">
              <Pressable
                onPress={handleSave}
                className="bg-indigo-600 h-14 rounded-xl shadow-lg shadow-indigo-900/20 flex-row justify-center items-center active:bg-indigo-700"
              >
                <Text className="text-white text-lg font-bold tracking-wide">
                  Save Changes
                </Text>
              </Pressable>

              <Pressable
                onPress={handleDelete}
                className="h-12 flex-row justify-center items-center rounded-xl border border-transparent active:bg-red-500/10"
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color="#ef4444"
                  style={{marginRight: 6}}
                />
                <Text className="text-red-500 text-base font-semibold">
                  Delete Idea
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
