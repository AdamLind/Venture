import {DarkTheme, DefaultTheme, ThemeProvider} from "@react-navigation/native";
import {useFonts} from "expo-font";
import {Stack} from "expo-router";
import {StatusBar} from "expo-status-bar";
import "react-native-reanimated";
import "../global.css";

import {useColorScheme} from "@/hooks/useColorScheme";

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
        {/* 1. Tabs Group */}
        <Stack.Screen name="(tabs)" options={{headerShown: false, title: ""}} />

        {/* 2. DETAIL SCREEN */}
        <Stack.Screen
          name="detail/[id]"
          options={{
            title: "Edit Date Idea",
            headerShown: true,
            presentation: "modal",
          }}
        />

        {/* 3. CREATE SCREEN */}
        <Stack.Screen
          name="create/index"
          options={{
            title: "New Date Idea",
            headerShown: true,
            presentation: "modal",
          }}
        />

        {/* 4. BUILDER SCREEN */}
        <Stack.Screen
          name="builder/index"
          options={{
            animation: "fade",
            title: "Build Your Activity",
          }}
        />

        {/* 5. ACTIVE DATE SCREEN */}
        <Stack.Screen
          name="active-date/index"
          options={{
            headerShown: false, // Let the map take over the screen
            animation: "slide_from_bottom",
          }}
        />

        {/* 6. Not Found Screen */}
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
