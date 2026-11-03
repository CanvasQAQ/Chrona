import { useContext, useState, type ComponentProps } from "react";
import { Button, Checkbox, Modal, SegmentedControl, Textarea, TextInput } from "@mantine/core";
import { Maximize2 } from "lucide-react";
import { BusEditor } from "../../components/BusEditor";
import { LiveNumberInput as NumberInput } from "../../components/LiveNumberInput";
import { RateInput } from "../../components/RateInput";
import { ConvertibleTimeInput } from "../../components/ConvertibleTimeInput";
import { formatBusName, generateBusPattern, parseBusName, parseBusTable } from "../../domain/bus";
import type { BusRule } from "../../domain/timing";
import { ChannelVisibility } from "./ChannelVisibility";
import { BusIdentity, ChannelGrid, EdgeWindow } from "./BusCards";
import { CardsMode, PrimaryCard, Section } from "./InspectorCards";

type Props = Omit<ComponentProps<typeof BusEditor>, "onApplyPatterns"> & { onApplyPatterns:(rows:string[][], indexes:number[], replace:boolean, generated:boolean, rule?:BusRule)=>void; expanded: boolean; setRange:(first:number,last:number)=>void; openManager?: () => void; select: (id: string) => void };

export function BusSettings({bus, channels, referencePeriodPs, expanded, setRange, select, openManager, onChange, onResize, onApplyPatterns}: Props) {
  const cards = useContext(CardsMode);
  const [manager,setManager] = useState(false);
  const derived = channels.every(c => c.sourceType === "sequential");
  const [name, setName] = useState<string | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [ruleDraft, setRule] = useState<BusRule | null>(null);
  const [table, setTable] = useState("");
  const [replace, setReplace] = useState(false);
  const [method, setMethod] = useState("rule");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const rule = ruleDraft ?? bus.rule;
  const all = channels.map((_, i) => i);
  const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(rule.prefix) && [rule.start,rule.channelStep,rule.timeStep,rule.length].every(Number.isInteger) && rule.length >= 1 && rule.length <= 256;
  function applyName() {
    const value = name?.trim() ?? formatBusName(bus);
    const range = parseBusName(value);
    if (!value || (/[<>]/.test(value) && !range) || (range && range.width !== bus.width)) { setError("Enter a name or a bit range matching the width."); return; }
    onChange(range ? {name:range.name, channelFirst:range.channelFirst, channelStep:range.channelStep} : {name:value});
    setName(null); setError("");
  }
  const generated = method === "rule";
  let patterns: string[][] | undefined;
  let draftError = "";
  if (generated && valid) {
    patterns = all.map(i => generateBusPattern(rule, i));
  } else if (generated) {
    draftError = "Use a valid prefix, integer steps and 1–256 slots.";
  } else if (table.trim()) {
    try { patterns = parseBusTable(table, channels.length); }
    catch (cause) { draftError = (cause as Error).message; }
  }
  const hasDraft = generated ? ruleDraft !== null || replace : !!table.trim();
  function apply() {
    if (!patterns || !hasDraft) return;
    onApplyPatterns(patterns, all, replace, generated, generated ? rule : undefined);
    setError(""); setRule(null); setTable(""); setReplace(false);
  }
  const previewRows = (full: boolean) => <div className={full ? "bus-preview-scroll is-full" : "bus-preview-scroll"}><table className="bus-preview-table"><tbody>
    {(full ? channels : channels.slice(0,3)).map((channel,i) => {
      const keepLocal = channel.busOverrides?.pattern && !replace;
      const row = hasDraft && !keepLocal && patterns ? patterns[i] : channel.pattern;
      return <tr key={channel.id}><th><button className="text-link" onClick={()=>select(channel.id)}>{channel.name}</button></th>
        {(full ? row : row.slice(0,3)).map((token,j)=><td key={j}>{token}</td>)}</tr>;
    })}
  </tbody></table></div>;
  return <>
    {cards ? <BusIdentity bus={bus} derived={derived} rename={name=>onChange({name})} setRange={setRange}/> : <>
    <TextInput label="Bus name & bit range" value={name ?? formatBusName(bus)} onChange={e=>setName(e.currentTarget.value)} onKeyDown={e=>{if(e.key === "Enter") applyName();}}/>
    {name !== null && <Button size="xs" onClick={applyName}>Apply name</Button>}
    <NumberInput label="Channel count" min={1} max={256} disabled={derived} value={width ?? bus.width} onChange={setWidth}/>
    {width !== null && <Button size="xs" disabled={!Number.isInteger(width) || width < 1 || width > 256} onClick={()=>{onResize(width); setWidth(null);}}>Apply width</Button>}
    </>}
    <button className="manager-link" onClick={openManager ?? (()=>setManager(true))}><span>Signal manager ↗</span><b>{bus.displayMode==="all"?bus.width:bus.displayMode==="selected"?bus.selectedChannels.length:0} / {bus.width} visible</b></button>
    {derived ? <Section title="Output channels" note="Select a Q to edit its sampling and delays" expanded><ChannelGrid channels={channels} select={select}/></Section>
    : <>
      <PrimaryCard title="Bus timing" note="Start positions the Bus. Time per slot sets its cadence.">
      <RateInput label="Time per slot" initialMode="period" periodPs={bus.periodPs} onChange={periodPs=>onChange({periodPs})}/>
      {cards && <ConvertibleTimeInput label="Default start" initialUnit="ps" referencePeriodPs={referencePeriodPs} valuePs={bus.startPs} onChange={startPs=>onChange({startPs})}/>}
      </PrimaryCard>
      <Section title="Edge uncertainty" note="Advance extends the possible edge earlier. Delay extends it later. The nominal edge stays fixed." expanded={expanded}>
        <EdgeWindow advance={bus.earlyPs??0} delay={bus.latePs??0}/>
        <div className="pair">{(["earlyPs","latePs"] as const).map(key=><NumberInput key={key} label={key==="earlyPs"?"Maximum advance":"Maximum delay"} min={0} suffix=" ps" value={bus[key]??0} onChange={v=>onChange({[key]:Math.max(0,v)})}/>)}</div>
      </Section>
      <Section title="Fill channel data" note="Generate a pattern or paste a table with one channel per row and tabs between slots." expanded={expanded}>
        <div className="bus-preview live-preview">
          <strong>{hasDraft && patterns ? "Preview after apply" : "Current channel data"}</strong>
          <button className="expand-preview" aria-label="Expand data preview" title="Expand data preview" onClick={()=>setPreview(true)}><Maximize2 size={14}/></button>
          {previewRows(false)}
        </div>
        <Modal opened={preview} onClose={()=>setPreview(false)} title="Channel data preview" size="xl">{preview && previewRows(true)}</Modal>
        <SegmentedControl fullWidth aria-label="Fill method" value={method} onChange={next=>{setMethod(next); if(next==="rule")setRule(rule);}} data={[{value:"rule",label:"Generate"},{value:"table",label:"Paste table"}]}/>
        {method === "rule" ? <>
          <TextInput label="Symbol prefix" value={rule.prefix} onChange={e=>setRule({...rule,prefix:e.currentTarget.value})}/>
          <div className="bus-rule-grid">{([["start","Starting number"],["channelStep","Step ↓ channel"],["timeStep","Step → slot"],["length","Slots per channel"]] as const).map(([key,label])=><NumberInput key={key} label={label} value={rule[key]} onChange={v=>setRule({...rule,[key]:v})}/>)}</div>
        </> : <Textarea label="Paste table" title="One channel per row, tabs between slots." value={table} onChange={e=>setTable(e.currentTarget.value)}/>}
        <Checkbox label="Replace local pattern edits" checked={replace} onChange={e=>setReplace(e.currentTarget.checked)}/>
        {draftError && <small role="alert">{draftError}</small>}
        <Button disabled={!patterns || !hasDraft} onClick={apply}>Apply to Bus · {bus.width} channels</Button>
      </Section>
      {!cards && <Section title="Bus start" expanded={expanded}><ConvertibleTimeInput label="Default start" initialUnit="ps" referencePeriodPs={referencePeriodPs} valuePs={bus.startPs} onChange={startPs=>onChange({startPs})}/></Section>}
    </>}
    <Modal opened={manager} onClose={()=>setManager(false)} title="Hidden signal manager" centered>
      <ChannelVisibility bus={bus} onChange={onChange}/>
    </Modal>{error && <p role="alert" className="sequential-error">{error}</p>}
  </>;
}
