// components/places/PlacePicker.tsx
// "Where is it?" for the idea form (#78): find a place that's already on
// Venture, or add a new one (a trailhead, a lookout, a hidden gem that
// isn't on any map). Full screen, one step at a time:
//
//   Search ..... places on Venture by name, nearest first (only ones you
//                may see: nobody's private pins, #77). Empty: what's near
//   Pin ........ a full-screen map: move it under the pin (where you go or
//                park). The pin lifts while the map moves. Tap the address
//                bar to look up an address or a landmark (the phone's map
//                service) and jump there, then nudge it
//   Details .... name it, and say how to get there if it's not obvious
//                (its own screen, so the keyboard never covers the map)
//   Same? ...... places very close or with a similar name: "Is it one of
//                these?", so one trail isn't pinned 3 times
//   Near home .. a gentle check if the pin is close to your saved home
//
// A new place isn't saved here: the form adds it with the idea.
// (Apple Maps results can join the search later, in a development build.)

import React, {useEffect, useRef, useState} from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import MapView, {type Region} from "react-native-maps";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Location from "expo-location";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Easing, useSharedValue, withTiming} from "react-native-reanimated";

import {useLocationStore} from "@/src/store/useLocationStore";
import {useProfileStore} from "@/src/store/useProfileStore";
import {toPlanningDefaults} from "@/src/lib/profile";
import {
  type PickedPlace,
  type PlaceResult,
  distanceLabel,
  pickExisting,
  searchPlaces,
  similarPlacesNear,
} from "@/src/lib/places";
import {getDistance} from "@/utils/geo";
import type {LatLng} from "@/utils/timeline";
import GlassSurface from "@/components/ui/GlassSurface";
import HoursEditor, {DEFAULT_HOURS, type HoursChoice, hoursFromChoice} from "./HoursEditor";
import MapPin, {PIN_COLOR, PIN_TIP_Y, PIN_WIDTH} from "./MapPin";
import {showError} from "@/src/lib/notify";
import {confirm} from "@/src/lib/sheets";
import Overlays from "@/components/sheets/Overlays";

