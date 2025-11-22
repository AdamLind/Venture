import {Dispatch, SetStateAction, useMemo, useState} from "react";
import {TextInput} from "react-native";

export default function BudgetCountInput({
  budget,
  setBudget,
  ref,
}: {
  budget: number | null;
  setBudget: Dispatch<SetStateAction<number | null>>;
  ref: React.RefObject<TextInput | null>;
}) {
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [rawBudget, setRawBudget] = useState<string>("");

  // --- Utility Function for Formatting ---
  const formatCurrency = (number: number | null): string => {
    if (number === null || number === 0 || isNaN(number)) {
      return "";
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number);
  };

  // --- Handlers ---

  const handleTextChange = (text: string) => {
    // Clean the input string (allow only digits and one decimal)
    let rawNumberString = text.replace(/[^0-9.]/g, "");
    const parts = rawNumberString.split(".");
    if (parts.length > 2) {
      rawNumberString = `${parts[0]}.${parts.slice(1).join("")}`;
    }
    const integerPart = parts[0];
    const maxIntLength = 7; // Max value will be 9,999,999

    if (integerPart.length > maxIntLength) {
      // If the new input exceeds the limit, IGNORE the change
      // and keep the current rawBudget state.
      return;
    }

    setRawBudget(rawNumberString);
  };

  const handleBlur = () => {
    setIsEditingBudget(false);

    // Update the parent's budget state ONLY on blur.
    const number = parseFloat(rawBudget);

    // Set the final number to the parent state. Use null if NaN (empty/invalid input)
    setBudget(isNaN(number) ? null : number);

    // Optional: Re-sync rawBudget to display the final formatted number on blur,
    // although the value prop handles this.
  };

  // --- Display Value Memo ---
  const formattedDisplayBudget = useMemo(() => {
    // Show the formatted currency value from the PARENT state when not editing.
    return formatCurrency(budget);
  }, [budget]);

  return (
    <TextInput
      ref={ref}
      keyboardType="numeric"
      placeholder="Budget"
      // Show rawBudget when focused, show formattedBudget when blurred
      value={isEditingBudget ? rawBudget : formattedDisplayBudget}
      onChangeText={handleTextChange}
      onFocus={() => setIsEditingBudget(true)}
      onBlur={handleBlur}
      className="bg-gray-800 flex-1 h-[50px] rounded-lg border border-gray-500 text-white text-[20px] font-semibold"
      style={{textAlign: "center"}}
    />
  );
}
