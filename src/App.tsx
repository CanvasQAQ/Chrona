import {
  ActionIcon,
  Badge,
  Button,
  Menu,
  Popover,
  Slider,
  TextInput,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import {
  Check,
  CirclePlus,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  GripVertical,
  Grid2X2,
  Info,
  Minus,
  Moon,
  RotateCcw,
  Save,
  ScanLine,
  Square,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConvertibleTimeInput } from "./components/ConvertibleTimeInput";
import { DataPatternEditor } from "./components/DataPatternEditor";
import { RateInput } from "./components/RateInput";
import chronaIcon from "./assets/chrona.png";
import {
  buildPeriodGrid,
  clockWavePoints,
  colorForDataToken,
  patternForDataSignal,
  type ClockSignal,
  type DataPatternSegment,
  type DataSignal,
  type Signal,
  type TimingProject,
  type WavePoint,
} from "./domain/timing";

const MIN_TRACK_HEIGHT = 48;
const AXIS_HEIGHT = 42;
const CANVAS_GUTTER = 18;
const LABEL_WIDTH = 196;
const CANVAS_BASE_WIDTH = 1120;
const SIGNAL_COLORS = ["#8b7cff", "#35d6b4", "#ffb45c", "#4db7ff", "#f277a8"];

const initialProject: TimingProject = {
  version: 2,
  name: "Untitled",
  durationPs: 6000,
  constraintDraft: {
    setupPs: 180,
    holdPs: 120,
    status: "awaiting-definition",
  },
  signals: [],
};

interface DataSegment {
  endPs: number;
  startPs: number;
  token: string;
}

interface TrackLayout {
  height: number;
  signal: Signal;
  y: number;
}

interface CanvasPan {
  moved: boolean;
  pointerId: number;
  pointerX: number;
  pointerY: number;
  scrollLeft: number;
  scrollTop: number;
}

interface AxisSelection {
  currentX: number;
  pointerId: number;
  startX: number;
}

function pathForPoints(
  points: WavePoint[],
  durationPs: number,
  width: number,
  y: number,
  rowHeight: number,
): string {
  const amplitude = Math.max(18, rowHeight - 20);
  const center = y + rowHeight / 2;
  const high = center - amplitude / 2;
  const low = center + amplitude / 2;
  return points
    .map((point, index) => {
      const x =
        CANVAS_GUTTER +
        (point.timePs / durationPs) * (width - CANVAS_GUTTER * 2);
      const py = point.value ? high : low;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${py}`;
    })
    .join(" ");
}

function formatAxisTime(timePs: number): string {
  if (Math.abs(timePs) < 1000) {
    const digits = Math.abs(timePs) < 100 ? 2 : 1;
    return `${Number(timePs.toFixed(digits))} ps`;
  }
  const timeNs = timePs / 1000;
  const digits = Math.abs(timeNs) < 10 ? 3 : 2;
  return `${Number(timeNs.toFixed(digits))} ns`;
}

function buildDataSegments(
  signal: DataSignal,
  durationPs: number,
): DataSegment[] {
  const pattern = patternForDataSignal(signal);
  const segments: DataSegment[] = [];
  const startIndex = Math.floor(-signal.startPs / signal.periodPs);
  const firstIndex = Math.max(0, startIndex);
  const count =
    Math.ceil((durationPs - signal.startPs) / signal.periodPs) + 1;

  for (let index = firstIndex; index < count; index += 1) {
    const rawStart = signal.startPs + index * signal.periodPs;
    const rawEnd = rawStart + signal.periodPs;
    if (rawEnd <= 0 || rawStart >= durationPs) continue;
    const startPs = Math.max(0, rawStart);
    const endPs = Math.min(durationPs, rawEnd);
    const token = pattern[index % pattern.length];
    const previous = segments[segments.length - 1];
    if (
      previous?.token === token &&
      Math.abs(previous.endPs - startPs) < 1e-6
    ) {
      previous.endPs = endPs;
    } else {
      segments.push({ startPs, endPs, token });
    }
  }

  return segments;
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const EXPORTED_STYLE_PROPERTIES = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "paint-order",
  "vector-effect",
] as const;

function inlineSvgStyles(
  sourceSvg: SVGSVGElement,
  clonedSvg: SVGSVGElement,
) {
  const sourceElements: Element[] = [
    sourceSvg,
    ...Array.from(sourceSvg.querySelectorAll("*")),
  ];
  const clonedElements: Element[] = [
    clonedSvg,
    ...Array.from(clonedSvg.querySelectorAll("*")),
  ];

  sourceElements.forEach((sourceElement, index) => {
    const clonedElement = clonedElements[index];
    if (!clonedElement) return;
    const computed = getComputedStyle(sourceElement);
    let styles = EXPORTED_STYLE_PROPERTIES.map(
      (property) => `${property}:${computed.getPropertyValue(property)}`,
    ).join(";");
    const tokenColor = computed.getPropertyValue("--token-color").trim();
    if (tokenColor) styles += `;--token-color:${tokenColor}`;
    clonedElement.setAttribute("style", styles);
  });
}

function buildStandaloneSvg(
  sourceSvg: SVGSVGElement,
  layouts: TrackLayout[],
  width: number,
  height: number,
): string {
  const exported = document.createElementNS(SVG_NAMESPACE, "svg");
  exported.setAttribute("xmlns", SVG_NAMESPACE);
  exported.setAttribute("width", String(LABEL_WIDTH + width));
  exported.setAttribute("height", String(height));
  exported.setAttribute(
    "viewBox",
    `0 0 ${LABEL_WIDTH + width} ${height}`,
  );

  const background = document.createElementNS(SVG_NAMESPACE, "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", "#ffffff");
  exported.appendChild(background);

  const labelBackground = document.createElementNS(SVG_NAMESPACE, "rect");
  labelBackground.setAttribute("width", String(LABEL_WIDTH));
  labelBackground.setAttribute("height", String(height));
  labelBackground.setAttribute("fill", "#f8f8fb");
  exported.appendChild(labelBackground);

  const labelDivider = document.createElementNS(SVG_NAMESPACE, "line");
  labelDivider.setAttribute("x1", String(LABEL_WIDTH));
  labelDivider.setAttribute("x2", String(LABEL_WIDTH));
  labelDivider.setAttribute("y1", "0");
  labelDivider.setAttribute("y2", String(height));
  labelDivider.setAttribute("stroke", "#dfe1e8");
  exported.appendChild(labelDivider);

  const axisLabel = document.createElementNS(SVG_NAMESPACE, "text");
  axisLabel.setAttribute("x", "13");
  axisLabel.setAttribute("y", "25");
  axisLabel.setAttribute("fill", "#777a88");
  axisLabel.setAttribute("font-size", "9");
  axisLabel.setAttribute("font-family", "Inter, Arial, sans-serif");
  axisLabel.setAttribute("font-weight", "700");
  axisLabel.textContent = "SIGNAL";
  exported.appendChild(axisLabel);

  layouts.forEach(({ height: trackHeight, signal, y }) => {
    const divider = document.createElementNS(SVG_NAMESPACE, "line");
    divider.setAttribute("x1", "0");
    divider.setAttribute("x2", String(LABEL_WIDTH));
    divider.setAttribute("y1", String(y + trackHeight - 1));
    divider.setAttribute("y2", String(y + trackHeight - 1));
    divider.setAttribute("stroke", "#e3e4eb");
    exported.appendChild(divider);

    const label = document.createElementNS(SVG_NAMESPACE, "text");
    label.setAttribute("x", "13");
    label.setAttribute("y", String(y + trackHeight / 2 + 4));
    label.setAttribute("fill", "#20212b");
    label.setAttribute("font-size", "11");
    label.setAttribute("font-family", "Inter, Arial, sans-serif");
    label.setAttribute("font-weight", "700");
    label.textContent = signal.name;
    exported.appendChild(label);
  });

  const clonedCanvas = sourceSvg.cloneNode(true) as SVGSVGElement;
  inlineSvgStyles(sourceSvg, clonedCanvas);
  clonedCanvas.setAttribute("x", String(LABEL_WIDTH));
  clonedCanvas.setAttribute("y", "0");
  clonedCanvas.setAttribute("width", String(width));
  clonedCanvas.setAttribute("height", String(height));

  clonedCanvas
    .querySelectorAll<SVGElement>(".canvas-background")
    .forEach((element) => element.style.setProperty("fill", "#ffffff"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".grid-minor")
    .forEach((element) => element.style.setProperty("stroke", "#f0f1f5"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".grid-major, .row-divider")
    .forEach((element) => element.style.setProperty("stroke", "#dfe1e8"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".axis line")
    .forEach((element) => element.style.setProperty("stroke", "#c8cad3"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".axis text")
    .forEach((element) => element.style.setProperty("fill", "#686a78"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-logic-line, .data-transition-line")
    .forEach((element) => element.style.setProperty("stroke", "#0b8c73"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-high-z-line")
    .forEach((element) => element.style.setProperty("stroke", "#686a78"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-state-label")
    .forEach((element) => {
      element.style.setProperty("fill", "#20212b");
      element.style.setProperty("stroke", "#ffffff");
    });
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-symbol-shape")
    .forEach((element) => {
      const tokenColor =
        element.parentElement?.style.getPropertyValue("--token-color");
      if (!tokenColor) return;
      element.style.setProperty("fill", `${tokenColor}22`);
      element.style.setProperty("stroke", tokenColor);
    });
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-symbol-label")
    .forEach((element) => {
      const tokenColor =
        element.parentElement?.style.getPropertyValue("--token-color");
      if (tokenColor) element.style.setProperty("fill", tokenColor);
    });

  exported.appendChild(clonedCanvas);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(exported)}`;
}

function isTimingProject(value: unknown): value is TimingProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<TimingProject>;
  return project.version === 2 && Array.isArray(project.signals);
}

function App() {
  const [project, setProject] = useState<TimingProject>(initialProject);
  const [selectedId, setSelectedId] = useState("");
  const [zoom, setZoom] = useState(1);
  const [trackHeight, setTrackHeight] = useState(MIN_TRACK_HEIGHT);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [axisSelection, setAxisSelection] = useState<AxisSelection | null>(null);
  const [statusMessage, setStatusMessage] = useState("Timing engine ready");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const pendingScrollLeftRef = useRef<number | null>(null);
  const canvasPanRef = useRef<CanvasPan | null>(null);
  const axisSelectionRef = useRef<AxisSelection | null>(null);
  const { setColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme("light");
  const desktopPlatform = window.chronaWindow?.platform ?? "web";

  useEffect(() => {
    const controls = window.chronaWindow;
    if (!controls || controls.platform !== "win32") return;
    void controls.isMaximized().then(setIsWindowMaximized);
    return controls.onMaximizedChange(setIsWindowMaximized);
  }, []);

  const visibleSignals = useMemo(
    () => project.signals.filter((signal) => signal.visible),
    [project.signals],
  );
  const selected =
    project.signals.find((signal) => signal.id === selectedId) ??
    project.signals[0];
  const referenceClock = project.signals.find(
    (signal): signal is ClockSignal => signal.kind === "clock",
  );
  const referencePeriodPs = referenceClock?.periodPs ?? 1000;
  const canvasWidth = CANVAS_BASE_WIDTH * zoom;
  const trackLayouts = useMemo<TrackLayout[]>(() => {
    let y = AXIS_HEIGHT;
    return visibleSignals.map((signal) => {
      const layout = { height: trackHeight, signal, y };
      y += trackHeight;
      return layout;
    });
  }, [trackHeight, visibleSignals]);
  const canvasHeight = Math.max(
    AXIS_HEIGHT +
      trackLayouts.reduce((total, track) => total + track.height, 0),
    430,
  );
  const gridPeriodPs = selected?.periodPs ?? referencePeriodPs;
  const gridMarks = useMemo(
    () =>
      buildPeriodGrid(
        project.durationPs,
        gridPeriodPs,
        Math.max(1, canvasWidth - CANVAS_GUTTER * 2),
      ),
    [canvasWidth, gridPeriodPs, project.durationPs],
  );
  const timelineX = (timePs: number) =>
    CANVAS_GUTTER +
    (timePs / project.durationPs) * (canvasWidth - CANVAS_GUTTER * 2);

  const setAnchoredZoom = useCallback((nextZoom: number, anchorClientX?: number) => {
    if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;
    const viewport = canvasViewportRef.current;
    if (!viewport) {
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      return;
    }

    const currentZoom = zoomRef.current;
    const bounds = viewport.getBoundingClientRect();
    const pointerX =
      anchorClientX === undefined
        ? bounds.width / 2
        : anchorClientX - bounds.left;
    const oldCanvasWidth = CANVAS_BASE_WIDTH * currentZoom;
    const oldTimelineWidth = Math.max(
      1,
      oldCanvasWidth - CANVAS_GUTTER * 2,
    );
    const currentScrollLeft =
      pendingScrollLeftRef.current ?? viewport.scrollLeft;
    const oldCanvasX =
      currentScrollLeft + pointerX - LABEL_WIDTH - CANVAS_GUTTER;
    const timeRatio = Math.min(1, Math.max(0, oldCanvasX / oldTimelineWidth));
    const nextCanvasWidth = CANVAS_BASE_WIDTH * nextZoom;
    const nextCanvasX =
      CANVAS_GUTTER +
      timeRatio * Math.max(1, nextCanvasWidth - CANVAS_GUTTER * 2);

    pendingScrollLeftRef.current = Math.max(
      0,
      LABEL_WIDTH + nextCanvasX - pointerX,
    );
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  }, []);

  const fitAllWaveforms = useCallback(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const availableWidth = Math.max(1, viewport.clientWidth - LABEL_WIDTH);
    const nextZoom = availableWidth / CANVAS_BASE_WIDTH;
    pendingScrollLeftRef.current = 0;
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    setStatusMessage("All waveforms fitted to the viewport");
  }, []);

  useLayoutEffect(() => {
    const viewport = canvasViewportRef.current;
    const nextScrollLeft = pendingScrollLeftRef.current;
    if (!viewport || nextScrollLeft === null) return;

    viewport.scrollLeft = nextScrollLeft;
    pendingScrollLeftRef.current = null;
  }, [zoom]);

  const normalizedWheelDelta = (event: WheelEvent, viewport: HTMLElement) => {
    const rawDelta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return rawDelta * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return rawDelta * viewport.clientHeight;
    }
    return rawDelta;
  };

  const handleCanvasWheel = useCallback((event: WheelEvent) => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const wheelDelta = normalizedWheelDelta(event, viewport);

    if (event.ctrlKey) {
      event.preventDefault();
      const boundedDelta = Math.max(-120, Math.min(120, wheelDelta));
      const factor = Math.exp(-boundedDelta * 0.0025);
      setAnchoredZoom(zoomRef.current * factor, event.clientX);
      setStatusMessage("Timeline zoom follows pointer");
      return;
    }

    if (!event.shiftKey) return;
    event.preventDefault();
    const delta = -wheelDelta * 0.22;
    setTrackHeight((current) => Math.max(MIN_TRACK_HEIGHT, current + delta));
    setStatusMessage("All track heights adjusted");
  }, [setAnchoredZoom]);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", handleCanvasWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleCanvasWheel);
  }, [handleCanvasWheel]);

  const startCanvasPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX =
      ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * canvasWidth;
    const pointerY =
      ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * canvasHeight;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (pointerY <= AXIS_HEIGHT) {
      const selection = {
        currentX: Math.min(
          canvasWidth - CANVAS_GUTTER,
          Math.max(CANVAS_GUTTER, pointerX),
        ),
        pointerId: event.pointerId,
        startX: Math.min(
          canvasWidth - CANVAS_GUTTER,
          Math.max(CANVAS_GUTTER, pointerX),
        ),
      };
      axisSelectionRef.current = selection;
      setAxisSelection(selection);
      setStatusMessage("Drag across the time axis to zoom into a range");
      return;
    }

    canvasPanRef.current = {
      moved: false,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsCanvasPanning(true);
  };

  const moveCanvasPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    const selection = axisSelectionRef.current;
    if (selection?.pointerId === event.pointerId) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const pointerX =
        ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * canvasWidth;
      const nextSelection = {
        ...selection,
        currentX: Math.min(
          canvasWidth - CANVAS_GUTTER,
          Math.max(CANVAS_GUTTER, pointerX),
        ),
      };
      axisSelectionRef.current = nextSelection;
      setAxisSelection(nextSelection);
      return;
    }

    const pan = canvasPanRef.current;
    const viewport = canvasViewportRef.current;
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return;
    if (
      Math.abs(event.clientX - pan.pointerX) > 2 ||
      Math.abs(event.clientY - pan.pointerY) > 2
    ) {
      pan.moved = true;
    }
    viewport.scrollLeft = pan.scrollLeft + pan.pointerX - event.clientX;
    viewport.scrollTop = pan.scrollTop + pan.pointerY - event.clientY;
  };

  const endCanvasPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    const selection = axisSelectionRef.current;
    if (selection?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      axisSelectionRef.current = null;
      setAxisSelection(null);

      const viewport = canvasViewportRef.current;
      const selectionStart = Math.min(selection.startX, selection.currentX);
      const selectionEnd = Math.max(selection.startX, selection.currentX);
      const selectionWidth = selectionEnd - selectionStart;
      const timelineWidth = Math.max(1, canvasWidth - CANVAS_GUTTER * 2);
      if (!viewport || selectionWidth < 6) {
        setStatusMessage("Time range selection cancelled");
        return;
      }

      const selectedRatio = selectionWidth / timelineWidth;
      const startRatio =
        (selectionStart - CANVAS_GUTTER) / timelineWidth;
      const visibleTimelineWidth = Math.max(
        1,
        viewport.clientWidth - LABEL_WIDTH - CANVAS_GUTTER * 2,
      );
      const nextTimelineWidth = visibleTimelineWidth / selectedRatio;
      const nextCanvasWidth = nextTimelineWidth + CANVAS_GUTTER * 2;
      const nextZoom = nextCanvasWidth / CANVAS_BASE_WIDTH;
      const nextSelectionStart =
        CANVAS_GUTTER + startRatio * nextTimelineWidth;

      pendingScrollLeftRef.current = Math.max(
        0,
        nextSelectionStart - CANVAS_GUTTER,
      );
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      setStatusMessage("Selected time range fitted to the viewport");
      return;
    }

    const pan = canvasPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    canvasPanRef.current = null;
    setIsCanvasPanning(false);
    if (pan.moved) setStatusMessage("Canvas position updated");
  };

  const cancelCanvasInteraction = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (axisSelectionRef.current?.pointerId === event.pointerId) {
      axisSelectionRef.current = null;
      setAxisSelection(null);
      setStatusMessage("Time range selection cancelled");
    }
    if (canvasPanRef.current?.pointerId === event.pointerId) {
      canvasPanRef.current = null;
      setIsCanvasPanning(false);
    }
  };

  const updateSignal = (id: string, patch: Partial<Signal>) => {
    setProject((current) => ({
      ...current,
      signals: current.signals.map((signal) =>
        signal.id === id ? ({ ...signal, ...patch } as Signal) : signal,
      ),
    }));
  };

  const updateSelected = (patch: Partial<Signal>) => {
    if (selected) updateSignal(selected.id, patch);
  };

  const setSignalVisibility = (id: string, visible: boolean) => {
    updateSignal(id, { visible });
    if (!visible && selectedId === id) {
      const nextVisible = project.signals.find(
        (signal) => signal.id !== id && signal.visible,
      );
      if (nextVisible) setSelectedId(nextVisible.id);
    }
    setStatusMessage(visible ? "Signal shown" : "Signal hidden");
  };

  const addSignal = (kind: "clock" | "data") => {
    const id = `${kind}-${crypto.randomUUID()}`;
    const base = {
      id,
      name:
        kind === "clock"
          ? `CLK ${project.signals.length}`
          : `DATA ${project.signals.length}`,
      startPs: 0,
      visible: true,
      color: SIGNAL_COLORS[project.signals.length % SIGNAL_COLORS.length],
    };
    const signal: Signal =
      kind === "clock"
        ? {
            ...base,
            kind,
            periodPs: 1000,
            phasePs: 0,
            dutyCycle: 0.5,
          }
        : {
            ...base,
            kind,
            periodPs: 800,
            pattern: ["D0", "D1", "D2"],
          };

    setProject((current) => ({
      ...current,
      signals: [...current.signals, signal],
    }));
    setSelectedId(id);
    setStatusMessage(`${signal.name} added`);
  };

  const deleteSignal = (id: string) => {
    setProject((current) => {
      const next = current.signals.filter((signal) => signal.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id ?? "");
      return { ...current, signals: next };
    });
    setStatusMessage("Signal removed");
  };

  const duplicateSignal = (id: string) => {
    const sourceIndex = project.signals.findIndex((signal) => signal.id === id);
    const source = project.signals[sourceIndex];
    if (!source) return;

    const baseName = `${source.name} copy`;
    let name = baseName;
    let suffix = 2;
    while (project.signals.some((signal) => signal.name === name)) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }

    const duplicate: Signal =
      source.kind === "data"
        ? {
            ...source,
            id: `${source.kind}-${crypto.randomUUID()}`,
            name,
            pattern: [...source.pattern],
            patternSegments: source.patternSegments?.map((segment) => ({
              ...segment,
              id: crypto.randomUUID(),
            })),
          }
        : {
            ...source,
            id: `${source.kind}-${crypto.randomUUID()}`,
            name,
          };

    setProject((current) => {
      const signals = [...current.signals];
      signals.splice(sourceIndex + 1, 0, duplicate);
      return { ...current, signals };
    });
    setSelectedId(duplicate.id);
    setStatusMessage(`${duplicate.name} created`);
  };

  const moveSignal = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setProject((current) => {
      const from = current.signals.findIndex((signal) => signal.id === sourceId);
      const to = current.signals.findIndex((signal) => signal.id === targetId);
      if (from < 0 || to < 0) return current;
      const signals = [...current.signals];
      const [moved] = signals.splice(from, 1);
      signals.splice(to, 0, moved);
      return { ...current, signals };
    });
    setStatusMessage("Signal order updated");
  };

  const moveSignalByOffset = (id: string, offset: number) => {
    const index = project.signals.findIndex((signal) => signal.id === id);
    const target = project.signals[index + offset];
    if (target) moveSignal(id, target.id);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    if (draggedId) moveSignal(draggedId, targetId);
    setDraggedId(null);
    setDragOverId(null);
  };

  const saveProject = () => {
    downloadFile(
      `${project.name.toLowerCase().replace(/\s+/g, "-")}.chrona.json`,
      JSON.stringify(project, null, 2),
      "application/json",
    );
    setStatusMessage("Project saved");
  };

  const exportSvg = () => {
    if (!svgRef.current) return;
    const source = buildStandaloneSvg(
      svgRef.current,
      trackLayouts,
      canvasWidth,
      canvasHeight,
    );
    downloadFile(
      `${project.name.toLowerCase().replace(/\s+/g, "-")}.svg`,
      source,
      "image/svg+xml",
    );
    setStatusMessage("SVG exported");
  };

  const openProject = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const loaded: unknown = JSON.parse(String(reader.result));
        if (!isTimingProject(loaded)) {
          setStatusMessage("This project uses an unsupported schema");
          return;
        }
        setProject(loaded);
        setSelectedId(loaded.signals[0]?.id ?? "");
        setStatusMessage(`${loaded.name} opened`);
      } catch {
        setStatusMessage("Could not read this project file");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  return (
    <div className="app-shell" data-platform={desktopPlatform}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <img src={chronaIcon} alt="" />
          </div>
          <div>
            <div className="brand-name">Chrona</div>
            <div className="brand-meta">TIMING STUDIO</div>
          </div>
        </div>

        <div className="topbar-actions">
          <Tooltip label="Open project">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              aria-label="Open project"
              onClick={() => fileInputRef.current?.click()}
            >
              <FolderOpen size={18} />
            </ActionIcon>
          </Tooltip>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".json,.chrona.json"
            onChange={openProject}
          />
          <Tooltip label="Save project">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              aria-label="Save project"
              onClick={saveProject}
            >
              <Save size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={`Switch to ${colorScheme === "dark" ? "light" : "dark"} theme`}
          >
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              aria-label="Toggle color theme"
              onClick={() =>
                setColorScheme(colorScheme === "dark" ? "light" : "dark")
              }
            >
              {colorScheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </ActionIcon>
          </Tooltip>
          <Button
            leftSection={<Download size={16} />}
            size="sm"
            onClick={exportSvg}
          >
            Export SVG
          </Button>
        </div>
        {desktopPlatform === "win32" && (
          <div className="window-controls" aria-label="Window controls">
            <button
              type="button"
              aria-label="Minimize window"
              onClick={() => window.chronaWindow?.minimize()}
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              aria-label={isWindowMaximized ? "Restore window" : "Maximize window"}
              onClick={() => window.chronaWindow?.toggleMaximize()}
            >
              {isWindowMaximized ? <Copy size={13} /> : <Square size={13} />}
            </button>
            <button
              type="button"
              className="window-close"
              aria-label="Close window"
              onClick={() => window.chronaWindow?.close()}
            >
              <X size={17} />
            </button>
          </div>
        )}
      </header>

      <div className="workspace">
        <main className="editor">
          <div className="editor-toolbar">
            <div className="canvas-mode">
              <Grid2X2 size={16} />
              <div>
                <span>Waveform canvas</span>
                <small>
                  Axis drag: select range · Canvas drag: pan · Ctrl + wheel: zoom
                </small>
              </div>
            </div>
            <div className="editor-actions">
              <Menu shadow="md" width={220} position="bottom-end">
                <Menu.Target>
                  <Button
                    variant="subtle"
                    color="gray"
                    size="compact-sm"
                    leftSection={<Eye size={15} />}
                  >
                    Signals
                    {project.signals.some((signal) => !signal.visible) &&
                      ` · ${project.signals.filter((signal) => !signal.visible).length} hidden`}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Signal visibility</Menu.Label>
                  {project.signals.length === 0 ? (
                    <Menu.Item disabled>No signals yet</Menu.Item>
                  ) : (
                    project.signals.map((signal) => (
                      <Menu.Item
                        key={signal.id}
                        closeMenuOnClick={false}
                        leftSection={
                          signal.visible ? <Eye size={15} /> : <EyeOff size={15} />
                        }
                        rightSection={signal.visible ? "Shown" : "Hidden"}
                        onClick={() =>
                          setSignalVisibility(signal.id, !signal.visible)
                        }
                      >
                        {signal.name}
                      </Menu.Item>
                    ))
                  )}
                  {project.signals.length > 0 && (
                    <>
                      <Menu.Divider />
                      <Menu.Item
                        onClick={() => {
                          setProject((current) => ({
                            ...current,
                            signals: current.signals.map((signal) => ({
                              ...signal,
                              visible: true,
                            })),
                          }));
                          setStatusMessage("All signals shown");
                        }}
                      >
                        Show all
                      </Menu.Item>
                      <Menu.Item
                        onClick={() => {
                          setProject((current) => ({
                            ...current,
                            signals: current.signals.map((signal) => ({
                              ...signal,
                              visible: false,
                            })),
                          }));
                          setStatusMessage("All signals hidden");
                        }}
                      >
                        Hide all
                      </Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>

              <Menu shadow="md" width={180} position="bottom-end">
                <Menu.Target>
                  <Button
                    variant="light"
                    size="compact-sm"
                    leftSection={<CirclePlus size={15} />}
                  >
                    Add
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Signal type</Menu.Label>
                  <Menu.Item
                    leftSection={<Clock3 size={16} />}
                    onClick={() => addSignal("clock")}
                  >
                    Clock
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<ScanLine size={16} />}
                    onClick={() => addSignal("data")}
                  >
                    Data
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>

              <Tooltip label="Fit all waveforms">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label="Fit all waveforms"
                  onClick={fitAllWaveforms}
                >
                  <RotateCcw size={16} />
                </ActionIcon>
              </Tooltip>
            </div>
          </div>

          <div
            ref={canvasViewportRef}
            className="canvas-viewport"
            role="region"
            aria-label="Timing canvas viewport"
          >
            <div
              className="canvas-content"
              style={{ width: LABEL_WIDTH + canvasWidth, minHeight: canvasHeight }}
            >
              <div
                className="fixed-signal-labels"
                style={{ width: LABEL_WIDTH, height: canvasHeight }}
              >
                <div className="axis-label">
                  <span>TRACKS</span>
                  <small>Drag to reorder</small>
                </div>
                {trackLayouts.map(({ height, signal }) => (
                  <div
                    key={signal.id}
                    className={[
                      "track-header",
                      signal.id === selectedId ? "selected" : "",
                      signal.id === dragOverId ? "drag-over" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ height }}
                    draggable
                    onDragStart={() => setDraggedId(signal.id)}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverId(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverId(signal.id);
                    }}
                    onDrop={(event) => handleDrop(event, signal.id)}
                  >
                    <GripVertical
                      className="track-drag-grip"
                      size={14}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      className="track-select"
                      aria-pressed={signal.id === selectedId}
                      onClick={() => setSelectedId(signal.id)}
                      onKeyDown={(event) => {
                        if (event.altKey && event.key === "ArrowUp") {
                          event.preventDefault();
                          moveSignalByOffset(signal.id, -1);
                        }
                        if (event.altKey && event.key === "ArrowDown") {
                          event.preventDefault();
                          moveSignalByOffset(signal.id, 1);
                        }
                      }}
                    >
                      <span>{signal.name}</span>
                    </button>
                    <Tooltip label={`Duplicate ${signal.name}`}>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label={`Duplicate ${signal.name}`}
                        onClick={() => duplicateSignal(signal.id)}
                      >
                        <Copy size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Popover
                      opened={pendingDeleteId === signal.id}
                      onChange={(opened) =>
                        setPendingDeleteId(opened ? signal.id : null)
                      }
                      position="bottom-end"
                      width={168}
                      withArrow
                      shadow="md"
                    >
                      <Popover.Target>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          aria-label={`Delete ${signal.name}`}
                          onClick={() => setPendingDeleteId(signal.id)}
                        >
                          <Trash2 size={14} />
                        </ActionIcon>
                      </Popover.Target>
                      <Popover.Dropdown className="delete-confirmation">
                        <span>Delete {signal.name}?</span>
                        <div>
                          <Tooltip label="Cancel">
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="sm"
                              aria-label={`Cancel deleting ${signal.name}`}
                              onClick={() => setPendingDeleteId(null)}
                            >
                              <X size={14} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Confirm delete">
                            <ActionIcon
                              variant="light"
                              color="red"
                              size="sm"
                              aria-label={`Confirm deleting ${signal.name}`}
                              onClick={() => {
                                deleteSignal(signal.id);
                                setPendingDeleteId(null);
                              }}
                            >
                              <Check size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </div>
                      </Popover.Dropdown>
                    </Popover>
                  </div>
                ))}
              </div>

              <svg
                ref={svgRef}
                className={[
                  "timing-canvas",
                  isCanvasPanning ? "is-panning" : "",
                  axisSelection ? "is-selecting" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                width={canvasWidth}
                height={canvasHeight}
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                role="img"
                aria-label="Interactive timing diagram"
                onPointerDown={startCanvasPan}
                onPointerMove={moveCanvasPan}
                onPointerUp={endCanvasPan}
                onPointerCancel={cancelCanvasInteraction}
              >
                <defs>
                  <pattern
                    id="unknown-hatch"
                    width="8"
                    height="8"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <line
                      className="unknown-hatch-line"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="8"
                    />
                  </pattern>
                </defs>
                <rect className="canvas-background" width="100%" height="100%" />
                <rect
                  className="axis-hitbox"
                  x="0"
                  y="0"
                  width="100%"
                  height={AXIS_HEIGHT}
                />
                {axisSelection && (
                  <rect
                    className="time-selection"
                    x={Math.min(axisSelection.startX, axisSelection.currentX)}
                    y="0"
                    width={Math.abs(
                      axisSelection.currentX - axisSelection.startX,
                    )}
                    height="100%"
                  />
                )}
                <g className="grid">
                  {gridMarks.map((mark) => {
                    const x = timelineX(mark.timePs);
                    return (
                      <line
                        key={mark.timePs}
                        x1={x}
                        x2={x}
                        y1={AXIS_HEIGHT}
                        y2="100%"
                        className={mark.isMajor ? "grid-major" : "grid-minor"}
                      />
                    );
                  })}
                </g>

                <g className="axis">
                  {gridMarks
                    .filter((mark) => mark.showLabel)
                    .map((mark) => {
                    const x = timelineX(mark.timePs);
                    return (
                      <g
                        key={mark.timePs}
                        transform={`translate(${x} 0)`}
                      >
                        <line y1={31} y2={AXIS_HEIGHT} />
                        <text y={22} textAnchor="middle">
                          {formatAxisTime(mark.timePs)}
                        </text>
                      </g>
                    );
                  })}
                </g>

                {trackLayouts.map(({ height, signal, y }) => {
                  return (
                    <g key={signal.id} className="wave-row">
                      <rect
                        className="row-hitbox"
                        x="0"
                        y={y}
                        width="100%"
                        height={height}
                      />
                      <line
                        className="row-divider"
                        x1="0"
                        x2="100%"
                        y1={y + height - 1}
                        y2={y + height - 1}
                      />
                      {signal.kind === "clock" ? (
                        <>
                          <path
                            d={pathForPoints(
                              clockWavePoints(signal, project.durationPs),
                              project.durationPs,
                              canvasWidth,
                              y,
                              height,
                            )}
                            fill="none"
                            stroke={signal.color}
                            className="wave-path-glow"
                          />
                          <path
                            d={pathForPoints(
                              clockWavePoints(signal, project.durationPs),
                              project.durationPs,
                              canvasWidth,
                              y,
                              height,
                            )}
                            fill="none"
                            stroke={signal.color}
                            className="wave-path"
                          />
                        </>
                      ) : (
                        <g className="data-symbols">
                          {(() => {
                            const segments = buildDataSegments(
                              signal,
                              project.durationPs,
                            );
                            return segments.map((segment, segmentIndex) => {
                              const x1 = timelineX(segment.startPs);
                              const x2 = timelineX(segment.endPs);
                              const centerY = y + height / 2;
                              const halfHeight = Math.max(
                                10,
                                (height - 20) / 2,
                              );
                              const notch = Math.min(7, (x2 - x1) / 4);
                              const color = colorForDataToken(segment.token);
                              const token = segment.token.toUpperCase();
                              const previousToken =
                                segments[segmentIndex - 1]?.token.toUpperCase();
                              const nextToken =
                                segments[segmentIndex + 1]?.token.toUpperCase();
                              if (token === "0" || token === "1") {
                                const logicY =
                                  token === "1"
                                    ? centerY - halfHeight
                                    : centerY + halfHeight;
                                const previousLogicY =
                                  previousToken === "1"
                                    ? centerY - halfHeight
                                    : centerY + halfHeight;
                                const previousIsLogic =
                                  previousToken === "0" ||
                                  previousToken === "1";
                                const nextIsLogic =
                                  nextToken === "0" || nextToken === "1";
                                const transitionWidth = Math.min(
                                  7,
                                  Math.max(0, (x2 - x1) / 4),
                                );
                                const lineStart = previousToken && !previousIsLogic
                                  ? x1 + transitionWidth
                                  : x1;
                                const lineEnd = nextToken && !nextIsLogic
                                  ? x2 - transitionWidth
                                  : x2;
                                return (
                                  <g key={`${segment.startPs}-${segmentIndex}`}>
                                    {previousToken &&
                                      !previousIsLogic && (
                                        <path
                                          d={`M ${x1} ${centerY} L ${lineStart} ${logicY}`}
                                          className="data-transition-line"
                                        />
                                      )}
                                    {previousIsLogic &&
                                      previousToken !== token && (
                                        <line
                                          x1={x1}
                                          x2={x1}
                                          y1={previousLogicY}
                                          y2={logicY}
                                          className="data-logic-line"
                                        />
                                      )}
                                    <line
                                      x1={lineStart}
                                      x2={lineEnd}
                                      y1={logicY}
                                      y2={logicY}
                                      className="data-logic-line"
                                    />
                                    {nextToken && !nextIsLogic && (
                                      <path
                                        d={`M ${lineEnd} ${logicY} L ${x2} ${centerY}`}
                                        className="data-transition-line"
                                      />
                                    )}
                                  </g>
                                );
                              }

                              if (token === "X") {
                                return (
                                  <g key={`${segment.startPs}-${segmentIndex}`}>
                                    <path
                                      d={[
                                        `M ${x1} ${centerY}`,
                                        `L ${x1 + notch} ${centerY - halfHeight}`,
                                        `L ${x2 - notch} ${centerY - halfHeight}`,
                                        `L ${x2} ${centerY}`,
                                        `L ${x2 - notch} ${centerY + halfHeight}`,
                                        `L ${x1 + notch} ${centerY + halfHeight}`,
                                        "Z",
                                      ].join(" ")}
                                      className="data-unknown-fill"
                                    />
                                    {x2 - x1 > 30 && (
                                      <text
                                        x={(x1 + x2) / 2}
                                        y={centerY + 4}
                                        textAnchor="middle"
                                        className="data-state-label"
                                      >
                                        X
                                      </text>
                                    )}
                                  </g>
                                );
                              }

                              if (token === "Z") {
                                return (
                                  <g key={`${segment.startPs}-${segmentIndex}`}>
                                    <line
                                      x1={x1}
                                      x2={x2}
                                      y1={centerY}
                                      y2={centerY}
                                      className="data-high-z-line"
                                    />
                                    {x2 - x1 > 30 && (
                                      <text
                                        x={(x1 + x2) / 2}
                                        y={centerY - 6}
                                        textAnchor="middle"
                                        className="data-state-label"
                                      >
                                        Z
                                      </text>
                                    )}
                                  </g>
                                );
                              }

                              return (
                                <g
                                  key={`${segment.startPs}-${segmentIndex}`}
                                  style={{ "--token-color": color } as CSSProperties}
                                >
                                  <path
                                    d={[
                                      `M ${x1} ${centerY}`,
                                      `L ${x1 + notch} ${centerY - halfHeight}`,
                                      `L ${x2 - notch} ${centerY - halfHeight}`,
                                      `L ${x2} ${centerY}`,
                                      `L ${x2 - notch} ${centerY + halfHeight}`,
                                      `L ${x1 + notch} ${centerY + halfHeight}`,
                                      "Z",
                                    ].join(" ")}
                                    className="data-symbol-shape"
                                  />
                                  {x2 - x1 > 38 && (
                                    <text
                                      x={(x1 + x2) / 2}
                                      y={centerY + 4}
                                      textAnchor="middle"
                                      className="data-symbol-label"
                                    >
                                      {segment.token}
                                    </text>
                                  )}
                                </g>
                              );
                            });
                          })()}
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="statusbar">
            <div className="status-item" aria-live="polite">
              <span className="status-dot" />
              {statusMessage}
            </div>
            <div>Schema v{project.version}</div>
            <div>
              Grid: {selected?.name ?? "reference"} /{" "}
              {formatAxisTime(gridPeriodPs / 4)}
            </div>
          </div>
        </main>

        <aside className="property-panel">
          <div className="panel-heading property-heading">
            <div>
              <span className="eyebrow">INSPECTOR</span>
              <h2>Properties</h2>
            </div>
            {selected && (
              <Badge
                variant="light"
                color={selected.kind === "clock" ? "violet" : "teal"}
              >
                {selected.kind}
              </Badge>
            )}
          </div>

          {selected && (
            <div className="property-content">
              <section className="property-section">
                <div className="section-title">
                  <span>Signal</span>
                  <span className="section-index">01</span>
                </div>
                <TextInput
                  label="Name"
                  value={selected.name}
                  onChange={(event) => updateSelected({ name: event.target.value })}
                />
                <ConvertibleTimeInput
                  label="Start"
                  description={`Relative to ${referenceClock?.name ?? "reference clock"}`}
                  valuePs={selected.startPs}
                  referencePeriodPs={referencePeriodPs}
                  onChange={(startPs) => updateSelected({ startPs })}
                />
              </section>

              <section className="property-section">
                <div className="section-title">
                  <span>Timing</span>
                  <span className="section-index">02</span>
                </div>
                <RateInput
                  periodPs={selected.periodPs}
                  onChange={(periodPs) => updateSelected({ periodPs })}
                />

                {selected.kind === "clock" && (
                  <>
                    <ConvertibleTimeInput
                      label="Clock phase"
                      description="Same value, editable as time or angle"
                      valuePs={selected.phasePs}
                      referencePeriodPs={selected.periodPs}
                      onChange={(phasePs) => updateSelected({ phasePs })}
                    />
                    <div className="slider-field">
                      <div className="slider-label">
                        <span>Duty cycle</span>
                        <strong>{Math.round(selected.dutyCycle * 100)}%</strong>
                      </div>
                      <Slider
                        min={10}
                        max={90}
                        step={5}
                        value={selected.dutyCycle * 100}
                        label={(value) => `${value}%`}
                        onChange={(value) =>
                          updateSelected({ dutyCycle: value / 100 })
                        }
                      />
                    </div>
                  </>
                )}
              </section>

              {selected.kind === "data" && (
                <section className="property-section pattern-section">
                  <div className="section-title">
                    <span>Pattern builder</span>
                    <span className="section-index">03</span>
                  </div>
                  <DataPatternEditor
                    key={selected.id}
                    pattern={selected.pattern}
                    segments={selected.patternSegments}
                    onChange={(
                      pattern: string[],
                      patternSegments: DataPatternSegment[],
                    ) => updateSelected({ pattern, patternSegments })}
                  />
                </section>
              )}

              <section className="analysis-paused">
                <Info size={16} />
                <div>
                  <strong>Setup / Hold model paused</strong>
                  <p>
                    The previous sweep has been removed. Min/max delay,
                    uncertainty and violation semantics will be designed as a
                    separate analysis model.
                  </p>
                </div>
              </section>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;
