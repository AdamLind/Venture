// app/create/index.tsx
// Post an idea, or edit one of yours with `?ideaId=123` (#82): one short
// step at a time, each a question or two with big tap targets, a preview of
// what you're making along the top, and a review at the end where every
// answer is one tap from its step. Editing opens on the review.
//
//   1 The idea .... photo, name
//   2 Where ....... at home, or a place (search, or pin a new one)
//   3 What kind ... meal / treat / activity, then up to 4 tags
//   4 What's like . mood, effort, indoors or outdoors (+ the weather it needs)
//   5 When ........ time of day (times the place is closed greyed out), time of year
//   6 Details ..... price, length (+ flexible or set), how many people, minimum age
//   7 The picture . the description (with the card above it), link, safety
//   8 Review ...... the card, every answer, publish or keep private, the promise
//
// Every required question starts unanswered (a preset would be saved as if
// it were the poster's answer, #20). Next checks the step's questions and
// marks what's missing; Submit checks them all and goes to the first gap.
//
// Saving an edit always sends the idea back to review or keeps it private:
// owners can't publish (the database enforces that), so editing a published
// idea takes it out of Discover until it's approved again.

import React, {useEffect, useRef, useState} from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {Image} from "expo-image";
import {useLocalSearchParams, useRouter} from "expo-router";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import Ionicons from "@expo/vector-icons/build/Ionicons";

import {supabase} from "@/src/supabase";
import {useMyIdeasStore} from "@/src/store/useMyIdeasStore";
import {useSavedStore} from "@/src/store/useSavedStore";
import {usePrefsStore} from "@/src/store/usePrefsStore";
import {SUSPENDED_MESSAGE, useAccountStore} from "@/src/store/useAccountStore";
import {confirmDeleteIdea, confirmUnpublishIdea} from "@/src/lib/ideaActions";
import {POSTER_PROMISE} from "@/src/lib/ideaGuidelines";
import {RISK_LABELS, SAFETY_NOTE_MAX, type RiskLabel} from "@/src/lib/safety";
import {WEATHER_NEEDS_OPTIONS, type WeatherNeeds} from "@/src/lib/weatherRules";
import {TIME_OF_DAY_LABEL, type TimeOfDay} from "@/src/lib/timeOfDay";
import {type PickedPlace, type PlaceResult, addPlace, distanceLabel, pickExisting, searchPlaces} from "@/src/lib/places";
import {useLocationStore} from "@/src/store/useLocationStore";
import {TAG_TAXONOMY, BASE_ACTIVITY_CLASSES, MAX_IDEA_TAGS, tagLabel} from "@/src/constants/tags";
import {parseCoordinates} from "@/utils/itineraryEngine";
import type {Exertion, Feel} from "@/utils/ideaTraits";
import {HOLIDAYS, type HolidayId} from "@/utils/holidays";
import {ALL_MONTHS, MONTH_NAMES, SEASONS, type Season, monthsLabel, seasonMonths} from "@/utils/seasons";
import {closedTimesOfDay} from "@/utils/closedTimes";
import {tidyTitle} from "@/src/lib/text";
import PlacePicker from "@/components/places/PlacePicker";
import ActivityTagsSelector from "@/components/home/ActivityTagsSelector";
import {BaseActivity} from "@/types/activities";

// Where an idea's photos live in storage (strip to get the file path)
const PHOTO_PATH_MARKER = "/storage/v1/object/public/activities/";

// ─── The steps ─────────────────────────────────────────────────────────────────

const STEPS = ["idea", "where", "kind", "like", "when", "details", "story", "review"] as const;
type StepKey = (typeof STEPS)[number];
const REVIEW = STEPS.indexOf("review");

/** Which step asks each question (to go to the first one missing) */
const FIELD_STEP: Record<string, StepKey> = {
  image: "idea",
  title: "idea",
  where: "where",
  place: "where",
  type: "kind",
  tags: "kind",
  feel: "like",
  exertion: "like",
  environment: "like",
  timeOfDay: "when",
  year: "when",
  price: "details",
  duration: "details",
  flexible: "details",
  people: "details",
  age: "details",
  description: "story",
  promise: "review",
};

// ─── The choices ───────────────────────────────────────────────────────────────

type Choice<T> = {value: T; label: string; hint?: string};

/** What kind it is. Older ideas may say ACTIVE: that's now the effort question (utils/ideaTraits.ts) */
const TYPE_OPTIONS: (Choice<"MEAL" | "TREAT" | "OTHER"> & {icon: React.ComponentProps<typeof Ionicons>["name"]})[] = [
  {value: "MEAL", label: "Meal", hint: "Breakfast, lunch, dinner", icon: "restaurant-outline"},
  {value: "TREAT", label: "Treat", hint: "Dessert, a drink, a snack", icon: "ice-cream-outline"},
  {value: "OTHER", label: "Activity", hint: "Anything you do: a hike, a show, a class", icon: "compass-outline"},
];
/** The mood (activities.feel), for the date's arc: dates warm up, then wind down */
const FEEL_OPTIONS: Choice<Feel>[] = [
  {value: "CALM", label: "Relaxed", hint: "Quiet and close: stargazing, a spa, a view"},
  {value: "UPBEAT", label: "Lively", hint: "Playful and engaging: an escape room, karaoke, a show"},
];
/** The effort (activities.exertion). A workout is what the Strenuous label means */
const EXERTION_OPTIONS: Choice<Exertion>[] = [
  {value: "NONE", label: "None", hint: "Sitting or standing: a movie, a meal"},
  {value: "LIGHT", label: "Light", hint: "A stroll, a market, a short trail"},
  {value: "HARD", label: "A workout", hint: "Real effort: climbing, a hike, a dance class. Marked Strenuous."},
];
const ENVIRONMENT_OPTIONS: Choice<BaseActivity["environment"]>[] = [
  {value: "INDOOR", label: "Indoors"},
  {value: "OUTDOOR", label: "Outdoors"},
  {value: "MIXED", label: "Both"},
];
/** Who it's for: min and max people (dates are two or more) */
const PEOPLE_OPTIONS: Choice<string>[] = [
  {value: "2-2", label: "Just 2", hint: "2 people"},
  {value: "2-4", label: "Up to 4", hint: "2 to 4 people: a double date"},
  {value: "2-8", label: "Up to 8", hint: "2 to 8 people"},
  {value: "2-50", label: "Any size", hint: "2 or more"},
  {value: "CUSTOM", label: "Other"},
];
/** The youngest it's OK for (Venture itself is 16+, so "All ages" means anyone on it) */
const AGE_OPTIONS: Choice<number | "OTHER">[] = [
  {value: 0, label: "All ages"},
  {value: 18, label: "18+"},
  {value: 21, label: "21+"},
  {value: "OTHER", label: "Other"},
];
const TIME_OF_DAY_OPTIONS: TimeOfDay[] = ["EARLY_MORNING", "MORNING", "AFTERNOON", "EVENING", "LATE_NIGHT"];

// ─── Length: 15-minute steps to 3h, 30 to 6h, then hours to 12h ─────────────────

const longer = (m: number | null) => {
  if (m == null) return 60; // the most common length
  if (m < 180) return Math.floor(m / 15) * 15 + 15;
  if (m < 360) return Math.floor(m / 30) * 30 + 30;
  return Math.min(720, Math.floor(m / 60) * 60 + 60);
};
const shorter = (m: number | null) => {
  if (m == null) return null;
  if (m <= 180) return Math.max(15, Math.ceil(m / 15) * 15 - 15);
  if (m <= 360) return Math.ceil(m / 30) * 30 - 30;
  return Math.ceil(m / 60) * 60 - 60;
};
const lengthLabel = (m: number | null) => {
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h === 0 ? `${r}m` : r ? `${h}h ${r}m` : `${h}h`;
};

/** A tag's group color (its tile on Plan), for the preview's chips */
const tagColor = (tag: string) => {
  const group = Object.keys(TAG_TAXONOMY).find((g) => TAG_TAXONOMY[g].includes(tag));
  return BASE_ACTIVITY_CLASSES.find((c) => c.name === group)?.rawColor ?? "#a1a1aa";
};

// ─── Small pieces ──────────────────────────────────────────────────────────────

