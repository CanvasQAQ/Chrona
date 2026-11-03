import { useMemo, useState, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { ActionIcon, Button, MantineProvider, SegmentedControl, Select } from "@mantine/core";
import { Activity, Moon, RotateCcw, Sun, Link2 } from "lucide-react";
import { PropertyPanel } from "../../src/features/inspector/PropertyPanel";
import { BusEditor } from "../../src/components/BusEditor";
import { SignalTimingEditor } from "../../src/components/SignalTimingEditor";
import { applyBusPatterns,busChannels,createBus,createBusChannels,formatBusName,generateBusPattern,resizeBus,updateBusDefaults } from "../../src/domain/bus";
import { createDerivedBus } from "../../src/domain/derivedBus";
import { resolveProjectTiming } from "../../src/domain/sequential";
import { isSequentialDataSignal,type DataSignal,type Signal,type TimingProject } from "../../src/domain/timing";
import fixture from "../../examples/bus-derived.chrona.json";
import { InspectorHeading } from "../../src/features/inspector/InspectorHeading";
import { BusSettings } from "../../src/features/inspector/BusSettings";
import { SignalSettings } from "../../src/features/inspector/SignalSettings";
import { CardsMode, Section } from "../../src/features/inspector/InspectorCards";
import "@mantine/core/styles.css";
import "../../src/styles.css";
import "./demo.css";

function initialProject():TimingProject {
  const p=structuredClone(fixture) as TimingProject;
  const data:DataSignal={id:"data",name:"DATA_IN",kind:"data",periodPs:250,startPs:0,visible:true,color:"#0c8873",pattern:["0","0","1","1"],patternSegments:[{id:"bits",kind:"logic",values:"0011",repeat:1}]};
  const source=p.signals.find(isSequentialDataSignal)!;
  const {busId:_bus,busIndex:_idx,...standalone}=source;
  const dff={...standalone,id:"dff",name:"Q_FF",derivation:{...source.derivation,dataSignalId:data.id}};
  const latch:DataSignal={...dff,id:"latch",name:"Q_LATCH",derivation:{...dff.derivation,device:"latch",trigger:"high",d2q:{minPs:0,currentPs:20,maxPs:40}}};
  p.signals.push(data,dff,latch,{...p.signals[0],id:"clock-b",name:"CLK B",periodPs:800});
  p.delayLinks=[{id:"delay-example",sourceSignalId:p.signals[0].id,targetSignalId:dff.id,label:"t",sourceEdge:1,targetEdge:1,minPs:0,currentPs:60,maxPs:120}];
  p.timingConstraints=[{id:"constraint-example",sourceSignalId:p.signals[0].id,targetSignalId:"bus-1",sourceEdge:1,targetEdge:1,sourceEdges:[],targetEdges:[],sourceEdgeKind:"rising",targetEdgeKind:"transition",setupPs:50,holdPs:30}];
  const wide = createBus("WORD<31:0>");
  p.buses!.push(wide);
  p.signals.push(...createBusChannels(wide,"#098374"));
  const outputs = createDerivedBus(p,{name:"Q_WORD<31:0>",sourceBusId:wide.id,clockSignalId:p.signals[0].id,device:"dff",trigger:"rising",c2q:{minPs:0,currentPs:20,maxPs:40},initialValue:"X"},"#7766bb");
  p.buses!.push(outputs.bus);
  p.signals.push(...outputs.channels);
  return p;
}
function Demo({reset,dark,toggle}:{reset:()=>void;dark:boolean;toggle:()=>void}){
  const [p,set]=useState(initialProject);
  const [id,select]=useState("data");
  const [mode,setMode]=useState("cards");
  const [rev,setRev]=useState([0,0]);
  const [collapsed,collapse]=useState(false);
  const s=p.signals.find(i=>i.id===id);
  const bus=p.buses?.find(i=>i.id===id);
  const parent=s?.kind==="data"?p.buses?.find(b=>b.id===s.busId):undefined;
  const channels=bus?busChannels(p,id):[];
  const ref=p.signals.find(i=>i.kind==="clock")!;
  const derived=!!bus && channels.every(c=>c.sourceType==="sequential");
  const cards = mode==="cards";
  const expanded=mode==="expanded";
  function setBusRange(first:number,last:number) {
    const width=Math.abs(last-first)+1;
    set(current=>{
      const resized=width===bus?.width ? current : resizeBus(current,id,width,"#098374");
      return updateBusDefaults(resized,id,{channelFirst:first,channelStep:first<=last?1:-1});
    });
  }
  const target:Signal=s??{kind:"data",id,name:bus?.name??"",visible:true,color:"",periodPs:bus?.periodPs??1000,startPs:0,pattern:["0","1"]};
  const timing=useMemo(()=>resolveProjectTiming(p.signals,p.durationPs,p.delayLinks??[],p.buses??[]),[p]);
  const delayLink=p.delayLinks?.find(i=>i.targetSignalId===id);
  const constraint=p.timingConstraints?.find(i=>i.targetSignalId===id);
  const relations:ComponentProps<typeof SignalTimingEditor>={
    selected:target,signals:p.signals.filter(i=>!bus || i.kind!=="data" || i.busId!==bus.id),durationPs:p.durationPs,busTarget:!!bus,delayLink,constraint,
    edgeTimes:(signal,polarity)=>timing.edgeTimes(signal.id,polarity),
    onAddDelay:sourceSignalId=>set(v=>({...v,delayLinks:[...(v.delayLinks??[]),{id:crypto.randomUUID(),label:"t",sourceSignalId,targetSignalId:id,sourceEdge:1,targetEdge:1,minPs:0,currentPs:50,maxPs:100}]})),
    onChangeDelay:patch=>set(v=>({...v,delayLinks:v.delayLinks?.map(i=>i.targetSignalId===id?{...i,...patch}:i)})),
    onRemoveDelay:()=>set(v=>({...v,delayLinks:v.delayLinks?.filter(i=>i.targetSignalId!==id)})),
    onAddConstraint:sourceSignalId=>set(v=>({...v,timingConstraints:[...(v.timingConstraints??[]),{id:crypto.randomUUID(),sourceSignalId,targetSignalId:id,sourceEdge:1,targetEdge:1,sourceEdges:[],targetEdges:[],setupPs:50,holdPs:30}]})),
    onChangeConstraint:patch=>set(v=>({...v,timingConstraints:v.timingConstraints?.map(i=>i.targetSignalId===id?{...i,...patch}:i)})),
    onRemoveConstraint:()=>set(v=>({...v,timingConstraints:v.timingConstraints?.filter(i=>i.targetSignalId!==id)})),
  };
  const panel=(side:number):ComponentProps<typeof PropertyPanel>=>({
    ...relations,creation:false,project:p,selected:s,parentBus:parent,referenceClock:ref,referencePeriodPs:ref.periodPs,edgeTimes:relations.edgeTimes!,patternResetVersion:rev[side],sequentialError:timing.errors[id],
    onUpdateSelected:patch=>{
      if("pattern" in patch)setRev(v=>v.map((n,i)=>i===side?n:n+1));
      set(v=>({...v,signals:v.signals.map((i):Signal=>{
        if(i.id!==id)return i;
        const next={...i,...patch} as Signal;
        if(parent && next.kind==="data"){
          const overrides={...next.busOverrides};
          for(const key of ["pattern","startPs","periodPs"] as const) if(key in patch) overrides[key]=true;
          next.busOverrides=overrides;
        }
        return next;
      })}));
    },
    onRestoreBusParameter:key=>{
      if(!parent)return;
      set(v=>({...v,signals:v.signals.map(i=>i.id!==id || i.kind!=="data"?i:{...i,...(key==="pattern"?{pattern:generateBusPattern(parent.rule,i.busIndex??0),patternSegments:undefined}:{[key]:parent[key]}),busOverrides:{...i.busOverrides,[key]:false}})}));
      if(key==="pattern")setRev(v=>v.map(n=>n+1));
    }
  });
  const busProps:ComponentProps<typeof BusEditor>|undefined=bus && {bus,channels,referencePeriodPs:ref.periodPs,onChange:patch=>set(v=>updateBusDefaults(v,id,patch)),onResize:width=>set(v=>resizeBus(v,id,width,"#098374")),onApplyPatterns:(a,b,c,d)=>set(v=>applyBusPatterns(v,id,a,b,c,d))};
  const options=[
    {group:"Independent signals",items:p.signals.filter(i=>i.kind==="clock" || !i.busId).map(i=>({value:i.id,label:(isSequentialDataSignal(i)?i.derivation.device.toUpperCase():i.kind==="clock"?"Clock":"Data")+" · "+(i.name||"(unnamed)")}))},
    ...(p.buses??[]).map(b=>({group:formatBusName(b),items:[{value:b.id,label:(busChannels(p,b.id).every(i=>i.sourceType==="sequential")?"Derived Bus":"Bus")+" · "+formatBusName(b)},...busChannels(p,b.id).map(i=>({value:i.id,label:(isSequentialDataSignal(i)?"Derived Q":"Channel")+" · "+i.name}))]}))
  ];
  const relationNote=[delayLink?`${p.signals.find(i=>i.id===delayLink.sourceSignalId)?.name} #${delayLink.sourceEdge} → #${delayLink.targetEdge} +${delayLink.currentPs} ps`:"",constraint?`Setup ${constraint.setupPs} / hold ${constraint.holdPs} ps`:""].filter(Boolean).join(" · ");
  return <main className="lab"><header className="mast"><span className="brandmark"><Activity size={21}/></span><strong>Chrona</strong><span className="slash">/</span><span>Design lab</span><button onClick={toggle} aria-label={dark?"浅色模式":"深色模式"}>{dark?<Sun size={17}/>:<Moon size={17}/>}</button></header>
    <div className="lab-body"><div className="intro"><h1>波形属性栏对照</h1></div>
    <div className="controls"><Select label="示例信号" searchable allowDeselect={false} value={id} data={options} onChange={v=>{if(v){select(v);collapse(false);}}}/>
      <div><label>建议栏布局</label><SegmentedControl aria-label="建议栏布局" value={mode} onChange={setMode} data={[{value:"cards",label:"分组卡片"},{value:"guided",label:"折叠布局"},{value:"expanded",label:"全部展开"}]}/></div>
      <Button variant="default" leftSection={<RotateCcw size={14}/>} onClick={reset}>重置示例</Button></div>
    <div className="columns" key={id}><article><div className="column-tag"><i>A</i><b>原版控制栏</b><span>CURRENT</span></div>
      {collapsed?<Button onClick={()=>collapse(false)}>Show properties</Button>:busProps?<aside className="property-panel"><div className="panel-heading"><div><span className="eyebrow">INSPECTOR</span><h2>Bus properties</h2></div><ActionIcon variant="subtle" aria-label="Collapse properties" onClick={()=>collapse(true)}>‹</ActionIcon></div><div className="property-content"><BusEditor {...busProps}/><SignalTimingEditor {...relations}/></div></aside>:<PropertyPanel {...panel(0)} onCollapse={()=>collapse(true)}/>}</article>
      <article className="suggested"><div className="column-tag"><i>B</i><b>建议控制栏</b><span>{cards?"CARDS":expanded?"EXPANDED":"GUIDED"}</span></div>
      <aside className="property-panel"><InspectorHeading signal={s} bus={bus} parent={parent} derived={derived} rename={name=>panel(1).onUpdateSelected({name})} select={select}/>
      <CardsMode.Provider value={cards}><div className={cards?"pro-content card-stack":"pro-content"} key={mode}>{busProps?<BusSettings {...busProps} onApplyPatterns={(rows,indexes,replace,generated,rule)=>set(v=>applyBusPatterns(rule?updateBusDefaults(v,id,{rule}):v,id,rows,indexes,replace,generated))} expanded={expanded} select={select} setRange={setBusRange}/>:<SignalSettings {...panel(1)} expanded={expanded}/>}
      <Section title="Timing relationships" note={relationNote || (bus?"Check setup / hold":"Align a target edge with a source edge, or check the setup / hold window.")} expanded={expanded}><SignalTimingEditor {...relations}/></Section></div></CardsMode.Provider></aside></article></div>
      <footer><Link2 size={13}/> 参数同步 · 两栏可独立滚动 <span>CHRONA　/　INSPECTOR STUDY</span></footer>
    </div></main>;
}
function Root(){
  const [version,setVersion]=useState(0); const [dark,toggle]=useState(false);
  return <MantineProvider forceColorScheme={dark?"dark":"light"} theme={{primaryColor:"violet",defaultRadius:"md",fontFamily:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'}}><Demo key={version} reset={()=>setVersion(x=>x+1)} dark={dark} toggle={()=>toggle(x=>!x)}/></MantineProvider>;
}
createRoot(document.getElementById("root")!).render(<Root/>);
