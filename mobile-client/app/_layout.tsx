import {DarkTheme, DefaultTheme, ThemeProvider} from "@react-navigation/native";
import {useFonts} from "expo-font";
import {Stack} from "expo-router";
import {StatusBar} from "expo-status-bar";
import "react-native-reanimated";
import "../global.css";
import Toast, {ToastConfig} from "react-native-toast-message";
import {View, Text} from "react-native"; // <-- Import View and Text

import {useColorScheme} from "@/hooks/useColorScheme";

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

  // Override the default 'success' toast (for later use)
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

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* Tabs Group */}
        <Stack.Screen name="(tabs)" options={{headerShown: false, title: ""}} />

        {/* THE NEW SLIDING FORM MODAL */}
        <Stack.Screen
          name="plan"
          options={{
            presentation: "modal", // Tells iOS to slide it up as a card!
            headerShown: false,
          }}
        />

        {/* DETAIL SCREEN */}
        <Stack.Screen
          name="detail/[id]"
          options={{
            title: "Edit Date Idea",
            headerShown: true,
            presentation: "modal",
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

      {/* Pass your custom config into the Toast provider */}
      <Toast config={toastConfig} />
    </ThemeProvider>
  );
}
