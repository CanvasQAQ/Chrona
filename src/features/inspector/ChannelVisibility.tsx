import { useState } from "react";
import { Button, SegmentedControl, TextInput } from "@mantine/core";
import { formatBusName, parseBusSelection } from "../../domain/bus";
import type { Bus } from "../../domain/timing";

export function ChannelVisibility({bus,onChange}: {bus:Bus;onChange:(patch:Partial<Bus>)=>void}) {
  const [selection,setSelection] = useState<string | null>(null);
  const [selectionError,setSelectionError] = useState("");
  const all = Array.from({length:bus.width},(_,i)=>i);
  function display(selectedChannels: number[]) {
    if (!selectedChannels.length) throw new Error("Select at least one channel.");
    onChange({displayMode:"selected",selectedChannels}); setSelection(null); setSelectionError("");
  }
  return <div className="manager-fields"><strong>{formatBusName(bus)}</strong>
      <SegmentedControl fullWidth value={bus.displayMode} data={[{value:"collapsed",label:"Fold"},{value:"selected",label:"Select"},{value:"all",label:"All"}]} onChange={v=>onChange({displayMode:v as Bus["displayMode"]})}/>
      <TextInput label="Channel positions" value={selection ?? bus.selectedChannels.join(", ")} onChange={e=>setSelection(e.currentTarget.value)}/>
      <div className="bus-presets"><Button size="xs" onClick={()=>{try{display(parseBusSelection(selection ?? bus.selectedChannels.join(", "),bus.width));}catch(e){setSelectionError((e as Error).message);}}}>Show</Button>
      {["First 4","Odd","Even"].map((label,k)=><Button key={label} size="xs" variant="subtle" disabled={k===1 && bus.width<2} onClick={()=>display(all.filter(i=>k===0?i<4:i%2===(k===1?1:0)))}>{label}</Button>)}</div>
      {selectionError && <small role="alert">{selectionError}</small>}</div>;
}
