import {Redirect} from "expo-router";

export default function RootIndex() {
  // Instantly redirects the user to your new Explore tab when the app opens
  return <Redirect href="/(tabs)/explore" />;
}
