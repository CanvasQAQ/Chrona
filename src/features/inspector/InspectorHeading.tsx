import { ActionIcon, Tooltip } from "@mantine/core";
import { PanelRightClose, Pencil } from "lucide-react";
import { formatBusName } from "../../domain/bus";
import { isSequentialDataSignal, type Bus, type Signal } from "../../domain/timing";

interface Props {
  signal?: Signal;
  bus?: Bus;
  parent?: Bus;
  derived?: boolean;
  rename: (name: string) => void;
  select: (id: string) => void;
  collapse?: () => void;
}

export function InspectorHeading({signal, bus, parent, derived, rename, select, collapse}: Props) {
  const kind = bus ? (derived ? "Derived Bus" : "Bus") : isSequentialDataSignal(signal)
    ? signal.derivation.device.toUpperCase() : parent ? "Bus channel" : signal?.kind === "clock" ? "Clock" : "Data";
  return <div className="pro-head">
    <div>{bus ? <><small>WAVEFORM INSPECTOR</small><h2>{formatBusName(bus)}</h2></>
      : signal && parent ? <><small>Bus channel</small><h2>{signal.name}</h2>
        <button className="text-link parent-link" onClick={()=>select(parent.id)}>Edit {parent.name} ↗</button></>
      : signal ? <label className="signal-name"><span>Signal name</span><span className="name-field">
        <input aria-label="Signal name" placeholder="Untitled" value={signal.name} onChange={e=>rename(e.currentTarget.value)}/><Pencil size={14} aria-hidden="true"/>
      </span></label> : <h2>Properties</h2>}</div>
    {(bus || signal) && <span>{kind}</span>}
    {collapse && <Tooltip label="Collapse properties"><ActionIcon variant="subtle" aria-label="Collapse properties" onClick={collapse}><PanelRightClose size={16}/></ActionIcon></Tooltip>}
  </div>;
}
