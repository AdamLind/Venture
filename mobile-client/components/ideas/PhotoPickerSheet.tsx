// components/ideas/PhotoPickerSheet.tsx
// "Pick a photo" for an official idea (admins, with Staff tools on). Tap a
// photo to see it bigger with its photographer, then "Use this photo": it's
// saved on the idea, and the idea page credits the photographer.
//
// Two places to look:
// - Near this place (ideas with a place): Wikimedia Commons photos taken near
//   its pin, or found by words. Free, so a place's picker opens here
// - Unsplash: searched from the idea's title (or its place's name). Its
//   searches are limited (50 an hour), so for a place it only searches once
//   you open its tab; a stay-in idea (no pin) opens on it
//
// A place: only a photo of that place, never a lookalike. No real photo:
// leave it (the idea keeps its tile).

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Overlays from "@/components/sheets/Overlays";
import {
  commonsCredit,
  commonsNear,
  commonsSearch,
  type CommonsPhoto,
} from "@/src/lib/commons";
import { UNSPLASH_UTM, type PhotoCredit } from "@/src/lib/images";
import { errorText, showDone, showError } from "@/src/lib/notify";
import {
  KEEP_FOR_PICKING,
  knownRemaining,
  pickUnsplashPhoto,
  savePickedPhoto,
  searchUnsplash,
  type UnsplashPhoto,
} from "@/src/lib/unsplash";

const GAP = 10;
const SIDE = 24;
/** Font size only (a line height pushes text off centre on iOS) */
const INPUT_TEXT = { fontSize: 16 };
/** How far "Near this place" looks, then "Look farther" (meters) */
const RADII = [150, 500, 2000];

export type PhotoPickerIdea = {
  idea_id: number;
  title: string;
  /** Its place's name (going out), for the search and the reminder */
  place?: string | null;
  /** Its place's pin, for "Near this place" */
  latitude?: number | null;
  longitude?: number | null;
};

type Props = {
  onClose: () => void;
  onPicked: (url: string, credit: PhotoCredit) => void;
};

type Tab = "nearby" | "unsplash";
type Preview =
  | { kind: "unsplash"; photo: UnsplashPhoto }
  | { kind: "commons"; photo: CommonsPhoto };

export default function PhotoPickerSheet({
  idea,
  ...props
}: Props & {
  /** Open for this idea; null: closed */
  idea: PhotoPickerIdea | null;
}) {
  // What it shows: set when it opens (a fresh picker each time), and kept
  // while it slides away (on iOS until it's down: emptied any sooner, it
  // flashes white on the way down)
  const [shown, setShown] = useState<PhotoPickerIdea | null>(null);
  if (idea && !shown) setShown(idea);
  if (!idea && shown && Platform.OS !== "ios") setShown(null);

  return (
    <Modal
      visible={!!idea}
      animationType="slide"
      presentationStyle="pageSheet"
      // (follows your finger down, like iOS's own sheets; without it the sheet
      // resists, then jumps away when you let go)
      allowSwipeDismissal
      onRequestClose={props.onClose}
      onDismiss={() => setShown(null)}
    >
      <View className="flex-1 bg-zinc-950">
        {shown ? <Picker idea={shown} {...props} /> : null}
      </View>
      <Overlays />
    </Modal>
  );
}

