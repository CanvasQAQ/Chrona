import { NumberInput, SegmentedControl, Select } from "@mantine/core";
import { useId, useState } from "react";
import {
  displayValueToPeriodPs,
  frequencyToPeriodPs,
  periodPsToFrequency,
  periodToDisplayValue,
  type FrequencyUnit,
  type PeriodUnit,
} from "../domain/timing";

interface RateInputProps {
  label?: string;
  periodPs: number;
  onChange: (periodPs: number) => void;
}

export function RateInput({
  label = "Period / Frequency",
  periodPs,
  onChange,
}: RateInputProps) {
  const [mode, setMode] = useState<"period" | "frequency">("frequency");
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>("ps");
  const [frequencyUnit, setFrequencyUnit] = useState<FrequencyUnit>("GHz");
  const labelId = useId();
  const unit = mode === "period" ? periodUnit : frequencyUnit;
  const value =
    mode === "period"
      ? periodToDisplayValue(periodPs, periodUnit)
      : periodPsToFrequency(periodPs, frequencyUnit);

  return (
    <div className="compound-field">
      <div className="compound-field-label">
        <label id={labelId}>{label}</label>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(next) => setMode(next as "period" | "frequency")}
          data={[
            { label: "Period", value: "period" },
            { label: "Freq", value: "frequency" },
          ]}
          aria-label={`${label} input mode`}
        />
      </div>
      <div className="rate-input-row">
        <NumberInput
          aria-labelledby={labelId}
          value={Number(value.toFixed(6))}
          min={Number.EPSILON}
          step={mode === "period" ? (periodUnit === "ps" ? 50 : 0.05) : 0.1}
          onChange={(next) => {
            const numeric = Math.max(Number.EPSILON, Number(next) || 0);
            onChange(
              mode === "period"
                ? displayValueToPeriodPs(numeric, periodUnit)
                : frequencyToPeriodPs(numeric, frequencyUnit),
            );
          }}
        />
        <Select
          aria-label={`${label} unit`}
          value={unit}
          allowDeselect={false}
          data={mode === "period" ? ["ps", "ns"] : ["MHz", "GHz"]}
          onChange={(next) => {
            if (!next) return;
            if (mode === "period") setPeriodUnit(next as PeriodUnit);
            else setFrequencyUnit(next as FrequencyUnit);
          }}
        />
      </div>
      <div className="conversion-readout">
        {mode === "period"
          ? `= ${periodPsToFrequency(periodPs, "GHz").toFixed(4)} GHz`
          : `= ${periodToDisplayValue(periodPs, "ps").toFixed(2)} ps`}
      </div>
    </div>
  );
}
