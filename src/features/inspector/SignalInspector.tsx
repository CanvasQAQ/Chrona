import type { ComponentProps } from "react";
import type { PropertyPanel } from "./PropertyPanel";
import { SignalTimingEditor } from "../../components/SignalTimingEditor";
import { InspectorHeading } from "./InspectorHeading";
import { Card, CardsMode } from "./InspectorCards";
import { SignalSettings } from "./SignalSettings";

export function SignalInspector(props: Omit<ComponentProps<typeof PropertyPanel>, "creation"> & { select: (id: string) => void }) {
  const {selected, project, select, parentBus, onUpdateSelected, onCollapse} = props;
  return <aside className="property-panel" aria-label="Waveform inspector">
    <InspectorHeading signal={selected} parent={parentBus} select={select} rename={name=>onUpdateSelected({name})} collapse={onCollapse}/>
    <CardsMode.Provider value><div className="pro-content card-stack" key={selected?.id}>
      {selected ? <>
        <SignalSettings {...props} expanded/>
        <Card title="Timing relationships" note="Align a target edge with a source edge, or check its setup and hold window.">
          <SignalTimingEditor {...props} selected={selected} signals={project.signals} durationPs={project.durationPs}/>
        </Card>
      </> : <small>Select a signal to see its properties.</small>}
    </div></CardsMode.Provider>
  </aside>;
}
