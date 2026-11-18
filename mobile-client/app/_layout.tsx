import {useEffect} from "react";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import {useFonts} from "expo-font";
import {Stack, useRouter, useSegments} from "expo-router";
import {StatusBar} from "expo-status-bar";
import "react-native-reanimated";
import {GestureHandlerRootView} from "react-native-gesture-handler";
import "../global.css";
import Toast, {ToastConfig} from "react-native-toast-message";
import {View, Text, ActivityIndicator, Pressable} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";

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
import {TERMS_VERSION} from "@/src/lib/terms";
import {signOut} from "@/src/lib/signOut";

// --- CREATE YOUR CUSTOM TOAST THEMES ---
// Custom toasts draw their own box, so they have to pass taps through
// themselves (`onPress`): "Tap to undo" toasts rely on it.
const toastConfig: ToastConfig = {
  // Override the default 'error' toast
  error: ({text1, text2, onPress}) => (
    <Pressable
      onPress={onPress}
      className="w-[90%] bg-zinc-900 border border-red-900/50 rounded-2xl p-4 shadow-2xl flex-row items-center active:opacity-80"
    >
      <View className="flex-1">
        <Text className="text-red-400 font-bold text-base mb-0.5">{text1}</Text>
        {text2 && (
          <Text className="text-zinc-400 text-sm font-medium">{text2}</Text>
        )}
      </View>
    </Pressable>
  ),

  // Override the default 'success' toast
  success: ({text1, text2, onPress}) => (
    <Pressable
      onPress={onPress}
      className="w-[90%] bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl flex-row items-center active:opacity-80"
    >
      <View className="flex-1">
        <Text className="text-white font-bold text-base mb-0.5">{text1}</Text>
        {text2 && (
          <Text className="text-zinc-400 text-sm font-medium">{text2}</Text>
        )}
      </View>
    </Pressable>
  ),
};

// --- THE TRAFFIC COP ---
// We moved your original layout into this component so it has access to the useAuth hook
/**
 * How far bottom toasts sit above the screen's bottom edge: clear of the
 * bottom bars (the tab bar, the builder's action bar, an idea's "Plan a date
 * with this"), which all end about this high above the safe area.
 */
const TOAST_ABOVE_BARS = 84;

function InitialLayout() {
  const insets = useSafeAreaInsets();
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
    if (
      userId &&
      onboarded &&
      profileStatus === "ready" &&
      itineraryUserId !== userId
    ) {
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
  const blockUserId = useBlockStore((s) => s.userId);
  const loadBlocks = useBlockStore((s) => s.load);
  const accountUserId = useAccountStore((s) => s.userId);
  const loadAccount = useAccountStore((s) => s.load);
  useEffect(() => {
    if (!userId || !onboarded || profileStatus !== "ready") return;
    if (savedUserId !== userId) loadSaved(userId);
    if (myIdeasUserId !== userId) loadMyIdeas(userId);
    if (hiddenUserId !== userId) loadHidden(userId);
    if (notificationsUserId !== userId) loadNotifications(userId);
    if (staffUserId !== userId) loadStaff(userId);
    if (blockUserId !== userId) loadBlocks(userId);
    if (accountUserId !== userId) loadAccount(userId);
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
  }, [
    session,
    initialized,
    segments,
    fontsReady,
    profileStatus,
    profileUserId,
    userId,
    onboarded,
    router,
  ]);

  // Signed in, but the profile isn't loaded yet (or failed to load)
  const showProfileGate =
    !!session &&
    (!hasProfile || profileUserId !== userId) &&
    profileStatus !== "ready";

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
        <Stack.Screen
          name="(tabs)"
          options={{headerShown: false, title: "", animation: "none"}}
        />

        {/* CREATE SCREEN */}
        <Stack.Screen
          name="create/index"
          options={{
            title: "New Date Idea",
            headerShown: false,
            // Native iOS sheet: rounded corners, swipe-to-dismiss.
            // Grabber is custom (in create/index.tsx) for a larger, lower pill.
            presentation: "formSheet",
            sheetGrabberVisible: false,
            sheetAllowedDetents: [1.0],
            sheetCornerRadius: 24,
            // Slightly lighter than the black screen behind so the edge reads
            contentStyle: {backgroundColor: "#121212"},
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
        <Stack.Screen
          name="active-date/index"
          options={{headerShown: false, animation: "slide_from_bottom"}}
        />

        {/* ONBOARDING (first sign-in until onboarded_at is set) */}
        <Stack.Screen
          name="onboarding/index"
          options={{headerShown: false, gestureEnabled: false, animation: "fade"}}
        />

        {/* SETTINGS */}
        <Stack.Screen name="settings/index" options={{headerShown: false}} />
        <Stack.Screen
          name="settings/edit-profile"
          options={{headerShown: false}}
        />
        <Stack.Screen name="settings/planning" options={{headerShown: false}} />
        <Stack.Screen
          name="settings/delete-account"
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="settings/hidden-ideas"
          options={{headerShown: false}}
        />
        {/* TERMS OF USE (Settings › Help) */}
        <Stack.Screen name="terms" options={{headerShown: false}} />

        {/* MODERATION (staff only) */}
        <Stack.Screen name="moderation" options={{headerShown: false}} />

        {/* IDEA GUIDELINES (#85): a sheet, so it opens over the post form */}
        <Stack.Screen
          name="guidelines"
          options={{headerShown: false, presentation: "modal", contentStyle: {backgroundColor: "#09090b"}}}
        />

        {/* SAVED DATE DETAIL */}
        <Stack.Screen name="itinerary/[id]" options={{headerShown: false}} />

        {/* IDEA DETAIL outside Discover (from Bucket List / My Ideas) */}
        <Stack.Screen name="idea/[id]" options={{headerShown: false}} />

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
              <Text className="text-white font-bold text-xl text-center">
                {"Couldn't load your profile"}
              </Text>
              {profileError && (
                <Text className="text-zinc-400 text-base text-center mt-2">
                  {profileError}
                </Text>
              )}
              <Pressable
                onPress={reloadProfile}
                className="bg-white rounded-2xl px-8 py-3.5 mt-8 active:opacity-80"
              >
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

      <StatusBar style="light" />
      {/* Bottom toasts ("Tap to undo") sit above the bottom bars, not on them */}
      <Toast config={toastConfig} bottomOffset={insets.bottom + TOAST_ABOVE_BARS} />
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
