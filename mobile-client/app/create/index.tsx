// app/create.tsx
import React, {useState, useEffect} from "react";
import {WEATHER_NEEDS_OPTIONS, type WeatherNeeds} from "@/src/lib/weatherRules";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
} from "react-native";
import * as Haptics from "expo-haptics";
import {Image} from "expo-image";
import {LinearGradient} from "expo-linear-gradient";
import {useLocalSearchParams, useRouter} from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import {supabase} from "@/src/supabase";
import {useMyIdeasStore} from "@/src/store/useMyIdeasStore";
import {confirmDeleteIdea, confirmUnpublishIdea} from "@/src/lib/ideaActions";
import {POSTER_PROMISE} from "@/src/lib/ideaGuidelines";
import {RISK_LABELS, SAFETY_NOTE_MAX, type RiskLabel} from "@/src/lib/safety";
import {SUSPENDED_MESSAGE, useAccountStore} from "@/src/store/useAccountStore";
import {useSavedStore} from "@/src/store/useSavedStore";
import {parseCoordinates} from "@/utils/itineraryEngine";
import type {Energy} from "@/utils/planEvaluator";

import PlacePicker from "@/components/places/PlacePicker";
import {type PickedPlace, addPlace} from "@/src/lib/places";
import ActivityTagsSelector from "@/components/home/ActivityTagsSelector";

// SHARED CONSTANTS & TYPES
import {TAG_TAXONOMY, BASE_ACTIVITY_CLASSES} from "@/src/constants/tags";
import {BaseActivity} from "@/types/activities";

// Where an idea's photos live in storage (strip to get the file path)
const PHOTO_PATH_MARKER = "/storage/v1/object/public/activities/";

/**
 * A field's label. When the field is missing on submit (the same everywhere
 * in this form): the label turns red, with a short note on the right saying
 * what's needed; the field itself gets a red border.
 */
function FieldLabel({
  label,
  missing,
  hint = "Required",
  dim = false,
  className = "mb-2",
}: {
  label: string;
  missing: boolean;
  /** What's missing ("Add a title") */
  hint?: string;
  /** Not used right now (e.g. the place, for a stay-in idea) */
  dim?: boolean;
  className?: string;
}) {
  return (
    <View className={`flex-row items-center justify-between gap-2 ml-1 ${className}`}>
      <Text
        className={`text-sm font-bold ${missing ? "text-red-500" : dim ? "text-zinc-700" : "text-zinc-400"}`}
        numberOfLines={1}
      >
        {label}
      </Text>
      {missing && (
        <View className="flex-row items-center gap-1 shrink">
          <Ionicons name="alert-circle" size={14} color="#ef4444" />
          <Text className="text-red-400 text-xs font-semibold" numberOfLines={1}>
            {hint}
          </Text>
        </View>
      )}
    </View>
  );
}

/** A field's border and fill: red when it's missing */
const fieldBox = (missing: boolean) =>
  missing ? "bg-red-950/10 border-red-500" : "bg-zinc-900 border-zinc-800";
/**
 * Around a group of choices (time of day, tags): an outline that's always
 * there (so nothing shifts) and only shows, red, when the group is missing
 */
const groupBox = (missing: boolean) =>
  `-mx-2 p-2 rounded-2xl border ${missing ? "border-red-500 bg-red-950/10" : "border-transparent"}`;

/** How lively it feels (#20), for the date's arc: dates warm up, then wind down */
const ENERGY_OPTIONS: {value: Energy; label: string; hint: string}[] = [
  {value: "CALM", label: "Calm", hint: "Quiet and close: stargazing, a spa, a view"},
  {value: "UPBEAT", label: "Upbeat", hint: "Engaging and playful: an escape room, karaoke, a show"},
  {value: "ACTIVE", label: "Active", hint: "Physical: climbing, a hike, a dance class"},
];

/** The idea as loaded for editing, to tell what changed on save. */
interface EditingOriginal {
  visibility: BaseActivity["visibility"];
  imageUrls: string[];
}

