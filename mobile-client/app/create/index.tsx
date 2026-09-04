// app/create.tsx
import React, {useState, useEffect} from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import {Image} from "expo-image";
import {useRouter} from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import {supabase} from "@/src/supabase";

import MapPickerModal from "@/components/MapPickerModal";
import ActivityTagsSelector from "@/components/home/ActivityTagsSelector";

// SHARED CONSTANTS & TYPES
import {TAG_TAXONOMY, BASE_ACTIVITY_CLASSES} from "@/src/constants/tags";
import {BaseActivity} from "@/types/activities";

export default function CreateScreen() {
  const router = useRouter();

  // --- FORM STATE ---
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [venueName, setVenueName] = useState(""); // e.g. "Sundance Resort"
  const [venueAddress, setVenueAddress] = useState(""); // e.g. "575 E Univ Pkwy"
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Enums / Selectors
  const [modality, setModality] = useState<BaseActivity["modality"]>("GO_OUT");
  const [activityType, setActivityType] =
    useState<BaseActivity["activity_type"]>("OTHER");
  const [environment, setEnvironment] =
    useState<BaseActivity["environment"]>("MIXED");

  // Multi-select Time of Day
  const [timeOfDay, setTimeOfDay] = useState<
    NonNullable<BaseActivity["time_of_day"]>
  >([]);

  // Demographics
  const [minPeople, setMinPeople] = useState("2");
  const [maxPeople, setMaxPeople] = useState("2");
  const [minAge, setMinAge] = useState("");

  // Numeric
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [isDurationVariable, setIsDurationVariable] = useState(false);

  // System
  const [visibility, setVisibility] =
    useState<BaseActivity["visibility"]>("PENDING_REVIEW");

  // --- ERROR TRACKING ---
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // --- TAG & UI STATE ---
  const [dbTags, setDbTags] = useState<{tag_id: number; name: string}[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMapModalVisible, setIsMapModalVisible] = useState(false);
  const [preciseCoords, setPreciseCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const TIME_OF_DAY_OPTIONS = [
    {label: "Early Morning", value: "EARLY_MORNING"},
    {label: "Morning", value: "MORNING"},
    {label: "Afternoon", value: "AFTERNOON"},
    {label: "Evening", value: "EVENING"},
    {label: "Late Night", value: "LATE_NIGHT"},
  ] as const;

  useEffect(() => {
    const fetchTags = async () => {
      const {data, error} = await supabase.from("tags").select("tag_id, name");
      if (!error && data) {
        setDbTags(data);
      }
    };
    fetchTags();
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const compressedImage = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{resize: {width: 800}}],
        {compress: 0.7, format: ImageManipulator.SaveFormat.JPEG},
      );
      setImageUri(compressedImage.uri);
      if (missingFields.includes("image")) {
        setMissingFields((prev) => prev.filter((f) => f !== "image"));
      }
    }
  };

  const openMapModal = () => setIsMapModalVisible(true);

  const toggleTimeOfDay = (
    time: NonNullable<BaseActivity["time_of_day"]>[0],
  ) => {
    setTimeOfDay((prev) =>
      prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time],
    );
  };

  const handleSubmit = async () => {
    // 0. Auth Check
    const {
      data: {session},
    } = await supabase.auth.getSession();
    if (!session) {
      Alert.alert(
        "Sign In Required",
        "You must be logged in to post a date idea.",
      );
      // Optional: router.push("/login");
      return;
    }

    const userId = session.user.id;

    // 1. Strict Validation
    const missing: string[] = [];
    if (!imageUri) missing.push("image");
    if (!title.trim()) missing.push("title");
    if (!description.trim()) missing.push("description");
    if (modality === "GO_OUT") {
      if (!venueName.trim()) missing.push("venueName");
      if (!venueAddress.trim()) missing.push("venueAddress");
    }
    if (timeOfDay.length === 0) missing.push("timeOfDay");
    if (!price) missing.push("price");
    if (!duration) missing.push("duration");
    if (selectedTags.length === 0) missing.push("tags");

    if (missing.length > 0) {
      setMissingFields(missing);
      Alert.alert(
        "Missing Information",
        "Please fill out the highlighted fields to continue.",
      );
      return;
    }

    setMissingFields([]);
    setIsSubmitting(true);

    const dbMinPeople = parseInt(minPeople, 10) || 2;
    const dbMaxPeople = parseInt(maxPeople, 10) || 2;
    const dbMinAge = parseInt(minAge, 10) || 0;

    // 🛑 --- DRY RUN TEST BLOCK --- 🛑
    const IS_DRY_RUN = false;

    if (IS_DRY_RUN) {
      let testLat = preciseCoords?.lat || 43.2312;
      let testLng = preciseCoords?.lng || -131.6614;

      console.log("\n=== 🧪 DRY RUN PAYLOAD ===");
      console.log(
        "1. VENUE: ",
        modality === "GO_OUT"
          ? `${venueName} at ${venueAddress} (${testLat}, ${testLng})`
          : "Null (STAY_IN)",
      );
      console.log("2. IMAGE URI: ", imageUri);
      console.log("3. ACTIVITY DATA: ", {
        title,
        description,
        url: url || null,
        modality,
        activity_type: activityType,
        environment,
        time_of_day: timeOfDay.length > 0 ? timeOfDay : null,
        est_price_per_person: parseFloat(price) || 0,
        est_duration_minutes: parseInt(duration, 10),
        is_duration_variable: isDurationVariable,
        min_people: dbMinPeople,
        max_people: dbMaxPeople,
        min_age: dbMinAge,
        visibility: visibility,
      });
      console.log("4. TAGS TO INSERT: ", selectedTags);
      console.log("==========================\n");

      Alert.alert("Dry Run Success", "Check your terminal to see the data!");
      setIsSubmitting(false);
      return;
    }
    // 🛑 --- END DRY RUN BLOCK --- 🛑

    // --- ACTUAL DATABASE UPLOAD ---
    try {
      let venueId = null;

      if (modality === "GO_OUT") {
        let latitude = preciseCoords?.lat || 40.2312;
        let longitude = preciseCoords?.lng || -111.6614;

        if (!preciseCoords) {
          try {
            const geocoded = await Location.geocodeAsync(venueAddress);
            if (geocoded && geocoded.length > 0) {
              latitude = geocoded[0].latitude;
              longitude = geocoded[0].longitude;
            }
          } catch (e) {
            console.warn("Geocoding failed, using default coordinates");
          }
        }

        const {data: venueData, error: venueError} = await supabase
          .from("venues")
          .insert({
            name: venueName,
            address: venueAddress,
            coordinates: `POINT(${longitude} ${latitude})`,
          })
          .select("venue_id")
          .single();

        if (venueError) throw venueError;
        venueId = venueData.venue_id;
      }

      if (!imageUri) {
        throw new Error("Image missing during upload phase");
      }

      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const response = await fetch(imageUri);
      const arrayBuffer = await response.arrayBuffer();

      const {error: uploadError} = await supabase.storage
        .from("activities")
        .upload(fileName, arrayBuffer, {
          contentType: "image/jpeg",
        });

      if (uploadError) throw uploadError;

      const {data: publicUrlData} = supabase.storage
        .from("activities")
        .getPublicUrl(fileName);

      const fullImageUrl = publicUrlData.publicUrl;

      const {data: activityData, error: dbError} = await supabase
        .from("activities")
        .insert({
          user_id: userId,
          venue_id: venueId,
          title,
          description,
          url: url || null,
          image_urls: [fullImageUrl],
          modality,
          activity_type: activityType,
          environment,
          time_of_day: timeOfDay.length > 0 ? timeOfDay : null,
          est_price_per_person: parseFloat(price) || 0,
          est_duration_minutes: parseInt(duration, 10),
          is_duration_variable: isDurationVariable,
          min_people: dbMinPeople,
          max_people: dbMaxPeople,
          min_age: dbMinAge,
          visibility: visibility,
        })
        .select("idea_id")
        .single();

      if (dbError) throw dbError;
      const newIdeaId = activityData.idea_id;

      if (selectedTags.length > 0) {
        const tagInserts = selectedTags.reduce(
          (acc, tagString) => {
            const matchedDbTag = dbTags.find(
              (db) => db.name.toLowerCase() === tagString.toLowerCase(),
            );
            if (matchedDbTag) {
              acc.push({idea_id: newIdeaId, tag_id: matchedDbTag.tag_id});
            }
            return acc;
          },
          [] as {idea_id: number; tag_id: number}[],
        );

        if (tagInserts.length > 0) {
          const {error: tagError} = await supabase
            .from("activity_tags")
            .insert(tagInserts);

          if (tagError) throw tagError;
        }
      }

      Alert.alert("Success!", "Your date idea has been submitted.");
      router.push("/");
    } catch (error: any) {
      console.error("Upload Error:", error);
      Alert.alert("Upload Failed", error.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-8 pb-16"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={true}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-3xl font-bold text-white mb-8">
          Post an Activity
        </Text>

        {/* IMAGE PICKER */}
        <Pressable
          onPress={pickImage}
          className={`h-56 w-full rounded-3xl border justify-center items-center mb-6 overflow-hidden active:scale-[0.98] active:opacity-80 transition-all ${
            missingFields.includes("image")
              ? "bg-red-950/20 border-red-500"
              : "bg-zinc-900 border-zinc-800"
          }`}
        >
          {imageUri ? (
            <Image
              source={{uri: imageUri}}
              style={{width: "100%", height: "100%"}}
              contentFit="cover"
            />
          ) : (
            <View className="items-center">
              <Ionicons
                name="camera"
                size={40}
                color={missingFields.includes("image") ? "#ef4444" : "#71717a"}
              />
              <Text
                className={`font-bold mt-2 ${
                  missingFields.includes("image")
                    ? "text-red-500"
                    : "text-zinc-500"
                }`}
              >
                Tap to add cover photo
              </Text>
            </View>
          )}
        </Pressable>

        {/* TITLE, DESC, URL */}
        <Text
          className={`text-sm font-bold ml-1 mb-2 ${
            missingFields.includes("title") ? "text-red-500" : "text-zinc-400"
          }`}
        >
          TITLE
        </Text>
        <TextInput
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            if (missingFields.includes("title")) {
              setMissingFields((prev) => prev.filter((f) => f !== "title"));
            }
          }}
          placeholder="e.g. Sunset Hike at Sundance"
          placeholderTextColor="#71717a"
          className={`text-white p-4 rounded-2xl mb-6 border ${
            missingFields.includes("title")
              ? "bg-red-950/10 border-red-500"
              : "bg-zinc-900 border-zinc-800"
          }`}
        />

        <Text
          className={`text-sm font-bold ml-1 mb-2 ${
            missingFields.includes("description")
              ? "text-red-500"
              : "text-zinc-400"
          }`}
        >
          DESCRIPTION
        </Text>
        <TextInput
          value={description}
          onChangeText={(text) => {
            setDescription(text);
            if (missingFields.includes("description")) {
              setMissingFields((prev) =>
                prev.filter((f) => f !== "description"),
              );
            }
          }}
          placeholder="What makes this date great?"
          placeholderTextColor="#71717a"
          multiline
          className={`text-white p-4 rounded-2xl mb-6 border h-28 pt-4 ${
            missingFields.includes("description")
              ? "bg-red-950/10 border-red-500"
              : "bg-zinc-900 border-zinc-800"
          }`}
        />

        <Text className="text-zinc-400 text-sm font-bold ml-1 mb-2">
          LINK (OPTIONAL)
        </Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="e.g. Website, Menu, Tickets, Recipe"
          placeholderTextColor="#71717a"
          keyboardType="url"
          autoCapitalize="none"
          className="bg-zinc-900 text-white p-4 rounded-2xl mb-6 border border-zinc-800"
        />

        {/* MODALITY */}
        <Text className="text-zinc-400 text-sm font-bold ml-1 mb-2">
          MODALITY
        </Text>
        <View className="flex-row gap-2 mb-6">
          {(["GO_OUT", "STAY_IN"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                setModality(m);
                // Clear location errors if they switch to STAY_IN
                if (m === "STAY_IN") {
                  setMissingFields((prev) =>
                    prev.filter(
                      (f) => f !== "venueName" && f !== "venueAddress",
                    ),
                  );
                }
              }}
              className={`flex-1 py-3 rounded-xl items-center border active:opacity-70 transition-opacity ${
                modality === m
                  ? "bg-zinc-800 border-white"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <Text
                className={`font-bold ${
                  modality === m ? "text-white" : "text-zinc-500"
                }`}
              >
                {m.replace("_", " ")}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* VENUE NAME */}
        <View>
          <Text
            className={`text-sm font-bold ml-1 mb-2 ${
              missingFields.includes("venueName")
                ? "text-red-500"
                : modality === "STAY_IN"
                  ? "text-zinc-700"
                  : "text-zinc-400"
            }`}
          >
            VENUE NAME
          </Text>
          <TextInput
            value={modality === "STAY_IN" ? "Not applicable" : venueName}
            editable={modality === "GO_OUT"}
            onChangeText={(text) => {
              setVenueName(text);
              if (missingFields.includes("venueName")) {
                setMissingFields((prev) =>
                  prev.filter((f) => f !== "venueName"),
                );
              }
            }}
            placeholder="e.g. Sundance Resort"
            placeholderTextColor="#71717a"
            className={`text-white p-4 rounded-2xl mb-6 border ${
              missingFields.includes("venueName")
                ? "bg-red-950/10 border-red-500"
                : modality === "STAY_IN"
                  ? "bg-zinc-950 border-zinc-900 text-zinc-700"
                  : "bg-zinc-900 border-zinc-800"
            }`}
          />
        </View>

        {/* VENUE ADDRESS */}
        <View>
          <Text
            className={`text-sm font-bold ml-1 mb-2 ${
              missingFields.includes("venueAddress")
                ? "text-red-500"
                : modality === "STAY_IN"
                  ? "text-zinc-700"
                  : "text-zinc-400"
            }`}
          >
            ADDRESS / LOCATION
          </Text>
          <View
            className={`flex-row items-center rounded-2xl border mb-6 pr-2 ${
              missingFields.includes("venueAddress")
                ? "bg-red-950/10 border-red-500"
                : modality === "STAY_IN"
                  ? "border-zinc-900 bg-zinc-950"
                  : "bg-zinc-900 border-zinc-800"
            }`}
          >
            <TextInput
              value={modality === "STAY_IN" ? "Not applicable" : venueAddress}
              editable={modality === "GO_OUT"}
              onChangeText={(text) => {
                setVenueAddress(text);
                // Note: We deliberately DO NOT wipe out preciseCoords here!
                if (missingFields.includes("venueAddress")) {
                  setMissingFields((prev) =>
                    prev.filter((f) => f !== "venueAddress"),
                  );
                }
              }}
              placeholder="e.g. 575 E Univ Pkwy, Orem"
              className={`flex-1 text-white p-4 ${
                modality === "STAY_IN"
                  ? "placeholder:text-zinc-800 text-zinc-700"
                  : "placeholder:text-zinc-500"
              }`}
            />
            <Pressable
              onPress={openMapModal}
              disabled={modality === "STAY_IN"}
              className={`p-2.5 rounded-xl transition-all ${
                modality === "GO_OUT"
                  ? "bg-zinc-800 active:bg-zinc-700 active:scale-[0.95]"
                  : "bg-zinc-900 opacity-30"
              }`}
            >
              <Ionicons
                name="map-outline"
                size={20}
                color={modality === "GO_OUT" ? "white" : "#52525b"}
              />
            </Pressable>
          </View>
        </View>

        {/* ENVIRONMENT */}
        <Text className="text-zinc-400 text-sm font-bold ml-1 mb-2">
          ENVIRONMENT
        </Text>
        <View className="flex-row gap-2 mb-6">
          {(["INDOOR", "OUTDOOR", "MIXED"] as const).map((e) => (
            <Pressable
              key={e}
              onPress={() => setEnvironment(e)}
              className={`flex-1 py-3 rounded-xl items-center border active:opacity-70 transition-opacity ${
                environment === e
                  ? "bg-zinc-800 border-white"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <Text
                className={`font-bold ${
                  environment === e ? "text-white" : "text-zinc-500"
                }`}
              >
                {e}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* TIME OF DAY */}
        <Text
          className={`text-sm font-bold ml-1 mb-2 ${
            missingFields.includes("timeOfDay")
              ? "text-red-500"
              : "text-zinc-400"
          }`}
        >
          BEST TIME OF DAY
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-6">
          {TIME_OF_DAY_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                toggleTimeOfDay(option.value);
                if (missingFields.includes("timeOfDay")) {
                  setMissingFields((prev) =>
                    prev.filter((f) => f !== "timeOfDay"),
                  );
                }
              }}
              className={`px-4 py-2 rounded-xl border active:opacity-70 transition-opacity ${
                timeOfDay.includes(option.value)
                  ? "bg-zinc-800 border-white"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <Text
                className={`font-bold ${
                  timeOfDay.includes(option.value)
                    ? "text-white"
                    : "text-zinc-500"
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ACTIVITY TYPE */}
        <Text className="text-zinc-400 text-sm font-bold ml-1 mb-2">
          ACTIVITY TYPE
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-6">
          {(["MEAL", "TREAT", "ACTIVE", "OTHER"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setActivityType(t)}
              className={`px-4 py-2 rounded-xl border active:opacity-70 transition-opacity ${
                activityType === t
                  ? "bg-zinc-800 border-white"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <Text
                className={`font-bold ${
                  activityType === t ? "text-white" : "text-zinc-500"
                }`}
              >
                {t}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* NUMERICS (Price & Duration) */}
        <View className="flex-row gap-4 mb-3">
          <View className="flex-1">
            <Text
              className={`text-sm font-bold ml-1 mb-2 ${
                missingFields.includes("price")
                  ? "text-red-500"
                  : "text-zinc-400"
              }`}
            >
              PRICE/PERSON ($)
            </Text>
            <TextInput
              value={price}
              onChangeText={(text) => {
                setPrice(text);
                if (missingFields.includes("price")) {
                  setMissingFields((prev) => prev.filter((f) => f !== "price"));
                }
              }}
              placeholder="0.00"
              placeholderTextColor="#71717a"
              keyboardType="decimal-pad"
              className={`text-white p-4 rounded-2xl border ${
                missingFields.includes("price")
                  ? "bg-red-950/10 border-red-500"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            />
          </View>
          <View className="flex-1">
            <Text
              className={`text-sm font-bold ml-1 mb-2 ${
                missingFields.includes("duration")
                  ? "text-red-500"
                  : "text-zinc-400"
              }`}
            >
              DURATION (MIN)
            </Text>
            <TextInput
              value={duration}
              onChangeText={(text) => {
                setDuration(text);
                if (missingFields.includes("duration")) {
                  setMissingFields((prev) =>
                    prev.filter((f) => f !== "duration"),
                  );
                }
              }}
              placeholder="120"
              placeholderTextColor="#71717a"
              keyboardType="number-pad"
              className={`text-white p-4 rounded-2xl border ${
                missingFields.includes("duration")
                  ? "bg-red-950/10 border-red-500"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            />
          </View>
        </View>

        {/* DURATION FLEXIBILITY */}
        <Pressable
          onPress={() => setIsDurationVariable(!isDurationVariable)}
          className="flex-row items-center ml-1 mb-6"
        >
          <View
            className={`w-5 h-5 rounded border items-center justify-center mr-2 ${
              isDurationVariable ? "bg-white border-white" : "border-zinc-500"
            }`}
          >
            {isDurationVariable && (
              <Ionicons name="checkmark" size={14} color="black" />
            )}
          </View>
          <Text className="text-zinc-400">Duration is flexible (varies)</Text>
        </Pressable>

        {/* DEMOGRAPHICS (People & Age) */}
        <View className="flex-row gap-4 mb-6">
          <View className="flex-1">
            <Text className="text-zinc-400 text-sm font-bold ml-1 mb-2">
              MIN PEOPLE
            </Text>
            <TextInput
              value={minPeople}
              onChangeText={setMinPeople}
              placeholder="2"
              placeholderTextColor="#71717a"
              keyboardType="number-pad"
              className="bg-zinc-900 text-white p-4 rounded-2xl border border-zinc-800"
            />
          </View>
          <View className="flex-1">
            <Text className="text-zinc-400 text-sm font-bold ml-1 mb-2">
              MAX PEOPLE
            </Text>
            <TextInput
              value={maxPeople}
              onChangeText={setMaxPeople}
              placeholder="2"
              placeholderTextColor="#71717a"
              keyboardType="number-pad"
              className="bg-zinc-900 text-white p-4 rounded-2xl border border-zinc-800"
            />
          </View>
        </View>

        {/* AGE RESTRICTION */}
        <Text className="text-zinc-400 text-sm font-bold ml-1 mb-2">
          MINIMUM AGE (Optional)
        </Text>
        <TextInput
          value={minAge}
          onChangeText={setMinAge}
          placeholder="e.g. 0 for All Ages, 14, 21"
          placeholderTextColor="#71717a"
          keyboardType="number-pad"
          className="bg-zinc-900 text-white p-4 rounded-2xl mb-6 border border-zinc-800"
        />

        {/* SHARED TAGS COMPONENT */}
        <Text
          className={`text-sm font-bold ml-1 mt-2 ${
            missingFields.includes("tags") ? "text-red-500" : "text-zinc-400"
          }`}
        >
          TAGS
        </Text>
        <View className="mt-2 mb-10 w-full">
          <ActivityTagsSelector
            mode="publish"
            taxonomy={TAG_TAXONOMY}
            classes={BASE_ACTIVITY_CLASSES}
            initialActiveTags={selectedTags}
            onTagsChange={(newTags) => {
              setSelectedTags(newTags);
              if (newTags.length > 0 && missingFields.includes("tags")) {
                setMissingFields((prev) => prev.filter((f) => f !== "tags"));
              }
            }}
          />
        </View>

        {/* VISIBILITY / MODERATION */}
        <Text className="text-zinc-400 text-sm font-bold ml-1 mb-2">
          VISIBILITY
        </Text>
        <View className="flex-row gap-2 mb-10">
          <Pressable
            onPress={() => setVisibility("PENDING_REVIEW")}
            className={`flex-1 p-4 rounded-xl items-center border ${
              visibility === "PENDING_REVIEW"
                ? "bg-zinc-800 border-white"
                : "bg-zinc-900 border-zinc-800"
            }`}
          >
            <Ionicons
              name="earth"
              size={24}
              color={visibility === "PENDING_REVIEW" ? "white" : "#71717a"}
            />
            <Text
              className={`font-bold mt-2 ${
                visibility === "PENDING_REVIEW" ? "text-white" : "text-zinc-500"
              }`}
            >
              Publish to Feed
            </Text>
            <Text className="text-zinc-500 text-xs text-center mt-1">
              Will be reviewed by our team
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setVisibility("PRIVATE")}
            className={`flex-1 p-4 rounded-xl items-center border ${
              visibility === "PRIVATE"
                ? "bg-zinc-800 border-white"
                : "bg-zinc-900 border-zinc-800"
            }`}
          >
            <Ionicons
              name="lock-closed"
              size={24}
              color={visibility === "PRIVATE" ? "white" : "#71717a"}
            />
            <Text
              className={`font-bold mt-2 ${
                visibility === "PRIVATE" ? "text-white" : "text-zinc-500"
              }`}
            >
              Keep Private
            </Text>
            <Text className="text-zinc-500 text-xs text-center mt-1">
              Only visible to you
            </Text>
          </Pressable>
        </View>

        {/* SUBMIT BUTTON */}
        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitting}
          className={`w-full py-4 rounded-full items-center mb-10 ${
            isSubmitting
              ? "bg-zinc-800"
              : "bg-white active:scale-[0.95] active:opacity-[0.90] transition-all"
          }`}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-black font-black text-lg">
              Post Date Idea
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {/* MAP MODAL */}
      <MapPickerModal
        visible={isMapModalVisible}
        onClose={() => setIsMapModalVisible(false)}
        initialAddress={venueAddress}
        initialCoords={preciseCoords}
        onSelectLocation={(data) => {
          setVenueAddress(data.address);
          setPreciseCoords({lat: data.latitude, lng: data.longitude});
          setIsMapModalVisible(false);
          // Clear address error after map selection
          if (missingFields.includes("venueAddress")) {
            setMissingFields((prev) =>
              prev.filter((f) => f !== "venueAddress"),
            );
          }
        }}
      />
    </View>
  );
}