function Picker({
  idea,
  onClose,
  onPicked,
}: Props & { idea: PhotoPickerIdea }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tile = (width - SIDE * 2 - GAP) / 2;

  const pin =
    idea.latitude != null && idea.longitude != null
      ? { latitude: idea.latitude, longitude: idea.longitude }
      : null;
  const firstQuery = idea.place?.trim() || idea.title;
  const [tab, setTab] = useState<Tab>(pin ? "nearby" : "unsplash");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Near this place (Wikimedia Commons) ──
  const [near, setNear] = useState<CommonsPhoto[]>([]);
  const [radius, setRadius] = useState(RADII[0]);
  /** Words searched on Commons (null: photos near the pin) */
  const [words, setWords] = useState<string | null>(null);
  const [commonsQuery, setCommonsQuery] = useState("");
  const [nearLoading, setNearLoading] = useState(!!pin);
  const [nearError, setNearError] = useState<string | null>(null);

  // ── Unsplash ──
  const [query, setQuery] = useState(firstQuery);
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(knownRemaining);
  const [searched, setSearched] = useState(!pin);
  const [loading, setLoading] = useState(!pin);
  const [error, setError] = useState<string | null>(null);
  // The hour's last request is kept for "Use this photo"
  const canSearch = remaining == null || remaining > KEEP_FOR_PICKING;

  // As it opens: a place looks near its pin (free); a stay-in idea searches
  // Unsplash (its only source)
  useEffect(() => {
    let live = true;
    if (pin) {
      commonsNear(pin.latitude, pin.longitude, RADII[0])
        .then((found) => live && setNear(found))
        .catch(
          (e) =>
            live &&
            setNearError(errorText(e, "Couldn't reach Wikimedia Commons.")),
        )
        .finally(() => live && setNearLoading(false));
    } else {
      searchUnsplash(firstQuery, 1)
        .then((result) => {
          if (!live) return;
          setPhotos(result.photos);
          setPages(result.pages);
        })
        .catch(
          (e) => live && setError(errorText(e, "Couldn't search Unsplash.")),
        )
        .finally(() => {
          if (!live) return;
          setLoading(false);
          setRemaining(knownRemaining());
        });
    }
    return () => {
      live = false;
    };
    // (once, as it opens)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Commons: near the pin at `meters`, or by `text` */
  const lookOnCommons = async (text: string | null, meters: number) => {
    setNearLoading(true);
    setNearError(null);
    try {
      const found = text
        ? await commonsSearch(text)
        : pin
          ? await commonsNear(pin.latitude, pin.longitude, meters)
          : [];
      setNear(found);
      setWords(text);
      setRadius(meters);
    } catch (e) {
      setNearError(errorText(e, "Couldn't reach Wikimedia Commons."));
    } finally {
      setNearLoading(false);
    }
  };

  /** Unsplash: page `p` of `q` (each one is a request) */
  const searchOnUnsplash = async (q: string, p: number) => {
    const text = q.trim();
    if (!text || !canSearch) return;
    setSearched(true);
    setLoading(true);
    setError(null);
    try {
      const result = await searchUnsplash(text, p);
      // (a later page can repeat photos from an earlier one: shown once)
      setPhotos((prev) => {
        if (p === 1) return result.photos;
        const seen = new Set(prev.map((photo) => photo.id));
        return [
          ...prev,
          ...result.photos.filter((photo) => !seen.has(photo.id)),
        ];
      });
      setPage(p);
      setPages(result.pages);
    } catch (e) {
      setError(errorText(e, "Couldn't search Unsplash."));
    } finally {
      setLoading(false);
      setRemaining(knownRemaining());
    }
  };

  const openTab = (next: Tab) => {
    setTab(next);
    // Unsplash's first search only once you open it
    if (next === "unsplash" && !searched) searchOnUnsplash(query, 1);
  };

  const use = async (picked: Preview) => {
    if (saving) return;
    setSaving(true);
    try {
      let url: string;
      let credit: PhotoCredit;
      if (picked.kind === "unsplash") {
        ({ url, credit } = await pickUnsplashPhoto(picked.photo));
        setRemaining(knownRemaining());
      } else {
        url = picked.photo.url;
        credit = commonsCredit(picked.photo);
      }
      await savePickedPhoto(idea.idea_id, url, credit);
      onPicked(url, credit);
      showDone("Photo saved", creditLine(credit));
      onClose();
    } catch (e) {
      setRemaining(knownRemaining());
      showError("Couldn't use that photo", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-zinc-950">
      <View className="flex-row items-center px-6 pt-7 pb-3 border-b border-zinc-900">
        {preview ? (
          <Pressable
            onPress={() => setPreview(null)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back to the photos"
            className="mr-3 active:opacity-60"
          >
            <Ionicons name="chevron-back" size={24} color="white" />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Text className="text-orange-200 text-xs font-bold uppercase tracking-widest">
            Pick a photo
          </Text>
          <Text className="text-white font-extrabold text-xl" numberOfLines={1}>
            {idea.title}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          className="active:opacity-60"
        >
          <Text className="text-zinc-400 font-semibold text-base">Done</Text>
        </Pressable>
      </View>

      {preview ? (
        <PreviewView
          preview={preview}
          width={width}
          saving={saving}
          bottom={insets.bottom}
          onUse={use}
        />
      ) : (
        <ScrollView
          contentContainerClassName="px-6 pt-5 gap-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Where to look (a place only: a stay-in idea has no pin) */}
          {pin ? (
            <View className="flex-row bg-zinc-900 border border-zinc-800 rounded-full p-1">
              {(
                [
                  { id: "nearby", label: "Near this place" },
                  { id: "unsplash", label: "Unsplash" },
                ] as const
              ).map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => openTab(t.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t.id }}
                  className={`flex-1 items-center py-2 rounded-full ${tab === t.id ? "bg-zinc-700" : ""}`}
                >
                  <Text
                    className={`text-sm font-semibold ${tab === t.id ? "text-white" : "text-zinc-400"}`}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* (like the app's search bar: a fixed height, and only a font size on the
              input, since a line height pushes the text off centre on iOS) */}
          <View className="flex-row items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 h-12">
            <Ionicons name="search" size={17} color="#a1a1aa" />
            {tab === "nearby" ? (
              <TextInput
                key="commons"
                value={commonsQuery}
                onChangeText={setCommonsQuery}
                onSubmitEditing={() =>
                  lookOnCommons(commonsQuery.trim() || null, radius)
                }
                returnKeyType="search"
                placeholder="Search Wikimedia Commons"
                placeholderTextColor="#71717a"
                autoCorrect={false}
                className="flex-1 h-full text-white"
                style={INPUT_TEXT}
                accessibilityLabel="Search Wikimedia Commons"
              />
            ) : (
              <TextInput
                key="unsplash"
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => searchOnUnsplash(query, 1)}
                returnKeyType="search"
                placeholder="Search Unsplash"
                placeholderTextColor="#71717a"
                autoCorrect={false}
                className="flex-1 h-full text-white"
                style={INPUT_TEXT}
                accessibilityLabel="Search Unsplash"
              />
            )}
          </View>

          {idea.place ? (
            <View className="flex-row gap-2 rounded-2xl px-3.5 py-3 bg-amber-500/10 border border-amber-400/30">
              <Ionicons
                name="location"
                size={15}
                color="#fcd34d"
                style={{ marginTop: 2 }}
              />
              <Text className="text-amber-100/90 text-sm leading-5 flex-1">
                Only a photo of {idea.place} itself. If there isn&apos;t a real
                one, leave it: the idea keeps its tile.
              </Text>
            </View>
          ) : null}

          {tab === "nearby" ? (
            <>
              <Text className="text-zinc-400 text-sm">
                {words
                  ? `Wikimedia Commons photos matching “${words}”`
                  : `Wikimedia Commons photos taken within ${radius < 1000 ? `${radius} m` : `${radius / 1000} km`} of the pin`}
              </Text>
              {nearError ? (
                <Text className="text-red-300 text-sm">{nearError}</Text>
              ) : null}
              {!nearLoading && !nearError && near.length === 0 ? (
                <Text className="text-zinc-400 text-sm">
                  Nothing here. Look farther, or try words or Unsplash.
                </Text>
              ) : null}
              <Grid
                tile={tile}
                items={near.map((photo) => ({
                  key: photo.file,
                  thumb: photo.thumb,
                  line:
                    photo.meters != null && !words
                      ? `${Math.round(photo.meters)} m away`
                      : (photo.name ?? photo.license),
                  label: `${photo.about || "Photo"}${photo.name ? `, by ${photo.name}` : ""}`,
                  onPress: () => setPreview({ kind: "commons", photo }),
                }))}
              />
              {nearLoading ? (
                <ActivityIndicator color="#FF9D0A" className="py-4" />
              ) : null}
              {!nearLoading && words ? (
                <SmallButton
                  label="Back to photos near the pin"
                  onPress={() => {
                    setCommonsQuery("");
                    lookOnCommons(null, radius);
                  }}
                />
              ) : !nearLoading && radius < RADII[RADII.length - 1] ? (
                <SmallButton
                  label="Look farther"
                  onPress={() =>
                    lookOnCommons(
                      null,
                      RADII[RADII.indexOf(radius) + 1] ?? radius,
                    )
                  }
                />
              ) : null}
            </>
          ) : (
            <>
              {error ? (
                <Text className="text-red-300 text-sm">{error}</Text>
              ) : null}
              {!loading &&
              !error &&
              searched &&
              pages === 0 &&
              photos.length === 0 ? (
                <Text className="text-zinc-400 text-sm">
                  Nothing found. Try other words.
                </Text>
              ) : null}
              <Grid
                tile={tile}
                items={photos.map((photo) => ({
                  key: photo.id,
                  thumb: photo.thumb,
                  line: photo.name,
                  label: `${photo.about || "Photo"}, by ${photo.name}`,
                  onPress: () => setPreview({ kind: "unsplash", photo }),
                }))}
              />
              {loading ? (
                <ActivityIndicator color="#FF9D0A" className="py-4" />
              ) : null}
              {!loading && canSearch && page < pages ? (
                <SmallButton
                  label="More photos"
                  onPress={() => searchOnUnsplash(query, page + 1)}
                />
              ) : null}
              {!canSearch ? (
                <Text className="text-zinc-400 text-sm text-center leading-5">
                  {remaining === 0
                    ? "No Unsplash requests left this hour. Picking and searching work again within the hour."
                    : "Unsplash's last request this hour is kept for Use this photo, so searching is paused until it resets."}
                </Text>
              ) : remaining != null ? (
                <Text className="text-zinc-600 text-xs text-center">
                  {remaining} Unsplash requests left this hour
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** The credit, as one line ("Photo by Ana Ruiz on Unsplash") */
function creditLine(credit: PhotoCredit): string {
  if (credit.source === "unsplash")
    return `Photo by ${credit.name} on Unsplash`;
  return credit.name
    ? `Photo by ${credit.name}, ${credit.license}`
    : `Photo from Wikimedia Commons, ${credit.license}`;
}

function Grid({
  tile,
  items,
}: {
  tile: number;
  items: {
    key: string;
    thumb: string;
    line: string;
    label: string;
    onPress: () => void;
  }[];
}) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: GAP }}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={item.onPress}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          className="active:opacity-80"
          style={{ width: tile }}
        >
          <Image
            source={item.thumb}
            style={{
              width: tile,
              aspectRatio: 1.3,
              borderRadius: 14,
              backgroundColor: "#18181b",
            }}
            contentFit="cover"
            transition={150}
            // (search results: not kept on the phone once you're done)
            cachePolicy="memory"
          />
          <Text className="text-zinc-400 text-xs mt-1.5" numberOfLines={1}>
            {item.line}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function SmallButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="self-center px-5 py-2.5 rounded-full bg-zinc-900 border border-zinc-800 active:opacity-70"
    >
      <Text className="text-white font-semibold">{label}</Text>
    </Pressable>
  );
}

/** One photo, bigger: is it the one? */
function PreviewView({
  preview,
  width,
  saving,
  bottom,
  onUse,
}: {
  preview: Preview;
  width: number;
  saving: boolean;
  bottom: number;
  onUse: (picked: Preview) => void;
}) {
  const unsplash = preview.kind === "unsplash" ? preview.photo : null;
  const commons = preview.kind === "commons" ? preview.photo : null;
  const image = unsplash ? unsplash.regular : commons!.url;
  const about = (unsplash ?? commons)!.about;
  const page = unsplash ? `${unsplash.page}?${UNSPLASH_UTM}` : commons!.page;

  return (
    <ScrollView
      contentContainerClassName="px-6 pt-5 gap-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}
    >
      <Image
        source={image}
        style={{
          width: width - SIDE * 2,
          aspectRatio: 1.3,
          borderRadius: 20,
          backgroundColor: "#18181b",
        }}
        contentFit="cover"
        // (looked at once: not kept on the phone)
        cachePolicy="memory"
        accessibilityLabel={about || "The photo"}
      />
      {unsplash ? (
        <Text className="text-zinc-400 text-sm">
          Photo by{" "}
          <Text className="text-white font-semibold">{unsplash.name}</Text> on
          Unsplash
        </Text>
      ) : (
        <Text className="text-zinc-400 text-sm">
          {commons!.name ? (
            <>
              Photo by{" "}
              <Text className="text-white font-semibold">{commons!.name}</Text>
            </>
          ) : (
            "Photo from Wikimedia Commons"
          )}
          , {commons!.license}
          {commons!.meters != null
            ? ` · ${Math.round(commons!.meters)} m from the pin`
            : ""}
        </Text>
      )}
      {about ? (
        <Text className="text-zinc-300 text-sm leading-5">{about}</Text>
      ) : null}
      {commons?.peopleWarning ? (
        <View className="flex-row gap-2 rounded-2xl px-3.5 py-3 bg-amber-500/10 border border-amber-400/30">
          <Ionicons
            name="people"
            size={15}
            color="#fcd34d"
            style={{ marginTop: 2 }}
          />
          <Text className="text-amber-100/90 text-sm leading-5 flex-1">
            Commons notes that people in this photo have rights of their own.
            Better to pick one without recognizable people.
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={() => Linking.openURL(page).catch(() => {})}
        accessibilityRole="link"
        className="self-start flex-row items-center gap-1 active:opacity-70"
      >
        <Text className="text-zinc-400 text-sm font-semibold">
          {unsplash ? "See it on Unsplash" : "See it on Wikimedia Commons"}
        </Text>
        <Ionicons name="open-outline" size={14} color="#a1a1aa" />
      </Pressable>
      <Pressable
        onPress={() => onUse(preview)}
        disabled={saving}
        accessibilityRole="button"
        className="mt-2 bg-white rounded-full flex-row items-center justify-center gap-2 active:opacity-80"
        style={{ height: 52, opacity: saving ? 0.6 : 1 }}
      >
        {saving ? (
          <ActivityIndicator color="black" />
        ) : (
          <Ionicons name="checkmark" size={20} color="black" />
        )}
        <Text className="text-black font-extrabold text-base">
          {saving ? "Saving…" : "Use this photo"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
