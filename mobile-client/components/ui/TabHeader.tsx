// components/ui/TabHeader.tsx
// The header every tab shares:
//
//   - At rest: a large title in the top-left (with an optional line above
//     and/or below it) and round glass buttons on the right.
//   - On scroll: the title shrinks up into a slim bar in the top-left, the
//     extra lines fade away, and a fading blur appears behind the bar
//     (strongest at the top, dissolving at the bottom, no hard edge).
//
// The header is the scroll view's first child, kept pinned with
// stickyHeaderIndices, and the scroll view is the screen's ROOT view.
// That's deliberate: iOS 26 only finds a tab's scroll view (for the tab bar's
// shrink-on-scroll) when it's at the root. Wrapping it in a View breaks that.
//
// Usage:
//   const header = useTabHeader({subtitle: true});
//   return (
//     <Animated.ScrollView {...header.scrollProps} style={{flex: 1, backgroundColor: "#000"}}>
//       <TabHeader header={header} title="Upcoming" subtitle="2 planned" right={...} />
//       <View>...content...</View>
//     </Animated.ScrollView>
//   );
//
// Screens without a scroll view (e.g. Discover's map) can render
// <TabHeader floating collapsed /> over their content instead.
//
// Animated.ScrollView isn't mapped by NativeWind, so give it style /
// contentContainerStyle rather than className / contentContainerClassName.

import React, {useCallback, useMemo, useState} from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ViewProps,
} from "react-native";
import {BlurView} from "expo-blur";
import {LinearGradient} from "expo-linear-gradient";
import RNMaskedView from "@react-native-masked-view/masked-view";
import {Ionicons} from "@expo/vector-icons";
import {useSafeAreaInsets} from "react-native-safe-area-context";

import GlassSurface, {useReduceTransparency} from "@/components/ui/GlassSurface";

// The library's class-component typings predate React 19's JSX types
const MaskedView = RNMaskedView as unknown as React.ComponentType<
  ViewProps & {maskElement: React.ReactElement}
>;

// --- Layout (fixed line heights, so the header's size is known up front) ---
const PAD_TOP = 6;
const EYEBROW_HEIGHT = 20; // 18 line + 2 gap
const TITLE_SIZE = 34;
const TITLE_LINE = 41;
const SUBTITLE_HEIGHT = 24; // 2 gap + 22 line
const PAD_BOTTOM = 14;

/** The slim bar the title shrinks into. */
const BAR_HEIGHT = 48;
const SMALL_TITLE_SIZE = 22;
const SMALL_SCALE = SMALL_TITLE_SIZE / TITLE_SIZE;
/** Scroll distance over which the header collapses (at least this much). */
const MIN_COLLAPSE = 32;
/** How far below the bar the blur keeps fading out. */
const FADE = 28;
const BUTTON_SIZE = 40;

export type TabHeaderState = ReturnType<typeof useTabHeader>;

export function useTabHeader({
  eyebrow = false,
  subtitle = false,
}: {
  /** The header shows a small line above the title. */
  eyebrow?: boolean;
  /** The header shows a line under the title. */
  subtitle?: boolean;
} = {}) {
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === "ios";

  const titleTop = PAD_TOP + (eyebrow ? EYEBROW_HEIGHT : 0);
  const expanded =
    titleTop + TITLE_LINE + (subtitle ? SUBTITLE_HEIGHT : 0) + PAD_BOTTOM;
  const height = insets.top + expanded;
  const collapseDistance = Math.max(expanded - BAR_HEIGHT, MIN_COLLAPSE);

  const [scrollY] = useState(() => new Animated.Value(0));
  // Wrapped in add() so it's the same Animated type as a parked value
  const progress = useMemo(() => Animated.add(scrollY, 0), [scrollY]);

  const onScroll = useMemo(
    () =>
      Animated.event([{nativeEvent: {contentOffset: {y: scrollY}}}], {
        useNativeDriver: true,
      }),
    [scrollY],
  );

  /** Call when the scroll view is replaced (it starts back at the top). */
  const reset = useCallback(() => scrollY.setValue(0), [scrollY]);

  return {
    height,
    titleTop,
    collapseDistance,
    progress,
    reset,
    /** Spread onto the tab's root Animated.ScrollView / Animated.FlatList. */
    scrollProps: {
      onScroll,
      scrollEventThrottle: 16,
      // <TabHeader> must be the scroll view's first child
      stickyHeaderIndices: [0],
      ...(ios
        ? {
            // The screen runs under the floating tab bar; its height is in
            // the bottom safe-area inset of each native tab screen
            contentInset: {bottom: insets.bottom},
            scrollIndicatorInsets: {bottom: insets.bottom},
            automaticallyAdjustContentInsets: false,
            contentInsetAdjustmentBehavior: "never" as const,
          }
        : {}),
    },
  };
}