/** A question: its title, a short red note when it's missing, then the choices */
function Question({
  title,
  missing,
  note = "Pick one",
  children,
}: {
  title: string;
  missing: boolean;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between gap-2 mb-2.5 ml-0.5">
        {/* One line, so side-by-side questions (price, length) stay level */}
        <Text className={`text-[17px] font-bold shrink ${missing ? "text-red-400" : "text-white"}`} numberOfLines={1}>
          {title}
        </Text>
        {missing && (
          <View className="flex-row items-center gap-1 shrink">
            <Ionicons name="alert-circle" size={14} color="#ef4444" />
            <Text className="text-red-400 text-xs font-semibold" numberOfLines={1}>
              {note}
            </Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

/** An outline that's always there (so nothing shifts), red when missing */
const groupBox = (missing: boolean) =>
  `-mx-2 p-2 rounded-2xl border ${missing ? "border-red-500 bg-red-950/10" : "border-transparent"}`;
const fieldBox = (missing: boolean) => (missing ? "bg-red-950/10 border-red-500" : "bg-zinc-900 border-zinc-700");

/** One-tap choices. `fill`: few choices sharing the row; otherwise they wrap */
function Choices<T extends string | number>({
  options,
  value,
  onPick,
  missing = false,
  fill = false,
  disabled,
}: {
  options: Choice<T>[];
  value: T | null;
  onPick: (value: T) => void;
  missing?: boolean;
  fill?: boolean;
  disabled?: (value: T) => boolean;
}) {
  return (
    <View className={`flex-row ${fill ? "" : "flex-wrap"} gap-2 ${groupBox(missing)}`}>
      {options.map((option) => {
        const active = value === option.value;
        const off = disabled?.(option.value) ?? false;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onPick(option.value)}
            disabled={off}
            accessibilityRole="button"
            accessibilityState={{selected: active, disabled: off}}
            accessibilityHint={option.hint}
            className={`${fill ? "flex-1 items-center py-3.5" : "px-4 py-2.5"} rounded-2xl border active:opacity-70 ${
              active ? "bg-zinc-800 border-white" : off ? "border-dashed border-zinc-700" : "bg-zinc-900 border-zinc-800"
            }`}
          >
            <Text
              className={`font-bold text-[15px] ${active ? "text-white" : off ? "text-zinc-600 line-through" : "text-zinc-400"}`}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const Hint = ({text, red = false}: {text: string; red?: boolean}) => (
  <Text className={`text-[13px] leading-[18px] ml-1 mt-2 ${red ? "text-red-400 font-semibold" : "text-zinc-400"}`}>
    {text}
  </Text>
);

/** The idea as loaded for editing, to tell what changed on save. */
interface EditingOriginal {
  visibility: BaseActivity["visibility"];
  imageUrls: string[];
}

// ─── The screen ────────────────────────────────────────────────────────────────

export default function CreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {ideaId} = useLocalSearchParams<{ideaId?: string}>();
  const editingId = ideaId ? Number(ideaId) : null;
  const [original, setOriginal] = useState<EditingOriginal | null>(null);
  const [isLoadingIdea, setIsLoadingIdea] = useState(!!editingId);
  // Remounts the tag selector once the idea's tags have loaded
  const [tagsKey, setTagsKey] = useState(0);
  const [step, setStep] = useState(0);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  // --- The answers (required ones start unanswered) ---
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  // Where: at home (a stay-in idea) or a place on Venture / a new one (#78)
  const [whereMode, setWhereMode] = useState<"HOME" | "PLACE" | null>(null);
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const modality: BaseActivity["modality"] = whereMode === "HOME" ? "STAY_IN" : "GO_OUT";
  const [activityType, setActivityType] = useState<BaseActivity["activity_type"] | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feel, setFeel] = useState<Feel | null>(null);
  const [exertion, setExertion] = useState<Exertion | null>(null);
  const [environment, setEnvironment] = useState<BaseActivity["environment"] | null>(null);
  // null: the default for its environment (src/lib/weatherRules.ts)
  const [weatherNeeds, setWeatherNeeds] = useState<WeatherNeeds | null>(null);
  const defaultWeatherNeeds: WeatherNeeds = environment === "INDOOR" ? "ANY" : "NICE";
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay[]>([]);
  // Time of year (#21): any time, some months (picked as seasons, fine-tuned
  // by month), or only around a holiday
  const [yearMode, setYearMode] = useState<"ANY" | "SEASONS" | "HOLIDAY" | null>(null);
  const [months, setMonths] = useState<number[]>([]);
  const [holidays, setHolidays] = useState<HolidayId[]>([]);
  // Price: free, or an amount
  const [paid, setPaid] = useState<boolean | null>(null);
  const [price, setPrice] = useState("");
  const [durationMin, setDurationMin] = useState<number | null>(null);
  // Flexible (stay as long as you like) or a set length (a movie, a class)
  const [isDurationVariable, setIsDurationVariable] = useState<boolean | null>(null);
  const [groupSize, setGroupSize] = useState<string | null>(null);
  const [minPeople, setMinPeople] = useState("");
  const [maxPeople, setMaxPeople] = useState("");
  const [ageChoice, setAgeChoice] = useState<number | "OTHER" | null>(null);
  const [minAge, setMinAge] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  // Safety (#81): what to know before going, and a short heads-up
  const [riskLabels, setRiskLabels] = useState<RiskLabel[]>([]);
  const [safetyNote, setSafetyNote] = useState("");
  const [visibility, setVisibility] = useState<BaseActivity["visibility"]>("PENDING_REVIEW");
  // Publishing: "This is legal to do here, and I've noted any risks" (#81, #85)
  const [promised, setPromised] = useState(false);
  // Suspended (#76): can still save private ideas, not submit for review
  const suspended = useAccountStore((s) => !!s.suspension);

  // --- What's missing (marked red), and the rest of the screen ---
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const missing = (field: string) => missingFields.includes(field);
  const clearMissing = (field: string) => setMissingFields((prev) => prev.filter((f) => f !== field));
  const [dbTags, setDbTags] = useState<{tag_id: number; name: string}[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Adding a new place opens the place screen (with this name to start)
  const [newPlaceName, setNewPlaceName] = useState<string | null>(null);

  // Seasons are months where the place is (south of the equator they flip);
  // a stay-in idea uses your home
  const homeLatitude = usePrefsStore((s) => s.prefs.homeLocation?.latitude ?? null);
  const seasonLatitude = whereMode === "PLACE" ? (place?.latitude ?? homeLatitude) : homeLatitude;

  // The place's hours (a new place carries them; one on Venture is looked up)
  // grey out the times of day it's never open
  const [venueHours, setVenueHours] = useState<Record<string, string | null>>({});
  const existingVenueId = place?.kind === "existing" ? place.venueId : null;
  useEffect(() => {
    if (!existingVenueId || existingVenueId in venueHours) return;
    let active = true;
    supabase
      .from("venues")
      .select("opening_hours")
      .eq("venue_id", existingVenueId)
      .maybeSingle()
      .then(({data}) => {
        if (active) setVenueHours((prev) => ({...prev, [existingVenueId]: data?.opening_hours ?? null}));
      });
    return () => {
      active = false;
    };
  }, [existingVenueId, venueHours]);
  const hoursText =
    whereMode !== "PLACE" || !place
      ? null
      : place.kind === "new"
        ? place.openingHours
        : (venueHours[place.venueId] ?? null);
  const closedTimes = closedTimesOfDay(hoursText);

  // Place search, right in the step: nearby before you type, matches as you do
  const userLocation = useLocationStore((s) => s.userLocation);
  const homeLocation = usePrefsStore((s) => s.prefs.homeLocation ?? null);
  // Around you (not the picked place: the list shouldn't jump when you pick)
  const around = userLocation ??
    homeLocation ??
    (place && {latitude: place.latitude, longitude: place.longitude}) ?? {latitude: 40.2338, longitude: -111.6585};
  const [placeQuery, setPlaceQuery] = useState("");
  // Searching: the field moves to the top and the results fill the space
  // above the keyboard (the heading, At home, the strip and Next step aside)
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const closePlaceSearch = () => {
    Keyboard.dismiss();
    setPlaceSearchOpen(false);
  };
  const [placeResults, setPlaceResults] = useState<{key: string; places?: PlaceResult[]; error?: string} | null>(null);
  const searchKey = `${placeQuery.trim().toLowerCase()}|${around.latitude.toFixed(3)},${around.longitude.toFixed(3)}`;
  useEffect(() => {
    if (STEPS[step] !== "where") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPlaces({query: placeQuery, near: around, radiusM: placeQuery.trim() ? 200_000 : 30_000, limit: 12})
        .then((places) => !cancelled && setPlaceResults({key: searchKey, places}))
        .catch((e) => !cancelled && setPlaceResults({key: searchKey, error: e.message}));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // (around by value, via searchKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, searchKey]);
  const searchingPlaces = placeResults?.key !== searchKey;
  // As many places as fit above Next (the step never scrolls); more: "Search
  // to see more places". Measured: the space the steps get, and where the
  // list starts in it
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [whereGroupY, setWhereGroupY] = useState(0);
  const [placeListY, setPlaceListY] = useState(0);
  // A row's real height on this device (measured from one shown); the
  // "Add a new place" row is the same shape
  const [rowHeight, setRowHeight] = useState(62);
  const NOTE_HEIGHT = 41; // "Search to see more places" (only when there are more)
  const BOTTOM_GAP = 20; // under the list: the outline's 8 and the step's 12
  const roomForRows = viewportHeight - whereGroupY - placeListY - BOTTOM_GAP - rowHeight;
  const fitting = (room: number) => Math.max(1, Math.min(12, Math.floor(room / rowHeight)));
  const pinnedPlace =
    whereMode === "PLACE" &&
    !!place &&
    !(place.kind === "existing" && placeResults?.places?.some((r) => r.venue_id === place.venueId));
  const rowsWanted = (placeResults?.places?.length ?? 0) + (pinnedPlace ? 1 : 0);
  const placeRowsFit = !viewportHeight
    ? 3
    : rowsWanted <= fitting(roomForRows)
      ? fitting(roomForRows) // they all fit: no note needed
      : fitting(roomForRows - NOTE_HEIGHT);
  const allPlaces = placeResults?.places ?? [];
  const shownPlaces = allPlaces.slice(0, placeRowsFit - (pinnedPlace ? 1 : 0));
  const morePlaces = allPlaces.length > shownPlaces.length;
  const choosePlace = (picked: PickedPlace) => {
    Keyboard.dismiss();
    setPlaceSearchOpen(false);
    setPlace(picked);
    setWhereMode("PLACE");
    clearMissing("place");
    clearMissing("where");
  };

  // --- EDITING: load the idea into the steps, and open on the review ---
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
        Alert.alert("Couldn't open this idea", error?.message ?? "It may have been deleted.");
        router.back();
        return;
      }

      const coords = parseCoordinates(data.venues?.coordinates);
      setTitle(data.title ?? "");
      setDescription(data.description ?? "");
      setUrl(data.url ?? "");
      setImageUri(data.image_urls?.[0] ?? null);
      const loadedPlace: PickedPlace | null =
        data.venue_id && data.venues && coords
          ? {
              kind: "existing",
              venueId: data.venue_id,
              name: data.venues.name,
              address: data.venues.address ?? null,
              latitude: coords.latitude,
              longitude: coords.longitude,
            }
          : null;
      setPlace(loadedPlace);
      setWhereMode(data.modality === "STAY_IN" ? "HOME" : loadedPlace ? "PLACE" : null);
      // Older ideas' Active type is now the effort question (asked again on edit)
      setActivityType(data.activity_type === "ACTIVE" ? "OTHER" : data.activity_type);
      setEnvironment(data.environment);
      setWeatherNeeds((data.weather_needs as WeatherNeeds | null) ?? null);
      setTimeOfDay((data.time_of_day ?? []) as TimeOfDay[]);
      const sizeKey = `${data.min_people ?? 2}-${data.max_people ?? 2}`;
      setGroupSize(PEOPLE_OPTIONS.some((o) => o.value === sizeKey) ? sizeKey : "CUSTOM");
      setMinPeople(String(data.min_people ?? 2));
      setMaxPeople(String(data.max_people ?? 2));
      const age = Number(data.min_age) || 0;
      setAgeChoice(AGE_OPTIONS.some((o) => o.value === age) ? age : "OTHER");
      setMinAge(age ? String(age) : "");
      const risks = (data.risk_labels ?? []) as RiskLabel[];
      setRiskLabels(risks.filter((r) => r !== "STRENUOUS"));
      setExertion((data.exertion as Exertion | null) ?? (risks.includes("STRENUOUS") ? "HARD" : null));
      setFeel((data.feel as Feel | null) ?? null);
      // Time of year: null months (and no holidays) means it wasn't asked yet
      const savedHolidays = (data.holidays ?? []) as HolidayId[];
      const savedMonths = (data.months ?? null) as number[] | null;
      if (savedHolidays.length > 0) {
        setYearMode("HOLIDAY");
        setHolidays(savedHolidays);
      } else if (savedMonths && savedMonths.length === 12) {
        setYearMode("ANY");
      } else if (savedMonths && savedMonths.length > 0) {
        setYearMode("SEASONS");
        setMonths([...savedMonths].sort((a, b) => a - b));
      }
      setSafetyNote(data.safety_note ?? "");
      const cost = Number(data.est_price_per_person) || 0;
      setPaid(cost > 0);
      setPrice(cost > 0 ? String(cost) : "0");
      setDurationMin(data.est_duration_minutes ?? null);
      setIsDurationVariable(!!data.is_duration_variable);
      setSelectedTags((data.activity_tags ?? []).map((row: any) => row.tags?.name).filter(Boolean));
      setTagsKey((k) => k + 1);
      // Saving keeps a private idea private; everything else goes to review
      setVisibility(data.visibility === "PRIVATE" ? "PRIVATE" : "PENDING_REVIEW");
      setOriginal({visibility: data.visibility, imageUrls: data.image_urls ?? []});
      setStep(REVIEW);
      setIsLoadingIdea(false);
    };

    loadIdea();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useEffect(() => {
    supabase
      .from("tags")
      .select("tag_id, name")
      .then(({data, error}) => {
        if (!error && data) setDbTags(data);
      });
  }, []);

  // --- Moving between steps ---
  const goTo = (index: number) => {
    Keyboard.dismiss();
    setPlaceSearchOpen(false);
    setStep(Math.max(0, Math.min(REVIEW, index)));
    scrollRef.current?.scrollTo({y: 0, animated: false});
  };

  /** Everything still unanswered */
  const findMissing = (): string[] => {
    const out: string[] = [];
    if (!imageUri) out.push("image");
    if (!title.trim()) out.push("title");
    if (!whereMode) out.push("where");
    if (whereMode === "PLACE" && !place) out.push("place");
    if (!activityType) out.push("type");
    if (selectedTags.length === 0) out.push("tags");
    if (!feel) out.push("feel");
    if (!exertion) out.push("exertion");
    if (!environment) out.push("environment");
    if (timeOfDay.length === 0) out.push("timeOfDay");
    if (!yearMode || (yearMode === "SEASONS" && months.length === 0) || (yearMode === "HOLIDAY" && holidays.length === 0)) {
      out.push("year");
    }
    if (paid === null || (paid && !(parseFloat(price) > 0))) out.push("price");
    if (durationMin == null) out.push("duration");
    if (isDurationVariable === null) out.push("flexible");
    const customMin = parseInt(minPeople, 10);
    const customMax = parseInt(maxPeople, 10);
    if (!groupSize || (groupSize === "CUSTOM" && !(customMin >= 1 && customMax >= customMin))) out.push("people");
    if (ageChoice === null || (ageChoice === "OTHER" && !(parseInt(minAge, 10) >= 0))) out.push("age");
    if (!description.trim()) out.push("description");
    return out;
  };

  const warn = () => {
    if (process.env.EXPO_OS === "ios") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const next = () => {
    const here = findMissing().filter((f) => FIELD_STEP[f] === STEPS[step]);
    if (here.length > 0) {
      setMissingFields(here);
      warn();
      return;
    }
    setMissingFields([]);
    goTo(step + 1);
  };

  // Closing asks first when something would be lost: a new idea with
  // anything in it, or an edit that changed something
  const snapshot = JSON.stringify([
    imageUri, title, whereMode, place?.name ?? null, activityType, selectedTags, feel, exertion, environment,
    weatherNeeds, timeOfDay, yearMode, months, holidays, paid, price, durationMin, isDurationVariable, groupSize,
    minPeople, maxPeople, ageChoice, minAge, description, url, riskLabels, safetyNote, visibility,
  ]);
  // What the edit started as (set once it has loaded, while rendering)
  const [baseline, setBaseline] = useState<string | null>(null);
  if (editingId && !isLoadingIdea && baseline === null) setBaseline(snapshot);
  const startedSomething = editingId
    ? baseline !== null && snapshot !== baseline
    : !!imageUri || !!title.trim() || !!whereMode || !!activityType || selectedTags.length > 0 || !!description.trim();
  const close = () => {
    Keyboard.dismiss();
    if (!startedSomething) {
      router.back();
      return;
    }
    Alert.alert(
      editingId ? "Leave without saving?" : "Discard this idea?",
      editingId ? "Your changes won't be saved." : "What you've entered so far will be lost.",
      [
        {text: "Keep going", style: "cancel"},
        {text: editingId ? "Leave" : "Discard", style: "destructive", onPress: () => router.back()},
      ],
    );
  };
  const back = () => {
    // Searching for a place: back closes the search first
    if (placeSearchOpen) {
      closePlaceSearch();
      return;
    }
    // Editing opens on the review: its back arrow is a way out too
    if (step === 0 || (editingId && step === REVIEW)) close();
    else goTo(step - 1);
  };

  // Android's back button goes back a step (or closes, asking first)
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      back();
      return true;
    });
    return () => sub.remove();
  });

  // --- Answers that touch others ---
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const compressed = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{resize: {width: 800}}], {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setImageUri(compressed.uri);
      clearMissing("image");
    }
  };

  const toggleTimeOfDay = (time: TimeOfDay) => {
    setTimeOfDay((prev) => (prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time]));
    clearMissing("timeOfDay");
  };

  const seasonOn = (season: Season) =>
    yearMode === "SEASONS" && seasonMonths(season, seasonLatitude).every((m) => months.includes(m));
  const toggleSeason = (season: Season) => {
    const its = seasonMonths(season, seasonLatitude);
    const base = yearMode === "SEASONS" ? months : [];
    const next = its.every((m) => base.includes(m)) ? base.filter((m) => !its.includes(m)) : [...base, ...its];
    setYearMode("SEASONS");
    setMonths(Array.from(new Set(next)).sort((a, b) => a - b));
    setHolidays([]);
    clearMissing("year");
  };
  const toggleMonth = (month: number) => {
    setMonths((prev) => (prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month].sort((a, b) => a - b)));
    clearMissing("year");
  };
  const toggleHoliday = (id: HolidayId) => {
    setHolidays((prev) => (prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]));
    clearMissing("year");
  };

  // Length: tap to step, hold to keep stepping
  const repeat = useRef<{timeout?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval>}>({});
  const stopRepeat = () => {
    if (repeat.current.timeout) clearTimeout(repeat.current.timeout);
    if (repeat.current.interval) clearInterval(repeat.current.interval);
    repeat.current = {};
  };
  const startRepeat = (fn: (m: number | null) => number | null) => {
    stopRepeat();
    if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDurationMin((m) => fn(m));
    clearMissing("duration");
    repeat.current.timeout = setTimeout(() => {
      repeat.current.interval = setInterval(() => setDurationMin((m) => fn(m)), 110);
    }, 420);
  };
  useEffect(() => stopRepeat, []);

  // --- Saving ---
  const handleSubmit = async () => {
    Keyboard.dismiss();
    const {
      data: {session},
    } = await supabase.auth.getSession();
    if (!session) {
      Alert.alert("Sign In Required", "You must be logged in to post a date idea.");
      return;
    }
    const userId = session.user.id;

    // Anything unanswered: go to the first step that asks it
    const gaps = findMissing();
    if (gaps.length > 0) {
      setMissingFields(gaps);
      warn();
      goTo(Math.min(...gaps.map((f) => STEPS.indexOf(FIELD_STEP[f]))));
      return;
    }

    if (visibility === "PENDING_REVIEW" && suspended) {
      Alert.alert("You can't publish right now", SUSPENDED_MESSAGE, [
        {text: "Cancel", style: "cancel"},
        {text: "Keep it private", onPress: () => setVisibility("PRIVATE")},
      ]);
      return;
    }

    // Publishing needs the poster's promise (private ideas don't)
    if (visibility === "PENDING_REVIEW" && !promised) {
      setMissingFields(["promise"]);
      warn();
      return;
    }

    setMissingFields([]);
    setIsSubmitting(true);

    const [presetMin, presetMax] = (groupSize ?? "2-2").split("-").map(Number);
    const dbMinPeople = groupSize === "CUSTOM" ? parseInt(minPeople, 10) : presetMin;
    const dbMaxPeople = groupSize === "CUSTOM" ? parseInt(maxPeople, 10) : presetMax;
    const dbMinAge = ageChoice === "OTHER" ? parseInt(minAge, 10) : (ageChoice ?? 0);
    // Strenuous is what "A workout" means
    const dbRiskLabels: RiskLabel[] = [
      ...riskLabels.filter((r) => r !== "STRENUOUS"),
      ...(exertion === "HARD" ? (["STRENUOUS"] as RiskLabel[]) : []),
    ];

    try {
      // 1. Place (#78): one already on Venture, or the new one added now
      //    (places are shared, so an existing one is never edited)
      let venueId: string | null = null;
      if (modality === "GO_OUT" && place) {
        venueId = place.kind === "existing" ? place.venueId : await addPlace(place);
      }
      if (!imageUri) throw new Error("Image missing during upload phase");

      // 2. Photo: upload only if it's new (an edit keeps the existing URL)
      let imageUrls: string[];
      const photoChanged = !original || imageUri !== original.imageUrls[0];
      if (photoChanged) {
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const response = await fetch(imageUri);
        const arrayBuffer = await response.arrayBuffer();
        const {error: uploadError} = await supabase.storage
          .from("activities")
          .upload(fileName, arrayBuffer, {contentType: "image/jpeg"});
        if (uploadError) throw uploadError;
        imageUrls = [supabase.storage.from("activities").getPublicUrl(fileName).data.publicUrl];
      } else {
        imageUrls = original!.imageUrls;
      }

      const fields = {
        venue_id: venueId,
        // Only a slip is tidied (all caps / all lowercase)
        title: tidyTitle(title),
        description: description.trim(),
        url: url.trim() || null,
        image_urls: imageUrls,
        modality,
        activity_type: activityType,
        environment,
        // Indoors: no weather rules
        weather_needs: environment === "INDOOR" ? null : weatherNeeds,
        time_of_day: timeOfDay.length > 0 ? timeOfDay : null,
        est_price_per_person: paid ? parseFloat(price) || 0 : 0,
        est_duration_minutes: durationMin,
        is_duration_variable: isDurationVariable,
        feel,
        exertion,
        months: yearMode === "ANY" ? ALL_MONTHS : yearMode === "SEASONS" ? months : null,
        holidays: yearMode === "HOLIDAY" ? holidays : [],
        min_people: dbMinPeople,
        max_people: dbMaxPeople,
        min_age: dbMinAge,
        risk_labels: dbRiskLabels,
        safety_note: safetyNote.trim() ? safetyNote.trim().slice(0, SAFETY_NOTE_MAX) : null,
        visibility,
      };

      // 3. The idea itself
      let savedIdeaId: number;
      if (editingId) {
        const {data: updated, error: dbError} = await supabase
          .from("activities")
          // Resubmitting starts a fresh review; keeping it private keeps
          // the last reviewer note for reference
          .update(visibility === "PENDING_REVIEW" ? {...fields, moderation_note: null, moderation_rules: null} : fields)
          .eq("idea_id", editingId)
          .select("idea_id")
          .maybeSingle();
        if (dbError) throw dbError;
        if (!updated) throw new Error("Couldn't save your changes.");
        savedIdeaId = editingId;
      } else {
        const {data: created, error: dbError} = await supabase
          .from("activities")
          .insert({user_id: userId, ...fields})
          .select("idea_id")
          .single();
        if (dbError) throw dbError;
        savedIdeaId = created.idea_id;
      }

      // 4. Tags: an edit replaces them
      if (editingId) {
        const {error: untagError} = await supabase.from("activity_tags").delete().eq("idea_id", savedIdeaId);
        if (untagError) throw untagError;
      }
      const tagInserts = selectedTags.flatMap((name) => {
        const match = dbTags.find((db) => db.name.toLowerCase() === name.toLowerCase());
        return match ? [{idea_id: savedIdeaId, tag_id: match.tag_id}] : [];
      });
      if (tagInserts.length > 0) {
        const {error: tagError} = await supabase.from("activity_tags").insert(tagInserts);
        if (tagError) throw tagError;
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
      } else {
        Alert.alert(
          visibility === "PRIVATE" ? "Saved" : "Submitted for review",
          visibility === "PRIVATE"
            ? "It's in Profile › My Ideas. Only you can see it, and you can use it when you plan."
            : "You can follow its review in Profile › My Ideas.",
        );
      }
      // Close the sheet (pushing a screen from it left the sheet under it)
      router.back();
    } catch (error: any) {
      console.error("Upload Error:", error);
      Alert.alert(editingId ? "Couldn't save changes" : "Upload Failed", error.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- What the answers say, in words (the preview and the review) ---
  const placeText = whereMode === "HOME" ? "At home" : (place?.name ?? null);
  const typeText = TYPE_OPTIONS.find((o) => o.value === (activityType === "ACTIVE" ? "OTHER" : activityType))?.label ?? null;
  const shownWeather = weatherNeeds ?? defaultWeatherNeeds;
  const weatherText = WEATHER_NEEDS_OPTIONS.find((o) => o.value === shownWeather)?.label ?? null;
  const likeText = [
    FEEL_OPTIONS.find((o) => o.value === feel)?.label,
    EXERTION_OPTIONS.find((o) => o.value === exertion)?.label,
    environment
      ? `${ENVIRONMENT_OPTIONS.find((o) => o.value === environment)?.label}${
          environment !== "INDOOR" && weatherText ? `, ${weatherText.toLowerCase()}` : ""
        }`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const yearText =
    yearMode === "ANY"
      ? "Any time of year"
      : yearMode === "SEASONS" && months.length
        ? monthsLabel(months)
        : yearMode === "HOLIDAY" && holidays.length
          ? `Around ${HOLIDAYS.filter((h) => holidays.includes(h.id)).map((h) => h.label).join(" or ")}`
          : null;
  const whenText = [timeOfDay.map((t) => TIME_OF_DAY_LABEL[t]).join(", ") || null, yearText].filter(Boolean).join(" · ");
  const priceText = paid === false ? "Free" : paid && parseFloat(price) > 0 ? `$${parseFloat(price)}` : null;
  const peopleText =
    groupSize === "CUSTOM"
      ? minPeople && maxPeople
        ? `${minPeople}–${maxPeople} people`
        : null
      : (PEOPLE_OPTIONS.find((o) => o.value === groupSize)?.label.toLowerCase() ?? null);
  const ageText = ageChoice === 0 ? "all ages" : ageChoice === "OTHER" ? (minAge ? `${minAge}+` : null) : ageChoice ? `${ageChoice}+` : null;
  const detailsText = [
    priceText,
    durationMin != null
      ? `${lengthLabel(durationMin)}${isDurationVariable == null ? "" : isDurationVariable ? ", flexible" : ", set"}`
      : null,
    peopleText,
    ageText,
  ]
    .filter(Boolean)
    .join(" · ");
  const safetyText = RISK_LABELS.filter((r) => riskLabels.includes(r.value) || (r.value === "STRENUOUS" && exertion === "HARD"))
    .map((r) => r.label)
    .join(", ");
  // The strip along the top: everything so far, in a line
  const soFar =
    [placeText, typeText, selectedTags.map(tagLabel).join(", ") || null, likeText || null, whenText || null, detailsText || null]
      .filter(Boolean)
      .join(" · ") || "Fills in as you go";
  const cardLine = [placeText, priceText, durationMin != null ? lengthLabel(durationMin) : null, timeOfDay[0] ? TIME_OF_DAY_LABEL[timeOfDay[0]] : null]
    .filter(Boolean)
    .join(" · ");

  const wasPublished = original?.visibility === "PUBLISHED";
  const key = STEPS[step];

  if (isLoadingIdea) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="white" />
      </View>
    );
  }

  // --- The steps ---
  const stepIdea = (
    <>
      <Heading title="What's the idea?" sub="A photo and a name. Everything else is a few taps." />
      <Pressable
        onPress={pickImage}
        accessibilityRole="button"
        accessibilityLabel={imageUri ? "Change the cover photo" : "Add a cover photo"}
        className={`h-60 w-full rounded-3xl border justify-center items-center mb-6 overflow-hidden active:opacity-80 ${
          missing("image") ? "bg-red-950/20 border-red-500" : "bg-zinc-900 border-zinc-700 border-dashed"
        }`}
      >
        {imageUri ? (
          <Image source={{uri: imageUri}} style={{width: "100%", height: "100%"}} contentFit="cover" />
        ) : (
          <View className="items-center gap-1.5">
            <Ionicons name="camera-outline" size={40} color={missing("image") ? "#ef4444" : "#a1a1aa"} />
            <Text className={`font-bold text-base ${missing("image") ? "text-red-400" : "text-zinc-300"}`}>
              {missing("image") ? "A cover photo is required" : "Add a cover photo"}
            </Text>
            <Text className="text-zinc-400 text-[13px]">Your own, taken there, is best</Text>
          </View>
        )}
      </Pressable>
      <Question title="Name it" missing={missing("title")} note="Add a name">
        <TextInput
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            clearMissing("title");
          }}
          placeholder="e.g. Sunset hike to the overlook"
          placeholderTextColor="#71717a"
          returnKeyType="next"
          onSubmitEditing={next}
          className={`text-white text-[17px] font-semibold px-4 py-4 rounded-2xl border ${fieldBox(missing("title"))}`}
        />
        <Hint text="Short and specific: “Sunset hike to the overlook”, not “Fun outing”." />
      </Question>
      <Text
        onPress={() => router.push("/guidelines")}
        accessibilityRole="link"
        suppressHighlighting
        className="self-start text-sm font-semibold ml-1"
        style={{color: "#FF9D0A"}}
      >
        What makes a good idea?
      </Text>
    </>
  );

  const stepWhere = (
    <>
      {!placeSearchOpen && <Heading title="Where is it?" sub="A place on Venture, a new one, or at home." />}
      <View
        className={`gap-3 ${groupBox(missing("where") || missing("place"))}`}
        onLayout={(e) => setWhereGroupY(e.nativeEvent.layout.y)}
      >
        {!placeSearchOpen && (
        <Pressable
          onPress={() => {
            setWhereMode("HOME");
            clearMissing("where");
            clearMissing("place");
          }}
          accessibilityRole="button"
          accessibilityState={{selected: whereMode === "HOME"}}
          className={`flex-row items-center gap-3.5 p-4 rounded-3xl border active:opacity-80 ${
            whereMode === "HOME" ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
          }`}
        >
          <View className="w-11 h-11 rounded-2xl bg-zinc-800 items-center justify-center">
            <Ionicons name="home-outline" size={21} color="#FF9D0A" />
          </View>
          <View className="flex-1">
            <Text className="text-white font-bold text-base">At home</Text>
            <Text className="text-zinc-400 text-[13px]">A stay-in idea: movie night, cooking together</Text>
          </View>
          {whereMode === "HOME" && <Ionicons name="checkmark" size={22} color="white" />}
        </Pressable>
        )}

        {/* Search places on Venture */}
        <View className="flex-row items-center gap-3">
          <View className="flex-1 flex-row items-center gap-2.5 h-[52px] px-4 rounded-2xl border border-zinc-700 bg-zinc-900">
            <Ionicons name="search" size={18} color="#a1a1aa" />
            <TextInput
              value={placeQuery}
              onChangeText={setPlaceQuery}
              onFocus={() => setPlaceSearchOpen(true)}
              placeholder="Search places"
              placeholderTextColor="#71717a"
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search places on Venture"
              // Font size only: a line height pushes one-line text off centre on iOS
              className="flex-1 h-[52px] text-white"
              style={{fontSize: 16, paddingVertical: 0}}
            />
            {searchingPlaces && <ActivityIndicator size="small" color="#71717a" />}
          </View>
          {placeSearchOpen && (
            <Pressable onPress={closePlaceSearch} hitSlop={8} accessibilityRole="button" className="active:opacity-60">
              <Text className="text-white font-semibold text-[15px]">Cancel</Text>
            </Pressable>
          )}
        </View>

        <View
          className="rounded-3xl border border-zinc-800 bg-zinc-900 overflow-hidden"
          onLayout={(e) => setPlaceListY(e.nativeEvent.layout.y)}
        >
          {/* First, so short results never move it: hidden gems are what Venture is for */}
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setNewPlaceName(placeQuery.trim());
            }}
            accessibilityRole="button"
            className="flex-row items-center gap-3 px-4 py-3.5 active:bg-zinc-800"
          >
            <Ionicons name="add" size={20} color="#93c5fd" />
            <View className="flex-1">
              <Text className="text-blue-300 font-bold text-[15px]" numberOfLines={1}>
                {placeQuery.trim() ? `Add "${placeQuery.trim()}" as a new place` : "Add a new place"}
              </Text>
              <Text className="text-zinc-400 text-[13px]">Pin a hidden gem, then add its hours</Text>
            </View>
          </Pressable>

          {/* The one picked, kept in view (a new place, or one not in these results) */}
          {pinnedPlace && place && (
            <PlaceRow
              name={place.name}
              detail={
                place.kind === "new"
                  ? `New place${place.address ? ` · near ${place.address}` : ""}`
                  : (place.address ?? "On Venture")
              }
              selected
              isNew={place.kind === "new"}
              divider
              onPress={() => {}}
            />
          )}
          {shownPlaces.map((r, i) => {
            const selected = whereMode === "PLACE" && place?.kind === "existing" && place.venueId === r.venue_id;
            const detail = [r.address, distanceLabel(r.distance_m), r.ideas > 0 ? `${r.ideas} ${r.ideas === 1 ? "idea" : "ideas"}` : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <PlaceRow
                key={r.venue_id}
                name={r.name}
                detail={detail}
                selected={selected}
                divider
                onPress={() => choosePlace(pickExisting(r))}
                onHeight={i === 0 ? setRowHeight : undefined}
              />
            );
          })}
          {placeResults?.error && !searchingPlaces ? (
            <Text className="text-zinc-400 text-sm px-4 py-3.5 border-t border-zinc-800">{placeResults.error}</Text>
          ) : placeResults?.places?.length === 0 && !searchingPlaces ? (
            <Text className="text-zinc-400 text-sm px-4 py-3.5 border-t border-zinc-800">
              {placeQuery.trim() ? "No places by that name yet." : "No places nearby yet."}
            </Text>
          ) : morePlaces ? (
            <Text className="text-zinc-500 text-[13px] text-center px-4 py-3 border-t border-zinc-800">
              {placeQuery.trim() ? "Keep typing to narrow it down" : "Search to see more places"}
            </Text>
          ) : null}
        </View>
      </View>
      {(missing("where") || missing("place")) && (
        <Hint red text={missing("place") ? "Choose the place (or pick At home)." : "Pick one."} />
      )}
    </>
  );

  const stepKind = (
    <>
      <Heading title="What kind is it?" sub="Then pick up to four tags that say the most about it." />
      <View className={`flex-row gap-2.5 mb-6 ${groupBox(missing("type"))}`}>
        {TYPE_OPTIONS.map((option) => {
          const active = (activityType === "ACTIVE" ? "OTHER" : activityType) === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                setActivityType(option.value);
                clearMissing("type");
              }}
              accessibilityRole="button"
              accessibilityState={{selected: active}}
              accessibilityHint={option.hint}
              className={`flex-1 h-28 rounded-3xl border items-center justify-center gap-2 active:opacity-80 ${
                active ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <Ionicons name={option.icon} size={28} color={active ? "white" : "#a1a1aa"} />
              <Text className={`font-bold text-[15px] ${active ? "text-white" : "text-zinc-400"}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Question title="Tags" missing={missing("tags")} note={`Pick 1 to ${MAX_IDEA_TAGS}`}>
        <View className={groupBox(missing("tags"))}>
          <ActivityTagsSelector
            key={tagsKey}
            mode="publish"
            taxonomy={TAG_TAXONOMY}
            classes={BASE_ACTIVITY_CLASSES}
            // A meal or a treat: its tags are under Food; an activity's most likely under Active
            openGroup={activityType === "MEAL" || activityType === "TREAT" ? "Food" : activityType ? "Active" : null}
            initialActiveTags={selectedTags}
            onTagsChange={(tags) => {
              setSelectedTags(tags);
              if (tags.length > 0) clearMissing("tags");
            }}
          />
        </View>
      </Question>
    </>
  );

  const stepLike = (
    <>
      <Heading title="What's it like?" />
      <Question title="What's the mood?" missing={missing("feel")}>
        <Choices
          fill
          options={FEEL_OPTIONS}
          value={feel}
          onPick={(v) => {
            setFeel(v);
            clearMissing("feel");
          }}
          missing={missing("feel")}
        />
        <Hint text={FEEL_OPTIONS.find((o) => o.value === feel)?.hint ?? "Dates warm up, then wind down."} />
      </Question>
      <Question title="How much effort?" missing={missing("exertion")}>
        <Choices
          fill
          options={EXERTION_OPTIONS}
          value={exertion}
          onPick={(v) => {
            setExertion(v);
            clearMissing("exertion");
          }}
          missing={missing("exertion")}
        />
        <Hint text={EXERTION_OPTIONS.find((o) => o.value === exertion)?.hint ?? "From sitting down to a real workout."} />
      </Question>
      <Question title="Indoors or outdoors?" missing={missing("environment")}>
        <Choices
          fill
          options={ENVIRONMENT_OPTIONS}
          value={environment}
          onPick={(v) => {
            setEnvironment(v);
            // Indoors needs no weather; outdoors starts at its default
            if (v === "INDOOR") setWeatherNeeds(null);
            clearMissing("environment");
          }}
          missing={missing("environment")}
        />
      </Question>
      {environment && environment !== "INDOOR" && (
        <Question title="What weather does it need?" missing={false}>
          <View className="flex-row flex-wrap gap-2">
            {WEATHER_NEEDS_OPTIONS.map((option) => {
              const active = shownWeather === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setWeatherNeeds(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{selected: active}}
                  accessibilityHint={option.hint}
                  className={`px-4 py-2.5 rounded-2xl border active:opacity-70 ${
                    active ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
                  }`}
                  style={{flexBasis: "47%", flexGrow: 1}}
                >
                  <Text className={`font-bold text-[15px] ${active ? "text-white" : "text-zinc-400"}`}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Hint text={WEATHER_NEEDS_OPTIONS.find((o) => o.value === shownWeather)?.hint ?? ""} />
        </Question>
      )}
    </>
  );

  const stepWhen = (
    <>
      <Heading title="When is it best?" />
      <Question title="Time of day" missing={missing("timeOfDay")} note="Pick at least one">
        <View className={`flex-row flex-wrap gap-2 ${groupBox(missing("timeOfDay"))}`}>
          {TIME_OF_DAY_OPTIONS.map((time) => {
            const on = timeOfDay.includes(time);
            const closed = closedTimes.has(time) && !on;
            return (
              <Pressable
                key={time}
                onPress={() => toggleTimeOfDay(time)}
                disabled={closed}
                accessibilityRole="button"
                accessibilityState={{selected: on, disabled: closed}}
                accessibilityHint={closed ? "The place is closed then" : undefined}
                className={`px-4 py-2.5 rounded-2xl border active:opacity-70 ${
                  on ? "bg-zinc-800 border-white" : closed ? "border-dashed border-zinc-700" : "bg-zinc-900 border-zinc-800"
                }`}
              >
                <Text
                  className={`font-bold text-[15px] ${on ? "text-white" : closed ? "text-zinc-600 line-through" : "text-zinc-400"}`}
                >
                  {TIME_OF_DAY_LABEL[time]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {closedTimes.size > 0 && (
          <Hint
            text={`${[...closedTimes].map((t) => TIME_OF_DAY_LABEL[t]).join(" and ")} ${
              closedTimes.size === 1 ? "is" : "are"
            } greyed out: ${place?.name ?? "the place"} is closed then.`}
          />
        )}
      </Question>

      <Question
        title="Time of year"
        missing={missing("year")}
        note={yearMode === "SEASONS" ? "Pick a season or month" : yearMode === "HOLIDAY" ? "Pick a holiday" : "Pick one"}
      >
        <View className={`flex-row flex-wrap gap-2 ${groupBox(missing("year"))}`}>
          {[
            {
              key: "ANY",
              label: "Any time",
              on: yearMode === "ANY",
              press: () => {
                setYearMode("ANY");
                setMonths([]);
                setHolidays([]);
                clearMissing("year");
              },
            },
            ...SEASONS.map((season) => ({
              key: season.value,
              label: season.label,
              on: seasonOn(season.value),
              press: () => toggleSeason(season.value),
            })),
            {
              key: "HOLIDAY",
              label: "Holiday",
              on: yearMode === "HOLIDAY",
              press: () => {
                setYearMode("HOLIDAY");
                setMonths([]);
                clearMissing("year");
              },
            },
          ].map((chip) => (
            <Pressable
              key={chip.key}
              onPress={chip.press}
              accessibilityRole="button"
              accessibilityState={{selected: chip.on}}
              className={`px-4 py-2.5 rounded-2xl border active:opacity-70 ${
                chip.on ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <Text className={`font-bold text-[15px] ${chip.on ? "text-white" : "text-zinc-400"}`}>{chip.label}</Text>
            </Pressable>
          ))}
        </View>
        {yearMode === "SEASONS" && (
          // Fine-tune by month (cherry blossoms: April only)
          <View className="flex-row flex-wrap gap-1.5 mt-3">
            {ALL_MONTHS.map((month) => {
              const on = months.includes(month);
              return (
                <Pressable
                  key={month}
                  onPress={() => toggleMonth(month)}
                  accessibilityRole="button"
                  accessibilityState={{selected: on}}
                  className={`items-center py-2 rounded-xl border active:opacity-70 ${
                    on ? "bg-zinc-800 border-zinc-400" : "bg-zinc-900 border-zinc-800"
                  }`}
                  style={{width: "15.4%"}}
                >
                  <Text className={`text-xs font-bold ${on ? "text-white" : "text-zinc-500"}`}>{MONTH_NAMES[month - 1]}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {yearMode === "HOLIDAY" && (
          <View className="flex-row flex-wrap gap-2 mt-3">
            {HOLIDAYS.map((holiday) => {
              const on = holidays.includes(holiday.id);
              return (
                <Pressable
                  key={holiday.id}
                  onPress={() => toggleHoliday(holiday.id)}
                  accessibilityRole="button"
                  accessibilityState={{selected: on}}
                  className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl border active:opacity-70 ${
                    on ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  <Text>{holiday.emoji}</Text>
                  <Text className={`font-bold text-sm ${on ? "text-white" : "text-zinc-400"}`}>{holiday.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Hint
          text={
            yearMode === "ANY"
              ? "Works any time of year."
              : yearMode === "SEASONS"
                ? months.length
                  ? `Only ${monthsLabel(months)}${seasonLatitude != null && seasonLatitude < 0 ? " (southern hemisphere)" : ""}. Tap months to fine-tune.`
                  : "Which seasons or months?"
                : yearMode === "HOLIDAY"
                  ? holidays.length
                    ? "Only in the weeks around it."
                    : "Which holiday is it for?"
                  : "Most ideas work any time. Seasonal ones only show up when they're on."
          }
        />
      </Question>
    </>
  );

  const stepDetails = (
    <>
      <Heading title="The details" />
      <View className="flex-row gap-3 mb-2">
        <View className="flex-1">
          <Question title="Price per person" missing={missing("price")} note={paid ? "Add a price" : "Pick one"}>
            {/* No outline box here: it would sit 8pt off the length stepper beside it.
                Missing shows on the buttons' own borders instead */}
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => {
                  setPaid(false);
                  setPrice("0");
                  clearMissing("price");
                }}
                accessibilityRole="button"
                accessibilityState={{selected: paid === false}}
                className={`flex-1 items-center justify-center h-[52px] rounded-2xl border active:opacity-70 ${
                  paid === false
                    ? "bg-zinc-800 border-white"
                    : missing("price")
                      ? "bg-red-950/10 border-red-500"
                      : "bg-zinc-900 border-zinc-800"
                }`}
              >
                <Text className={`font-bold text-[15px] ${paid === false ? "text-white" : "text-zinc-400"}`}>Free</Text>
              </Pressable>
              {paid ? (
                <View className="flex-1 flex-row items-center h-[52px] rounded-2xl border bg-zinc-800 border-white px-3">
                  <Text className="text-white font-bold text-[15px]">$</Text>
                  <TextInput
                    value={price === "0" ? "" : price}
                    onChangeText={(text) => {
                      setPrice(text.replace(/[^0-9.]/g, ""));
                      clearMissing("price");
                    }}
                    autoFocus={!editingId}
                    placeholder="0"
                    placeholderTextColor="#71717a"
                    keyboardType="decimal-pad"
                    accessibilityLabel="Price per person, in dollars"
                    className="flex-1 text-white font-bold text-[15px] ml-1"
                  />
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    setPaid(true);
                    if (price === "0") setPrice("");
                  }}
                  accessibilityRole="button"
                  className={`flex-1 items-center justify-center h-[52px] rounded-2xl border active:opacity-70 ${
                    missing("price") ? "bg-red-950/10 border-red-500" : "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  <Text className="font-bold text-[15px] text-zinc-400">$ …</Text>
                </Pressable>
              )}
            </View>
          </Question>
        </View>
        <View className="flex-1">
          <Question title="How long" missing={missing("duration")} note="Pick a length">
            <View
              className={`flex-row items-center justify-between h-[52px] px-1.5 rounded-2xl border ${
                missing("duration") ? "border-red-500 bg-red-950/10" : "border-zinc-700 bg-zinc-900"
              }`}
            >
              <Pressable
                onPressIn={() => startRepeat(shorter)}
                onPressOut={stopRepeat}
                accessibilityRole="button"
                accessibilityLabel="Shorter"
                className="w-10 h-10 rounded-xl bg-zinc-800 items-center justify-center active:opacity-70"
              >
                <Ionicons name="remove" size={20} color="white" />
              </Pressable>
              <Text
                className={`font-bold text-base ${durationMin == null ? "text-zinc-500" : "text-white"}`}
                accessibilityLiveRegion="polite"
              >
                {lengthLabel(durationMin)}
              </Text>
              <Pressable
                onPressIn={() => startRepeat(longer)}
                onPressOut={stopRepeat}
                accessibilityRole="button"
                accessibilityLabel="Longer"
                className="w-10 h-10 rounded-xl bg-zinc-800 items-center justify-center active:opacity-70"
              >
                <Ionicons name="add" size={20} color="white" />
              </Pressable>
            </View>
          </Question>
        </View>
      </View>

      <Question title="Flexible or set?" missing={missing("flexible")}>
        <Choices
          fill
          options={[
            {value: "FLEX", label: "Flexible"},
            {value: "SET", label: "Set length"},
          ]}
          value={isDurationVariable == null ? null : isDurationVariable ? "FLEX" : "SET"}
          onPick={(v) => {
            setIsDurationVariable(v === "FLEX");
            clearMissing("flexible");
          }}
          missing={missing("flexible")}
        />
        <Hint
          text={
            isDurationVariable === true
              ? "Stay as long as you like: it can run longer to fit a date."
              : isDurationVariable === false
                ? "It takes this long: a movie, a class, a tour."
                : "Can people stay longer, or is the length set?"
          }
        />
      </Question>

      <Question title="How many people?" missing={missing("people")} note={groupSize === "CUSTOM" ? "Add both numbers" : "Pick one"}>
        <Choices
          options={PEOPLE_OPTIONS}
          value={groupSize}
          onPick={(v) => {
            setGroupSize(v);
            clearMissing("people");
          }}
          missing={missing("people")}
        />
        {groupSize === "CUSTOM" ? (
          <View className="flex-row gap-3 mt-3">
            <TextInput
              value={minPeople}
              onChangeText={(text) => {
                setMinPeople(text);
                clearMissing("people");
              }}
              placeholder="At least"
              placeholderTextColor="#71717a"
              keyboardType="number-pad"
              className="flex-1 bg-zinc-900 text-white px-4 py-3.5 rounded-2xl border border-zinc-700"
            />
            <TextInput
              value={maxPeople}
              onChangeText={(text) => {
                setMaxPeople(text);
                clearMissing("people");
              }}
              placeholder="At most"
              placeholderTextColor="#71717a"
              keyboardType="number-pad"
              className="flex-1 bg-zinc-900 text-white px-4 py-3.5 rounded-2xl border border-zinc-700"
            />
          </View>
        ) : (
          <Hint text={PEOPLE_OPTIONS.find((o) => o.value === groupSize)?.hint ?? "Couples, a double date, or a group?"} />
        )}
      </Question>

      <Question title="Minimum age" missing={missing("age")} note={ageChoice === "OTHER" ? "Add an age" : "Pick one"}>
        <Choices
          fill
          options={AGE_OPTIONS}
          value={ageChoice}
          onPick={(v) => {
            setAgeChoice(v);
            clearMissing("age");
          }}
          missing={missing("age")}
        />
        {ageChoice === "OTHER" ? (
          <TextInput
            value={minAge}
            onChangeText={(text) => {
              setMinAge(text);
              clearMissing("age");
            }}
            placeholder="e.g. 16"
            placeholderTextColor="#71717a"
            keyboardType="number-pad"
            className="bg-zinc-900 text-white px-4 py-3.5 rounded-2xl mt-3 border border-zinc-700"
          />
        ) : (
          <Hint
            text={
              ageChoice === 0 ? "Fine for anyone on Venture." : ageChoice ? `Only shown to people ${ageChoice} and older.` : "Who's it OK for?"
            }
          />
        )}
      </Question>
    </>
  );

  const stepStory = (
    <>
      <Heading title="Paint the picture" sub="What makes it a great date? A sentence or two is plenty." />
      {/* The card they've built, with their words on it as they type */}
      <View className="flex-row gap-3 p-3 rounded-3xl bg-zinc-900 border border-zinc-800 mb-5">
        <View className="w-[84px] h-[84px] rounded-2xl bg-zinc-800 overflow-hidden">
          {imageUri ? <Image source={{uri: imageUri}} style={{width: "100%", height: "100%"}} contentFit="cover" /> : null}
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-white font-extrabold text-base" numberOfLines={1}>
            {title || "Your idea"}
          </Text>
          <Text className="text-zinc-400 text-xs" numberOfLines={1}>
            {cardLine}
          </Text>
          <Text className={`text-[13px] leading-[18px] ${description ? "text-zinc-300" : "text-zinc-500"}`} numberOfLines={2}>
            {description || "Your words show here."}
          </Text>
        </View>
      </View>
      <Question title="Description" missing={missing("description")} note="Add a sentence or two">
        <TextInput
          value={description}
          onChangeText={(text) => {
            setDescription(text);
            clearMissing("description");
          }}
          placeholder="Hike the first mile up and catch the sunset over the valley. Bring a blanket."
          placeholderTextColor="#71717a"
          multiline
          textAlignVertical="top"
          className={`text-white text-base leading-[22px] px-4 pt-3.5 pb-3.5 rounded-2xl border min-h-28 ${fieldBox(missing("description"))}`}
        />
      </Question>
      <Question title="Link (optional)" missing={false}>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="Website, menu, tickets, recipe"
          placeholderTextColor="#71717a"
          keyboardType="url"
          autoCapitalize="none"
          className="bg-zinc-900 text-white px-4 py-3.5 rounded-2xl border border-zinc-700"
        />
      </Question>
      <Question title="Safety (optional)" missing={false}>
        <View className="flex-row flex-wrap gap-2 mb-3">
          {/* Strenuous is what "A workout" means: shown (and set) from that answer */}
          {exertion === "HARD" && (
            <View
              accessible
              accessibilityLabel="Strenuous, set by A workout"
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl border bg-amber-500/15 border-amber-400"
            >
              <Ionicons name="barbell-outline" size={15} color="#fbbf24" />
              <Text className="font-bold text-sm text-amber-200">Strenuous</Text>
              <Ionicons name="lock-closed" size={11} color="#fbbf24" />
            </View>
          )}
          {RISK_LABELS.filter((risk) => risk.value !== "STRENUOUS").map((risk) => {
            const on = riskLabels.includes(risk.value);
            return (
              <Pressable
                key={risk.value}
                onPress={() => setRiskLabels((prev) => (on ? prev.filter((r) => r !== risk.value) : [...prev, risk.value]))}
                accessibilityRole="checkbox"
                accessibilityState={{checked: on}}
                accessibilityHint={risk.hint}
                className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl border active:opacity-70 ${
                  on ? "bg-amber-500/15 border-amber-400" : "bg-zinc-900 border-zinc-800"
                }`}
              >
                <Ionicons name={risk.icon} size={15} color={on ? "#fbbf24" : "#a1a1aa"} />
                <Text className={`font-bold text-sm ${on ? "text-amber-200" : "text-zinc-400"}`}>{risk.label}</Text>
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
          placeholder="A heads-up, e.g. the last half mile is a scramble; skip it after rain."
          placeholderTextColor="#71717a"
          className="bg-zinc-900 text-white px-4 pt-3.5 pb-3.5 rounded-2xl border border-zinc-700 min-h-20"
        />
      </Question>
    </>
  );

  const rows: {label: string; text: string; step: StepKey}[] = [
    {label: "Where", text: placeText ?? "—", step: "where"},
    {label: "Kind", text: [typeText, selectedTags.map(tagLabel).join(", ")].filter(Boolean).join(" · ") || "—", step: "kind"},
    {label: "Like", text: likeText || "—", step: "like"},
    {label: "When", text: whenText || "—", step: "when"},
    {label: "Details", text: detailsText || "—", step: "details"},
    {
      label: "Picture",
      text: [description ? `“${description.slice(0, 34)}${description.length > 34 ? "…" : ""}”` : null, safetyText || null]
        .filter(Boolean)
        .join(" · ") || "—",
      step: "story",
    },
  ];

  const stepReview = (
    <>
      <Heading title={editingId ? "Your idea" : "Looks good?"} />
      {/* The idea card, as people will see it */}
      <View className="rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-4">
        <View className="h-32 bg-zinc-800">
          {imageUri ? <Image source={{uri: imageUri}} style={{width: "100%", height: "100%"}} contentFit="cover" /> : null}
        </View>
        <View className="px-3.5 pt-2.5 pb-3 gap-1.5">
          <Text className="text-white font-extrabold text-[17px]" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-zinc-400 text-[13px]" numberOfLines={1}>
            {cardLine}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {selectedTags.map((tag) => (
              <View key={tag} className="px-2.5 py-1 rounded-full" style={{backgroundColor: `${tagColor(tag)}26`}}>
                <Text className="text-xs font-semibold" style={{color: tagColor(tag)}}>
                  {tagLabel(tag)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Every answer, in the order asked, one tap from its step */}
      <View className="rounded-3xl bg-zinc-900 border border-zinc-800 overflow-hidden mb-4">
        {rows.map((row, i) => {
          const gap = missingFields.some((f) => FIELD_STEP[f] === row.step);
          return (
            <Pressable
              key={row.label}
              onPress={() => goTo(STEPS.indexOf(row.step))}
              accessibilityRole="button"
              accessibilityLabel={`${row.label}: ${row.text}. Edit`}
              className={`flex-row items-center gap-2.5 px-3.5 py-3 active:bg-zinc-800 ${i > 0 ? "border-t border-zinc-800" : ""}`}
            >
              <Text className={`w-[62px] text-[13px] ${gap ? "text-red-400" : "text-zinc-400"}`}>{row.label}</Text>
              <Text className="flex-1 text-white text-sm font-semibold" numberOfLines={1}>
                {row.text}
              </Text>
              <Text className="text-blue-300 text-[13px] font-semibold">Edit</Text>
            </Pressable>
          );
        })}
      </View>

      {wasPublished && (
        <View className="flex-row gap-2 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 mb-3">
          <Ionicons name="information-circle" size={18} color="#fbbf24" />
          <Text className="text-amber-100/80 text-sm flex-1">
            {"This idea is live. Saving changes takes it out of Discover until it's reviewed again."}
          </Text>
        </View>
      )}

      <View className="flex-row gap-2 mb-3">
        <Pressable
          onPress={() => setVisibility("PENDING_REVIEW")}
          accessibilityRole="radio"
          accessibilityState={{checked: visibility === "PENDING_REVIEW"}}
          className={`flex-1 p-3 rounded-2xl border ${
            visibility === "PENDING_REVIEW" ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
          }`}
        >
          <Text className={`font-bold text-[15px] ${visibility === "PENDING_REVIEW" ? "text-white" : "text-zinc-400"}`}>Publish</Text>
          <Text className="text-zinc-400 text-xs mt-0.5">
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
          accessibilityRole="radio"
          accessibilityState={{checked: visibility === "PRIVATE"}}
          className={`flex-1 p-3 rounded-2xl border ${
            visibility === "PRIVATE" ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
          }`}
        >
          <Text className={`font-bold text-[15px] ${visibility === "PRIVATE" ? "text-white" : "text-zinc-400"}`}>Keep private</Text>
          <Text className="text-zinc-400 text-xs mt-0.5">Only you, for planning</Text>
        </Pressable>
      </View>

      {/* The promise for publishing (#81) */}
      {visibility === "PENDING_REVIEW" && (
        <Pressable
          onPress={() => {
            setPromised((p) => !p);
            clearMissing("promise");
          }}
          accessibilityRole="checkbox"
          accessibilityState={{checked: promised}}
          className={`flex-row items-center gap-3 p-3.5 rounded-2xl border mb-2 ${
            missing("promise") ? "bg-red-500/10 border-red-500" : "bg-zinc-900 border-zinc-800"
          }`}
        >
          <View className={`w-6 h-6 rounded-md border items-center justify-center ${promised ? "bg-white border-white" : "border-zinc-500"}`}>
            {promised && <Ionicons name="checkmark" size={16} color="black" />}
          </View>
          <Text className="text-zinc-200 text-[13px] leading-[18px] flex-1">{POSTER_PROMISE}</Text>
        </Pressable>
      )}
      {missing("promise") && <Hint red text="Tick this to send it for review." />}

      {/* EDITING: delete it (live ideas are unpublished first: deleting would
          pull them out of other people's dates and saved lists) */}
      {editingId && original && (
        <View className="items-center gap-2 mt-6">
          {original.visibility === "PUBLISHED" ? (
            <>
              <Pressable
                onPress={() =>
                  confirmUnpublishIdea(editingId, () => {
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
              <Text className="text-zinc-400 text-xs text-center px-6">
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
    </>
  );

  const body: Record<StepKey, React.ReactNode> = {
    idea: stepIdea,
    where: stepWhere,
    kind: stepKind,
    like: stepLike,
    when: stepWhen,
    details: stepDetails,
    story: stepStory,
    review: stepReview,
  };

  const primary =
    key === "review"
      ? !editingId
        ? visibility === "PRIVATE"
          ? "Save idea"
          : "Submit for review"
        : visibility === "PRIVATE"
          ? "Save changes"
          : "Save & submit for review"
      : key === "story"
        ? "Review"
        : "Next";

  return (
    <KeyboardAvoidingView
      className="flex-1"
      style={{backgroundColor: "#09090b"}}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* HEADER: back (or close), progress, step count */}
      <View className="flex-row items-center gap-3 px-5 pb-3" style={{paddingTop: insets.top + 10}}>
        <Pressable
          onPress={back}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={step === 0 || (editingId && step === REVIEW) ? "Close" : "Back"}
          className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center active:opacity-70"
        >
          <Ionicons
            name={step === 0 || (editingId && step === REVIEW) ? "close" : "chevron-back"}
            size={20}
            color="white"
          />
        </Pressable>
        <View className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <View className="h-full rounded-full bg-white" style={{width: `${((step + 1) / STEPS.length) * 100}%`}} />
        </View>
        <Text className="text-zinc-400 text-[13px] font-semibold">
          {step + 1} of {STEPS.length}
        </Text>
      </View>

      {/* WHAT YOU'RE MAKING (steps 2 to 7) */}
      {step > 0 && key !== "story" && key !== "review" && !placeSearchOpen && (
        <View className="flex-row items-center gap-3 mx-5 mt-2 mb-1 p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800">
          <View className="w-11 h-11 rounded-xl bg-zinc-800 overflow-hidden">
            {imageUri ? <Image source={{uri: imageUri}} style={{width: "100%", height: "100%"}} contentFit="cover" /> : null}
          </View>
          <View className="flex-1">
            <Text className="text-white font-bold text-[15px]" numberOfLines={1}>
              {title || "Your idea"}
            </Text>
            <Text className="text-zinc-400 text-[13px]" numberOfLines={1}>
              {soFar}
            </Text>
          </View>
        </View>
      )}

      {/* A solid page: it only scrolls when a step is taller than the screen
          (a small phone), and never bounces */}
      <ScrollView
        ref={scrollRef}
        onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
        onContentSizeChange={(_, height) => setContentHeight(height)}
        scrollEnabled={contentHeight > viewportHeight + 1}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        className="flex-1"
        contentContainerClassName="px-5 pt-6 pb-3"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {body[key]}
      </ScrollView>

      {/* NEXT / REVIEW / SUBMIT (stepping aside while searching for a place) */}
      <View
        className="px-5 pt-3"
        style={{paddingBottom: Math.max(insets.bottom, 16) + 8, display: placeSearchOpen ? "none" : "flex"}}
      >
        <Pressable
          onPress={key === "review" ? handleSubmit : next}
          disabled={isSubmitting}
          accessibilityRole="button"
          className={`h-14 rounded-2xl items-center justify-center ${isSubmitting ? "bg-zinc-800" : "bg-white active:opacity-80"}`}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-black font-extrabold text-[17px]">{primary}</Text>
          )}
        </Pressable>
      </View>

      {/* ADDING A NEW PLACE: drop a pin, name it, its hours */}
      <PlacePicker
        visible={newPlaceName !== null}
        newPlaceName={newPlaceName}
        current={place}
        onClose={() => setNewPlaceName(null)}
        onPick={(picked) => {
          setNewPlaceName(null);
          choosePlace(picked);
        }}
      />
    </KeyboardAvoidingView>
  );
}

/** A place in the Where step's list */
function PlaceRow({
  name,
  detail,
  selected,
  isNew = false,
  divider = false,
  onPress,
  onHeight,
}: {
  name: string;
  detail: string;
  selected: boolean;
  isNew?: boolean;
  divider?: boolean;
  onPress: () => void;
  /** Reports the row's height (to fit as many as the screen holds) */
  onHeight?: (height: number) => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLayout={onHeight ? (e) => onHeight(Math.round(e.nativeEvent.layout.height)) : undefined}
      accessibilityRole="button"
      accessibilityState={{selected}}
      className={`flex-row items-center gap-3 px-4 py-3.5 ${selected ? "bg-zinc-800" : "active:bg-zinc-800"} ${
        divider ? "border-t border-zinc-800" : ""
      }`}
    >
      <Ionicons name={isNew ? "add-circle-outline" : "location-outline"} size={20} color={selected ? "#FF9D0A" : "#a1a1aa"} />
      <View className="flex-1">
        <Text className="text-white font-bold text-[15px]" numberOfLines={1}>
          {name}
        </Text>
        {detail ? (
          <Text className="text-zinc-400 text-[13px]" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {selected && <Ionicons name="checkmark" size={20} color="white" />}
    </Pressable>
  );
}

/** A step's question, big, with an optional line under it */
function Heading({title, sub}: {title: string; sub?: string}) {
  return (
    <View className="mb-6">
      <Text className="text-white text-[30px] leading-9 font-extrabold" style={{letterSpacing: -0.5}}>
        {title}
      </Text>
      {sub ? <Text className="text-zinc-400 text-[15px] leading-[21px] mt-1.5">{sub}</Text> : null}
    </View>
  );
}
