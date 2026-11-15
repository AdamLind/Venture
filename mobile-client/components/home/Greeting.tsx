import {Text} from "react-native";

import {useProfileStore} from "@/src/store/useProfileStore";

function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 21) return "Good Evening";
  return "Good Night";
}

/** "Good Evening, Adam" (or just "Good Evening" without a first name). */
export function useGreeting() {
  const firstName = useProfileStore((s) => s.profile?.first_name?.trim());
  const greeting = greetingFor(new Date().getHours());
  return firstName ? `${greeting}, ${firstName}` : greeting;
}

export default function Greeting() {
  const text = useGreeting();

  return (
    <Text
      className="text-zinc-400 font-semibold text-sm uppercase tracking-wider mb-1"
      numberOfLines={1}
      maxFontSizeMultiplier={1.2}
    >
      {text}
    </Text>
  );
}