/**
 * Pull-to-refresh for a tab:
 *   const refresh = useTabRefresh(reload);
 *   <Animated.ScrollView refreshControl={refresh.control} ...>
 *     <TabHeader refreshing={refresh.headerSpinner} ... />
 *
 * On iOS the system spinner would sit in the gap above the header, mostly
 * behind the status bar, so it's made invisible and the header shows one
 * instead. Android's spinner floats over the content, so it's just moved
 * below the status bar.
 */
export function useTabRefresh(onRefresh: () => Promise<unknown>) {
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === "ios";
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return {
    refreshing,
    /** Pass to <TabHeader refreshing>. */
    headerSpinner: ios && refreshing,
    control: (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        tintColor={ios ? "transparent" : "white"}
        progressViewOffset={insets.top + 8}
      />
    ),
  };
}

/** Round glass icon button for the header's right side. */
export function HeaderIconButton({
  icon,
  label,
  onPress,
  badgeColor,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress?: () => void;
  /** Shows a small dot (e.g. unread notifications). */
  badgeColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      className="active:opacity-70"
    >
      <GlassSurface style={styles.iconButton}>
        <Ionicons name={icon} size={20} color="white" />
      </GlassSurface>
      {badgeColor ? (
        <View style={[styles.badge, {backgroundColor: badgeColor}]} />
      ) : null}
    </Pressable>
  );
}

