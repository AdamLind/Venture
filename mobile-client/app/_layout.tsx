import {useEffect} from "react";
import {DarkTheme, DefaultTheme, ThemeProvider} from "expo-router/react-navigation";
import {useFonts} from "expo-font";
import {Stack, useRouter, useSegments} from "expo-router";
import {StatusBar} from "expo-status-bar";
import "react-native-reanimated";
import {GestureHandlerRootView} from "react-native-gesture-handler";
import "../global.css";
import {View, Text, ActivityIndicator, Pressable} from "react-native";

import {useColorScheme} from "@/hooks/useColorScheme";
import {AuthProvider, useAuth} from "../src/providers/AuthProvider";
import {useProfileStore} from "@/src/store/useProfileStore";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import {useSavedStore} from "@/src/store/useSavedStore";
import {useMyIdeasStore} from "@/src/store/useMyIdeasStore";
import {useHiddenStore} from "@/src/store/useHiddenStore";
import {useNotificationStore} from "@/src/store/useNotificationStore";
import {useStaffStore} from "@/src/store/useStaffStore";
import {useBlockStore} from "@/src/store/useBlockStore";
import {useAccountStore} from "@/src/store/useAccountStore";
import TermsGate from "@/components/TermsGate";
import SaveTip from "@/components/ideas/SaveTip";
import SheetHost from "@/components/sheets/SheetHost";
import ToastHost from "@/components/sheets/ToastHost";
import {watchDeviceAccounts} from "@/src/store/useDeviceAccounts";
import {useConnectionsStore} from "@/src/store/useConnectionsStore";
import {TERMS_VERSION} from "@/src/lib/terms";
import {signOut} from "@/src/lib/signOut";

// --- THE TRAFFIC COP ---
// We moved your original layout into this component so it has access to the useAuth hook