/** A pin this close to your saved home area (miles) gets a check */
const NEAR_HOME_MILES = 0.3;
const NOTE_MAX = 300;
/** Somewhere to start the map when we know nothing (Provo) */
const FALLBACK: LatLng = {latitude: 40.2338, longitude: -111.6585};
/** The pin screen starts here (zoom in further to place it exactly) */
const ZOOM = {latitudeDelta: 0.004, longitudeDelta: 0.004};
/** The name screen's map: about 150 m top to bottom (which building, and what's around it) */
const PREVIEW_SPAN = 150 / 111_000; // degrees of latitude (~111 km each)
/** Looking up a spot on the pin map: at most this many to choose from */
const FIND_MAX = 5;
/** Text inputs: font size only (a line height pushes one-line text off centre on iOS) */
const INPUT_TEXT = {fontSize: 16};
/** Floating glass buttons over the map (like the idea page's) */
const GLASS_ROUND = {width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center"} as const;
const GLASS_PILL = {
  height: 44,
  borderRadius: 22,
  paddingHorizontal: 16,
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
} as const;

type Step = "search" | "pin" | "details" | "same";

/** A spot the phone's map service found, for the pin map */
type FoundSpot = LatLng & {label: string; detail: string | null};

/**
 * Moves a map (keeping its zoom) so `coord` shows exactly at `target` (a
 * point in the map view). The map's own "centre" isn't always the middle
 * of the view (Apple Maps can allow for the status bar), so a pin drawn
 * over the map is lined up with the map itself, not assumed.
 */
async function showCoordinateAt(map: MapView, coord: LatLng, target: {x: number; y: number}) {
  const [at, camera] = await Promise.all([map.pointForCoordinate(coord), map.getCamera()]);
  const centreAt = await map.pointForCoordinate(camera.center);
  const center = await map.coordinateForPoint({
    x: centreAt.x - (target.x - at.x),
    y: centreAt.y - (target.y - at.y),
  });
  map.setCamera({center});
}

export default function PlacePicker({
  visible,
  onClose,
  onPick,
  current,
  newPlaceName = null,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (place: PickedPlace) => void;
  /** The place picked so far (centres the map and search on it) */
  current: PickedPlace | null;
  /**
   * Open straight on adding a new place, with this name to start (the
   * publisher searches inline and only comes here to pin a new one). Its
   * back button then closes, instead of going to search
   */
  newPlaceName?: string | null;
}) {
  const addOnly = newPlaceName !== null;
  const insets = useSafeAreaInsets();
  const {height: windowHeight, width: windowWidth} = useWindowDimensions();
  const userLocation = useLocationStore((s) => s.userLocation);
  const preferences = useProfileStore((s) => s.preferences);
  const defaults = toPlanningDefaults(preferences);
  const home: LatLng | null =
    defaults.home_lat != null && defaults.home_lng != null
      ? {latitude: defaults.home_lat, longitude: defaults.home_lng}
      : null;
  // Where to search around and start the map
  const around: LatLng =
    (current && {latitude: current.latitude, longitude: current.longitude}) ?? userLocation ?? home ?? FALLBACK;

  const [step, setStep] = useState<Step>("search");
  // Opening to add a new place goes straight to the pin (adjusted while rendering)
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible && addOnly) {
      setStep("pin");
    }
  }

  // ─── Search ──────────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{key: string; places: PlaceResult[]} | {key: string; error: string} | null>(
    null,
  );
  const searchKey = `${query.trim().toLowerCase()}|${around.latitude.toFixed(3)},${around.longitude.toFixed(3)}`;
  useEffect(() => {
    if (!visible || step !== "search") return;
    let cancelled = false;
    // A short pause while typing
    const timer = setTimeout(() => {
      searchPlaces({query, near: around, radiusM: query.trim() ? 200_000 : 30_000})
        .then((places) => !cancelled && setResults({key: searchKey, places}))
        .catch((e) => !cancelled && setResults({key: searchKey, error: e.message}));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // (around by value, via searchKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step, searchKey]);
  const searching = results?.key !== searchKey;

  // ─── New place ───────────────────────────────────────────────────────────
  const mapRef = useRef<MapView>(null);
  const [pin, setPin] = useState<LatLng>(around);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState<HoursChoice>(DEFAULT_HOURS);
  const [address, setAddress] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [similar, setSimilar] = useState<PlaceResult[]>([]);

  // The name screen keeps the field you're typing in above the keyboard:
  // once the keyboard is up (and when you switch fields), it scrolls the
  // field's label to just under the top
  const detailsScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const formY = useRef(0);
  const fieldY = useRef({name: 0, note: 0});
  const focusedField = useRef<"name" | "note" | null>(null);
  const revealField = () => {
    const field = focusedField.current;
    if (!field) return;
    detailsScroll.current?.scrollTo({y: Math.max(0, formY.current + fieldY.current[field] - 12), animated: true});
  };
  useEffect(() => {
    if (step !== "details") return;
    const sub = Keyboard.addListener("keyboardDidShow", revealField);
    return () => sub.remove();
  }, [step]);
  const onFieldFocus = (field: "name" | "note") => {
    focusedField.current = field;
    // Switching fields with the keyboard already up
    if (Keyboard.isVisible()) revealField();
  };
  // The pin rises while the map moves under it
  const lift = useSharedValue(0);
  const moving = useRef(false);
  // The pin map's size: the pin's tip is drawn at its middle, and the spot
  // saved is whatever the map says is under the tip
  const pinMapSize = useRef<{width: number; height: number} | null>(null);
  // While the map is being lined up with the pin (not you moving it), and
  // whether it has been since this screen opened (until then, where the
  // map says it is doesn't move the pin)
  const aligningUntil = useRef(0);
  const pinAligned = useRef(false);
  useEffect(() => {
    if (step === "pin") pinAligned.current = false;
  }, [step]);
  const tipPoint = () =>
    pinMapSize.current ? {x: pinMapSize.current.width / 2, y: pinMapSize.current.height / 2} : null;
  const alignPinMap = async () => {
    const map = mapRef.current;
    const tip = tipPoint();
    if (!map || !tip) return;
    aligningUntil.current = Date.now() + 400;
    try {
      await showCoordinateAt(map, pin, tip);
    } catch {}
    pinAligned.current = true;
  };

  // The pin's address, once the map settles (from the phone's map service)
  useEffect(() => {
    if (step !== "pin") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const [hit] = await Location.reverseGeocodeAsync(pin);
        if (cancelled) return;
        const street = [hit?.streetNumber, hit?.street].filter(Boolean).join(" ") || hit?.name || "";
        setAddress([street, hit?.city].filter(Boolean).join(", ") || null);
      } catch {
        if (!cancelled) setAddress(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, pin]);

  // ─── Looking up a spot (the pin map's address bar) ───────────────────────
  // The phone's own map service (Apple's on iPhone): an address, a town, a
  // landmark. It returns spots, not places, so each is named by what's there
  // and the map jumps to it; the pin is still yours to nudge. As-you-type
  // place search comes with a development build (#78)
  const [finding, setFinding] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [foundSpots, setFoundSpots] = useState<FoundSpot[] | null>(null);
  const [findBusy, setFindBusy] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const findRequest = useRef(0);
  const openFind = () => {
    // Starts from the name you're adding ("Bridal Veil Falls"): often what you'd search
    setFindQuery(name.trim());
    setFoundSpots(null);
    setFindError(null);
    setFinding(true);
  };
  const closeFind = () => {
    findRequest.current++;
    Keyboard.dismiss();
    setFinding(false);
    setFindBusy(false);
  };
  const goToSpot = (spot: LatLng) => {
    closeFind();
    mapRef.current?.animateToRegion({latitude: spot.latitude, longitude: spot.longitude, ...ZOOM}, 500);
  };
  const runFind = async () => {
    const wanted = findQuery.trim();
    if (!wanted) return;
    const request = ++findRequest.current;
    setFindBusy(true);
    setFindError(null);
    try {
      const hits = await Location.geocodeAsync(wanted);
      if (request !== findRequest.current) return;
      // Nearest first (it doesn't know where you're looking)
      const spots = hits
        .map((hit) => ({latitude: hit.latitude, longitude: hit.longitude}))
        .sort((a, b) => getDistance(pin, a) - getDistance(pin, b))
        .slice(0, FIND_MAX);
      if (spots.length === 0) {
        setFoundSpots([]);
        setFindError("Nothing found. Try an address, or a landmark and its town.");
        return;
      }
      if (spots.length === 1) {
        goToSpot(spots[0]);
        return;
      }
      const named = await Promise.all(
        spots.map(async (spot): Promise<FoundSpot> => {
          try {
            const [hit] = await Location.reverseGeocodeAsync(spot);
            const street = [hit?.streetNumber, hit?.street].filter(Boolean).join(" ");
            const label = hit?.name || street || hit?.city || "A spot on the map";
            const area = [hit?.city, hit?.region].filter(Boolean).join(", ");
            return {...spot, label, detail: area || null};
          } catch {
            return {...spot, label: `${spot.latitude.toFixed(4)}, ${spot.longitude.toFixed(4)}`, detail: null};
          }
        }),
      );
      if (request !== findRequest.current) return;
      setFoundSpots(named);
    } catch {
      if (request !== findRequest.current) return;
      setFindError("Couldn't look that up. Move the map instead, or try again.");
    } finally {
      if (request === findRequest.current) setFindBusy(false);
    }
  };

  const reset = () => {
    setFinding(false);
    setStep("search");
    setQuery("");
    setName("");
    setNote("");
    setHours(DEFAULT_HOURS);
    setSimilar([]);
  };
  const close = () => {
    reset();
    onClose();
  };
  const pick = (place: PickedPlace) => {
    reset();
    onPick(place);
  };

  // (Opening in add-only mode: start from the name the publisher had typed)
  const [seededName, setSeededName] = useState<string | null>(null);
  if (visible && addOnly && seededName !== newPlaceName) {
    setSeededName(newPlaceName);
    setName(newPlaceName ?? "");
    setPin(around);
    setAddress(null);
  }
  if (!visible && seededName !== null) setSeededName(null);

  const startNew = () => {
    Keyboard.dismiss();
    setName(query.trim());
    setPin(around);
    setAddress(null);
    setStep("pin");
  };

  const locateMe = () => {
    if (!userLocation) return;
    mapRef.current?.animateToRegion({...userLocation, ...ZOOM}, 400);
  };

  const newPlace = (): PickedPlace => ({
    kind: "new",
    name: name.trim(),
    address,
    latitude: pin.latitude,
    longitude: pin.longitude,
    accessNote: note.trim() || null,
    openingHours: hoursFromChoice(hours),
  });

  // Last check before adding: is the pin at someone's home (yours)?
  const finishNew = async () => {
    if (home && getDistance(home, pin) <= NEAR_HOME_MILES) {
      const publicPlace = await confirm({
        title: "This pin is near your home",
        message:
          "Places on Venture are for public spots. If this is your home or someone's yard, move the pin, or make the idea a stay-in one.",
        confirmLabel: "It's a public place",
        cancelLabel: "Move the pin",
        icon: "home-outline",
      });
      if (publicPlace) pick(newPlace());
      else setStep("pin");
      return;
    }
    pick(newPlace());
  };

  const addNew = async () => {
    if (!name.trim()) {
      showError("Name the place", "Like Hidden Falls Trailhead");
      return;
    }
    Keyboard.dismiss();
    setChecking(true);
    try {
      const found = await similarPlacesNear(name, pin);
      if (found.length > 0) {
        setSimilar(found);
        setStep("same");
        return;
      }
      finishNew();
    } catch {
      // Couldn't check: add it anyway (review catches duplicates too)
      finishNew();
    } finally {
      setChecking(false);
    }
  };

  // The name screen's map, close in, with the whole pin in its middle: the
  // pin is drawn over the map (not as a map marker) half its height below
  // the middle, and once the map is ready it's moved so the spot is
  // exactly under the tip (showCoordinateAt). The span's shape matches the
  // map's, so the zoom comes out the same every time
  const previewHeight = Math.round(windowHeight * 0.36);
  const pinDrop = PIN_TIP_Y / 2;
  const previewRegion = {
    latitude: pin.latitude,
    longitude: pin.longitude,
    latitudeDelta: PREVIEW_SPAN,
    // (a degree of longitude is shorter away from the equator)
    longitudeDelta:
      (PREVIEW_SPAN * (windowWidth / previewHeight)) / Math.max(0.2, Math.cos((pin.latitude * Math.PI) / 180)),
  };
  const previewMap = useRef<MapView>(null);
  // Hidden until the spot is lined up with it (no visible jump)
  const [previewAligned, setPreviewAligned] = useState(false);
  const alignPreview = async () => {
    const map = previewMap.current;
    if (!map) return;
    try {
      await showCoordinateAt(map, pin, {x: windowWidth / 2, y: previewHeight / 2 + pinDrop});
    } catch {}
    setPreviewAligned(true);
  };
  const onPreviewReady = () => {
    setPreviewAligned(false);
    previewMap.current?.animateToRegion(previewRegion, 0);
    // (once the zoom has been applied)
    setTimeout(alignPreview, 120);
  };

  // ─── Pieces ──────────────────────────────────────────────────────────────
  const placeRow = (place: PlaceResult, from?: LatLng) => {
    const meters = from ? getDistance(from, place) * 1609.34 : place.distance_m;
    const extra = [
      place.address,
      distanceLabel(meters),
      place.ideas > 0 ? `${place.ideas} ${place.ideas === 1 ? "idea" : "ideas"}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <Pressable
        key={place.venue_id}
        onPress={() => pick(pickExisting(place))}
        accessibilityRole="button"
        className="flex-row items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5 active:opacity-80"
      >
        <View className="w-10 h-10 rounded-xl bg-zinc-800 items-center justify-center">
          <Ionicons name="location-outline" size={18} color={PIN_COLOR} />
        </View>
        <View className="flex-1">
          <Text className="text-white font-bold text-base" numberOfLines={1}>
            {place.name}
          </Text>
          {extra ? (
            <Text className="text-zinc-400 text-sm" numberOfLines={1}>
              {extra}
            </Text>
          ) : null}
          {/* Yours: whether anyone else can see it (#77) */}
          {place.added_by_me && (
            <View className="flex-row items-center gap-1 mt-0.5">
              <Ionicons
                name={place.public_ideas > 0 ? "person-outline" : "lock-closed"}
                size={11}
                color="#a1a1aa"
              />
              <Text className="text-zinc-400 text-xs" numberOfLines={1}>
                {place.public_ideas > 0 ? "Added by you" : "Only you can see this · added by you"}
              </Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color="#52525b" />
      </Pressable>
    );
  };

  const header = (title: string, left: {label: string; onPress: () => void}) => (
    <View
      className="flex-row items-center justify-between px-5 pb-3 border-b border-zinc-900"
      style={{paddingTop: insets.top + 10}}
    >
      <Pressable onPress={left.onPress} hitSlop={10} accessibilityRole="button" className="w-16">
        <Text className="text-zinc-400 font-semibold text-base">{left.label}</Text>
      </Pressable>
      <Text className="text-white font-bold text-base">{title}</Text>
      <View className="w-16" />
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() =>
        finding
          ? closeFind()
          : step === "search" || (addOnly && step === "pin")
          ? close()
          : setStep(step === "same" ? "details" : step === "details" ? "pin" : "search")
      }
    >
      <View className="flex-1 bg-black">
        {step === "search" && (
          <>
            {header("Where is it?", {label: "Cancel", onPress: close})}
            <View className="px-5 pt-4">
              <View className="flex-row items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 h-12">
                <Ionicons name="search" size={18} color="#71717a" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                  placeholder="Search places on Venture"
                  placeholderTextColor="#71717a"
                  returnKeyType="search"
                  autoCorrect={false}
                  className="flex-1 h-12 text-white"
                  style={INPUT_TEXT}
                />
                {searching && <ActivityIndicator size="small" color="#71717a" />}
              </View>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerClassName="px-5 pt-4 gap-2.5"
              contentContainerStyle={{paddingBottom: insets.bottom + 24}}
            >
              {/* Always on offer: hidden gems are what Venture is for */}
              <Pressable
                onPress={startNew}
                accessibilityRole="button"
                className="flex-row items-center gap-3 border border-dashed border-zinc-700 rounded-2xl p-3.5 active:opacity-80"
              >
                <View className="w-10 h-10 rounded-xl bg-orange-500/15 items-center justify-center">
                  <Ionicons name="add" size={22} color={PIN_COLOR} />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-bold text-base">
                    {query.trim() ? `Add "${query.trim()}" as a new place` : "Add a new place"}
                  </Text>
                  <Text className="text-zinc-400 text-sm">
                    Not on Venture yet? Drop a pin: a trailhead, a lookout, a hidden gem.
                  </Text>
                </View>
              </Pressable>

              <Text className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-3 mb-0.5 ml-1">
                {query.trim() ? "On Venture" : "Near you"}
              </Text>
              {results && "error" in results && !searching ? (
                <Text className="text-zinc-400 text-sm ml-1">{results.error}</Text>
              ) : results && "places" in results && results.places.length > 0 ? (
                results.places.map((place) => placeRow(place))
              ) : !searching ? (
                <Text className="text-zinc-500 text-sm ml-1">
                  {query.trim() ? "No places by that name yet. Add it as a new place." : "No places nearby yet."}
                </Text>
              ) : null}
            </ScrollView>
          </>
        )}

        {step === "pin" && (
          <View
            className="flex-1"
            onLayout={(e) => {
              const {width, height} = e.nativeEvent.layout;
              pinMapSize.current = {width, height};
            }}
          >
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={{...pin, ...ZOOM}}
              // Start with the spot exactly under the pin's tip (coming back
              // to move it, it doesn't creep)
              onMapReady={alignPinMap}
              onRegionChange={() => {
                if (moving.current || Date.now() < aligningUntil.current) return;
                moving.current = true;
                lift.set(withTiming(1, {duration: 90, easing: Easing.out(Easing.quad)}));
              }}
              onRegionChangeComplete={async (r: Region) => {
                moving.current = false;
                // Straight down onto the spot (no bounce past it)
                lift.set(withTiming(0, {duration: 110, easing: Easing.in(Easing.quad)}));
                if (!pinAligned.current) return;
                // The spot is what's under the tip, as the map sees it
                const tip = tipPoint();
                try {
                  const under = tip ? await mapRef.current?.coordinateForPoint(tip) : null;
                  setPin(under ?? {latitude: r.latitude, longitude: r.longitude});
                } catch {
                  setPin({latitude: r.latitude, longitude: r.longitude});
                }
              }}
              showsUserLocation
              showsMyLocationButton={false}
              userInterfaceStyle="dark"
            />

            {/* The pin stays in the middle, its tip on the spot; the map moves under it */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                marginLeft: -PIN_WIDTH / 2,
                marginTop: -PIN_TIP_Y,
              }}
            >
              <MapPin lift={lift} />
            </View>

            {/* Top: back, and what to do */}
            <View
              className="absolute left-0 right-0 flex-row items-center px-4 gap-3"
              style={{top: insets.top + 8}}
              pointerEvents="box-none"
            >
              <Pressable
                onPress={() => (addOnly ? close() : setStep("search"))}
                accessibilityRole="button"
                accessibilityLabel="Back"
                className="active:opacity-70"
              >
                <GlassSurface style={GLASS_ROUND}>
                  <Ionicons name="chevron-back" size={24} color="white" />
                </GlassSurface>
              </Pressable>
              <View className="flex-1" pointerEvents="none">
                <GlassSurface style={{borderRadius: 22, paddingHorizontal: 16, paddingVertical: 8}}>
                  <Text className="text-white font-bold text-sm">Drop a pin</Text>
                  <Text className="text-zinc-300 text-xs">Move the map so the pin is where you go, or park</Text>
                </GlassSurface>
              </View>
            </View>

            {/* Bottom: where it is, and next */}
            <View
              className="absolute left-0 right-0 px-5 gap-3"
              style={{bottom: insets.bottom + 16}}
              pointerEvents="box-none"
            >
              <View className="flex-row items-end gap-3" pointerEvents="box-none">
                {/* Where the pin is; tap to look up an address or landmark */}
                <Pressable
                  onPress={openFind}
                  accessibilityRole="search"
                  accessibilityLabel={`${address ? `Near ${address}` : "Pin on the map"}. Look up an address or a landmark`}
                  className="flex-1 active:opacity-80"
                >
                  <GlassSurface
                    style={{
                      borderRadius: 22,
                      paddingHorizontal: 16,
                      height: 44,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="search" size={15} color="#d4d4d8" />
                    <Text className="text-zinc-100 text-sm flex-1" numberOfLines={1}>
                      {address ? `Near ${address}` : `${pin.latitude.toFixed(4)}, ${pin.longitude.toFixed(4)}`}
                    </Text>
                  </GlassSurface>
                </Pressable>
                {userLocation && (
                  <Pressable
                    onPress={locateMe}
                    accessibilityRole="button"
                    accessibilityLabel="Go to where I am"
                    className="active:opacity-70"
                  >
                    <GlassSurface style={GLASS_ROUND}>
                      <Ionicons name="navigate" size={18} color="white" />
                    </GlassSurface>
                  </Pressable>
                )}
              </View>
              <Pressable
                onPress={() => setStep("details")}
                accessibilityRole="button"
                className="bg-white rounded-full h-14 items-center justify-center active:opacity-80"
              >
                <Text className="text-black font-extrabold text-base">Next</Text>
              </Pressable>
            </View>

            {/* Looking up a spot: over the map, which jumps there when you pick one */}
            {finding && (
              <View className="absolute inset-0 bg-black/80" style={{paddingTop: insets.top + 8}}>
                <View className="flex-row items-center gap-3 px-4">
                  <Pressable
                    onPress={closeFind}
                    accessibilityRole="button"
                    accessibilityLabel="Back to the map"
                    className="active:opacity-70"
                  >
                    <GlassSurface style={GLASS_ROUND}>
                      <Ionicons name="chevron-back" size={24} color="white" />
                    </GlassSurface>
                  </Pressable>
                  <View className="flex-1 flex-row items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 h-11">
                    <Ionicons name="search" size={16} color="#71717a" />
                    <TextInput
                      value={findQuery}
                      onChangeText={(text) => {
                        setFindQuery(text);
                        setFindError(null);
                      }}
                      onSubmitEditing={runFind}
                      autoFocus
                      selectTextOnFocus
                      placeholder="An address, or a landmark and town"
                      placeholderTextColor="#71717a"
                      returnKeyType="search"
                      autoCorrect={false}
                      accessibilityLabel="Look up an address or a landmark"
                      className="flex-1 text-white"
                      style={INPUT_TEXT}
                    />
                    {findBusy ? (
                      <ActivityIndicator size="small" color="#71717a" />
                    ) : findQuery ? (
                      <Pressable onPress={() => setFindQuery("")} hitSlop={10} accessibilityLabel="Clear">
                        <Ionicons name="close-circle" size={18} color="#71717a" />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  contentContainerClassName="px-5 pt-4 gap-2.5"
                  contentContainerStyle={{paddingBottom: insets.bottom + 24}}
                >
                  {findError ? (
                    <Text className="text-zinc-400 text-sm ml-1">{findError}</Text>
                  ) : foundSpots && foundSpots.length > 0 ? (
                    <>
                      <Text className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-0.5 ml-1">
                        Which one?
                      </Text>
                      {foundSpots.map((spot) => (
                        <Pressable
                          key={`${spot.latitude},${spot.longitude}`}
                          onPress={() => goToSpot(spot)}
                          accessibilityRole="button"
                          className="flex-row items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5 active:opacity-80"
                        >
                          <View className="w-10 h-10 rounded-xl bg-zinc-800 items-center justify-center">
                            <Ionicons name="map-outline" size={18} color={PIN_COLOR} />
                          </View>
                          <View className="flex-1">
                            <Text className="text-white font-bold text-base" numberOfLines={1}>
                              {spot.label}
                            </Text>
                            <Text className="text-zinc-400 text-sm" numberOfLines={1}>
                              {[spot.detail, distanceLabel(getDistance(pin, spot) * 1609.34)]
                                .filter(Boolean)
                                .join(" · ")}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color="#52525b" />
                        </Pressable>
                      ))}
                    </>
                  ) : (
                    <Text className="text-zinc-500 text-sm ml-1 leading-5">
                      Search, and the map jumps there. Then move it so the pin is exactly where you go.
                    </Text>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {step === "details" && (
          <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}>
            <ScrollView
              ref={detailsScroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              // No pulling past the top (it showed black above the map)
              bounces={false}
              overScrollMode="never"
              contentContainerStyle={{paddingBottom: 24}}
            >
              {/* The spot, full width under the status bar */}
              <View style={{height: previewHeight}} pointerEvents="none">
                <MapView
                  ref={previewMap}
                  style={StyleSheet.absoluteFill}
                  initialRegion={previewRegion}
                  onMapReady={onPreviewReady}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  userInterfaceStyle="dark"
                />
                <View
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    marginLeft: -PIN_WIDTH / 2,
                    marginTop: -PIN_TIP_Y + pinDrop,
                    opacity: previewAligned ? 1 : 0,
                  }}
                >
                  <MapPin />
                </View>
              </View>

              {/* The form, below a clean edge */}
              <View
                className="border-t border-zinc-800 px-5 pt-6 gap-6"
                onLayout={(e) => (formY.current = e.nativeEvent.layout.y)}
              >
                <View>
                  <Text className="text-white text-3xl font-extrabold tracking-tight">Name this place</Text>
                  <Text className="text-zinc-400 text-base mt-1.5" numberOfLines={2}>
                    {address ? `Near ${address}` : "Right where you put the pin"}
                  </Text>
                </View>

                <View className="gap-2" onLayout={(e) => (fieldY.current.name = e.nativeEvent.layout.y)}>
                  <Text className="text-zinc-400 text-sm font-bold ml-1">NAME</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    // A proper noun: capitals suggested, never forced
                    autoCapitalize="words"
                    onFocus={() => onFieldFocus("name")}
                    autoFocus={!name}
                    placeholder="e.g. Hidden Falls trailhead"
                    placeholderTextColor="#71717a"
                    maxLength={80}
                    returnKeyType="next"
                    className="h-14 px-4 text-white bg-zinc-900 border border-zinc-800 rounded-2xl"
                    style={{fontSize: 17}}
                  />
                </View>

                <View className="gap-2" onLayout={(e) => (fieldY.current.note = e.nativeEvent.layout.y)}>
                  <View className="flex-row items-baseline justify-between mx-1">
                    <Text className="text-zinc-400 text-sm font-bold">HOW TO GET THERE</Text>
                    <Text className="text-zinc-600 text-xs">Optional · {NOTE_MAX - note.length} left</Text>
                  </View>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    onFocus={() => onFieldFocus("note")}
                    placeholder="e.g. Park at the dirt pullout. The trail starts behind the green gate."
                    placeholderTextColor="#71717a"
                    multiline
                    maxLength={NOTE_MAX}
                    textAlignVertical="top"
                    className="min-h-28 px-4 pt-3.5 pb-3.5 text-white bg-zinc-900 border border-zinc-800 rounded-2xl"
                    style={INPUT_TEXT}
                  />
                </View>

                {/* When it's open (#6): plans and the live date warn when it's closed */}
                <View className="gap-2">
                  <View className="flex-row items-baseline justify-between mx-1">
                    <Text className="text-zinc-400 text-sm font-bold">HOURS</Text>
                    <Text className="text-zinc-600 text-xs">Optional</Text>
                  </View>
                  <HoursEditor value={hours} onChange={setHours} />
                </View>
              </View>
            </ScrollView>

            {/* Pinned at the bottom (rides up with the keyboard) */}
            <View className="px-5 pt-3 bg-black" style={{paddingBottom: insets.bottom + 12}}>
              <Pressable
                onPress={addNew}
                disabled={checking}
                accessibilityRole="button"
                className="bg-white rounded-full h-14 items-center justify-center active:opacity-80"
              >
                {checking ? (
                  <ActivityIndicator color="black" />
                ) : (
                  <Text className="text-black font-extrabold text-base">Use this place</Text>
                )}
              </Pressable>
            </View>

            {/* Floating over the map: back, and move the pin */}
            <View
              className="absolute left-0 right-0 flex-row justify-between px-4"
              style={{top: insets.top + 8}}
              pointerEvents="box-none"
            >
              <Pressable
                onPress={() => setStep("pin")}
                accessibilityRole="button"
                accessibilityLabel="Back"
                className="active:opacity-70"
              >
                <GlassSurface style={GLASS_ROUND}>
                  <Ionicons name="chevron-back" size={24} color="white" />
                </GlassSurface>
              </Pressable>
              <Pressable
                onPress={() => setStep("pin")}
                accessibilityRole="button"
                accessibilityLabel="Move the pin"
                className="active:opacity-70"
              >
                <GlassSurface style={GLASS_PILL}>
                  <Ionicons name="move" size={16} color="white" />
                  <Text className="text-white font-semibold text-sm">Move pin</Text>
                </GlassSurface>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}

        {step === "same" && (
          <>
            {header("Is it one of these?", {label: "Back", onPress: () => setStep("details")})}
            <ScrollView contentContainerClassName="px-5 pt-4 gap-2.5" contentContainerStyle={{paddingBottom: insets.bottom + 24}}>
              <Text className="text-zinc-400 text-sm mb-1">
                These are already on Venture near your pin. If it&apos;s the same spot, use it, so its ideas stay
                together.
              </Text>
              {similar.map((place) => placeRow(place, pin))}
              <Pressable
                onPress={finishNew}
                accessibilityRole="button"
                className="mt-2 bg-zinc-800 rounded-full h-14 items-center justify-center active:opacity-80"
              >
                <Text className="text-white font-bold text-base">No, it&apos;s a different place</Text>
              </Pressable>
            </ScrollView>
          </>
        )}
      </View>

      {/* Pop-ups and toasts over this sheet (#86) */}
      <Overlays />
    </Modal>
  );
}
