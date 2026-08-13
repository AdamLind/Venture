import {useEffect, useState} from "react";
import {Text} from "react-native";

export default function Greeting() {
  const [greeting, setGreeting] = useState("");

  const currentHours = new Date().getHours();
  // On mount check current time and format greeting appropriately.
  useEffect(() => {
    if (currentHours >= 5 && currentHours < 12) {
      setGreeting("Good Morning, Adam");
    } else if (currentHours >= 12 && currentHours < 17) {
      setGreeting("Good Afternoon, Adam");
    } else if (currentHours >= 17 && currentHours < 21) {
      setGreeting("Good Evening, Adam");
    } else {
      setGreeting("Good Night, Adam");
    }
  }, []);

  return (
    <Text className="text-zinc-400 font-semibold text-sm uppercase tracking-wider mb-1">
      {greeting}
    </Text>
  );
}
