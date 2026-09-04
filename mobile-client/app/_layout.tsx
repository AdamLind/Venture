import {useEffect} from "react";
import {DarkTheme, DefaultTheme, ThemeProvider} from "@react-navigation/native";
import {useFonts} from "expo-font";
import {Stack, useRouter, useSegments} from "expo-router";
import {StatusBar} from "expo-status-bar";
import "react-native-reanimated";
import "../global.css";
import Toast, {ToastConfig} from "react-native-toast-message";
import {View, Text} from "react-native";

import {useColorScheme} from "@/hooks/useColorScheme";
import {AuthProvider, useAuth} from "../src/providers/AuthProvider";

// --- CREATE YOUR CUSTOM TOAST THEMES ---
const toastConfig: ToastConfig = {
  // Override the default 'error' toast
  error: ({text1, text2}) => (
    <View className="w-[90%] bg-zinc-900 border border-red-900/50 rounded-2xl p-4 shadow-2xl flex-row items-center">
      <View className="flex-1">
        <Text className="text-red-400 font-bold text-base mb-0.5">{text1}</Text>
        {text2 && (
          <Text className="text-zinc-400 text-sm font-medium">{text2}</Text>
        )}
      </View>
    </View>
  ),

  // Override the default 'success' toast
  success: ({text1, text2}) => (
    <View className="w-[90%] bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl flex-row items-center">
      <View className="flex-1">
        <Text className="text-white font-bold text-base mb-0.5">{text1}</Text>
        {text2 && (
          <Text className="text-zinc-400 text-sm font-medium">{text2}</Text>
        )}
      </View>
    </View>
  ),
};

// --- THE TRAFFIC COP ---
// We moved your original layout into this component so it has access to the useAuth hook
function InitialLayout() {
  const {session, initialized} = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  // The Reactive Auth Routing Logic
  useEffect(() => {
    // Wait until fonts load AND Supabase checks for a token
    if (!initialized || !loaded) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (session && inAuthGroup) {
      // ✅ Logged in but stuck on login screen -> push to tabs
      router.replace("/(tabs)/explore");
    } else if (!session && !inAuthGroup) {
      // ❌ Not logged in but trying to see the app -> push to login
      router.replace("/(auth)/login");
    }
  }, [session, initialized, segments, loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* ADDED: Auth Group (hides the header for the login screen) */}
        <Stack.Screen name="(auth)/login" options={{headerShown: false}} />

        {/* Tabs Group */}
        <Stack.Screen name="(tabs)" options={{headerShown: false, title: ""}} />

        {/* THE NEW SLIDING FORM MODAL */}
        <Stack.Screen
          name="plan/index"
          options={{
            presentation: "modal",
            headerShown: false,
          }}
        />

        {/* CREATE SCREEN */}
        <Stack.Screen
          name="create/index"
          options={{
            title: "New Date Idea",
            headerShown: true,
            presentation: "modal",
          }}
        />

        {/* BUILDER SCREEN */}
        <Stack.Screen
          name="builder/index"
          options={{animation: "fade", title: "Build Your Activity"}}
        />

        {/* ACTIVE DATE SCREEN */}
        <Stack.Screen
          name="active-date/index"
          options={{headerShown: false, animation: "slide_from_bottom"}}
        />

        {/* Not Found Screen */}
        <Stack.Screen name="+not-found" />
      </Stack>

      <StatusBar style="light" />
      <Toast config={toastConfig} />
    </ThemeProvider>
  );
}

// --- THE ROOT PROVIDER ---
// Wraps your app in the AuthContext so useAuth() works everywhere
export default function RootLayout() {
  return (
    <AuthProvider>
      <InitialLayout />
    </AuthProvider>
  );
}