/**
 * Post a new idea, or edit one of yours with `?ideaId=123`.
 * Saving an edit always sends the idea back to review or keeps it private:
 * owners can't publish (the database enforces that), so editing a published
 * idea takes it out of Discover until it's approved again.
 */
export default function CreateScreen() {
  const router = useRouter();
  const {ideaId} = useLocalSearchParams<{ideaId?: string}>();
  const editingId = ideaId ? Number(ideaId) : null;
  const [original, setOriginal] = useState<EditingOriginal | null>(null);
  const [isLoadingIdea, setIsLoadingIdea] = useState(!!editingId);
  // Remounts the tag selector once the idea's tags have loaded
  const [tagsKey, setTagsKey] = useState(0);

  // --- FORM STATE ---
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  // Where it is (#78): a place on Venture, or a new one to add with the idea
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Enums / Selectors. Type, environment, length and energy start unanswered
  // (null) and are required: a preset value would be saved as if it were
  // the poster's answer (#20)
  const [modality, setModality] = useState<BaseActivity["modality"]>("GO_OUT");
  const [activityType, setActivityType] = useState<BaseActivity["activity_type"] | null>(null);
  const [environment, setEnvironment] = useState<BaseActivity["environment"] | null>(null);
  // null: the default for its environment (src/lib/weatherRules.ts)
  const [weatherNeeds, setWeatherNeeds] = useState<WeatherNeeds | null>(null);
  const defaultWeatherNeeds: WeatherNeeds | null =
    environment == null ? null : environment === "INDOOR" ? "ANY" : "NICE";

  // Multi-select Time of Day
  const [timeOfDay, setTimeOfDay] = useState<
    NonNullable<BaseActivity["time_of_day"]>
  >([]);

  // Demographics
  const [minPeople, setMinPeople] = useState("2");
  const [maxPeople, setMaxPeople] = useState("2");
  const [minAge, setMinAge] = useState("");
  // Safety (#81): what to know before going, and a short heads-up
  const [riskLabels, setRiskLabels] = useState<RiskLabel[]>([]);
  const [safetyNote, setSafetyNote] = useState("");
  // Energy (#20). Strenuous always means active, so it's set for you then
  const [energy, setEnergy] = useState<Energy | null>(null);
  const strenuous = riskLabels.includes("STRENUOUS");
  const shownEnergy: Energy | null = strenuous ? "ACTIVE" : energy;

  // Numeric
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  // Flexible (stay as long as you like) or a set length (a movie, a class)
  const [isDurationVariable, setIsDurationVariable] = useState<boolean | null>(null);

  // System
  const [visibility, setVisibility] =
    useState<BaseActivity["visibility"]>("PENDING_REVIEW");

  // Publishing: "This is legal to do here, and I've noted any risks" (#81, #85)
  const [promised, setPromised] = useState(false);
  // Suspended (#76): can still save private ideas, not submit for review
  const suspended = useAccountStore((s) => !!s.suspension);

  // --- ERROR TRACKING ---
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // --- TAG & UI STATE ---
  const [dbTags, setDbTags] = useState<{tag_id: number; name: string}[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPlacePickerOpen, setIsPlacePickerOpen] = useState(false);

  const TIME_OF_DAY_OPTIONS = [
    {label: "Early Morning", value: "EARLY_MORNING"},
    {label: "Morning", value: "MORNING"},
    {label: "Afternoon", value: "AFTERNOON"},
    {label: "Evening", value: "EVENING"},
    {label: "Late Night", value: "LATE_NIGHT"},
  ] as const;

  // --- EDITING: load the idea into the form ---
  useEffect(() => {
    if (!editingId) return;
    let active = true;

    const loadIdea = async () => {
      const {data, error} = await supabase
        .from("activities")
        .select(
          `*, venues ( venue_id, name, address, coordinates ),
          activity_tags ( tags ( name ) )`,
        )
        .eq("idea_id", editingId)
        .maybeSingle();
      if (!active) return;

      if (error || !data) {
        Alert.alert(
          "Couldn't open this idea",
          error?.message ?? "It may have been deleted.",
        );
        router.back();
        return;
      }

      const coords = parseCoordinates(data.venues?.coordinates);

      setTitle(data.title ?? "");
      setDescription(data.description ?? "");
      setUrl(data.url ?? "");
      setImageUri(data.image_urls?.[0] ?? null);
      setModality(data.modality);
      setActivityType(data.activity_type);
      setEnvironment(data.environment);
      setWeatherNeeds((data.weather_needs as WeatherNeeds | null) ?? null);
      setTimeOfDay(data.time_of_day ?? []);
      setMinPeople(String(data.min_people ?? 2));
      setMaxPeople(String(data.max_people ?? 2));
      setMinAge(data.min_age ? String(data.min_age) : "");
      setRiskLabels((data.risk_labels ?? []) as RiskLabel[]);
      setSafetyNote(data.safety_note ?? "");
      setEnergy((data.energy as Energy | null) ?? null);
      setPrice(String(data.est_price_per_person ?? ""));
      setDuration(String(data.est_duration_minutes ?? ""));
      setIsDurationVariable(!!data.is_duration_variable);
      setPlace(
        data.venue_id && data.venues && coords
          ? {
              kind: "existing",
              venueId: data.venue_id,
              name: data.venues.name,
              address: data.venues.address ?? null,
              latitude: coords.latitude,
              longitude: coords.longitude,
            }
          : null,
      );
      setSelectedTags(
        (data.activity_tags ?? [])
          .map((row: any) => row.tags?.name)
          .filter(Boolean),
      );
      setTagsKey((k) => k + 1);
      // Saving keeps a private idea private; everything else goes to review
      setVisibility(data.visibility === "PRIVATE" ? "PRIVATE" : "PENDING_REVIEW");
      setOriginal({
        visibility: data.visibility,
        imageUrls: data.image_urls ?? [],
      });
      setIsLoadingIdea(false);
    };

    loadIdea();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

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

  const openPlacePicker = () => setIsPlacePickerOpen(true);

  const toggleTimeOfDay = (
    time: NonNullable<BaseActivity["time_of_day"]>[0],
  ) => {
    setTimeOfDay((prev) =>
      prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time],
    );
  };

  const handleSubmit = async () => {
    // Nothing focused: iOS puts the cursor back in the last-used field when
    // an alert closes, which scrolled the form up to it
    Keyboard.dismiss();

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
    if (modality === "GO_OUT" && !place) missing.push("place");
    if (timeOfDay.length === 0) missing.push("timeOfDay");
    if (!price) missing.push("price");
    if (!duration) missing.push("duration");
    if (isDurationVariable === null) missing.push("flexible");
    if (!environment) missing.push("environment");
    if (!activityType) missing.push("type");
    if (!shownEnergy) missing.push("energy");
    if (selectedTags.length === 0) missing.push("tags");

    if (missing.length > 0) {
      setMissingFields(missing);
      Alert.alert(
        "Missing Information",
        "Please fill out the highlighted fields to continue.",
      );
      return;
    }

    if (visibility === "PENDING_REVIEW" && suspended) {
      Alert.alert("You can't publish right now", SUSPENDED_MESSAGE, [
        {text: "Cancel", style: "cancel"},
        {text: "Keep it private", onPress: () => setVisibility("PRIVATE")},
      ]);
      return;
    }

    // Publishing needs the poster's promise (private ideas don't). The box
    // is right above the button, so mark it instead of an alert
    if (visibility === "PENDING_REVIEW" && !promised) {
      setMissingFields(["promise"]);
      if (process.env.EXPO_OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
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
      console.log("\n=== 🧪 DRY RUN PAYLOAD ===");
      console.log("1. PLACE: ", modality === "GO_OUT" ? place : "Null (STAY_IN)");
      console.log("2. IMAGE URI: ", imageUri);
      console.log("3. ACTIVITY DATA: ", {
        title,
        description,
        url: url || null,
        modality,
        activity_type: activityType,
        environment,
        weather_needs: weatherNeeds,
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
      // 1. Place (#78): one already on Venture, or the new one added now
      //    (places are shared, so an existing one is never edited)
      let venueId: string | null = null;
      if (modality === "GO_OUT" && place) {
        venueId = place.kind === "existing" ? place.venueId : await addPlace(place);
      }

      if (!imageUri) {
        throw new Error("Image missing during upload phase");
      }

      // 2. Photo: upload only if it's new (an edit keeps the existing URL)
      let imageUrls: string[];
      const photoChanged = !original || imageUri !== original.imageUrls[0];
      if (photoChanged) {
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
        imageUrls = [publicUrlData.publicUrl];
      } else {
        imageUrls = original!.imageUrls;
      }

      const fields = {
        venue_id: venueId,
        title,
        description,
        url: url || null,
        image_urls: imageUrls,
        modality,
        activity_type: activityType,
        environment,
        weather_needs: weatherNeeds,
        time_of_day: timeOfDay.length > 0 ? timeOfDay : null,
        est_price_per_person: parseFloat(price) || 0,
        est_duration_minutes: parseInt(duration, 10),
        is_duration_variable: isDurationVariable,
        energy: shownEnergy,
        min_people: dbMinPeople,
        max_people: dbMaxPeople,
        min_age: dbMinAge,
        risk_labels: riskLabels,
        safety_note: safetyNote.trim() ? safetyNote.trim().slice(0, SAFETY_NOTE_MAX) : null,
        visibility: visibility,
      };

      // 3. The idea itself
      let savedIdeaId: number;
      if (editingId) {
        const {data: updated, error: dbError} = await supabase
          .from("activities")
          // Resubmitting starts a fresh review; keeping it private keeps
          // the last reviewer note for reference
          .update(
            visibility === "PENDING_REVIEW"
              ? {...fields, moderation_note: null, moderation_rules: null}
              : fields,
          )
          .eq("idea_id", editingId)
          .select("idea_id")
          .maybeSingle();
        if (dbError) throw dbError;
        if (!updated) throw new Error("Couldn't save your changes.");
        savedIdeaId = editingId;
      } else {
        const {data: activityData, error: dbError} = await supabase
          .from("activities")
          .insert({user_id: userId, ...fields})
          .select("idea_id")
          .single();
        if (dbError) throw dbError;
        savedIdeaId = activityData.idea_id;
      }

      // 4. Tags: an edit replaces them
      if (editingId) {
        const {error: untagError} = await supabase
          .from("activity_tags")
          .delete()
          .eq("idea_id", savedIdeaId);
        if (untagError) throw untagError;
      }

      if (selectedTags.length > 0) {
        const tagInserts = selectedTags.reduce(
          (acc, tagString) => {
            const matchedDbTag = dbTags.find(
              (db) => db.name.toLowerCase() === tagString.toLowerCase(),
            );
            if (matchedDbTag) {
              acc.push({idea_id: savedIdeaId, tag_id: matchedDbTag.tag_id});
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

      // 5. An edit replaced the photo: remove the old file (best effort)
      if (editingId && photoChanged && original) {
        const oldPaths = original.imageUrls
          .map((u) => u.split(PHOTO_PATH_MARKER)[1])
          .filter((path): path is string => !!path);
        if (oldPaths.length > 0) {
          supabase.storage
            .from("activities")
            .remove(oldPaths)
            .then(({error}) => {
              if (error) console.warn("Couldn't remove old photo:", error.message);
            });
        }
      }

      // Show it in Profile > My Ideas (and refresh saved copies of it)
      useMyIdeasStore.getState().reload();
      if (editingId) useSavedStore.getState().reload();

      if (editingId) {
        Alert.alert(
          visibility === "PRIVATE" ? "Changes saved" : "Sent for review",
          visibility === "PRIVATE"
            ? "Only you can see it, and you can use it when you plan."
            : "It goes live again once it's approved. You can follow it in Profile › My Ideas.",
        );
        router.back();
      } else {
        Alert.alert(
          visibility === "PRIVATE" ? "Saved" : "Submitted for review",
          visibility === "PRIVATE"
            ? "It's in Profile › My Ideas. Only you can see it, and you can use it when you plan."
            : "You can follow its review in Profile › My Ideas.",
        );
        // Close the sheet (pushing a screen from it left the sheet under it,
        // its top edge showing until the app reloaded)
        router.back();
      }
    } catch (error: any) {
      console.error("Upload Error:", error);
      Alert.alert(
        editingId ? "Couldn't save changes" : "Upload Failed",
        error.message || "An error occurred",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const wasPublished = original?.visibility === "PUBLISHED";

  if (isLoadingIdea) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="white" />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-10 pb-16"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={true}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-3xl font-bold text-white mb-2">
          {editingId ? "Edit idea" : "Post an Activity"}
        </Text>

        {/* GUIDELINES (#85): a quiet link under the title, so people can
            check what's expected before they fill it in */}
        <Text
          onPress={() => router.push("/guidelines")}
          accessibilityRole="link"
          suppressHighlighting
          className="self-start text-zinc-500 text-sm underline mb-8"
        >
          What makes a good idea?
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
              {missingFields.includes("image") && (
                <View className="flex-row items-center gap-1 mt-2">
                  <Ionicons name="alert-circle" size={14} color="#ef4444" />
                  <Text className="text-red-400 text-xs font-semibold">A cover photo is required</Text>
                </View>
              )}
            </View>
          )}
        </Pressable>

        {/* TITLE, DESC, URL */}
        <FieldLabel label="TITLE" missing={missingFields.includes("title")} hint="Add a title" />
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
          className={`text-white p-4 rounded-2xl mb-6 border ${fieldBox(missingFields.includes("title"))}`}
        />

        <FieldLabel
          label="DESCRIPTION"
          missing={missingFields.includes("description")}
          hint="Add a description"
        />
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
          className={`text-white p-4 rounded-2xl mb-6 border h-28 pt-4 ${fieldBox(missingFields.includes("description"))}`}
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
                  setMissingFields((prev) => prev.filter((f) => f !== "place"));
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

        {/* WHERE IS IT (#78): a place on Venture, or a new pin */}
        <View className="mb-6">
          <FieldLabel
            label="WHERE IS IT?"
            missing={missingFields.includes("place")}
            hint="Choose a place"
            dim={modality === "STAY_IN"}
          />
          <Pressable
            onPress={openPlacePicker}
            disabled={modality === "STAY_IN"}
            accessibilityRole="button"
            accessibilityLabel={place ? `Place: ${place.name}. Change` : "Choose a place"}
            className={`flex-row items-center gap-3 rounded-2xl border p-4 active:opacity-80 ${
              missingFields.includes("place")
                ? "bg-red-950/10 border-red-500"
                : modality === "STAY_IN"
                  ? "bg-zinc-950 border-zinc-900"
                  : "bg-zinc-900 border-zinc-800"
            }`}
          >
            <Ionicons
              name={place?.kind === "new" ? "add-circle-outline" : "location-outline"}
              size={20}
              color={modality === "STAY_IN" ? "#3f3f46" : "#FF9D0A"}
            />
            <View className="flex-1">
              {modality === "STAY_IN" ? (
                <Text className="text-zinc-700 text-base">At home (not needed)</Text>
              ) : place ? (
                <>
                  <Text className="text-white font-bold text-base" numberOfLines={1}>
                    {place.name}
                  </Text>
                  <Text className="text-zinc-400 text-sm" numberOfLines={1}>
                    {place.kind === "new"
                      ? `New place${place.address ? ` · near ${place.address}` : ""}`
                      : (place.address ?? "On Venture")}
                  </Text>
                </>
              ) : (
                <Text className="text-zinc-500 text-base">Search places, or add a new one</Text>
              )}
            </View>
            {modality === "GO_OUT" && (
              <Text className="text-blue-400 text-sm font-semibold">{place ? "Change" : "Choose"}</Text>
            )}
          </Pressable>
        </View>

        {/* ENVIRONMENT */}
        <FieldLabel
          label="ENVIRONMENT"
          missing={missingFields.includes("environment")}
          hint="Pick one"
          className="mb-0"
        />
        <View className={`flex-row gap-2 mb-4 ${groupBox(missingFields.includes("environment"))}`}>
          {(["INDOOR", "OUTDOOR", "MIXED"] as const).map((e) => (
            <Pressable
              key={e}
              onPress={() => {
                setEnvironment(e);
                setMissingFields((prev) => prev.filter((f) => f !== "environment"));
              }}
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

        {/* WEATHER (what it needs to be enjoyable) */}
        <Text className="text-zinc-400 text-sm font-bold ml-1 mb-2">WEATHER</Text>
        <View className="flex-row flex-wrap gap-2 mb-2">
          {WEATHER_NEEDS_OPTIONS.map((option) => {
            const shown = weatherNeeds ?? defaultWeatherNeeds;
            const active = shown === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setWeatherNeeds(option.value)}
                accessibilityRole="button"
                accessibilityState={{selected: active}}
                className={`px-4 py-2 rounded-xl border active:opacity-70 ${
                  active ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
                }`}
              >
                <Text className={`font-bold ${active ? "text-white" : "text-zinc-500"}`}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="text-zinc-500 text-xs ml-1 mb-6">
          {weatherNeeds
            ? WEATHER_NEEDS_OPTIONS.find((o) => o.value === weatherNeeds)?.hint
            : environment
              ? `Default for ${environment.toLowerCase()} ideas. ${
                  WEATHER_NEEDS_OPTIONS.find((o) => o.value === defaultWeatherNeeds)?.hint ?? ""
                }`
              : "Follows the environment unless you pick one."}
        </Text>

        {/* TIME OF DAY */}
        <FieldLabel
          label="BEST TIME OF DAY"
          missing={missingFields.includes("timeOfDay")}
          hint="Pick at least one"
          className="mb-0"
        />
        <View className={`flex-row flex-wrap gap-2 mb-4 ${groupBox(missingFields.includes("timeOfDay"))}`}>
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
        <FieldLabel
          label="ACTIVITY TYPE"
          missing={missingFields.includes("type")}
          hint="Pick one"
          className="mb-0"
        />
        <View className={`flex-row flex-wrap gap-2 mb-4 ${groupBox(missingFields.includes("type"))}`}>
          {(["MEAL", "TREAT", "ACTIVE", "OTHER"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => {
                setActivityType(t);
                setMissingFields((prev) => prev.filter((f) => f !== "type"));
              }}
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

        {/* ENERGY (#20): for the date's arc */}
        <FieldLabel
          label="ENERGY"
          missing={missingFields.includes("energy")}
          hint="Pick one"
          className="mb-0"
        />
        <View className={`flex-row gap-2 mb-1 ${groupBox(missingFields.includes("energy"))}`}>
          {ENERGY_OPTIONS.map((option) => {
            const active = shownEnergy === option.value;
            return (
              <Pressable
                key={option.value}
                disabled={strenuous}
                onPress={() => {
                  setEnergy(option.value);
                  setMissingFields((prev) => prev.filter((f) => f !== "energy"));
                }}
                accessibilityRole="button"
                accessibilityState={{selected: active, disabled: strenuous}}
                accessibilityHint={option.hint}
                className={`flex-1 py-3 rounded-xl items-center border active:opacity-70 ${
                  active ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
                } ${strenuous && !active ? "opacity-40" : ""}`}
              >
                <Text className={`font-bold ${active ? "text-white" : "text-zinc-500"}`}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="text-zinc-500 text-xs ml-1 mb-6">
          {strenuous
            ? "Strenuous ideas are active."
            : (ENERGY_OPTIONS.find((o) => o.value === shownEnergy)?.hint ??
              "How it feels. Dates warm up, then wind down.")}
        </Text>

        {/* NUMERICS (Price & Duration) */}
        <View className="flex-row gap-4 mb-3">
          <View className="flex-1">
            <FieldLabel label="PRICE/PERSON ($)" missing={missingFields.includes("price")} />
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
              className={`text-white p-4 rounded-2xl border ${fieldBox(missingFields.includes("price"))}`}
            />
          </View>
          <View className="flex-1">
            <FieldLabel label="DURATION (MIN)" missing={missingFields.includes("duration")} />
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
              placeholder="e.g. 120"
              placeholderTextColor="#71717a"
              keyboardType="number-pad"
              className={`text-white p-4 rounded-2xl border ${fieldBox(missingFields.includes("duration"))}`}
            />
          </View>
        </View>

        {/* DURATION FLEXIBILITY: flexible ideas can run longer to fit a date
            (utils/stretch.ts); set lengths can't be cut */}
        <View className={`flex-row gap-2 mb-1 ${groupBox(missingFields.includes("flexible"))}`}>
          {([
            {value: true, label: "Flexible"},
            {value: false, label: "Set length"},
          ] as const).map((option) => {
            const active = isDurationVariable === option.value;
            return (
              <Pressable
                key={option.label}
                onPress={() => {
                  setIsDurationVariable(option.value);
                  setMissingFields((prev) => prev.filter((f) => f !== "flexible"));
                }}
                accessibilityRole="button"
                accessibilityState={{selected: active}}
                className={`flex-1 py-3 rounded-xl items-center border active:opacity-70 ${
                  active ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
                }`}
              >
                <Text className={`font-bold ${active ? "text-white" : "text-zinc-500"}`}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text
          className={`text-xs ml-1 mb-6 ${missingFields.includes("flexible") ? "text-red-400 font-semibold" : "text-zinc-500"}`}
        >
          {isDurationVariable === true
            ? "Stay as long as you like: it can run longer to fit a date."
            : isDurationVariable === false
              ? "It takes this long: a movie, a class, a tour."
              : missingFields.includes("flexible")
                ? "Is the length flexible, or set?"
                : "Can people stay longer, or is the length set?"}
        </Text>

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

        {/* SAFETY (#81): risky but legal is fine, with a heads-up */}
        <Text className="text-zinc-400 text-sm font-bold ml-1 mb-1">SAFETY (Optional)</Text>
        <Text className="text-zinc-500 text-xs ml-1 mb-3">Anything people should know before they go?</Text>
        <View className="flex-row flex-wrap gap-2 mb-3">
          {RISK_LABELS.map((risk) => {
            const on = riskLabels.includes(risk.value);
            return (
              <Pressable
                key={risk.value}
                onPress={() =>
                  setRiskLabels((prev) =>
                    on ? prev.filter((r) => r !== risk.value) : [...prev, risk.value],
                  )
                }
                accessibilityRole="checkbox"
                accessibilityState={{checked: on}}
                accessibilityHint={risk.hint}
                className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl border active:opacity-70 ${
                  on ? "bg-amber-500/15 border-amber-400" : "bg-zinc-900 border-zinc-800"
                }`}
              >
                <Ionicons name={risk.icon} size={15} color={on ? "#fbbf24" : "#71717a"} />
                <Text className={`font-bold text-sm ${on ? "text-amber-200" : "text-zinc-500"}`}>
                  {risk.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={safetyNote}
          onChangeText={setSafetyNote}
          multiline
          maxLength={SAFETY_NOTE_MAX}
          textAlignVertical="top"
          placeholder="e.g. The last half mile is a scramble; skip it after rain."
          placeholderTextColor="#71717a"
          className="bg-zinc-900 text-white p-4 pt-4 rounded-2xl mb-6 border border-zinc-800 min-h-20"
        />

        {/* SHARED TAGS COMPONENT */}
        <FieldLabel
          label="TAGS"
          missing={missingFields.includes("tags")}
          hint="Pick at least one"
          className="mt-2 mb-0"
        />
        <View className={`mb-8 ${groupBox(missingFields.includes("tags"))}`}>
          <ActivityTagsSelector
            key={tagsKey}
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
        {wasPublished && (
          <View className="flex-row gap-2 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 mb-3">
            <Ionicons name="information-circle" size={18} color="#fbbf24" />
            <Text className="text-amber-100/80 text-sm flex-1">
              {"This idea is live. Saving changes takes it out of Discover until it's reviewed again."}
            </Text>
          </View>
        )}
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
              Reviewed against our{" "}
              <Text
                onPress={() => router.push("/guidelines")}
                accessibilityRole="link"
                suppressHighlighting
                className="font-semibold"
                style={{color: "#FF9D0A"}}
              >
                guidelines
              </Text>
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

        {/* The promise for publishing (#81) */}
        {visibility === "PENDING_REVIEW" && (
          <View className="-mt-6 mb-10">
            <Pressable
              onPress={() => {
                setPromised((p) => !p);
                if (missingFields.includes("promise")) {
                  setMissingFields((prev) => prev.filter((f) => f !== "promise"));
                }
              }}
              accessibilityRole="checkbox"
              accessibilityState={{checked: promised}}
              className={`flex-row items-center gap-3 p-4 rounded-2xl border ${
                missingFields.includes("promise")
                  ? "bg-red-500/10 border-red-500"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <View
                className={`w-6 h-6 rounded-md border items-center justify-center ${
                  promised ? "bg-white border-white" : "border-zinc-500"
                }`}
              >
                {promised && <Ionicons name="checkmark" size={16} color="black" />}
              </View>
              <Text className="text-zinc-200 text-sm flex-1">{POSTER_PROMISE}</Text>
            </Pressable>
            {missingFields.includes("promise") && (
              <View className="flex-row items-center gap-1 ml-1 mt-2">
                <Ionicons name="alert-circle" size={14} color="#ef4444" />
                <Text className="text-red-400 text-xs font-semibold">
                  Tick this to send it for review
                </Text>
              </View>
            )}
          </View>
        )}

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
              {!editingId
                ? "Post Date Idea"
                : visibility === "PRIVATE"
                  ? "Save Changes"
                  : "Save & Submit for Review"}
            </Text>
          )}
        </Pressable>

        {/* EDITING: delete it (live ideas are unpublished first: deleting
            would pull them out of other people's dates and bucket lists) */}
        {editingId && original && (
          <View className="items-center gap-2 -mt-4 mb-10">
            {original.visibility === "PUBLISHED" ? (
              <>
                <Pressable
                  onPress={() =>
                    confirmUnpublishIdea(editingId, () => {
                      // Now private: saving keeps it private, and it can be deleted
                      setOriginal((prev) => (prev ? {...prev, visibility: "PRIVATE"} : prev));
                      setVisibility("PRIVATE");
                    })
                  }
                  disabled={isSubmitting}
                  hitSlop={8}
                  accessibilityRole="button"
                  className="py-2 active:opacity-70"
                >
                  <Text className="text-red-400 font-bold text-base">Unpublish idea</Text>
                </Pressable>
                <Text className="text-zinc-500 text-xs text-center px-6">
                  Live ideas can&apos;t be deleted. Unpublish it first, then you can delete it.
                </Text>
              </>
            ) : (
              <Pressable
                onPress={() => confirmDeleteIdea(editingId, () => router.back())}
                disabled={isSubmitting}
                hitSlop={8}
                accessibilityRole="button"
                className="py-2 active:opacity-70"
              >
                <Text className="text-red-400 font-bold text-base">Delete idea</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/* SWIPE-DOWN GRABBER (custom; native one is off in app/_layout.tsx).
          Floats over the ScrollView so content scrolls underneath, with a
          short fade (sheet color -> transparent) to keep the pill readable. */}
      <View
        pointerEvents="none"
        style={{position: "absolute", top: 0, left: 0, right: 0}}
      >
        <LinearGradient
          colors={["#121212", "rgba(18,18,18,0)"]}
          style={{height: 32, alignItems: "center", paddingTop: 12}}
        >
          <View className="w-12 h-1.5 rounded-full bg-zinc-500" />
        </LinearGradient>
      </View>

      {/* WHERE IS IT: search places on Venture, or add a new one */}
      <PlacePicker
        visible={isPlacePickerOpen}
        current={place}
        onClose={() => setIsPlacePickerOpen(false)}
        onPick={(picked) => {
          setPlace(picked);
          setIsPlacePickerOpen(false);
          if (missingFields.includes("place")) {
            setMissingFields((prev) => prev.filter((f) => f !== "place"));
          }
        }}
      />
    </View>
  );
}
