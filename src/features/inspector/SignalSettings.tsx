import { useContext, type ComponentProps } from "react";
import { Button, Checkbox, SegmentedControl, Select, Slider } from "@mantine/core";
import { PropertyPanel } from "./PropertyPanel";
import { DataPatternEditor } from "../../components/DataPatternEditor";
import { RateInput } from "../../components/RateInput";
import { ConvertibleTimeInput } from "../../components/ConvertibleTimeInput";
import { LiveNumberInput as NumberInput } from "../../components/LiveNumberInput";
import { DelayRangeEditor } from "../../components/DelayRangeEditor";
import { isSequentialDataSignal, type SequentialDerivation } from "../../domain/timing";
import { PositionPreview } from "./PositionPreview";
import { CardsMode, PrimaryCard, Section } from "./InspectorCards";

type Props = ComponentProps<typeof PropertyPanel> & {expanded: boolean};
export function SignalSettings({selected:s, parentBus:bus, project, referencePeriodPs, referenceClock, patternResetVersion=0, expanded, onUpdateSelected:update, onRestoreBusParameter:restore, sequentialError}:Props){
  const cards=useContext(CardsMode);
  if(!s) return null;
  const q=isSequentialDataSignal(s)?s.derivation:undefined;
  const patchQ=(patch:Partial<SequentialDerivation>)=>q && update({derivation:{...q,...patch}});
  const inheritance=(key:"pattern"|"periodPs"|"startPs")=>bus && s.kind==="data" && <div className="inherit">{s.busOverrides?.[key]?<>Local override <Button size="compact-xs" variant="subtle" onClick={()=>restore?.(key)}>Restore {bus.name} default</Button></>:<>Inherited from {bus.name}</>}</div>;
  const rate = <RateInput label={s.kind==="clock"?"Clock rate":"Time per slot"} initialMode={s.kind==="clock"?"frequency":"period"} periodPs={s.periodPs} onChange={periodPs=>update({periodPs})}/>;
  return <>
    {q ? <>
      <PrimaryCard title="Sampling rule" note="Choose the device, input signals and trigger.">
      {!cards && <div className="recipe"><small>SAMPLING RULE</small><b>{q.device==="dff" ? `Sample ${project.signals.find(i=>i.id===q.dataSignalId)?.name ?? "D"} on the ${q.trigger} edge` : `Follow data while clock is ${q.trigger}`}</b></div>}
      <SegmentedControl fullWidth aria-label="Device" value={q.device} data={[{value:"dff",label:"DFF"},{value:"latch",label:"Latch"}]} onChange={v=>patchQ(v==="dff"?{device:"dff",trigger:"rising",d2q:undefined}:{device:"latch",trigger:"high",d2q:{minPs:0,currentPs:20,maxPs:40}})}/>
      <div className="pair">{(["clock","data"] as const).map(k=><Select key={k} label={k==="clock"?"Clock":"Data"} allowDeselect={false} data={project.signals.filter(i=>i.kind===k && i.id!==s.id).map(i=>({value:i.id,label:i.name || "(unnamed)"}))} value={q[k==="clock"?"clockSignalId":"dataSignalId"]} onChange={id=>id && patchQ({[k==="clock"?"clockSignalId":"dataSignalId"]:id})}/>)}</div>
      <label>{q.device==="dff"?"Sampling edge":"Transparent level"}</label><SegmentedControl fullWidth aria-label="Trigger" value={q.trigger} data={q.device==="dff"?["rising","falling"]:["high","low"]} onChange={v=>patchQ({trigger:v as SequentialDerivation["trigger"]})}/>
      </PrimaryCard>
      <Section title="Initial state & propagation" note={`Initial ${q.initialValue} · C→Q ${q.c2q.currentPs} ps${q.d2q ? ' · D→Q '+q.d2q.currentPs+' ps':''}`} expanded={expanded}>
        <Select label="Initial Q" allowDeselect={false} data={["0","1","X","Z"]} value={q.initialValue} onChange={v=>v && patchQ({initialValue:v})}/>
        <DelayRangeEditor label="C→Q delay" value={q.c2q} onChange={c2q=>patchQ({c2q})}/>
        {q.d2q && <DelayRangeEditor label="D→Q delay" value={q.d2q} onChange={d2q=>patchQ({d2q})}/>}
      </Section>{sequentialError && <small role="alert">{sequentialError}</small>}
    </> : <>
      <PrimaryCard title={s.kind==="clock"?"Clock waveform":"Data waveform"} note={`Base waveform before source-delay alignment. Start angles use ${referenceClock?.name??"the reference clock"}. ${s.kind==="clock"?"Phase shifts the clock from its start and uses its own period.":"Start places slot zero. A channel offset shifts all slots."}`}>
        <PositionPreview signal={s}/>
        {rate}{inheritance("periodPs")}
        {s.kind==="clock" && <><label>Duty cycle <b>{Math.round(s.dutyCycle*100)}%</b></label><Slider aria-label="Duty cycle" min={10} max={90} step={5} value={s.dutyCycle*100} onChange={v=>update({dutyCycle:v/100})}/></>}
        <ConvertibleTimeInput initialUnit="ps" label="Start" description={cards?undefined:`Angle uses ${referenceClock?.name ?? "reference clock"}`} referencePeriodPs={referencePeriodPs} valuePs={s.startPs} onChange={startPs=>update({startPs})}/>{inheritance("startPs")}
        {s.kind==="clock" && <ConvertibleTimeInput initialUnit="ps" label="Clock phase" description={cards?undefined:"Angle uses this clock’s period"} referencePeriodPs={s.periodPs} valuePs={s.phasePs} onChange={phasePs=>update({phasePs})}/>}
        {s.kind==="data" && bus && <><Checkbox label="Use fixed channel offset" checked={s.busOffsetPs!==undefined} onChange={e=>update({busOffsetPs:e.currentTarget.checked?0:undefined})}/>{s.busOffsetPs===undefined ? <small>Inherited range −{bus.earlyPs??0} / +{bus.latePs??0} ps</small> : <NumberInput label="Move actual edge" suffix=" ps" value={s.busOffsetPs} onChange={busOffsetPs=>update({busOffsetPs})}/>}</>}
      </PrimaryCard>
      {s.kind==="data" && <Section title="Edit segments" note="Edit the sequence from left to right. Changes update the waveform above." expanded={expanded}>
        <DataPatternEditor key={patternResetVersion} descriptiveLabels pattern={s.pattern} segments={s.patternSegments}
          onChange={(pattern,patternSegments)=>update({pattern,patternSegments})}/>
        {inheritance("pattern")}
      </Section>}
    </>}
  </>;
}
