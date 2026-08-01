import {
  ActionIcon,
  Button,
  Menu,
  NumberInput,
  Select,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  Binary,
  ChevronDown,
  Copy,
  GripVertical,
  ListPlus,
  Plus,
  Trash2,
} from "lucide-react";
import { useState, type DragEvent } from "react";
import {
  expandDataPatternSegments,
  type DataPatternSegment,
} from "../domain/timing";

interface DataPatternEditorProps {
  pattern: string[];
  segments?: DataPatternSegment[];
  onChange: (
    pattern: string[],
    segments: DataPatternSegment[],
  ) => void;
}

type RangeDraft = {
  id: string;
  kind: "range";
  prefix: string;
  from: string;
  to: string;
  step: string;
  repeat: string;
};

type LogicDraft = {
  id: string;
  kind: "logic";
  values: string;
  repeat: string;
};

type SymbolsDraft = {
  id: string;
  kind: "symbols";
  values: string;
  repeat: string;
};

type SegmentDraft = RangeDraft | LogicDraft | SymbolsDraft;
type SegmentKind = SegmentDraft["kind"];

const newId = () => crypto.randomUUID();

function createDraft(kind: SegmentKind): SegmentDraft {
  if (kind === "range") {
    return {
      id: newId(),
      kind,
      prefix: "D",
      from: "0",
      to: "7",
      step: "1",
      repeat: "1",
    };
  }
  if (kind === "logic") {
    return {
      id: newId(),
      kind,
      values: "01",
      repeat: "4",
    };
  }
  return {
    id: newId(),
    kind,
    values: "IDLE READ",
    repeat: "1",
  };
}

function toDraft(segment: DataPatternSegment): SegmentDraft {
  if (segment.kind === "range") {
    return {
      ...segment,
      from: String(segment.from),
      to: String(segment.to),
      step: String(segment.step),
      repeat: String(segment.repeat ?? segment.each ?? 1),
    };
  }
  return { ...segment, repeat: String(segment.repeat) };
}

function errorsFor(segment: SegmentDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const positiveInteger = (value: string) =>
    /^\d+$/.test(value) && Number(value) > 0;

  if (segment.kind === "range") {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment.prefix)) {
      errors.prefix = "Invalid";
    }
    if (!/^-?\d+$/.test(segment.from)) errors.from = "Invalid";
    if (!/^-?\d+$/.test(segment.to)) errors.to = "Invalid";
    if (
      !errors.from &&
      !errors.to &&
      Number(segment.to) < Number(segment.from)
    ) {
      errors.to = "Must be ≥ start";
    }
    if (!positiveInteger(segment.step)) errors.step = "Use ≥ 1";
    if (!positiveInteger(segment.repeat)) errors.repeat = "Use ≥ 1";
  } else if (segment.kind === "logic") {
    if (!/^[01XxZz]+$/.test(segment.values)) {
      errors.values = "Only 0, 1, X, Z";
    }
    if (!positiveInteger(segment.repeat)) errors.repeat = "Use ≥ 1";
  } else {
    if (!segment.values.trim()) errors.values = "Required";
    if (
      segment.values
        .split(/[\s,;|]+/)
        .filter(Boolean)
        .some((token) => !/^[A-Za-z0-9_+-]+$/.test(token))
    ) {
      errors.values = "Invalid token";
    }
    if (!positiveInteger(segment.repeat)) errors.repeat = "Use ≥ 1";
  }

  return errors;
}

function toSegment(draft: SegmentDraft): DataPatternSegment {
  if (draft.kind === "range") {
    return {
      ...draft,
      prefix: draft.prefix.toUpperCase(),
      from: Number(draft.from),
      to: Number(draft.to),
      step: Number(draft.step),
      repeat: Number(draft.repeat),
    };
  }
  return {
    ...draft,
    values: draft.values.toUpperCase(),
    repeat: Number(draft.repeat),
  };
}

function hasErrors(segments: SegmentDraft[]) {
  return segments.some(
    (segment) => Object.keys(errorsFor(segment)).length > 0,
  );
}

