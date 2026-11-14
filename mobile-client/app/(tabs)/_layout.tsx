import {Tabs, useRouter} from "expo-router";
import React from "react";
import {Platform, Pressable, StyleSheet} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import ActiveDateBanner from "@/components/ActiveDateBanner";

export default function TabLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // <-- Gets the exact size of the Pro Max swipe bar

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: "#ffffff",
          tabBarInactiveTintColor: "#52525b",

          tabBarItemStyle: {
            justifyContent: "center",
            alignItems: "center",
          },

          tabBarStyle: {
            backgroundColor: "#000000",
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: "#27272a",

            paddingTop: 10,
            paddingHorizontal: 16,

            paddingBottom: Platform.OS === "ios" ? insets.bottom : 10,

            height: Platform.OS === "ios" ? 40 + insets.bottom : 70,
          },
        }}
      >
        <Tabs.Screen
          name="explore"
          options={{
            title: "Explore",
            tabBarIcon: ({color, focused}) => (
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={28}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="feed"
          options={{
            title: "Feed",
            tabBarIcon: ({color, focused}) => (
              <Ionicons
                name={focused ? "people" : "people-outline"}
                size={28}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="plan"
          options={{
            title: "Plan",
            tabBarIcon: ({color, focused}) => (
              <Ionicons
                name={focused ? "add-circle" : "add-circle-outline"}
                size={28}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="activity"
          options={{
            title: "Activity",
            tabBarIcon: ({color, focused}) => (
              <Ionicons
                name={focused ? "calendar" : "calendar-outline"}
                size={28}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({color, focused}) => (
              <Ionicons
                name={focused ? "person-circle" : "person-circle-outline"}
                size={28}
                color={color}
              />
            ),
          }}
        />
      </Tabs>

      <ActiveDateBanner />
    </>
  );
}
