import { NumberInput, type NumberInputProps } from "@mantine/core";
import { useState } from "react";

type Props = Omit<NumberInputProps, "value" | "onChange"> & {
  value: number;
  onChange: (value: number) => void;
};

/** Keep incomplete edits in the field while publishing every valid number. */
export function LiveNumberInput({ value, onChange, onBlur, ...props }: Props) {
  const [draft, setDraft] = useState<string | number | null>(null);

  return <NumberInput {...props} value={draft ?? value}
    onChange={(next) => {
      setDraft(next);
      if (next === "" || next === "-" || next === "." || next === "-.") return;
      const numeric = Number(next);
      if (Number.isFinite(numeric)) onChange(numeric);
    }}
    onBlur={(event) => {
      setDraft(null);
      onBlur?.(event);
    }} />;
}