export function DataPatternEditor({
  pattern,
  segments,
  onChange,
}: DataPatternEditorProps) {
  const [drafts, setDrafts] = useState<SegmentDraft[]>(() =>
    segments?.length
      ? segments.map(toDraft)
      : [
          {
            id: newId(),
            kind: "symbols",
            values: pattern.join(" "),
            repeat: "1",
          },
        ],
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const commit = (next: SegmentDraft[]) => {
    setDrafts(next);
    if (next.length === 0 || hasErrors(next)) return;
    const nextSegments = next.map(toSegment);
    onChange(expandDataPatternSegments(nextSegments), nextSegments);
  };

  const patchDraft = (
    id: string,
    patch: Partial<SegmentDraft>,
  ) => {
    commit(
      drafts.map((draft) =>
        draft.id === id
          ? ({ ...draft, ...patch } as SegmentDraft)
          : draft,
      ),
    );
  };

  const changeKind = (id: string, kind: SegmentKind) => {
    const replacement = { ...createDraft(kind), id };
    commit(
      drafts.map((draft) => (draft.id === id ? replacement : draft)),
    );
  };

  const addSegment = (kind: SegmentKind) => {
    commit([...drafts, createDraft(kind)]);
  };

  const duplicateSegment = (id: string) => {
    const index = drafts.findIndex((draft) => draft.id === id);
    if (index < 0) return;
    const next = [...drafts];
    next.splice(index + 1, 0, { ...drafts[index], id: newId() });
    commit(next);
  };

  const removeSegment = (id: string) => {
    if (drafts.length === 1) return;
    commit(drafts.filter((draft) => draft.id !== id));
  };

  const moveSegment = (id: string, offset: number) => {
    const from = drafts.findIndex((draft) => draft.id === id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= drafts.length) return;
    const next = [...drafts];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
  };

  const dropSegment = (
    event: DragEvent<HTMLDivElement>,
    targetId: string,
  ) => {
    event.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const next = [...drafts];
    const from = next.findIndex((draft) => draft.id === draggedId);
    const to = next.findIndex((draft) => draft.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="pattern-editor">
      <div className="pattern-segment-list">
        {drafts.map((segment, index) => {
          const errors = errorsFor(segment);
          return (
            <div
              key={segment.id}
              className={[
                "pattern-segment",
                segment.id === dragOverId ? "drag-over" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverId(segment.id);
              }}
              onDrop={(event) => dropSegment(event, segment.id)}
            >
              <div className="segment-toolbar">
                <ActionIcon
                  className="segment-grip"
                  variant="subtle"
                  color="gray"
                  size={28}
                  draggable
                  aria-label={`Reorder segment ${index + 1}`}
                  onDragStart={() => setDraggedId(segment.id)}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.altKey && event.key === "ArrowUp") {
                      event.preventDefault();
                      moveSegment(segment.id, -1);
                    }
                    if (event.altKey && event.key === "ArrowDown") {
                      event.preventDefault();
                      moveSegment(segment.id, 1);
                    }
                  }}
                >
                  <GripVertical size={15} aria-hidden="true" />
                </ActionIcon>
                <span className="segment-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Select
                  className="segment-kind-select"
                  value={segment.kind}
                  data={[
                    { value: "range", label: "Range" },
                    { value: "logic", label: "Logic" },
                    { value: "symbols", label: "Symbols" },
                  ]}
                  allowDeselect={false}
                  withCheckIcon={false}
                  size="xs"
                  aria-label={`Segment ${index + 1} type`}
                  comboboxProps={{ shadow: "md" }}
                  onChange={(value) =>
                    value && changeKind(segment.id, value as SegmentKind)
                  }
                />
                <div className="segment-actions">
                  <Tooltip label="Duplicate segment">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      aria-label={`Duplicate segment ${index + 1}`}
                      onClick={() => duplicateSegment(segment.id)}
                    >
                      <Copy size={13} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete segment">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      disabled={drafts.length === 1}
                      aria-label={`Delete segment ${index + 1}`}
                      onClick={() => removeSegment(segment.id)}
                    >
                      <Trash2 size={13} />
                    </ActionIcon>
                  </Tooltip>
                </div>
              </div>

              {segment.kind === "range" && (
                <div className="segment-fields range-fields">
                  <SegmentField label="Prefix" error={errors.prefix}>
                    <TextInput
                      value={segment.prefix}
                      aria-label="Range prefix"
                      error={Boolean(errors.prefix)}
                      size="xs"
                      onChange={(event) =>
                        patchDraft(segment.id, { prefix: event.target.value })
                      }
                    />
                  </SegmentField>
                  <SegmentField label="From" error={errors.from}>
                    <NumberInput
                      value={segment.from}
                      aria-label="Range start"
                      error={Boolean(errors.from)}
                      size="xs"
                      allowDecimal={false}
                      hideControls
                      onChange={(value) =>
                        patchDraft(segment.id, { from: String(value) })
                      }
                    />
                  </SegmentField>
                  <SegmentField label="To" error={errors.to}>
                    <NumberInput
                      value={segment.to}
                      aria-label="Range end"
                      error={Boolean(errors.to)}
                      size="xs"
                      allowDecimal={false}
                      hideControls
                      onChange={(value) =>
                        patchDraft(segment.id, { to: String(value) })
                      }
                    />
                  </SegmentField>
                  <SegmentField label="Step" error={errors.step}>
                    <NumberInput
                      value={segment.step}
                      aria-label="Range step"
                      error={Boolean(errors.step)}
                      size="xs"
                      allowDecimal={false}
                      hideControls
                      onChange={(value) =>
                        patchDraft(segment.id, { step: String(value) })
                      }
                    />
                  </SegmentField>
                  <SegmentField label="Repeat" error={errors.repeat}>
                    <NumberInput
                      value={segment.repeat}
                      aria-label="Range repeat count"
                      error={Boolean(errors.repeat)}
                      size="xs"
                      allowDecimal={false}
                      hideControls
                      onChange={(value) =>
                        patchDraft(segment.id, { repeat: String(value) })
                      }
                    />
                  </SegmentField>
                </div>
              )}

              {segment.kind === "logic" && (
                <div className="segment-fields two-fields">
                  <SegmentField label="Pattern" error={errors.values}>
                    <TextInput
                      value={segment.values}
                      placeholder="01XZ"
                      aria-label="Logic pattern"
                      error={Boolean(errors.values)}
                      size="xs"
                      onChange={(event) =>
                        patchDraft(segment.id, { values: event.target.value })
                      }
                    />
                  </SegmentField>
                  <SegmentField label="Repeat" error={errors.repeat}>
                    <NumberInput
                      value={segment.repeat}
                      aria-label="Logic repeat count"
                      error={Boolean(errors.repeat)}
                      size="xs"
                      allowDecimal={false}
                      hideControls
                      onChange={(value) =>
                        patchDraft(segment.id, { repeat: String(value) })
                      }
                    />
                  </SegmentField>
                </div>
              )}

              {segment.kind === "symbols" && (
                <div className="segment-fields symbols-fields">
                  <SegmentField label="Values" error={errors.values}>
                    <TextInput
                      value={segment.values}
                      placeholder="IDLE READ D0"
                      aria-label="Symbol values"
                      error={Boolean(errors.values)}
                      size="xs"
                      onChange={(event) =>
                        patchDraft(segment.id, { values: event.target.value })
                      }
                    />
                  </SegmentField>
                  <SegmentField label="Repeat" error={errors.repeat}>
                    <NumberInput
                      value={segment.repeat}
                      aria-label="Symbol repeat count"
                      error={Boolean(errors.repeat)}
                      size="xs"
                      allowDecimal={false}
                      hideControls
                      onChange={(value) =>
                        patchDraft(segment.id, { repeat: String(value) })
                      }
                    />
                  </SegmentField>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Menu shadow="md" width={180} position="bottom-start">
        <Menu.Target>
          <Button
            fullWidth
            variant="light"
            leftSection={<Plus size={15} />}
            rightSection={<ChevronDown size={14} />}
            className="add-segment-button"
          >
            Add segment
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<ListPlus size={15} />}
            onClick={() => addSegment("range")}
          >
            Range
          </Menu.Item>
          <Menu.Item
            leftSection={<Binary size={15} />}
            onClick={() => addSegment("logic")}
          >
            Logic
          </Menu.Item>
          <Menu.Item
            leftSection={<Plus size={15} />}
            onClick={() => addSegment("symbols")}
          >
            Symbols
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

function SegmentField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="segment-field">
      <span>{label}</span>
      {children}
      {error && <small role="alert">{error}</small>}
    </label>
  );
}
