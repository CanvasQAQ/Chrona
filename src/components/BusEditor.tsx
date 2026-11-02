import { Button, Checkbox, Modal, SegmentedControl, Select, Textarea, TextInput } from "@mantine/core";
import { LiveNumberInput as NumberInput } from "./LiveNumberInput";
import { Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ConvertibleTimeInput } from "./ConvertibleTimeInput";
import { RateInput } from "./RateInput";
import { busChannelNumber, formatBusName, generateBusPattern, parseBusName, parseBusSelection, parseBusTable } from "../domain/bus";
import type { Bus, BusRule, DataSignal } from "../domain/timing";

interface Props {
  bus: Bus;
  channels: DataSignal[];
  creation?: boolean;
  referencePeriodPs: number;
  onChange: (patch: Partial<Bus>) => void;
  onResize: (width: number) => void;
  onApplyPatterns: (patterns: string[][], indexes: number[], replaceOverrides: boolean, generated: boolean) => void;
}

export function BusEditor({ bus, channels, creation, referencePeriodPs, onChange, onResize, onApplyPatterns }: Props) {
  const derived = channels.length > 0 && channels.every(channel => channel.sourceType === "sequential");
  const [rule, setRule] = useState<BusRule>(bus.rule);
  const [autoTimeStep, setAutoTimeStep] = useState(bus.rule.timeStep === bus.width);
  const [draftWidth, setDraftWidth] = useState(bus.width);
  const [nameDraft, setNameDraft] = useState(formatBusName(bus));
  const [nameError, setNameError] = useState("");
  const [scope, setScope] = useState("all");
  const [replaceOverrides, setReplaceOverrides] = useState(false);
  const [selectionText, setSelectionText] = useState(bus.selectedChannels.join(", "));
  const [table, setTable] = useState("");
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => { setRule(bus.rule); }, [bus.rule]);
  useEffect(() => { setDraftWidth(bus.width); }, [bus.width, bus.id]);
  useEffect(() => { if (!creation) setNameDraft(formatBusName(bus)); }, [bus.name, bus.width, bus.channelFirst, bus.channelStep, bus.id, creation]);
  useEffect(() => { setSelectionText(bus.selectedChannels.join(", ")); }, [bus.selectedChannels]);
  const indexes = scope === "selected" ? bus.selectedChannels : Array.from({ length: bus.width }, (_, index) => index);
  const previewIndexes = indexes.slice(0, 4);
  const validRule = /^[A-Za-z_][A-Za-z0-9_]*$/.test(rule.prefix) &&
    Number.isInteger(rule.start) && Number.isInteger(rule.channelStep) && Number.isInteger(rule.timeStep) &&
    Number.isInteger(rule.length) && rule.length >= 1 && rule.length <= 256;
  const editRule = (next: BusRule) => { setRule(next); if (creation) onChange({ rule: next }); };
  const previewLength = Math.max(1, Math.min(256, Math.trunc(rule.length || 1)));
  const itemAt = (channel: number, slot: number) => `${rule.prefix}${rule.start + channel * rule.channelStep + slot * rule.timeStep}`;
  const previewTable = (full: boolean) => {
    const rows = full ? indexes : previewIndexes;
    const slots = Array.from({ length: full ? previewLength : Math.min(3, previewLength) }, (_, slot) => slot);
    return <div className={`bus-preview-scroll${full ? " is-full" : ""}`} tabIndex={0} aria-label={full ? "All generated data" : "Generated data sample"}>
      <table className="bus-preview-table">
        <thead><tr><th scope="col">Channel ↓</th>{slots.map((slot) => <th key={slot} scope="col">Slot {slot}</th>)}</tr></thead>
        <tbody>{rows.map((index) => <tr key={index}><th scope="row">〈{busChannelNumber(bus, index)}〉</th>{slots.map((slot) => <td key={slot}>{itemAt(index, slot)}</td>)}</tr>)}</tbody>
      </table>
    </div>;
  };

  const applySelection = () => {
    try {
      const selectedChannels = parseBusSelection(selectionText, bus.width);
      if (!selectedChannels.length) throw new Error("Select at least one channel");
      onChange({ selectedChannels, displayMode: "selected" });
      setError("");
    } catch (cause) { setError((cause as Error).message); }
  };

  const applyRule = () => {
    if (!validRule) { setError("Enter a valid prefix, integers, and length 1–256"); return; }
    if (scope === "all") onChange({ rule });
    onApplyPatterns(indexes.map((index) => generateBusPattern(rule, index)), indexes, replaceOverrides, true);
    setError("");
  };

  const applyTable = () => {
    try {
      const patterns = parseBusTable(table, indexes.length);
      onApplyPatterns(patterns, indexes, replaceOverrides, false);
      setError("");
    } catch (cause) { setError((cause as Error).message); }
  };

  const applyName = () => {
    const input = nameDraft.trim();
    const range = parseBusName(input);
    if (!range && (!input || /[<>]/.test(input))) {
      setNameError("Enter a name such as DATA<10:4> or a plain name.");
      return;
    }
    if (range && range.width !== bus.width) {
      setNameError(`This range has ${range.width} channels. Set width to ${range.width} first, then apply the name.`);
      return;
    }
    onChange(range ? { name: range.name, channelFirst: range.channelFirst, channelStep: range.channelStep } : { name: input });
    setNameError("");
  };

  return <div className="bus-editor">
    <section className="property-section">
      <div className="section-title"><span>Bus</span><span className="section-index">01</span></div>
      <TextInput label="Bus name and bit range" description={creation ? "For example DATA<10:4> creates channels 10 through 4." : "Edit the complete name. A new range must match the current width."} value={nameDraft} onChange={(event) => {
        const name = event.currentTarget.value;
        setNameDraft(name);
        setNameError("");
        if (!creation) return;
        const range = creation ? parseBusName(name) : null;
        if (range) {
          onChange({ name: range.name, channelFirst: range.channelFirst, channelStep: range.channelStep });
          onResize(range.width);
          if (autoTimeStep) editRule({ ...rule, timeStep: range.width });
        } else onChange({ name });
      }} onKeyDown={(event) => { if (!creation && event.key === "Enter") applyName(); }} />
      {!creation && <Button size="xs" variant="light" disabled={nameDraft.trim() === formatBusName(bus)} onClick={applyName}>Apply name</Button>}
      {nameError && <p role="alert" className="sequential-error">{nameError}</p>}
      <NumberInput label="Channels / width" min={1} max={256} disabled={derived} value={draftWidth} onChange={(value) => { const width = Number(value); setDraftWidth(width); if (creation) { onResize(width); if (autoTimeStep) editRule({ ...rule, timeStep: width }); } }} />
      {!creation && !derived && draftWidth !== bus.width && <Button size="xs" variant="light" disabled={!Number.isInteger(draftWidth) || draftWidth < 1 || draftWidth > 256} onClick={() => onResize(draftWidth)}>Apply width</Button>}
      {derived && <p className="bus-hint">Derived channels are paired with the input Bus by position. Change each channel's device or source in its Sequential logic panel. DFF samples inside the input mixed-data interval keep their current-edge value and show a yellow warning.</p>}
      {!derived && <>
      <ConvertibleTimeInput label="Start default" valuePs={bus.startPs} referencePeriodPs={referencePeriodPs} onChange={(startPs) => onChange({ startPs })} />
      <RateInput periodPs={bus.periodPs} onChange={(periodPs) => onChange({ periodPs })} />
      <div className="bus-rule-grid">
        {(["earlyPs", "latePs"] as const).map(key => <NumberInput key={key} label={key === "earlyPs" ? "Maximum advance" : "Maximum delay"} suffix=" ps" min={0} allowNegative={false} value={bus[key] ?? 0} onChange={value => onChange({ [key]: Math.max(0, Number(value) || 0) })} />)}
      </div>
      <p className="bus-hint">Channels inherit a possible edge range of −{bus.earlyPs ?? 0} to +{bus.latePs ?? 0} ps. A fixed channel offset replaces that range and moves its actual edge. Hatching updates as you edit.</p>
      <p className="bus-hint">Each channel has a finite Pattern. After its last item, the Pattern repeats until the project ends, as with Data signals. No Clock binding is required.</p>
      {!creation && <p className="bus-hint">{channels.filter((channel) => channel.busOffsetPs !== undefined || Object.values(channel.busOverrides ?? {}).some(Boolean)).length} channels have local overrides.</p>}
      </>}
    </section>
    {!creation && <section className="property-section">
      <div className="section-title"><span>Display</span><span className="section-index">02</span></div>
      <SegmentedControl fullWidth value={bus.displayMode} data={[{ label: "Fold", value: "collapsed" }, { label: "Select", value: "selected" }, { label: "All", value: "all" }]} onChange={(displayMode) => onChange({ displayMode: displayMode as Bus["displayMode"] })} />
      <div className="bus-selection"><TextInput label="Channels to show" description="For example 0–3, 38–39" value={selectionText} onChange={(event) => setSelectionText(event.currentTarget.value)} /><Button size="xs" variant="light" onClick={applySelection}>Show</Button></div>
      <div className="bus-presets">
        <Button size="compact-xs" variant="subtle" onClick={() => onChange({ selectedChannels: Array.from({ length: Math.min(4, bus.width) }, (_, i) => i), displayMode: "selected" })}>First 4</Button>
        <Button size="compact-xs" variant="subtle" disabled={bus.width < 2} onClick={() => onChange({ selectedChannels: Array.from({ length: bus.width }, (_, i) => i).filter((i) => i % 2 === 1), displayMode: "selected" })}>Odd</Button>
        <Button size="compact-xs" variant="subtle" onClick={() => onChange({ selectedChannels: Array.from({ length: bus.width }, (_, i) => i).filter((i) => i % 2 === 0), displayMode: "selected" })}>Even</Button>
      </div>
      {bus.displayMode === "selected" && <p className="bus-hint">{bus.width - bus.selectedChannels.length} channels not shown.</p>}
    </section>}
    {!derived && <section className="property-section">
      <div className="section-title"><span>Bulk data</span><span className="section-index">03</span></div>
      {!creation && <Select label="Apply to" data={[{ label: "All channels", value: "all" }, { label: "Selected channels", value: "selected" }]} value={scope} onChange={(value) => setScope(value || "all")} allowDeselect={false} />}
      {!creation && scope === "selected" && <p className="bus-hint">Generating or pasting into selected channels creates local Pattern overrides; other channels keep their current data.</p>}
      <div className="bus-rule-grid">
        <TextInput label="Symbol prefix" description="Label before the number" value={rule.prefix} onChange={(event) => editRule({ ...rule, prefix: event.currentTarget.value })} />
        <NumberInput label="Starting number" description={`First item: ${itemAt(0, 0)}`} value={rule.start} onChange={(value) => editRule({ ...rule, start: Number(value) })} />
        <div className="bus-rule-direction"><NumberInput label="↓ Next channel" description={`${itemAt(0, 0)} ↓ ${itemAt(1, 0)}`} value={rule.channelStep} onChange={(value) => editRule({ ...rule, channelStep: Number(value) })} /><small>Add to the number when moving down one row.</small></div>
        <div className="bus-rule-direction"><NumberInput label="→ Next time slot" description={`${itemAt(0, 0)} → ${itemAt(0, 1)}`} value={rule.timeStep} onChange={(value) => { setAutoTimeStep(false); editRule({ ...rule, timeStep: Number(value) }); }} /><small>Add to the number when moving right one column.</small></div>
        <NumberInput className="bus-rule-length" label="Time slots per channel" description="Number of columns before each row repeats" min={1} max={256} value={rule.length} onChange={(value) => editRule({ ...rule, length: Number(value) })} />
      </div>
      <div className="bus-preview" aria-label="Rule preview">
        <div className="bus-preview-heading"><strong>Rule preview</strong><Button size="compact-xs" variant="subtle" leftSection={<Maximize2 size={12} />} onClick={() => setPreviewOpen(true)} disabled={!validRule || !indexes.length}>View all</Button></div>
        <p className="bus-preview-direction">↓ Channel step {rule.channelStep} · → Time step {rule.timeStep}</p>
        {previewTable(false)}
        <p className="bus-preview-caption">Showing {previewIndexes.length} of {indexes.length} channels · {Math.min(3, previewLength)} of {previewLength} slots</p>
      </div>
      <Modal opened={previewOpen} onClose={() => setPreviewOpen(false)} title="Full rule preview" size={Math.min(1100, Math.max(620, previewLength * 96 + 130))} centered>
        <div className="bus-full-preview"><p className="bus-hint">{indexes.length} channels × {previewLength} time slots · {scope === "selected" ? "Selected channels" : "All channels"}. Preview of this rule before applying it.</p>
          <p className="bus-preview-direction">↓ Next channel: {rule.channelStep} · → Next time slot: {rule.timeStep}</p>
          {previewOpen && previewTable(true)}
        </div>
      </Modal>
      {!creation && <><Checkbox label="Replace channels with local Pattern edits" checked={replaceOverrides} onChange={(event) => setReplaceOverrides(event.currentTarget.checked)} />
      <Button variant="light" disabled={!validRule || indexes.length === 0} onClick={applyRule}>Generate {scope === "all" ? "all channels" : "selected channels"}</Button></>}
      {creation && <p className="bus-hint">This rule is applied to every channel when you add the Bus.</p>}
      {!creation && <><Textarea label="Paste table" description="One channel per row; one item per tab-separated column. Applies to the chosen scope atomically." minRows={3} value={table} onChange={(event) => setTable(event.currentTarget.value)} /><Button variant="light" disabled={!table.trim() || indexes.length === 0} onClick={applyTable}>Apply pasted table</Button></>}
      {error && <p role="alert" className="sequential-error">{error}</p>}
    </section>}
  </div>;
}
