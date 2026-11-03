import { useState } from "react";
import { Button, TextInput } from "@mantine/core";
import { busChannelNumber } from "../../domain/bus";
import type { Bus, DataSignal } from "../../domain/timing";
import { Card } from "./InspectorCards";

export function BusIdentity({bus, derived, rename, setRange}: {
  bus: Bus; derived: boolean; rename: (name:string)=>void; setRange:(first:number,last:number)=>void;
}) {
  const [name,setName] = useState<string | null>(null);
  const [range,setDraft] = useState<[string,string] | null>(null);
  const ends = range ?? [String(busChannelNumber(bus,0)),String(busChannelNumber(bus,bus.width-1))];
  const count = Math.abs(Number(ends[0])-Number(ends[1]))+1;
  const nameValid = !!name?.trim() && !/[<>]/.test(name);
  const rangeValid = ends.every(s=>/^\d+$/.test(s) && Number.isSafeInteger(Number(s))) && count<=256 && (!derived || count===bus.width);
  function saveName() { if(nameValid){rename(name!.trim());setName(null);} }
  function saveRange() { if(rangeValid){setRange(Number(ends[0]),Number(ends[1])); setDraft(null);} }
  return <Card title="Bus identity" note={derived ? "The two endpoints must span the input Bus width." : "The endpoints set channel order and width, up to 256 channels."}>
    <TextInput label="Bus name" value={name ?? bus.name} onChange={e=>setName(e.currentTarget.value)} onKeyDown={e=>{if(e.key==="Enter")saveName();}} error={name!==null && !nameValid ? "Enter a name without angle brackets." : undefined}/>
    {name!==null && <Button size="compact-xs" disabled={!nameValid} onClick={saveName}>Apply name</Button>}
    <div className="range-label"><b>Bit range</b><span>{bus.width} channels</span></div>
    <div className="range-inputs">{(["First bit","Last bit"] as const).map((label,i)=><TextInput key={label} label={label} inputMode="numeric" value={ends[i]} onChange={e=>{const next:[string,string]=[ends[0],ends[1]];next[i]=e.currentTarget.value;setDraft(next);}} onKeyDown={e=>{if(e.key==="Enter")saveRange();}}/>)}</div>
    {range && <>{!rangeValid && <small role="alert">{derived ? `Use non-negative endpoints spanning ${bus.width} channels.` : "Use non-negative endpoints spanning 1–256 channels."}</small>}<Button size="xs" disabled={!rangeValid} onClick={saveRange}>Apply bit range{rangeValid ? ` · ${count} channels` : ""}</Button></>}
  </Card>;
}

export function ChannelGrid({channels,select}: {channels:DataSignal[]; select:(id:string)=>void}) {
  const [query,setQuery]=useState("");
  const filtered=channels.filter(c=>c.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <>{channels.length>12 && <TextInput aria-label="Find output channel" placeholder="Find channel…" value={query} onChange={e=>setQuery(e.currentTarget.value)}/>}
    <div className="channel-grid">{filtered.map(c=><button key={c.id} title={c.name} onClick={()=>select(c.id)}>{c.name}</button>)}</div>
    {!filtered.length && <small>No matching channels</small>}
  </>;
}

export function EdgeWindow({advance,delay}: {advance:number;delay:number}) {
  const scale=133/Math.max(advance,delay,1);
  const middle=182, left=middle-advance*scale, right=middle+delay*scale;
  return <figure className="scope">
    <figcaption><span className="scope-id"><i/>BUS</span><span>Edge window <b>{advance+delay} ps</b></span></figcaption>
    <svg viewBox="0 0 364 108" role="img" aria-label={`Possible edge from ${advance} ps before to ${delay} ps after the nominal edge`}>
      {[48,115,182,249,316].map(x=><path key={x} className="scope-grid" d={`M ${x} 12 V 85`}/>)}
      <path className="scope-grid" d="M 15 36 H 349 M 15 72 H 349"/>
      <rect className="early-zone" x={left} y="29" width={middle-left} height="50"/>
      <rect className="late-zone" x={middle} y="29" width={right-middle} height="50"/>
      <path className="scope-base" d={`M ${left} 72 V 36 M ${right} 72 V 36`}/>
      <path className="scope-wave" d="M 15 72 H 182 V 36 H 349"/>
      <text x={middle} y="20" textAnchor="middle">Nominal edge</text>
      <text x={middle} y="99" textAnchor="middle">Δ 0 ps</text>
    </svg>
    <div className="scope-legend"><span><i className="start-key"/>Advance <b>−{advance} ps</b></span>
      <span><i className="offset-key"/>Delay <b>+{delay} ps</b></span></div>
  </figure>;
}
