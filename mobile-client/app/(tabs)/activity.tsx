import {Image} from "expo-image";
import {Platform, StyleSheet, View} from "react-native";

import {HelloWave} from "@/components/HelloWave";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import {ThemedText} from "@/components/ThemedText";
import {ThemedView} from "@/components/ThemedView";

export default function ActivityScreen() {
  return (
    <View style={styles.container}>
      <ThemedText type="title">Your Activity</ThemedText>
      <HelloWave />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
