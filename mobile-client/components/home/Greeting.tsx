import {useEffect, useState} from "react";
import {Text} from "react-native";

export default function Greeting() {
  const [greeting, setGreeting] = useState("");

  const currentHours = new Date().getHours();
  // On mount check current time and format greeting appropriately.
  useEffect(() => {
    if (currentHours >= 5 && currentHours < 12) {
      setGreeting("Good Morning");
    } else if (currentHours >= 12 && currentHours < 17) {
      setGreeting("Good Afternoon");
    } else if (currentHours >= 17 && currentHours < 21) {
      setGreeting("Good Evening");
    } else {
      setGreeting("Good Night");
    }
  }, []);

  return (
    <Text className="text-white font-bold text-3xl">{greeting}</Text>
  );
}