/** The fading blur behind the collapsed bar. */
function Backdrop({
  top,
  opacity,
}: {
  top: number;
  opacity: Animated.AnimatedInterpolation<number>;
}) {
  const reduceTransparency = useReduceTransparency();
  const total = top + BAR_HEIGHT + FADE;
  const solidUntil = (top + BAR_HEIGHT * 0.6) / total;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.fill, {height: total, opacity}]}
    >
      {Platform.OS !== "ios" || reduceTransparency ? (
        // No blur here: a plain dark fade keeps the bar readable
        <LinearGradient
          colors={["rgba(0,0,0,0.96)", "rgba(0,0,0,0.85)", "rgba(0,0,0,0)"]}
          locations={[0, solidUntil, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <>
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
                colors={["#000", "#000", "rgba(0,0,0,0.6)", "transparent"]}
                locations={[0, solidUntil, solidUntil + (1 - solidUntil) * 0.45, 1]}
                style={StyleSheet.absoluteFill}
              />
            }
          >
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          </MaskedView>
          {/* A soft dark wash keeps white text readable over bright content */}
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.25)", "rgba(0,0,0,0)"]}
            locations={[0, solidUntil, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
    </Animated.View>
  );
}

export default function TabHeader({
  header,
  title,
  eyebrow,
  subtitle,
  right,
  collapsed = false,
  floating = false,
  refreshing = false,
}: {
  header: TabHeaderState;
  title: string;
  /** Small line above the title (e.g. the greeting on Discover). */
  eyebrow?: string;
  /** Line under the title. */
  subtitle?: string;
  right?: React.ReactNode;
  /** Stay in the slim bar (when there's nothing to scroll, e.g. a map). */
  collapsed?: boolean;
  /** Float over the screen instead of sitting inside a scroll view. */
  floating?: boolean;
  /**
   * Shows a spinner beside the buttons. On iOS, pass the RefreshControl's
   * `refreshing` here and give the RefreshControl a transparent tint: its own
   * spinner sits in the gap above the header, mostly behind the status bar.
   */
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const {titleTop, collapseDistance: d} = header;

  // When forced collapsed, drive everything from a value parked at the end
  // (wrapped in add() so it's the same Animated type as header.progress)
  const [parked] = useState(() => Animated.add(new Animated.Value(d), 0));
  const p = collapsed ? parked : header.progress;

  // Title: shrinks toward its top-left corner and settles centered in the bar.
  // Pulling down past the top grows it a little, like iOS.
  const smallTop = (BAR_HEIGHT - TITLE_LINE * SMALL_SCALE) / 2;
  const titleScale = p.interpolate({
    inputRange: [-120, 0, d],
    outputRange: [1.08, 1, SMALL_SCALE],
    extrapolate: "clamp",
  });
  const titleShift = p.interpolate({
    inputRange: [0, d],
    outputRange: [0, smallTop - titleTop],
    extrapolate: "clamp",
  });

  // Lines above/below the title ride up with the content and fade out
  const extrasOpacity = p.interpolate({
    inputRange: [0, d * 0.6],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const extrasShift = p.interpolate({
    inputRange: [0, d],
    outputRange: [0, -d],
    extrapolate: "clamp",
  });

  // Buttons start level with the large title and end centered in the bar
  const buttonsTop = titleTop + TITLE_LINE / 2 - BUTTON_SIZE / 2;
  const buttonsShift = p.interpolate({
    inputRange: [0, d],
    outputRange: [0, (BAR_HEIGHT - BUTTON_SIZE) / 2 - buttonsTop],
    extrapolate: "clamp",
  });

  // The blur fades in as content starts sliding under the header
  const backdropOpacity = p.interpolate({
    inputRange: [0, d],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <View
      style={[
        floating ? styles.container : styles.stickyContainer,
        {paddingTop: insets.top, height: header.height},
      ]}
      pointerEvents="box-none"
    >
      <Backdrop top={insets.top} opacity={backdropOpacity} />

      <View style={styles.inner} pointerEvents="box-none">
        {eyebrow ? (
          <Animated.Text
            style={[
              styles.eyebrow,
              {top: PAD_TOP, opacity: extrasOpacity, transform: [{translateY: extrasShift}]},
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={1}
          >
            {eyebrow}
          </Animated.Text>
        ) : null}

        <Animated.Text
          style={[
            styles.title,
            {
              top: titleTop,
              transform: [{translateY: titleShift}, {scale: titleScale}],
            },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={1}
          accessibilityRole="header"
        >
          {title}
        </Animated.Text>

        {subtitle ? (
          <Animated.Text
            style={[
              styles.subtitle,
              {
                top: titleTop + TITLE_LINE + 2,
                opacity: extrasOpacity,
                transform: [{translateY: extrasShift}],
              },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={1}
          >
            {subtitle}
          </Animated.Text>
        ) : null}

        {right || refreshing ? (
          <Animated.View
            style={[
              styles.right,
              {top: buttonsTop, transform: [{translateY: buttonsShift}]},
            ]}
          >
            {refreshing ? (
              <View style={styles.spinner}>
                <ActivityIndicator color="white" />
              </View>
            ) : null}
            {right}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  stickyContainer: {zIndex: 20},
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  inner: {flex: 1},
  eyebrow: {
    position: "absolute",
    left: 24,
    right: 140,
    color: "#a1a1aa",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    position: "absolute",
    left: 24,
    // Leaves room for the buttons; the title shrinks from its left edge
    right: 120,
    color: "#fff",
    fontSize: TITLE_SIZE,
    lineHeight: TITLE_LINE,
    fontWeight: "800",
    letterSpacing: -0.6,
    transformOrigin: "left top",
  },
  subtitle: {
    position: "absolute",
    left: 24,
    right: 24,
    color: "#a1a1aa",
    fontSize: 16,
    lineHeight: 22,
  },
  right: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  spinner: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#18181b",
  },
});
