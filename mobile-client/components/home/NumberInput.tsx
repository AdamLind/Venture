import {TextInput} from "react-native";
import { Dispatch, SetStateAction, useState } from "react";

export default function NumberInput({
  ref,
  headCount,
  setHeadCount,
  placeholder
}: {
  ref: React.RefObject<TextInput | null>;
  headCount: number;
  setHeadCount: Dispatch<SetStateAction<number>>;
  placeholder: string;
}) {
  const [displayValue, setDisplayValue] = useState<string>(headCount && headCount > 0 ? headCount.toString() : "");

  return (
    <TextInput
      ref={ref}
      keyboardType="numeric"
      placeholder={placeholder}
      value={displayValue && parseInt(displayValue) > 0 ? displayValue : ""}
      clearTextOnFocus={true}
      onChangeText={(text) => setDisplayValue(text)}
      onBlur={() => {
        if (displayValue === null || isNaN(parseInt(displayValue))) {
          setDisplayValue(headCount.toString()); // Default to headCount if input is invalid
        } else {
          setHeadCount(parseInt(displayValue));
        }
      }}
      className="bg-gray-800 flex-1 h-[50px] rounded-lg border border-gray-500 text-white text-[20px] font-semibold"
      style={{textAlign: "center"}}
    />
  );
}