function InitialLayout() {
  const {session, initialized} = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

  const [loaded, fontError] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  // A failed font load should not block the app forever
  const fontsReady = loaded || !!fontError;

  const userId = session?.user.id ?? null;
  const profileUserId = useProfileStore((s) => s.userId);
  const profileStatus = useProfileStore((s) => s.status);
  const profileError = useProfileStore((s) => s.error);
  const hasProfile = useProfileStore((s) => !!s.profile);
  const onboarded = useProfileStore((s) => !!s.preferences?.onboarded_at);
  const preferences = useProfileStore((s) => s.preferences);
  const loadProfile = useProfileStore((s) => s.load);
  const reloadProfile = useProfileStore((s) => s.reload);
  const clearProfile = useProfileStore((s) => s.clear);

  // Keep the profile store in sync with whoever is signed in
  useEffect(() => {
    if (!initialized) return;
    if (userId && userId !== profileUserId) {
      loadProfile(userId);
    } else if (!userId && profileUserId) {
      clearProfile();
    }
  }, [initialized, userId, profileUserId, loadProfile, clearProfile]);

  // Load saved dates once the user is set up. This also restores a date that
  // was in progress when the app was closed.
  const itineraryUserId = useItineraryStore((s) => s.userId);
  const loadItineraries = useItineraryStore((s) => s.load);
  useEffect(() => {
    if (userId && onboarded && profileStatus === "ready" && itineraryUserId !== userId) {
      loadItineraries(userId);
    }
  }, [userId, onboarded, profileStatus, itineraryUserId, loadItineraries]);

  // Bucket List and My Ideas, loaded alongside the dates
  const savedUserId = useSavedStore((s) => s.userId);
  const loadSaved = useSavedStore((s) => s.load);
  const myIdeasUserId = useMyIdeasStore((s) => s.userId);
  const loadMyIdeas = useMyIdeasStore((s) => s.load);
  const hiddenUserId = useHiddenStore((s) => s.userId);
  const loadHidden = useHiddenStore((s) => s.load);
  const notificationsUserId = useNotificationStore((s) => s.userId);
  const loadNotifications = useNotificationStore((s) => s.load);
  const staffUserId = useStaffStore((s) => s.userId);
  const loadStaff = useStaffStore((s) => s.load);
  // Accounts on this device (#31): keep saved sessions current
  useEffect(() => watchDeviceAccounts(), []);

  const blockUserId = useBlockStore((s) => s.userId);
  const loadBlocks = useBlockStore((s) => s.load);
  const accountUserId = useAccountStore((s) => s.userId);
  const loadAccount = useAccountStore((s) => s.load);
  const connectionsUserId = useConnectionsStore((s) => s.userId);
  const loadConnections = useConnectionsStore((s) => s.load);
  useEffect(() => {
    if (!userId || !onboarded || profileStatus !== "ready") return;
    if (savedUserId !== userId) loadSaved(userId);
    if (myIdeasUserId !== userId) loadMyIdeas(userId);
    if (hiddenUserId !== userId) loadHidden(userId);
    if (notificationsUserId !== userId) loadNotifications(userId);
    if (staffUserId !== userId) loadStaff(userId);
    if (blockUserId !== userId) loadBlocks(userId);
    if (accountUserId !== userId) loadAccount(userId);
    if (connectionsUserId !== userId) loadConnections(userId);
  }, [
    userId,
    onboarded,
    profileStatus,
    savedUserId,
    loadSaved,
    myIdeasUserId,
    loadMyIdeas,
    hiddenUserId,
    loadHidden,
    notificationsUserId,
    loadNotifications,
    staffUserId,
    loadStaff,
    blockUserId,
    loadBlocks,
    accountUserId,
    loadAccount,
    connectionsUserId,
    loadConnections,
  ]);

  // The Reactive Auth Routing Logic
  useEffect(() => {
    // Wait until fonts load AND Supabase checks for a token
    if (!initialized || !fontsReady) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";

    if (!session) {
      // ❌ Not logged in but trying to see the app -> push to login
      if (!inAuthGroup) router.replace("/(auth)/login");
      return;
    }

    // Logged in: wait for the profile to decide between onboarding and the app
    if (profileStatus !== "ready" || profileUserId !== userId) return;

    if (!onboarded) {
      if (!inOnboarding) router.replace("/onboarding");
    } else if (inAuthGroup || inOnboarding) {
      // ✅ Logged in and set up -> push to tabs
      router.replace("/(tabs)/explore");
    }
  }, [session, initialized, segments, fontsReady, profileStatus, profileUserId, userId, onboarded, router]);

  // Signed in, but the profile isn't loaded yet (or failed to load)
  const showProfileGate = !!session && (!hasProfile || profileUserId !== userId) && profileStatus !== "ready";

  // Set up, but hasn't accepted the current terms
  const acceptedTermsVersion = preferences?.terms_version ?? null;
  const showTermsGate =
    !!session &&
    !showProfileGate &&
    profileStatus === "ready" &&
    onboarded &&
    !!preferences &&
    acceptedTermsVersion !== TERMS_VERSION;

  if (!fontsReady) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* ADDED: Auth Group (hides the header for the login screen) */}
        <Stack.Screen name="(auth)/login" options={{headerShown: false}} />

        {/* Tabs Group */}
        <Stack.Screen name="(tabs)" options={{headerShown: false, title: "", animation: "none"}} />

        {/* CREATE SCREEN */}
        <Stack.Screen
          name="create/index"
          options={{
            title: "New Date Idea",
            headerShown: false,
            // Full screen (#82): posting is several steps, and a sheet's
            // swipe-down would throw them away. It slides up from the bottom;
            // the × (step 1) or back arrow are the way out
            presentation: "fullScreenModal",
            animation: "slide_from_bottom",
            gestureEnabled: false,
            contentStyle: {backgroundColor: "#09090b"},
          }}
        />

        {/* BUILDER SCREEN */}
        <Stack.Screen
          name="builder/index"
          options={{
            animation: "fade",
            title: "Build Your Activity",
            // The builder draws its own header
            headerShown: false,
          }}
        />

        {/* ACTIVE DATE SCREEN */}
        <Stack.Screen name="active-date/index" options={{headerShown: false, animation: "slide_from_bottom"}} />
        {/* THE LIVE DATE CAMERA (#40), over the live date */}
        <Stack.Screen
          name="capture"
          options={{headerShown: false, presentation: "fullScreenModal", contentStyle: {backgroundColor: "#000"}}}
        />

        {/* ONBOARDING (first sign-in until onboarded_at is set) */}
        <Stack.Screen
          name="onboarding/index"
          options={{headerShown: false, gestureEnabled: false, animation: "fade"}}
        />

        {/* SETTINGS */}
        <Stack.Screen name="settings/index" options={{headerShown: false}} />
        <Stack.Screen name="settings/edit-profile" options={{headerShown: false}} />
        <Stack.Screen name="settings/planning" options={{headerShown: false}} />
        <Stack.Screen name="settings/delete-account" options={{headerShown: false}} />
        <Stack.Screen name="settings/hidden-ideas" options={{headerShown: false}} />
        {/* CONNECTIONS (#35): the list, Add someone, and opening someone's link */}
        <Stack.Screen name="connections" options={{headerShown: false}} />
        <Stack.Screen name="connections/add" options={{headerShown: false}} />
        <Stack.Screen name="connect/[code]" options={{headerShown: false, animation: "fade"}} />

        {/* TERMS OF USE and PRIVACY POLICY (Settings › Help) */}
        <Stack.Screen name="terms" options={{headerShown: false}} />
        <Stack.Screen name="privacy" options={{headerShown: false}} />

        {/* MODERATION (staff only), and a reported person's review (#76) */}
        <Stack.Screen name="moderation" options={{headerShown: false}} />
        <Stack.Screen name="reported-person/[id]" options={{headerShown: false}} />

        {/* IDEA GUIDELINES (#85): a sheet, so it opens over the post form */}
        <Stack.Screen
          name="guidelines"
          options={{headerShown: false, presentation: "modal", contentStyle: {backgroundColor: "#09090b"}}}
        />

        {/* SAVED DATE DETAIL */}
        <Stack.Screen name="itinerary/[id]" options={{headerShown: false}} />

        {/* IDEA DETAIL outside Discover (from Bucket List / My Ideas) */}
        <Stack.Screen name="idea/[id]" options={{headerShown: false}} />

        {/* SEARCH every idea, near or far (the magnifier in Discover) */}
        <Stack.Screen name="search" options={{headerShown: false}} />

        {/* NOTIFICATIONS (the bell in Discover) */}
        <Stack.Screen name="notifications" options={{headerShown: false}} />

        {/* Not Found Screen */}
        <Stack.Screen name="+not-found" />
      </Stack>

      {/* Covers the app while the signed-in user's profile loads */}
      {showProfileGate && (
        <View className="absolute inset-0 bg-black items-center justify-center px-8">
          {profileStatus === "error" ? (
            <>
              <Text className="text-white font-bold text-xl text-center">{"Couldn't load your profile"}</Text>
              {profileError && <Text className="text-zinc-400 text-base text-center mt-2">{profileError}</Text>}
              <Pressable onPress={reloadProfile} className="bg-white rounded-2xl px-8 py-3.5 mt-8 active:opacity-80">
                <Text className="text-black font-extrabold">Try again</Text>
              </Pressable>
              <Pressable onPress={signOut} className="mt-4 py-2">
                <Text className="text-zinc-400 font-semibold">Sign out</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color="white" size="large" />
          )}
        </View>
      )}

      {/* Terms of use (#76): accepted once you're set up, and again when
          they change */}
      {showTermsGate && <TermsGate updated={!!acceptedTermsVersion} />}

      {/* The first save with a partner: tap vs press and hold (#35) */}
      <SaveTip />

      {/* Our own pop-ups (#86: src/lib/sheets.ts); screens that open over
          the app mount their own */}
      <SheetHost />

      <StatusBar style="light" />
      {/* Bottom toasts ("Tap to undo") sit above the bottom bars, not on them */}
      <ToastHost />
    </ThemeProvider>
  );
}

// --- THE ROOT PROVIDER ---
// Wraps your app in the AuthContext so useAuth() works everywhere
export default function RootLayout() {
  return (
    // Gesture handler's root: the builder's drag-to-reorder and the live
    // date's sheet need it
    <GestureHandlerRootView style={{flex: 1}}>
      <AuthProvider>
        <InitialLayout />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
