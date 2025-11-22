import {TextInput} from "react-native";
import { Dispatch, SetStateAction } from "react";

export default function NumberInput({
  ref,
  headCount,
  setHeadCount,
  placeholder
}: {
  ref: React.RefObject<TextInput | null>;
  headCount: number | null;
  setHeadCount: Dispatch<SetStateAction<number | null>>;
  placeholder: string;
}) {
  return (
    <TextInput
      ref={ref}
      keyboardType="numeric"
      placeholder={placeholder}
      value={headCount?.toString()}
      onChangeText={(text) => setHeadCount(parseInt(text) || null)}
      className="bg-gray-800 flex-1 h-[50px] rounded-lg border border-gray-500 text-white text-[20px] font-semibold"
      style={{textAlign: "center"}}
    />
  );
}
