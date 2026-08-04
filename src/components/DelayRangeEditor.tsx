import { NumberInput, Slider } from "@mantine/core";
import type { DelayRange } from "../domain/timing";

interface DelayRangeEditorProps {
  label: string;
  value: DelayRange;
  onChange: (value: DelayRange) => void;
}

function numeric(value: string | number, fallback: number) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

export function DelayRangeEditor({
  label,
  value,
  onChange,
}: DelayRangeEditorProps) {
  const minimum = Math.max(0, Math.min(value.minPs, value.maxPs));
  const maximum = Math.max(minimum, Math.max(value.minPs, value.maxPs));
  const current = Math.min(maximum, Math.max(minimum, value.currentPs));

  return (
    <fieldset className="delay-range-editor">
      <legend>{label}</legend>
      <div className="delay-range-inputs">
        <NumberInput
          label="Min"
          suffix=" ps"
          min={0}
          value={minimum}
          onChange={(next) => {
            const minPs = Math.max(0, numeric(next, minimum));
            onChange({
              minPs,
              currentPs: Math.max(minPs, current),
              maxPs: Math.max(minPs, maximum),
            });
          }}
        />
        <NumberInput
          label="Current"
          suffix=" ps"
          min={minimum}
          max={maximum}
          value={current}
          onChange={(next) =>
            onChange({
              minPs: minimum,
              currentPs: Math.min(maximum, Math.max(minimum, numeric(next, current))),
              maxPs: maximum,
            })
          }
        />
        <NumberInput
          label="Max"
          suffix=" ps"
          min={minimum}
          value={maximum}
          onChange={(next) => {
            const maxPs = Math.max(minimum, numeric(next, maximum));
            onChange({
              minPs: minimum,
              currentPs: Math.min(maxPs, current),
              maxPs,
            });
          }}
        />
      </div>
      <Slider
        aria-label={`${label} current delay`}
        min={minimum}
        max={Math.max(minimum + 1, maximum)}
        step={Math.max(1, Math.round(Math.max(1, maximum - minimum) / 100))}
        value={current}
        label={(next) => `${Math.round(next)} ps`}
        onChange={(currentPs) =>
          onChange({ minPs: minimum, currentPs, maxPs: maximum })
        }
      />
    </fieldset>
  );
}
