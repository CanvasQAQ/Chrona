import { useId } from "react";
import { clampDuration, patternForDataSignal, type Signal } from "../../domain/timing";

const ps = (value: number) => Number(value.toPrecision(5)) + " ps";
const left = 15;
const right = 349;

// The clock repeats through zero, even when its configured edge is off-screen.
function clockPath(origin: number, period: number, duty: number, end: number, x: (t:number)=>number) {
  const firstRise = ((origin % period) + period) % period - period;
  let path = `M ${x(firstRise)} 76`;
  for (let rise = firstRise; rise <= end; rise += period) {
    path += ` V 44 H ${x(rise + period*duty)} V 76 H ${x(rise + period)}`;
  }
  return path;
}

export function PositionPreview({signal}: {signal:Signal}) {
  const clip = useId();
  const clock = signal.kind === "clock";
  const period = clampDuration(signal.periodPs);
  const offset = clock ? signal.phasePs : signal.busOffsetPs ?? 0;
  const origin = signal.startPs + offset;
  const tokens = signal.kind === "data" ? patternForDataSignal(signal) : [];
  const count = clock ? 2 : Math.min(tokens.length,10);
  const maximum = period * Math.max(1,count);
  const x = (time:number) => left + (right-left)*time/maximum;
  const firstSlot = Math.max(0,Math.floor(-origin/period));
  const firstTime = origin < 0 ? origin % period : origin;
  const visibleSlots = Array.from({length:count+1},(_,i)=>({
    index:firstSlot+i,
    time:firstTime+i*period,
  })).filter(slot=>slot.time < maximum && slot.time+period > 0);
  const showOffset = clock || (signal.kind==="data" && signal.busOffsetPs!==undefined);
  const result = clock ? "Rising edge" : "Slot 0";
  const second = clock ? "Phase" : "Channel offset";
  const description = `Start ${ps(signal.startPs)}${showOffset ? ', '+second+' '+ps(offset) : ''}. ${result} at ${ps(origin)}.`;
  // Pick readable major ticks and keep at least 65 SVG units between labels.
  const rawStep = maximum/4;
  const decade = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1,2,5,10].find(n=>n*decade>=rawStep) ?? 10)*decade;
  const ticks = Array.from({length:5},(_,i)=>i*step).filter(t=>t<=maximum);
  const measurement = (from:number,to:number,y:number, style:string) => <g className={style}>
    <path className="measure-line" d={`M ${x(from)} ${y} H ${x(to)} M ${x(from)} ${y-3} v6 M ${x(to)} ${y-3} v6`}/>
    <circle cx={x(to)} cy={y} r="2.3"/>
  </g>;
  return <figure className="scope">
    <figcaption><span className="scope-id"><i/>{clock?"CLOCK":"DATA"}</span>
      <span>{clock?"Rising edge":"Slot 0"} <b>{ps(origin)}</b></span></figcaption>
    <svg viewBox="0 0 364 110" role="img" aria-label={description}>
      <defs><clipPath id={clip}><rect x={left} y="7" width={right-left} height="84"/></clipPath></defs>
      {ticks.map(t=><g key={t}><path className="scope-grid" d={`M ${x(t)} 10 V 91`}/>
        <text x={x(t)} y="104" textAnchor={x(t)<35?"start":x(t)>320?"end":"middle"}>{ps(t)}</text></g>)}
      <path className="scope-grid" d="M 10 44 H 354 M 10 76 H 354"/>
      <g clipPath={`url(#${clip})`}>
      {measurement(0,signal.startPs,13,"start-mark")}
      {showOffset && measurement(signal.startPs,origin,24,"offset-mark")}
      <path className="scope-origin" d={`M ${x(origin)} ${showOffset?27:16} V 87`}/>
      {clock ? <>
        <path className="scope-base" d={clockPath(signal.startPs,period,signal.dutyCycle,maximum,x)}/>
        <path className="scope-wave" d={clockPath(origin,period,signal.dutyCycle,maximum,x)}/>
      </> : visibleSlots.map(({index:i,time})=>{
        const token=tokens[i%tokens.length];
        const previous=i>0?tokens[(i-1)%tokens.length]:undefined;
        const a=x(time), b=x(time+period);
        const labelLeft=Math.max(a,left), labelRight=Math.min(b,right);
        const y=token==="1"?44:76;
        const notch=Math.min(4,(b-a)/4);
        return <g key={i}><title>{`Slot ${i} · ${token}`}</title>
          <path className="slot-tick" d={`M ${a} 36 V 82`}/>
          {token==="0" || token==="1" ? <path className="scope-wave" d={`M ${a} ${previous==="1"?44:previous==="0"?76:y} V ${y} H ${b}`}/>
            : token==="Z" ? <path className="scope-wave impedance" d={`M ${a} 68 H ${b}`}/> :
            <path className="scope-symbol" d={`M ${a} 60 l ${notch} -13 H ${b-notch} L ${b} 60 l -${notch} 13 H ${a+notch} Z`}/>}
          {labelRight-labelLeft>16 && <text className="slot-value" x={(labelLeft+labelRight)/2} y="63" textAnchor="middle">{token.length*6<labelRight-labelLeft-4?token:"…"}</text>}
        </g>;
      })}</g>
    </svg>
    <div className="scope-legend"><span><i className="start-key"/>Start <b>{ps(signal.startPs)}</b></span>
      {showOffset && <span><i className="offset-key"/>{second} <b>{ps(offset)}</b></span>}
      {clock ? <span className="base-key">┄ Zero phase</span> : <span>{tokens.length} slots / loop</span>}
    </div>
  </figure>;
}
