import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import "../global.css"

import { useColorScheme } from '@/hooks/useColorScheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* 1. Tabs Group: This is your tab-based navigation. 
             It will show the tab bar at the bottom. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* 2. DETAIL SCREEN: This screen is INDEPENDENT of the tabs. 
             It will slide in and cover the entire screen, including the tab bar. */}
        <Stack.Screen 
          name="detail/[id]" 
          options={{ 
            title: 'Edit Date Idea',
            headerShown: true,
            presentation: 'modal', // Recommended presentation style
          }} 
        />

        {/* 3. CREATE SCREEN: Also independent of the tabs. */}
        <Stack.Screen 
          name="create/index" 
          options={{ 
            title: 'New Date Idea',
            headerShown: true,
            presentation: 'modal',
          }} 
        />

        {/* 4. Not Found Screen */}
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}