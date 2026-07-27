import { NumberInput, SegmentedControl } from "@mantine/core";
import { useId, useState } from "react";
import { degreesToPs, psToDegrees } from "../domain/timing";

interface ConvertibleTimeInputProps {
  label: string;
  valuePs: number;
  referencePeriodPs: number;
  onChange: (valuePs: number) => void;
  description?: string;
}

export function ConvertibleTimeInput({
  label,
  valuePs,
  referencePeriodPs,
  onChange,
  description,
}: ConvertibleTimeInputProps) {
  const [unit, setUnit] = useState<"ps" | "deg">("deg");
  const labelId = useId();
  const displayedValue =
    unit === "ps" ? valuePs : psToDegrees(valuePs, referencePeriodPs);

  return (
    <div className="compound-field">
      <div className="compound-field-label">
        <div>
          <label id={labelId}>{label}</label>
          {description && <small>{description}</small>}
        </div>
        <SegmentedControl
          size="xs"
          value={unit}
          onChange={(value) => setUnit(value as "ps" | "deg")}
          data={[
            { label: "ps", value: "ps" },
            { label: "phase", value: "deg" },
          ]}
          aria-label={`${label} input unit`}
        />
      </div>
      <NumberInput
        aria-labelledby={labelId}
        value={Number(displayedValue.toFixed(3))}
        step={unit === "ps" ? 25 : 5}
        suffix={unit === "ps" ? " ps" : "°"}
        onChange={(value) => {
          const numeric = Number(value) || 0;
          onChange(
            unit === "ps"
              ? numeric
              : degreesToPs(numeric, referencePeriodPs),
          );
        }}
      />
    </div>
  );
}
