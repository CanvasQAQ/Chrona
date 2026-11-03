import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { Tooltip } from "@mantine/core";
import { ChevronDown, Info } from "lucide-react";

export const CardsMode = createContext(false);

export function Help({text}: {text: string}) {
  return <Tooltip label={text} openDelay={850} multiline w={220} events={{hover:true, focus:true, touch:true}}>
    <button className="help-dot" type="button" aria-label={text}><Info size={13}/></button>
  </Tooltip>;
}

export function Card({title, note, children}: {title:string; note?:string; children:ReactNode}) {
  return <section className="setting-card" aria-label={title}>
    <header><h3>{title}</h3>{note && <Help text={note}/>}</header><div className="card-fields">{children}</div>
  </section>;
}

export function PrimaryCard(props: Parameters<typeof Card>[0]) {
  return useContext(CardsMode) ? <Card {...props}/> : <>{props.children}</>;
}

export function Section({ title, note, children, expanded = false }: {title: string; note?: string; children: ReactNode; expanded?: boolean}) {
  const [open, setOpen] = useState(expanded);
  const id = useId();
  if (useContext(CardsMode)) return <Card title={title} note={note}>{children}</Card>;
  return <section className="fold"><button type="button" className="fold-heading" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
    <span><b>{title}</b>{note && <small>{note}</small>}</span><ChevronDown size={16} />
  </button><div id={id} hidden={!open} className="fold-body">{children}</div></section>;
}
