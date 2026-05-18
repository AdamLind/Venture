import React, {useState, useEffect} from "react";
import {Text, View} from "react-native";

const CountdownTimer = ({targetTime}: {targetTime: number}) => {
  const [timeLeft, setTimeLeft] = useState(targetTime - Date.now());

  useEffect(() => {
    // 1. Set up the interval to run every 1 second (1000ms)
    const intervalId = setInterval(() => {
      const remaining = targetTime - Date.now();

      // 2. Stop the timer if it hits zero
      if (remaining <= 0) {
        clearInterval(intervalId);
        setTimeLeft(0);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    // 3. Cleanup function to clear interval when component unmounts
    return () => clearInterval(intervalId);
  }, [targetTime]);

  // Helper function to format milliseconds into HH:MM:SS
  const formatTime = (ms: number) => {
    if (ms <= 0) return "00:00";

    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

    // Pad single digits with a leading zero
    const pad = (num: number) => num.toString().padStart(2, "0");

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  return (
    <View>
      <Text className="text-white text-center">Plans Start in</Text>
      <Text className="text-white text-center text-lg">{formatTime(timeLeft)}</Text>
    </View>
  );
};

export default CountdownTimer;
