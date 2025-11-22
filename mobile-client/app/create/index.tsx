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
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import Ionicons from "@expo/vector-icons/build/Ionicons";

const API_HOST = process.env.EXPO_PUBLIC_API_HOST;
const IDEA_URL = `${API_HOST}/api/ideas`;
const TAGS_URL = `${API_HOST}/api/tags`;

// Interface for Tags
interface Tag {
  tag_id: number;
  name: string;
}

export default function CreateIdeaScreen() {
  const router = useRouter();
  
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("0");
  const [type, setType] = useState<"STAY_IN" | "GO_OUT">("GO_OUT");
  const [creator, setCreator] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);

  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  useEffect(() => {
    // Fetch all tags from database
    const fetchTags = async () => {
      try {
        const response = await fetch(TAGS_URL);
        const data = await response.json();
        setAvailableTags(data);
      } catch (e) {
        console.log("Failed to load tags", e);
      }
    };
    fetchTags();
  }, []);

  // Select or deselect a tag to be added to an idea
  const toggleTag = (id: number) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((tagId) => tagId !== id); 
      } else {
        return [...prev, id]; 
      }
    });
  };

  // Format price to US currency format
  const formatInputPrice = (value: string): string => {
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      return `${parts[0]}.${parts.slice(1).join("")}`;
    }
    return cleaned;
  };

  // Submit data to database to create the idea
  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a title for the idea.");
      return;
    }

    let finalLatitude = null;
    let finalLongitude = null;

    if (type === "GO_OUT") {
      finalLatitude = latitude.trim() || null;
      finalLongitude = longitude.trim() || null;

      if (!finalLatitude || !finalLongitude) {
        Alert.alert(
          "Missing Location",
          "Please enter both Latitude and Longitude for a 'GO OUT' activity."
        );
        return;
      }
    }

    setIsLoading(true);
    try {
      const response = await fetch(IDEA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          est_price_per_person: price,
          activity_type: type,
          creator_username: creator.trim() || null,
          latitude: finalLatitude,
          longitude: finalLongitude,
          tags: selectedTagIds,
        }),
      });

      if (!response.ok) throw new Error("Failed to create idea");

      Alert.alert("Success", "New date idea created!");
      router.back();
    } catch (e) {
      console.error("Creation failed:", e);
      Alert.alert("Error", "Could not create idea. Check API.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-zinc-950"
    >
      <ScrollView 
        className="flex-1 px-5 pt-6"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header */}
        <View className="mb-8">
            <Text className="text-zinc-400 text-xs uppercase tracking-widest font-bold mb-1">
              New Entry
            </Text>
            <Text className="text-3xl font-bold text-white">Propose Idea</Text>
        </View>

        {/* SECTION: Core Info */}
        <View className="gap-5 mb-8">
            {/* Title Input */}
            <View>
                <Text className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-2 ml-1">
                Title
                </Text>
                <TextInput
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white text-[16px]"
                value={title}
                onChangeText={setTitle}
                placeholder="E.g., Take a Cooking Class"
                placeholderTextColor="#52525b"
                />
            </View>

            {/* Price Input */}
            <View>
                <Text className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-2 ml-1">
                Price Per Person
                </Text>
                <View className="relative">
                    <Text className="absolute left-4 top-4 text-zinc-500 text-lg">$</Text>
                    <TextInput
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 pl-8 text-white text-[16px] font-mono"
                    keyboardType="numeric"
                    value={price}
                    onChangeText={(text) => setPrice(formatInputPrice(text))}
                    placeholder="0.00"
                    placeholderTextColor="#52525b"
                    />
                </View>
            </View>

            {/* Creator Input */}
            <View>
                <Text className="text-zinc-400 text-xs uppercase tracking-wider font-bold mb-2 ml-1">
                Your Name (Optional)
                </Text>
                <TextInput
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white text-[16px]"
                value={creator}
                onChangeText={setCreator}
                placeholder="Your Username"
                placeholderTextColor="#52525b"
                />
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
                Tags (Optional)
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
                        <Text className="text-zinc-500 text-xs mb-1 ml-1">LATITUDE</Text>
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
                        <Text className="text-zinc-500 text-xs mb-1 ml-1">LONGITUDE</Text>
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

        {/* Submit Button */}
        <View className="mb-10">
            {isLoading ? (
                <ActivityIndicator size="large" color="#6366f1" />
            ) : (
                <Pressable
                onPress={handleCreate}
                className="bg-indigo-600 h-14 rounded-xl shadow-lg shadow-indigo-900/20 flex-row justify-center items-center active:bg-indigo-700"
                >
                <Text className="text-white text-lg font-bold tracking-wide">
                    Submit New Idea
                </Text>
                </Pressable>
            )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}