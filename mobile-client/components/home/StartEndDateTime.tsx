import DateTimePicker from "@react-native-community/datetimepicker";
import {Dispatch, SetStateAction, useState} from "react";
import {
  Modal,
  Pressable,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";

export default function StartEndDateTime({
  // Destructured variables
  start,
  end,
  showEndPicker,
  setStart,
  setEnd,
  setShowEndPicker,
}: {
  start: Date;
  end: Date | null;
  showEndPicker: boolean;
  setStart: Dispatch<SetStateAction<Date>>;
  setEnd: Dispatch<SetStateAction<Date | null>>;
  setShowEndPicker: Dispatch<SetStateAction<boolean>>;
}) {
  const [showStartPicker, setShowStartPicker] = useState(false);
  const currentTime = new Date();
  const minEndDate = start || currentTime;

  const formatDate = (date: Date) => {
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "short", // e.g., 11
      day: "numeric", // e.g., 4
    });

    // ⏰ Format: H:MM:SS AM/PM
    const formattedTime = date.toLocaleTimeString("en-US", {
      hour: "2-digit", // e.g., 08
      minute: "2-digit", // e.g., 29
      hour12: true, // Display AM/PM
    });

    return `${formattedDate}, ${formattedTime}`;
  };

  const onStartChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || start; // Use the selected date or the current date
    setStart(currentDate); // Update the state with the new date
  };

  const onEndDateChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || start; // Use the selected date or the current date
    setEnd(currentDate); // Update the state with the new date
  };

  return (
    <View className="flex flex-col justify-center">
      <Modal
        animationType="fade" // Or "slide"
        transparent={true}
        visible={showStartPicker}
        onRequestClose={() => {
          // This is for Android back button behavior
          setShowStartPicker(false);
        }}
      >
        <TouchableWithoutFeedback
          // This is the outer click-off area
          onPress={() => setShowStartPicker(false)}
        >
          <View
            style={{
              flex: 1, // Use flex: 1 instead of absolute positioning for full coverage in Modal
              backgroundColor: "rgba(0, 0, 0, 0.9)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text className="text-white text-[20px] mb-5">Pick Start Time</Text>
            <TouchableWithoutFeedback>
              {/* Inner TWF stops propagation on the picker itself */}
              <DateTimePicker
                value={start}
                mode="datetime"
                display="spinner"
                minimumDate={currentTime}
                onChange={onStartChange}
              />
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <Pressable
        className="bg-gray-800 w-full h-[50px] rounded-t-lg border border-gray-500 border-b-0 items-center justify-center"
        onPress={() => setShowStartPicker(true)}
      >
        <Text className="text-center align-center text-white font-semibold text-[20px]">
          {formatDate(start)}
        </Text>
      </Pressable>
      <View className="w-full border-t border-gray-500"></View>
      <Modal
        animationType="fade" // Or "slide"
        transparent={true}
        visible={showEndPicker}
        onRequestClose={() => {
          // This is for Android back button behavior
          setShowEndPicker(false);
        }}
      >
        <TouchableWithoutFeedback
          // This is the outer click-off area
          onPress={() => setShowEndPicker(false)}
        >
          <View
            style={{
              flex: 1, // Use flex: 1 instead of absolute positioning for full coverage in Modal
              backgroundColor: "rgba(0, 0, 0, 0.9)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text className="text-white text-[20px] mb-5">Pick End Time</Text>

            <TouchableWithoutFeedback>
              <DateTimePicker
                value={end || start}
                mode="datetime"
                display="spinner"
                minimumDate={minEndDate}
                onChange={onEndDateChange}
              />
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <Pressable
        className="bg-gray-800 w-full h-[50px] rounded-b-lg border border-gray-500 border-t-0 justify-center items-center"
        onPress={() => setShowEndPicker(true)}
      >
        <Text
          className={`text-center align-center font-semibold text-[20px] ${
            end ? "text-white" : "text-gray-500"
          }`}
        >
          {end ? formatDate(end) : "Until"}
        </Text>
      </Pressable>
    </View>
  );
}
