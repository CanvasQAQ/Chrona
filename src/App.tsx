import {
  ActionIcon,
  Button,
  Menu,
  Modal,
  NumberInput,
  Popover,
  Select,
  SegmentedControl,
  Switch,
  TextInput,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
} from "@mantine/core";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  Grid2X2,
  GitBranch,
  Layers3,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  ScanLine,
  Search,
  Settings2,
  SlidersHorizontal,
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
import { SignalTimingEditor } from "./components/SignalTimingEditor";
import { BusEditor } from "./components/BusEditor";
import { PropertyPanel } from "./features/inspector/PropertyPanel";
import { DelayConsole } from "./features/delay-console/DelayConsole";
import {
  AXIS_HEIGHT,
  CANVAS_BASE_WIDTH,
  CANVAS_GUTTER,
  DEFAULT_LABEL_WIDTH,
  MAX_LABEL_WIDTH,
  MAX_TRACK_HEIGHT,
  MIN_LABEL_WIDTH,
  MIN_TRACK_HEIGHT,
  autoLabelWidth,
  buildBusSummarySegments,
  buildDataSegments,
  formatAxisTime,
  measureBusSummaryText,
  pathForPoints,
  type TrackLayout,
} from "./features/canvas/canvasGeometry";
import {
  ProjectHeader,
  type ExportMode,
} from "./features/project/ProjectHeader";
import { buildStandaloneSvg } from "./features/project/svgExport";
import {
  downloadTextFile,
  parseTimingProject,
} from "./features/project/projectSerialization";
import {
  buildPeriodGrid,
  clockWavePoints,
  colorForDataToken,
  isSequentialDataSignal,
  resolveTimingConstraint,
  type DelayRange,
  type DataLabelColor,
  type DataLabelSize,
  type EdgeDelayLink,
  type ClockSignal,
  type DataSignal,
  type Signal,
  type SignalGroup,
  type TimingProject,
  type TimingConstraint,
  WAVEFORM_PALETTES,
} from "./domain/timing";
import {
  latchTransparentIntervals,
  resolveProjectTiming,
  segmentsForResolvedWaveform,
} from "./domain/sequential";
import { applyBusPatterns, busChannels, createBus, createBusChannels, fitBusSlotLabel, generateBusPattern, resizeBus, updateBusDefaults } from "./domain/bus";
import type { Bus } from "./domain/timing";

const DEFAULT_CANVAS_SETTINGS = {
  showVerticalGrid: true,
  gridMode: "auto" as const,
  gridIntervalPs: 250,
  trackHeight: MIN_TRACK_HEIGHT,
  waveformPalette: "contrast24" as const,
  clockColorMode: "multi" as const,
  clockColorIndex: 0,
  dataLabelSize: "large" as const,
  dataLabelColor: "token" as const,
  waveformGlow: false,
};

const PALETTE_CHOICES = [
  { value: "contrast24", label: "Clarity" },
  { value: "vivid", label: "Vivid" },
  { value: "monochrome", label: "Black & white" },
] as const;

const initialProject: TimingProject = {
  version: 3,
  name: "Untitled",
  durationPs: 6000,
  constraintDraft: {
    setupPs: 10,
    holdPs: 10,
    status: "awaiting-definition",
  },
  delayLinks: [],
  timingConstraints: [],
  canvasSettings: DEFAULT_CANVAS_SETTINGS,
  signals: [],
};

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

interface ExportRange {
  endPs: number;
  startPs: number;
}


function App() {
  const colorScheme = useComputedColorScheme("light");
  const [project, setProject] = useState<TimingProject>(initialProject);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [signalDraft, setSignalDraft] = useState<Signal | null>(null);
  const [busDraft, setBusDraft] = useState<Bus | null>(null);
  const [delayDraft, setDelayDraft] = useState<EdgeDelayLink | null>(null);
  const [constraintDraft, setConstraintDraft] = useState<TimingConstraint | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [patternResetVersion, setPatternResetVersion] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [labelWidth, setLabelWidth] = useState(DEFAULT_LABEL_WIDTH);
  const [isLabelWidthAuto, setIsLabelWidthAuto] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingBusResize, setPendingBusResize] = useState<{ id: string; width: number; removed: number; links: number; constraints: number; derived: number } | null>(null);
  const [busEditorVersion, setBusEditorVersion] = useState(0);
  const [axisSelection, setAxisSelection] = useState<AxisSelection | null>(null);
  const [signalsPanelOpen, setSignalsPanelOpen] = useState(false);
  const [signalSearch, setSignalSearch] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("view");
  const [exportStartPs, setExportStartPs] = useState(0);
  const [exportEndPs, setExportEndPs] = useState(initialProject.durationPs);
  const [statusMessage, setStatusMessage] = useState("Timing engine ready");
  const [delayConsoleOpen, setDelayConsoleOpen] = useState(false);
  const [delayConsoleCollapsed, setDelayConsoleCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const fitToViewportRef = useRef(false);
  const pendingScrollLeftRef = useRef<number | null>(null);
  const canvasPanRef = useRef<CanvasPan | null>(null);
  const axisSelectionRef = useRef<AxisSelection | null>(null);
  const labelResizeRef = useRef<{
    pointerId: number;
    startWidth: number;
    startX: number;
  } | null>(null);
  const desktopPlatform = window.chronaWindow?.platform ?? "web";

  const signalNameKey = project.signals
    .map((signal) => signal.name)
    .join("\u0000");

  useLayoutEffect(() => {
    if (!isLabelWidthAuto) return;
    setLabelWidth(Math.max(project.buses?.length ? DEFAULT_LABEL_WIDTH : 0, autoLabelWidth(project.signals)));
  }, [isLabelWidthAuto, signalNameKey, project.buses?.length]);

  const busById = useMemo(() => new Map((project.buses ?? []).map((bus) => [bus.id, bus])), [project.buses]);
  const displaySignals = useMemo(() => {
    const rows: Signal[] = [];
    const seen = new Set<string>();
    for (const signal of project.signals) {
      const bus = signal.kind === "data" && signal.busId ? busById.get(signal.busId) : undefined;
      if (bus) {
        if (!seen.has(bus.id)) {
          seen.add(bus.id);
          if (bus.visible) rows.push({ id: bus.id, kind: "data", name: bus.name, startPs: bus.startPs, periodPs: bus.periodPs, pattern: ["BUS"], visible: true, color: signal.color });
        }
        if (bus.visible && signal.visible && (bus.displayMode === "all" || bus.displayMode === "selected" && bus.selectedChannels.includes(signal.kind === "data" ? signal.busIndex ?? -1 : -1))) rows.push(signal);
      } else if (signal.visible) rows.push(signal);
    }
    return rows;
  }, [project.signals, busById]);
  const signalGroups = project.signalGroups ?? [];
  const managerSignals = useMemo(() => [
    ...project.signals.filter((signal) => signal.kind !== "data" || !signal.busId),
    ...(project.buses ?? []).map((bus): DataSignal => ({ id: bus.id, kind: "data", name: bus.name, groupId: bus.groupId, startPs: bus.startPs, periodPs: bus.periodPs, pattern: ["BUS"], visible: bus.visible, color: "#687aa2" })),
  ], [project.signals, project.buses]);
  const normalizedSignalSearch = signalSearch.trim().toLocaleLowerCase();
  const matchingSignals = useMemo(
    () =>
      managerSignals.filter((signal) =>
        signal.name.toLocaleLowerCase().includes(normalizedSignalSearch),
      ),
    [normalizedSignalSearch, managerSignals],
  );
  const selectedBus = busById.get(selectedId);
  const selected = project.signals.find((signal) => signal.id === selectedId) ??
    (!selectedBus && !selectedId ? project.signals.find((signal) => signal.kind !== "data" || !signal.busId) : undefined);
  const referenceClock = project.signals.find(
    (signal): signal is ClockSignal => signal.kind === "clock",
  );
  const selectedDelayLink = selected
    ? (project.delayLinks ?? []).find(
        (link) => link.targetSignalId === selected.id,
      )
    : undefined;
  const derivedDelayCount = project.signals.reduce(
    (count, signal) =>
      isSequentialDataSignal(signal)
        ? count +
          1 +
          (signal.derivation.device === "latch" && signal.derivation.d2q
            ? 1
            : 0)
        : count,
    0,
  );
  const consoleDelayCount =
    (project.delayLinks?.length ?? 0) + derivedDelayCount;
  const selectedConstraint = selected
    ? (project.timingConstraints ?? []).find(
        (constraint) => constraint.targetSignalId === selected.id,
      )
    : undefined;
  const resolvedProjectTiming = useMemo(
    () =>
      resolveProjectTiming(
        project.signals,
        project.durationPs,
        project.delayLinks ?? [],
      ),
    [project.delayLinks, project.durationPs, project.signals],
  );
  const resolvedSequentialSignals = resolvedProjectTiming;
  const referencePeriodPs = referenceClock?.periodPs ?? 1000;
  const canvasSettings = project.canvasSettings ?? DEFAULT_CANVAS_SETTINGS;
  const waveformPalette = canvasSettings.waveformPalette ?? "contrast24";
  const dataLabelSize = canvasSettings.dataLabelSize ?? "large";
  const dataLabelColor = canvasSettings.dataLabelColor ?? "token";
  const waveformGlow = canvasSettings.waveformGlow ?? false;
  const clockColorMode = canvasSettings.clockColorMode === "single" ? "single" : "multi";
  const monochrome = waveformPalette === "monochrome";
  const contrastPalette = waveformPalette === "contrast16" || waveformPalette === "contrast24";
  const palette = WAVEFORM_PALETTES[waveformPalette];
  const displaySignalColors = colorScheme === "dark"
    ? palette.darkSignal ?? palette.signal
    : palette.signal;
  const displayTokenColors = colorScheme === "dark"
    ? palette.darkToken ?? palette.token
    : palette.token;
  const clockColorIndex = Number.isFinite(canvasSettings.clockColorIndex)
    ? Math.max(0, Math.floor(canvasSettings.clockColorIndex ?? 0)) % displaySignalColors.length
    : 0;
  const singleClockColor = displaySignalColors[clockColorIndex];
  const dataTokenColors = useMemo(() => {
    const assigned = new Map<string, string>();
    if (!contrastPalette) return assigned;
    const order: string[] = [];
    const neighbors = new Map<string, Set<string>>();

    for (const signal of project.signals) {
      if (signal.kind !== "data") continue;
      const resolvedWaveform = resolvedSequentialSignals.bySignalId[signal.id];
      const segments = isSequentialDataSignal(signal) && resolvedWaveform
        ? segmentsForResolvedWaveform(resolvedWaveform, project.durationPs)
        : buildDataSegments(signal, project.durationPs);
      let previousToken: string | undefined;
      for (const segment of segments) {
        const token = segment.token.trim().toUpperCase();
        if (["0", "1", "X", "Z"].includes(token)) {
          previousToken = undefined;
          continue;
        }
        if (!neighbors.has(token)) {
          neighbors.set(token, new Set());
          order.push(token);
        }
        if (previousToken && previousToken !== token) {
          neighbors.get(token)?.add(previousToken);
          neighbors.get(previousToken)?.add(token);
        }
        previousToken = token;
      }
    }

    for (const token of order) {
      const preferred = assigned.size % displayTokenColors.length;
      const usedByNeighbors = new Set(
        [...(neighbors.get(token) ?? [])].map((neighbor) => assigned.get(neighbor)),
      );
      let color = displayTokenColors[preferred];
      for (let offset = 0; offset < displayTokenColors.length; offset += 1) {
        const candidate = displayTokenColors[(preferred + offset) % displayTokenColors.length];
        if (!usedByNeighbors.has(candidate)) {
          color = candidate;
          break;
        }
      }
      assigned.set(token, color);
    }
    return assigned;
  }, [contrastPalette, displayTokenColors, project.durationPs, project.signals, resolvedSequentialSignals]);
  const dataLabelFontSize = {
    small: 8,
    medium: 10,
    large: 12,
  }[dataLabelSize];
  const dataLabelFill = (tokenColor: string) => {
    if (monochrome) return colorScheme === "dark" ? "#ffffff" : "#111111";
    if (dataLabelColor === "contrast") return "var(--text)";
    if (dataLabelColor === "muted") return "var(--text-soft)";
    return tokenColor;
  };
  const trackHeight = Math.min(
    MAX_TRACK_HEIGHT,
    Math.max(MIN_TRACK_HEIGHT, canvasSettings.trackHeight),
  );
  const canvasWidth = CANVAS_BASE_WIDTH * zoom;
  const trackLayouts = useMemo<TrackLayout[]>(() => {
    let y = AXIS_HEIGHT;
    return displaySignals.map((signal) => {
      const layout = { height: trackHeight, signal, y };
      y += trackHeight;
      return layout;
    });
  }, [trackHeight, displaySignals]);
  const trackLayoutBySignal = useMemo(
    () => new Map(trackLayouts.map((layout) => [layout.signal.id, layout])),
    [trackLayouts],
  );
  const resolvedDelayLinks = {
    byId: resolvedProjectTiming.delayById,
    signalShiftsPs: resolvedProjectTiming.signalShiftsPs,
  };
  const resolvedConstraints = useMemo(
    () =>
      (project.timingConstraints ?? []).map((constraint) => ({
        constraint,
        resolved: resolveTimingConstraint(
          project.signals,
          project.durationPs,
          constraint,
          resolvedDelayLinks.signalShiftsPs,
          (signal, polarity) =>
            resolvedProjectTiming.edgeTimes(signal.id, polarity),
        ),
      })),
    [
      project.durationPs,
      project.signals,
      project.timingConstraints,
      resolvedDelayLinks.signalShiftsPs,
      resolvedProjectTiming,
    ],
  );
  const canvasHeight = Math.max(
    AXIS_HEIGHT +
      trackLayouts.reduce((total, track) => total + track.height, 0),
    430,
  );
  const selectedDerivedClock = isSequentialDataSignal(selected)
    ? project.signals.find(
        (signal): signal is ClockSignal =>
          signal.kind === "clock" &&
          signal.id === selected.derivation.clockSignalId,
      )
    : undefined;
  const gridPeriodPs = selectedDerivedClock?.periodPs ?? selected?.periodPs ?? referencePeriodPs;
  const gridIntervalPs =
    canvasSettings.gridMode === "custom"
      ? Math.max(1, canvasSettings.gridIntervalPs)
      : gridPeriodPs / 4;
  const gridMarks = useMemo(
    () =>
      buildPeriodGrid(
        project.durationPs,
        canvasSettings.gridMode === "custom"
          ? gridIntervalPs
          : gridPeriodPs,
        Math.max(1, canvasWidth - CANVAS_GUTTER * 2),
        canvasSettings.gridMode === "custom" ? 1 : 4,
      ),
    [
      canvasSettings.gridMode,
      canvasWidth,
      gridIntervalPs,
      gridPeriodPs,
      project.durationPs,
    ],
  );
  const timelineX = (timePs: number) =>
    CANVAS_GUTTER +
    (timePs / project.durationPs) * (canvasWidth - CANVAS_GUTTER * 2);

  const setAnchoredZoom = useCallback((nextZoom: number, anchorClientX?: number) => {
    if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;
    fitToViewportRef.current = false;
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
      currentScrollLeft + pointerX - labelWidth - CANVAS_GUTTER;
    const timeRatio = Math.min(1, Math.max(0, oldCanvasX / oldTimelineWidth));
    const nextCanvasWidth = CANVAS_BASE_WIDTH * nextZoom;
    const nextCanvasX =
      CANVAS_GUTTER +
      timeRatio * Math.max(1, nextCanvasWidth - CANVAS_GUTTER * 2);

    pendingScrollLeftRef.current = Math.max(
      0,
      labelWidth + nextCanvasX - pointerX,
    );
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  }, [labelWidth]);

  const fitAllWaveforms = useCallback(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    fitToViewportRef.current = true;
    const availableWidth = Math.max(1, viewport.clientWidth - labelWidth);
    const nextZoom = availableWidth / CANVAS_BASE_WIDTH;
    pendingScrollLeftRef.current = 0;
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    setStatusMessage("All waveforms fitted to the viewport");
  }, [labelWidth]);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (!fitToViewportRef.current) return;
      const nextZoom = Math.max(1, viewport.clientWidth - labelWidth) / CANVAS_BASE_WIDTH;
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [labelWidth]);

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

  const updateTrackHeight = useCallback(
    (next: number | ((current: number) => number)) => {
      setProject((current) => {
        const settings = current.canvasSettings ?? DEFAULT_CANVAS_SETTINGS;
        const currentHeight = Math.min(
          MAX_TRACK_HEIGHT,
          Math.max(MIN_TRACK_HEIGHT, settings.trackHeight),
        );
        const requested =
          typeof next === "function" ? next(currentHeight) : next;
        return {
          ...current,
          canvasSettings: {
            ...settings,
            trackHeight: Math.min(
              MAX_TRACK_HEIGHT,
              Math.max(MIN_TRACK_HEIGHT, requested),
            ),
          },
        };
      });
    },
    [],
  );

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
    updateTrackHeight((current) => current + delta);
    setStatusMessage("All track heights adjusted");
  }, [setAnchoredZoom, updateTrackHeight]);

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
        viewport.clientWidth - labelWidth - CANVAS_GUTTER * 2,
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
      fitToViewportRef.current = false;
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
        signal.id === id ? ({ ...signal, ...patch,
          ...(signal.kind === "data" && signal.busId ? { busOverrides: {
            ...signal.busOverrides,
            ...(patch.startPs !== undefined ? { startPs: true } : {}),
            ...(patch.periodPs !== undefined ? { periodPs: true } : {}),
            ...("pattern" in patch || "patternSegments" in patch ? { pattern: true } : {}),
          } } : {}),
        } as Signal) : signal,
      ),
    }));
  };

  const updateBus = (id: string, patch: Partial<Bus>) => {
    setProject((current) => updateBusDefaults(current, id, patch));
  };

  const resizeSelectedBus = (id: string, width: number) => {
    if (!Number.isInteger(width) || width < 1 || width > 256) return;
    const old = busById.get(id);
    if (!old || old.width === width) return;
    if (width < old.width) {
      const removed = new Set(busChannels(project, id).filter((signal) => (signal.busIndex ?? 0) >= width).map((signal) => signal.id));
      const links = (project.delayLinks ?? []).filter((link) => removed.has(link.sourceSignalId) || removed.has(link.targetSignalId)).length;
      const constraints = (project.timingConstraints ?? []).filter((item) => removed.has(item.sourceSignalId) || removed.has(item.targetSignalId)).length;
      const derived = project.signals.filter((signal) => isSequentialDataSignal(signal) &&
        (removed.has(signal.derivation.dataSignalId) || removed.has(signal.derivation.clockSignalId))).length;
      setPendingBusResize({ id, width, removed: removed.size, links, constraints, derived });
      return;
    }
    setProject((current) => resizeBus(current, id, width, palette.signal[0]));
    setStatusMessage(`${old.name} now has ${width} channels`);
  };

  const confirmBusResize = () => {
    if (!pendingBusResize) return;
    const { id, width } = pendingBusResize;
    const name = busById.get(id)?.name ?? "Bus";
    setProject((current) => resizeBus(current, id, width, palette.signal[0]));
    setStatusMessage(`${name} now has ${width} channels${pendingBusResize.derived ? ` · ${pendingBusResize.derived} derived signal(s) need a new source` : ""}`);
    setPendingBusResize(null);
  };

  const applyPatternsToBus = (id: string, patterns: string[][], indexes: number[], replaceOverrides: boolean, generated: boolean) => {
    const selectedIndexes = new Map(indexes.map((index, position) => [index, patterns[position]]));
    setProject((current) => applyBusPatterns(current, id, patterns, indexes, replaceOverrides, generated));
    const skipped = busChannels(project, id).filter((signal) => selectedIndexes.has(signal.busIndex ?? -1) && signal.busOverrides?.pattern && !replaceOverrides).length;
    setStatusMessage(`${patterns.length - skipped} channels updated${skipped ? ` · ${skipped} local Pattern edits preserved` : ""}`);
  };

  const restoreBusParameter = (signalId: string, parameter: "pattern" | "startPs" | "periodPs") => {
    setProject((current) => ({ ...current, signals: current.signals.map((signal): Signal => {
      if (signal.id !== signalId || signal.kind !== "data" || !signal.busId) return signal;
      const bus = current.buses?.find((item) => item.id === signal.busId);
      if (!bus) return signal;
      return { ...signal, ...(parameter === "pattern" ? { pattern: generateBusPattern(bus.rule, signal.busIndex ?? 0), patternSegments: undefined } : { [parameter]: bus[parameter] }), busOverrides: { ...signal.busOverrides, [parameter]: false } };
    }) }));
    if (parameter === "pattern") setPatternResetVersion((value) => value + 1);
  };

  const updateSelected = (patch: Partial<Signal>) => {
    if (selected) updateSignal(selected.id, patch);
  };

  const setSignalVisibility = (id: string, visible: boolean) => {
    if (busById.has(id)) updateBus(id, { visible }); else updateSignal(id, { visible });
    if (!visible && selectedId === id) {
      const nextVisible = project.signals.find(
        (signal) => signal.id !== id && signal.visible && (signal.kind !== "data" || !signal.busId || signal.busId !== id),
      );
      setSelectedId(nextVisible?.kind === "data" && nextVisible.busId ? nextVisible.busId : nextVisible?.id ?? project.buses?.find((bus) => bus.id !== id && bus.visible)?.id ?? "");
    }
    setStatusMessage(visible ? "Signal shown" : "Signal hidden");
  };

  const setSignalsVisibility = (ids: string[], visible: boolean) => {
    const idSet = new Set(ids);
    setProject((current) => ({
      ...current,
      signals: current.signals.map((signal) =>
        idSet.has(signal.id) ? { ...signal, visible } : signal,
      ),
      buses: current.buses?.map((bus) => idSet.has(bus.id) ? { ...bus, visible } : bus),
    }));
    if (!visible && selected && idSet.has(selected.id)) {
      const nextVisible = project.signals.find(
        (signal) => !idSet.has(signal.id) && signal.visible,
      );
      setSelectedId(nextVisible?.id ?? "");
    }
    setStatusMessage(
      visible
        ? `${ids.length} signal${ids.length === 1 ? "" : "s"} shown`
        : `${ids.length} signal${ids.length === 1 ? "" : "s"} hidden`,
    );
  };

  const createSignalGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    const group: SignalGroup = { id: crypto.randomUUID(), name };
    setProject((current) => ({
      ...current,
      signalGroups: [...(current.signalGroups ?? []), group],
    }));
    setNewGroupName("");
    setStatusMessage(`${name} group created`);
  };

  const deleteSignalGroup = (groupId: string) => {
    const group = signalGroups.find((item) => item.id === groupId);
    setProject((current) => ({
      ...current,
      signalGroups: (current.signalGroups ?? []).filter(
        (item) => item.id !== groupId,
      ),
      signals: current.signals.map((signal) =>
        signal.groupId === groupId
          ? { ...signal, groupId: undefined }
          : signal,
      ),
      buses: current.buses?.map((bus) => bus.groupId === groupId ? { ...bus, groupId: undefined } : bus),
    }));
    setStatusMessage(`${group?.name ?? "Signal"} group removed`);
  };

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const startLabelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    labelResizeRef.current = {
      pointerId: event.pointerId,
      startWidth: labelWidth,
      startX: event.clientX,
    };
    setIsLabelWidthAuto(false);
  };

  const moveLabelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = labelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setLabelWidth(
      Math.min(
        MAX_LABEL_WIDTH,
        Math.max(MIN_LABEL_WIDTH, resize.startWidth + event.clientX - resize.startX),
      ),
    );
  };

  const endLabelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (labelResizeRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    labelResizeRef.current = null;
    setStatusMessage(`Signal column set to ${Math.round(labelWidth)} px`);
  };

  const resetLabelWidth = () => {
    setIsLabelWidthAuto(true);
    setLabelWidth(Math.max(project.buses?.length ? DEFAULT_LABEL_WIDTH : 0, autoLabelWidth(project.signals)));
    setStatusMessage("Signal column fitted to the 85th percentile");
  };

  const addSignal = (kind: "clock" | "data") => {
    const id = `${kind}-${crypto.randomUUID()}`;
    const base = {
      id,
      name:
        kind === "clock"
          ? `CLK ${project.signals.filter((signal) => signal.kind === "clock").length + 1}`
          : `DATA ${project.signals.filter((signal) => signal.kind === "data" && !signal.busId).length + 1}`,
      startPs: 0,
      visible: true,
      color: palette.signal[project.signals.length % palette.signal.length],
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

    setSignalDraft(signal);
  };

  const addBus = () => setBusDraft(createBus(`BUS ${1 + (project.buses?.length ?? 0)}`));

  const deleteBus = (id: string) => {
    const bus = busById.get(id);
    const removedIds = new Set(busChannels(project, id).map((signal) => signal.id));
    const brokenDerived = project.signals.filter((signal) => isSequentialDataSignal(signal) &&
      (removedIds.has(signal.derivation.dataSignalId) || removedIds.has(signal.derivation.clockSignalId))).length;
    setProject((current) => {
      const ids = new Set(busChannels(current, id).map((signal) => signal.id));
      return { ...current, buses: current.buses?.filter((item) => item.id !== id),
        signals: current.signals.filter((signal) => !ids.has(signal.id)),
        delayLinks: current.delayLinks?.filter((link) => !ids.has(link.sourceSignalId) && !ids.has(link.targetSignalId)),
        timingConstraints: current.timingConstraints?.filter((item) => !ids.has(item.sourceSignalId) && !ids.has(item.targetSignalId)),
      };
    });
    if (selectedId === id || busChannels(project, id).some((signal) => signal.id === selectedId)) {
      setSelectedId(project.signals.find((signal) => !removedIds.has(signal.id) && (signal.kind !== "data" || !signal.busId))?.id ?? project.buses?.find((item) => item.id !== id)?.id ?? "");
    }
    setStatusMessage(`${bus?.name ?? "Bus"} removed${brokenDerived ? ` · ${brokenDerived} derived signal(s) need a new source` : ""}`);
  };

  const duplicateBus = (id: string) => {
    const source = busById.get(id);
    if (!source) return;
    const original = busChannels(project, id);
    const copy = { ...source, id: `bus-${crypto.randomUUID()}`, name: `${source.name} copy`, selectedChannels: [...source.selectedChannels] };
    const ids = new Map(original.map((signal) => [signal.id, `data-${crypto.randomUUID()}`]));
    const channels: DataSignal[] = original.map((signal) => ({ ...signal,
      id: ids.get(signal.id)!, busId: copy.id,
      name: signal.name === `${source.name}〈${signal.busIndex}〉` ? `${copy.name}〈${signal.busIndex}〉` : signal.name,
      pattern: [...signal.pattern], patternSegments: signal.patternSegments?.map((segment) => ({ ...segment, id: crypto.randomUUID() })),
      busOverrides: signal.busOverrides ? { ...signal.busOverrides } : undefined,
      derivation: signal.derivation ? { ...signal.derivation,
        clockSignalId: ids.get(signal.derivation.clockSignalId) ?? signal.derivation.clockSignalId,
        dataSignalId: ids.get(signal.derivation.dataSignalId) ?? signal.derivation.dataSignalId,
      } : undefined,
    }));
    setProject((current) => {
      const signals = [...current.signals];
      const at = signals.reduce((index, signal, current) => signal.kind === "data" && signal.busId === id ? current : index, -1);
      signals.splice(at + 1, 0, ...channels);
      return { ...current, buses: [...(current.buses ?? []), copy], signals,
        delayLinks: [...(current.delayLinks ?? []), ...(current.delayLinks ?? []).filter((link) => ids.has(link.targetSignalId)).map((link) => ({ ...link, id: crypto.randomUUID(), sourceSignalId: ids.get(link.sourceSignalId) ?? link.sourceSignalId, targetSignalId: ids.get(link.targetSignalId)! }))],
        timingConstraints: [...(current.timingConstraints ?? []), ...(current.timingConstraints ?? []).filter((item) => ids.has(item.targetSignalId)).map((item) => ({ ...item, id: crypto.randomUUID(), sourceSignalId: ids.get(item.sourceSignalId) ?? item.sourceSignalId, targetSignalId: ids.get(item.targetSignalId)! }))],
      };
    });
    setSelectedId(copy.id);
    setStatusMessage(`${copy.name} created`);
  };

  const addDerivedSignal = () => {
    const clock = project.signals.find(
      (signal): signal is ClockSignal => signal.kind === "clock",
    );
    const preferredData =
      selected?.kind === "data" ? selected : undefined;
    const data =
      preferredData ??
      project.signals.find(
        (signal): signal is DataSignal => signal.kind === "data",
      );
    if (!clock || !data) {
      setStatusMessage("Add at least one Clock and one Data signal first");
      return;
    }
    const id = `data-${crypto.randomUUID()}`;
    let outputIndex = 0;
    let name = "Q";
    while (project.signals.some((signal) => signal.name === name)) {
      outputIndex += 1;
      name = `Q${outputIndex}`;
    }
    const signal: DataSignal = {
      id,
      kind: "data",
      sourceType: "sequential",
      name,
      startPs: 0,
      periodPs: clock.periodPs,
      pattern: ["X"],
      visible: true,
      color: palette.signal[project.signals.length % palette.signal.length],
      derivation: {
        device: "latch",
        clockSignalId: clock.id,
        dataSignalId: data.id,
        trigger: "high",
        c2q: { minPs: 0, currentPs: 10, maxPs: 20 },
        d2q: { minPs: 0, currentPs: 20, maxPs: 40 },
        initialValue: "X",
      },
    };
    setSignalDraft(signal);
  };

  const addDelayForTarget = (
    targetSignalId: string,
    sourceSignalId: string,
  ) => {
    const target = project.signals.find((signal) => signal.id === targetSignalId);
    if (!target || targetSignalId === sourceSignalId) return;
    const existing = project.delayLinks ?? [];
    const usedLabels = new Set(existing.map((link) => link.label?.trim()));
    let labelIndex = existing.length + 1;
    while (usedLabels.has(`t${labelIndex}`)) labelIndex += 1;
    setDelayDraft({
      id: crypto.randomUUID(), label: `t${labelIndex}`,
      sourceSignalId, targetSignalId, sourceEdge: 1, targetEdge: 1,
      minPs: 0, currentPs: 10, maxPs: 20,
    });
  };

  const addSelectedDelay = (sourceSignalId: string) => {
    if (selected) addDelayForTarget(selected.id, sourceSignalId);
  };

  const updateDelayForTarget = (
    targetSignalId: string,
    patch: Partial<EdgeDelayLink>,
  ) => {
    const target = project.signals.find((signal) => signal.id === targetSignalId);
    setProject((current) => ({
      ...current,
      delayLinks: (current.delayLinks ?? []).map((link) =>
        link.targetSignalId === targetSignalId ? { ...link, ...patch } : link,
      ),
    }));
    setStatusMessage(`${target?.name ?? "Signal"} delay updated`);
  };

  const removeDelayForTarget = (targetSignalId: string) => {
    const target = project.signals.find((signal) => signal.id === targetSignalId);
    setProject((current) => ({
      ...current,
      delayLinks: (current.delayLinks ?? []).filter(
        (link) => link.targetSignalId !== targetSignalId,
      ),
    }));
    setStatusMessage(`${target?.name ?? "Signal"} delay removed`);
  };

  const updateSelectedDelay = (patch: Partial<EdgeDelayLink>) => {
    if (!selectedDelayLink) return;
    updateDelayForTarget(selectedDelayLink.targetSignalId, patch);
  };

  const updateDerivedDelay = (
    signalId: string,
    delayKind: "c2q" | "d2q",
    range: DelayRange,
  ) => {
    const target = project.signals.find((signal) => signal.id === signalId);
    setProject((current) => ({
      ...current,
      signals: current.signals.map((signal) => {
        if (signal.id !== signalId || !isSequentialDataSignal(signal)) {
          return signal;
        }
        return {
          ...signal,
          derivation: {
            ...signal.derivation,
            [delayKind]: range,
          },
        };
      }),
    }));
    setStatusMessage(
      `${target?.name ?? "Derived signal"} ${delayKind === "c2q" ? "C→Q" : "D→Q"} updated`,
    );
  };

  const addSelectedConstraint = (sourceSignalId: string) => {
    if (!selected) return;
    const constraint: TimingConstraint = {
      id: crypto.randomUUID(),
      sourceSignalId,
      targetSignalId: selected.id,
      sourceEdge: 1,
      targetEdge: 1,
      sourceEdges: [],
      targetEdges: [],
      sourceEdgeKind:
        project.signals.find((signal) => signal.id === sourceSignalId)?.kind ===
        "clock"
          ? "rising"
          : "transition",
      targetEdgeKind: selected.kind === "clock" ? "rising" : "transition",
      setupPs: project.constraintDraft.setupPs,
      holdPs: project.constraintDraft.holdPs,
    };
    setConstraintDraft(constraint);
  };

  const updateSelectedConstraint = (patch: Partial<TimingConstraint>) => {
    if (!selectedConstraint) return;
    setProject((current) => ({
      ...current,
      timingConstraints: (current.timingConstraints ?? []).map((constraint) =>
        constraint.id === selectedConstraint.id
          ? { ...constraint, ...patch }
          : constraint,
      ),
    }));
    setStatusMessage(`${selected?.name ?? "Signal"} constraint updated`);
  };

  const deleteSignal = (id: string) => {
    setProject((current) => {
      const next = current.signals.filter((signal) => signal.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id ?? "");
      return {
        ...current,
        signals: next,
        delayLinks: (current.delayLinks ?? []).filter(
          (link) =>
            link.sourceSignalId !== id && link.targetSignalId !== id,
        ),
        timingConstraints: (current.timingConstraints ?? []).filter(
          (constraint) =>
            constraint.sourceSignalId !== id &&
            constraint.targetSignalId !== id,
        ),
      };
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
    const targetSignal = project.signals.find((signal) => signal.id === targetId);
    if (targetSignal?.kind === "data" && targetSignal.busId) targetId = targetSignal.busId;
    if (sourceId === targetId) return;
    setProject((current) => {
      const sourceBus = current.buses?.find((bus) => bus.id === sourceId);
      const targetBus = current.buses?.find((bus) => bus.id === targetId);
      const sourceIds = new Set(sourceBus ? busChannels(current, sourceId).map((signal) => signal.id) : [sourceId]);
      const from = current.signals.findIndex((signal) => sourceIds.has(signal.id));
      const to = current.signals.findIndex((signal) => targetBus ? signal.kind === "data" && signal.busId === targetId : signal.id === targetId);
      if (from < 0 || to < 0) return current;
      const moved = current.signals.filter((signal) => sourceIds.has(signal.id));
      const signals = current.signals.filter((signal) => !sourceIds.has(signal.id));
      const targetIndex = signals.findIndex((signal) => targetBus ? signal.kind === "data" && signal.busId === targetId : signal.id === targetId);
      signals.splice(targetIndex, 0, ...moved);
      return { ...current, signals };
    });
    setStatusMessage("Signal order updated");
  };

  const moveSignalByOffset = (id: string, offset: number) => {
    const roots: string[] = [];
    for (const signal of project.signals) {
      const root = signal.kind === "data" && signal.busId ? signal.busId : signal.id;
      if (!roots.includes(root)) roots.push(root);
    }
    const index = roots.indexOf(id);
    const target = roots[index + offset];
    if (target) moveSignal(id, target);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    if (draggedId) moveSignal(draggedId, targetId);
    setDraggedId(null);
    setDragOverId(null);
  };

  const saveProject = () => {
    downloadTextFile(
      `${project.name.toLowerCase().replace(/\s+/g, "-")}.chrona.json`,
      JSON.stringify(project, null, 2),
      "application/json",
    );
    setStatusMessage("Project saved");
  };

  const currentViewRange = (): ExportRange => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return { startPs: 0, endPs: project.durationPs };
    const timelineWidth = Math.max(1, canvasWidth - CANVAS_GUTTER * 2);
    const visibleWidth = Math.max(1, viewport.clientWidth - labelWidth);
    const startX = Math.max(CANVAS_GUTTER, viewport.scrollLeft);
    const endX = Math.min(
      canvasWidth - CANVAS_GUTTER,
      viewport.scrollLeft + visibleWidth,
    );
    return {
      startPs:
        (Math.max(CANVAS_GUTTER, startX) - CANVAS_GUTTER) /
        timelineWidth *
        project.durationPs,
      endPs:
        (Math.max(startX, endX) - CANVAS_GUTTER) /
        timelineWidth *
        project.durationPs,
    };
  };

  const exportSvg = () => {
    if (!svgRef.current) return;
    const range =
      exportMode === "view"
        ? currentViewRange()
        : exportMode === "range"
          ? {
              startPs: Math.max(0, Math.min(project.durationPs, exportStartPs)),
              endPs: Math.max(0, Math.min(project.durationPs, exportEndPs)),
            }
          : { startPs: 0, endPs: project.durationPs };
    if (range.endPs <= range.startPs) {
      setStatusMessage("Export end time must be after start time");
      return;
    }
    const viewportTimelineWidth = Math.max(
      480,
      (canvasViewportRef.current?.clientWidth ?? 800) - labelWidth,
    );
    const rangeRatio = (range.endPs - range.startPs) / project.durationPs;
    const outputTimelineWidth =
      exportMode === "view"
        ? viewportTimelineWidth
        : exportMode === "all"
          ? CANVAS_BASE_WIDTH
          : Math.max(640, Math.min(2400, CANVAS_BASE_WIDTH * rangeRatio));
    const source = buildStandaloneSvg(
      svgRef.current,
      trackLayouts,
      canvasWidth,
      canvasHeight,
      labelWidth,
      range,
      project.durationPs,
      outputTimelineWidth,
      dataLabelColor,
      waveformPalette,
      colorScheme === "dark",
    );
    downloadTextFile(
      `${project.name.toLowerCase().replace(/\s+/g, "-")}.svg`,
      source,
      "image/svg+xml",
    );
    setExportPanelOpen(false);
    setStatusMessage(
      `SVG exported · ${formatAxisTime(range.startPs)}–${formatAxisTime(range.endPs)}`,
    );
  };

  const openProject = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseTimingProject(String(reader.result), {
        canvasSettings: DEFAULT_CANVAS_SETTINGS,
        durationPs: initialProject.durationPs,
      });
      if (!result.ok) {
        setStatusMessage(
          result.reason === "unsupported"
            ? "This project uses an unsupported schema"
            : "Could not read this project file",
        );
        return;
      }

      setProject(result.project);
      const first = result.project.signals[0];
      setSelectedId(first?.kind === "data" && first.busId ? first.busId : first?.id ?? "");
      setExportStartPs(0);
      setExportEndPs(result.project.durationPs);
      setIsLabelWidthAuto(true);
      setStatusMessage(`${result.project.name} opened`);
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const renderSignalGroup = (group?: SignalGroup) => {
    const groupId = group?.id ?? "ungrouped";
    const knownGroupIds = new Set(signalGroups.map((item) => item.id));
    const belongsToGroup = (signal: Signal) =>
      group
        ? signal.groupId === group.id
        : !signal.groupId || !knownGroupIds.has(signal.groupId);
    const allGroupSignals = managerSignals.filter(belongsToGroup);
    const signals = matchingSignals.filter(belongsToGroup);
    if (signals.length === 0 && normalizedSignalSearch) return null;
    if (signals.length === 0 && !group) return null;
    const collapsed = collapsedGroups.has(groupId) && !normalizedSignalSearch;
    const allVisible =
      allGroupSignals.length > 0 &&
      allGroupSignals.every((signal) => signal.visible);

    return (
      <section className="signal-group" key={groupId}>
        <div className="signal-group-heading">
          <UnstyledButton
            className="signal-group-toggle"
            aria-expanded={!collapsed}
            onClick={() => toggleGroupCollapsed(groupId)}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span>{group?.name ?? "Ungrouped"}</span>
            <small>{signals.length}</small>
          </UnstyledButton>
          <div className="signal-group-actions">
            <Tooltip label={allVisible ? "Hide group" : "Show group"}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                disabled={allGroupSignals.length === 0}
                aria-label={`${allVisible ? "Hide" : "Show"} ${group?.name ?? "ungrouped"} signals`}
                onClick={() =>
                  setSignalsVisibility(
                    allGroupSignals.map((signal) => signal.id),
                    !allVisible,
                  )
                }
              >
                {allVisible ? <EyeOff size={14} /> : <Eye size={14} />}
              </ActionIcon>
            </Tooltip>
            {group && (
              <Tooltip label="Remove group">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  aria-label={`Remove ${group.name} group`}
                  onClick={() => deleteSignalGroup(group.id)}
                >
                  <Trash2 size={13} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>
        </div>
        {!collapsed && (
          <div className="signal-manager-list">
            {signals.length === 0 ? (
              <div className="signal-manager-empty">No signals in this group</div>
            ) : (
              signals.map((signal) => (
                <div className="signal-manager-row" key={signal.id}>
                  <ActionIcon
                    variant="subtle"
                    color={signal.visible ? "violet" : "gray"}
                    size="sm"
                    aria-label={`${signal.visible ? "Hide" : "Show"} ${signal.name}`}
                    onClick={() => setSignalVisibility(signal.id, !signal.visible)}
                  >
                    {signal.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </ActionIcon>
                  <UnstyledButton
                    className="signal-manager-name"
                    title={signal.name}
                    onClick={() => {
                      setSelectedId(signal.id);
                      setSignalsPanelOpen(false);
                    }}
                  >
                    <span
                      className="signal-color-dot"
                      style={{
                        backgroundColor: signal.kind === "clock" && clockColorMode === "single"
                          ? singleClockColor
                          : signal.color,
                      }}
                    />
                    <span>{signal.name}</span>
                  </UnstyledButton>
                  <Select
                    className="signal-group-select"
                    aria-label={`Group for ${signal.name}`}
                    value={signal.groupId ?? ""}
                    data={[
                      { label: "Ungrouped", value: "" },
                      ...signalGroups.map((item) => ({
                        label: item.name,
                        value: item.id,
                      })),
                    ]}
                    allowDeselect={false}
                    withCheckIcon={false}
                    size="xs"
                    classNames={{
                      dropdown: "signal-group-dropdown",
                      option: "signal-group-option",
                    }}
                    comboboxProps={{ position: "bottom-end", shadow: "md" }}
                    onChange={(value) =>
                      busById.has(signal.id) ? updateBus(signal.id, { groupId: value || undefined }) : updateSignal(signal.id, { groupId: value || undefined })
                    }
                  />
                </div>
              ))
            )}
          </div>
        )}
      </section>
    );
  };

  const signalWithLinkedStart = (signal: Signal): Signal => {
    const shiftPs = resolvedDelayLinks.signalShiftsPs[signal.id] ?? 0;
    return shiftPs === 0
      ? signal
      : { ...signal, startPs: signal.startPs + shiftPs };
  };

  const renderSequentialGuides = () => {
    if (!isSequentialDataSignal(selected)) return null;
    const layout = trackLayoutBySignal.get(selected.id);
    const waveform = resolvedSequentialSignals.bySignalId[selected.id];
    const sourceClock = project.signals.find(
      (signal): signal is ClockSignal =>
        signal.kind === "clock" &&
        signal.id === selected.derivation.clockSignalId,
    );
    const clock = sourceClock
      ? (resolvedProjectTiming.clockBySignalId[sourceClock.id] ?? sourceClock)
      : undefined;
    if (!layout || !waveform || !clock) return null;
    const intervals =
      selected.derivation.device === "latch"
        ? latchTransparentIntervals(
            clock,
            selected.derivation.trigger === "low" ? "low" : "high",
            project.durationPs,
          )
        : [];
    return (
      <g className="sequential-guides" aria-label="Derived signal delay ranges">
        {intervals.map((interval, index) => {
          const x1 = timelineX(interval.startPs);
          const x2 = timelineX(interval.endPs);
          return (
            <rect
              key={`transparent-${index}`}
              className="latch-transparent-window"
              x={x1}
              y={layout.y + 3}
              width={Math.max(0, x2 - x1)}
              height={Math.max(1, layout.height - 6)}
              rx="3"
            />
          );
        })}
        {waveform.events.map((event, index) => {
          const minX = timelineX(event.minTimePs);
          const maxX = timelineX(event.maxTimePs);
          const currentX = timelineX(event.timePs);
          const top = layout.y + 5;
          const bottom = layout.y + layout.height - 5;
          return (
            <g key={`${event.timePs}-${index}`} className={`sequential-delay-range is-${event.cause}`}>
              <title>{`${event.cause.toUpperCase()} · ${formatAxisTime(event.timePs - event.causeTimePs)} · ${formatAxisTime(event.minTimePs - event.causeTimePs)}–${formatAxisTime(event.maxTimePs - event.causeTimePs)}`}</title>
              <rect
                x={Math.min(minX, maxX)}
                y={top}
                width={Math.max(1, Math.abs(maxX - minX))}
                height={Math.max(1, bottom - top)}
                rx="3"
              />
              <line x1={minX} x2={minX} y1={top} y2={bottom} />
              <line x1={maxX} x2={maxX} y1={top} y2={bottom} />
              <text x={currentX + 3} y={top + 8}>{event.cause === "c2q" ? "C→Q" : "D→Q"}</text>
            </g>
          );
        })}
      </g>
    );
  };

  const renderDelayBackgrounds = () => {
    return (project.delayLinks ?? []).map((link, index) => {
      const key = link.id ?? `delay-${index}`;
      const resolved = resolvedDelayLinks.byId[key];
      const targetLayout = trackLayoutBySignal.get(link.targetSignalId);
      if (!resolved || !targetLayout) return null;
      const minX = timelineX(resolved.minTimePs);
      const maxX = timelineX(resolved.maxTimePs);
      return (
        <g key={key} className="linked-delay-range" aria-hidden="true">
          <line
            x1={minX}
            x2={minX}
            y1={targetLayout.y + 5}
            y2={targetLayout.y + targetLayout.height - 5}
          />
          <line
            x1={maxX}
            x2={maxX}
            y1={targetLayout.y + 5}
            y2={targetLayout.y + targetLayout.height - 5}
          />
        </g>
      );
    });
  };

  const renderConstraintWindows = () => {
    return resolvedConstraints.map(({ constraint, resolved }) => {
      if (!resolved) return null;
      const sourceLayout = trackLayoutBySignal.get(constraint.sourceSignalId);
      const targetLayout = trackLayoutBySignal.get(constraint.targetSignalId);
      if (!targetLayout) return null;
      return (
        <g key={constraint.id}>
          {resolved.windows.map((window, windowIndex) => {
            const referenceX = timelineX(window.sourceTimePs);
            const startX = timelineX(window.startTimePs);
            const endX = timelineX(window.endTimePs);
            return (
              <g
                key={`${constraint.id}-${windowIndex}`}
                className={`linked-timing-window${
                  window.isViolated ? " is-violated" : ""
                }`}
                aria-label={
                  window.isViolated
                    ? "Constrained edge is inside the timing window"
                    : "Timing constraint window"
                }
              >
                <rect
                  x={Math.min(startX, endX)}
                  y={targetLayout.y + 4}
                  width={Math.abs(endX - startX)}
                  height={Math.max(1, targetLayout.height - 8)}
                  rx="4"
                />
                {sourceLayout && <line
                  x1={referenceX}
                  x2={referenceX}
                  y1={Math.min(sourceLayout.y, targetLayout.y) + 4}
                  y2={Math.max(
                    sourceLayout.y + sourceLayout.height,
                    targetLayout.y + targetLayout.height,
                  ) - 4}
                />}
              </g>
            );
          })}
        </g>
      );
    });
  };

  const renderDelayLinks = () => {
    return (project.delayLinks ?? []).map((link, index) => {
      const key = link.id ?? `delay-${index}`;
      const resolved = resolvedDelayLinks.byId[key];
      const sourceLayout = trackLayoutBySignal.get(link.sourceSignalId);
      const targetLayout = trackLayoutBySignal.get(link.targetSignalId);
      if (!resolved || !sourceLayout || !targetLayout) return null;
      const sourceX = timelineX(resolved.sourceTimePs);
      const targetX = timelineX(resolved.targetTimePs);
      const relationY = targetLayout.y + 8;
      const sourceY = sourceLayout.y + sourceLayout.height / 2;
      const targetY = targetLayout.y + targetLayout.height / 2;
      const labelX = (sourceX + targetX) / 2;
      const currentDelay = Math.max(
        0,
        resolved.targetTimePs - resolved.sourceTimePs,
      );
      const delayLabel = link.label?.trim() || `t${index + 1}`;
      return (
        <g key={key} className="linked-delay-link">
          <title>{`${delayLabel} · ${formatAxisTime(currentDelay)}`}</title>
          <line x1={sourceX} x2={sourceX} y1={sourceY} y2={relationY} />
          <line x1={targetX} x2={targetX} y1={relationY} y2={targetY} />
          <line
            className="linked-delay-measure"
            x1={sourceX}
            x2={targetX}
            y1={relationY}
            y2={relationY}
          />
          <circle cx={sourceX} cy={sourceY} r="3" />
          <circle cx={targetX} cy={targetY} r="3.5" />
          <text x={labelX} y={relationY - 4} textAnchor="middle">
            {delayLabel}
          </text>
        </g>
      );
    });
  };

  const timingDraft = delayDraft ?? constraintDraft;
  const draftTarget = project.signals.find((signal) => signal.id === timingDraft?.targetSignalId);
  const closeCreation = () => {
    setSignalDraft(null);
    setBusDraft(null);
    setDelayDraft(null);
    setConstraintDraft(null);
  };
  const confirmCreation = () => {
    if (busDraft) {
      if (!busDraft.name.trim()) return;
      const bus = { ...busDraft, name: busDraft.name.trim() };
      const channels = createBusChannels(bus, palette.signal[project.signals.length % palette.signal.length]);
      setProject((current) => ({ ...current, buses: [...(current.buses ?? []), bus], signals: [...current.signals, ...channels] }));
      setSelectedId(bus.id);
      setStatusMessage(`${bus.name} · ${bus.width} channels added`);
    } else if (signalDraft) {
      if (!signalDraft.name.trim()) return;
      const signal = { ...signalDraft, name: signalDraft.name.trim() };
      setProject((current) => ({ ...current, version: 3, signals: [...current.signals, signal] }));
      setSelectedId(signal.id);
      setStatusMessage(`${signal.name} added`);
    } else if (timingDraft && draftTarget) {
      setProject((current) => delayDraft ? {
        ...current,
        delayLinks: [...(current.delayLinks ?? []).filter((link) => link.targetSignalId !== delayDraft.targetSignalId), delayDraft],
      } : {
        ...current,
        timingConstraints: [...(current.timingConstraints ?? []).filter((item) => item.targetSignalId !== constraintDraft!.targetSignalId), constraintDraft!],
      });
      setSelectedId(draftTarget.id);
      setStatusMessage(`${draftTarget.name} ${delayDraft ? "source delay" : "constraint"} added`);
    }
    closeCreation();
  };

  return (
    <div className="app-shell" data-platform={desktopPlatform}>
      <ProjectHeader
        durationPs={project.durationPs}
        exportEndPs={exportEndPs}
        exportMode={exportMode}
        exportPanelOpen={exportPanelOpen}
        exportStartPs={exportStartPs}
        fileInputRef={fileInputRef}
        formatTime={formatAxisTime}
        onExport={exportSvg}
        onExportEndChange={setExportEndPs}
        onExportModeChange={setExportMode}
        onExportPanelOpenChange={setExportPanelOpen}
        onExportStartChange={setExportStartPs}
        onOpenProject={openProject}
        onSaveProject={saveProject}
      />

      <Modal opened={Boolean(busDraft || signalDraft || timingDraft)} onClose={closeCreation}
        title={busDraft ? "Add Bus" : signalDraft ? `Add ${isSequentialDataSignal(signalDraft) ? "derived" : signalDraft.kind} signal` : delayDraft ? "Add source delay" : "Add timing constraint"}
        centered size="lg" className="creation-modal" closeOnClickOutside={false}
        closeButtonProps={{ "aria-label": "Cancel creation" }} transitionProps={{ transition: "fade", exitDuration: 0 }}>
        <p className="creation-description">{busDraft ? "Define independent parallel data channels." : signalDraft ? "Configure your signal, then click Add to draw it on the canvas." : `Configure timing for ${draftTarget?.name ?? "signal"}, then click Add to apply it.`}</p>
        {busDraft && <BusEditor creation bus={busDraft} channels={[]} referencePeriodPs={referencePeriodPs}
          onChange={(patch) => setBusDraft((draft) => draft ? { ...draft, ...patch } : draft)}
          onResize={(width) => setBusDraft((draft) => draft ? { ...draft, width } : draft)}
          onApplyPatterns={() => {}} />}
        {signalDraft && <PropertyPanel creation project={project} selected={signalDraft}
          referenceClock={referenceClock} referencePeriodPs={referencePeriodPs}
          edgeTimes={(signal, polarity) => resolvedProjectTiming.edgeTimes(signal.id, polarity)}
          onUpdateSelected={(patch) => setSignalDraft((draft) => draft ? { ...draft, ...patch } as Signal : draft)}
          onAddDelay={() => {}} onAddConstraint={() => {}} onChangeDelay={() => {}}
          onChangeConstraint={() => {}} onRemoveDelay={() => {}} onRemoveConstraint={() => {}} />}
        {timingDraft && draftTarget && <SignalTimingEditor creation={delayDraft ? "delay" : "constraint"}
          selected={draftTarget} signals={project.signals} durationPs={project.durationPs}
          edgeTimes={(signal, polarity) => resolvedProjectTiming.edgeTimes(signal.id, polarity)}
          delayLink={delayDraft ?? undefined} constraint={constraintDraft ?? undefined}
          onChangeDelay={(patch) => setDelayDraft((draft) => draft ? { ...draft, ...patch } : draft)}
          onChangeConstraint={(patch) => setConstraintDraft((draft) => draft ? { ...draft, ...patch } : draft)}
          onAddDelay={() => {}} onAddConstraint={() => {}} onRemoveDelay={() => {}} onRemoveConstraint={() => {}} />}
        {signalDraft && !signalDraft.name.trim() && <p role="alert" className="sequential-error">Enter a signal name.</p>}
        <div className="creation-actions">
          <Button variant="default" onClick={closeCreation}>Cancel</Button>
          <Button disabled={busDraft ? !busDraft.name.trim() || !Number.isInteger(busDraft.width) || busDraft.width < 1 || busDraft.width > 256 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(busDraft.rule.prefix) || ![busDraft.rule.start, busDraft.rule.channelStep, busDraft.rule.timeStep, busDraft.rule.length].every(Number.isInteger) || busDraft.rule.length < 1 || busDraft.rule.length > 256 : signalDraft ? !signalDraft.name.trim() : !draftTarget} onClick={confirmCreation}>Add</Button>
        </div>
      </Modal>
      <Modal opened={Boolean(pendingBusResize)} onClose={() => { setPendingBusResize(null); setBusEditorVersion((value) => value + 1); }} title="Reduce Bus width?" centered size="sm">
        {pendingBusResize && <div className="bus-resize-warning">
          <p>{busById.get(pendingBusResize.id)?.name} will have {pendingBusResize.width} channels. This removes {pendingBusResize.removed} channel(s) and their data.</p>
          <p>{pendingBusResize.links} Delay link(s) and {pendingBusResize.constraints} Setup/Hold constraint(s) will be removed. {pendingBusResize.derived} derived signal(s) will lose a source and show an error until reconfigured.</p>
          <div className="creation-actions"><Button variant="default" onClick={() => { setPendingBusResize(null); setBusEditorVersion((value) => value + 1); }}>Cancel</Button><Button color="red" onClick={confirmBusResize}>Reduce channels</Button></div>
        </div>}
      </Modal>
      <div className={`workspace${inspectorOpen ? "" : " inspector-collapsed"}`}>
        <main
          className="editor"
          data-delay-console={
            delayConsoleOpen
              ? delayConsoleCollapsed
                ? "collapsed"
                : "open"
              : "closed"
          }
        >
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
              <div className="duration-control">
                <span>Duration</span>
                <NumberInput
                  aria-label="Waveform duration in picoseconds"
                  suffix=" ps"
                  min={1}
                  step={100}
                  value={project.durationPs}
                  onChange={(value) => {
                    const durationPs = Math.max(1, Number(value) || 1);
                    const previousDurationPs = project.durationPs;
                    setProject((current) => ({ ...current, durationPs }));
                    setExportEndPs((current) =>
                      current === previousDurationPs
                        ? durationPs
                        : Math.min(durationPs, current),
                    );
                  }}
                  onBlur={() => setStatusMessage("Waveform duration updated")}
                />
              </div>

              <Popover
                opened={signalsPanelOpen}
                onChange={setSignalsPanelOpen}
                width={390}
                position="bottom-end"
                shadow="md"
                withArrow
              >
                <Popover.Target>
                  <Button
                    variant="subtle"
                    color="gray"
                    size="compact-sm"
                    leftSection={<Layers3 size={15} />}
                    onClick={() => setSignalsPanelOpen((opened) => !opened)}
                  >
                    Signals
                    {managerSignals.some((signal) => !signal.visible) &&
                      ` · ${managerSignals.filter((signal) => !signal.visible).length} hidden`}
                  </Button>
                </Popover.Target>
                <Popover.Dropdown className="signals-panel">
                  <div className="signals-panel-heading">
                    <div>
                      <strong>Signal manager</strong>
                      <span>Search, group and control visibility</span>
                    </div>
                    <div>
                      <Button
                        variant="subtle"
                        color="gray"
                        size="compact-xs"
                        disabled={managerSignals.length === 0}
                        onClick={() =>
                          setSignalsVisibility(
                            managerSignals.map((signal) => signal.id),
                            true,
                          )
                        }
                      >
                        Show all
                      </Button>
                      <Button
                        variant="subtle"
                        color="gray"
                        size="compact-xs"
                        disabled={project.signals.length === 0}
                        onClick={() =>
                          setSignalsVisibility(
                            managerSignals.map((signal) => signal.id),
                            false,
                          )
                        }
                      >
                        Hide all
                      </Button>
                    </div>
                  </div>
                  <TextInput
                    aria-label="Search signals"
                    placeholder="Search signal names"
                    leftSection={<Search size={14} />}
                    value={signalSearch}
                    onChange={(event) => setSignalSearch(event.target.value)}
                  />
                  <div className="signal-groups-scroll">
                    {managerSignals.length === 0 ? (
                      <div className="signal-manager-empty">Add a signal to start organizing.</div>
                    ) : matchingSignals.length === 0 ? (
                      <div className="signal-manager-empty">No signals match “{signalSearch}”.</div>
                    ) : (
                      <>
                        {signalGroups.map((group) => renderSignalGroup(group))}
                        {renderSignalGroup()}
                      </>
                    )}
                  </div>
                  <div className="create-group-row">
                    <TextInput
                      aria-label="New group name"
                      placeholder="New group name"
                      value={newGroupName}
                      onChange={(event) => setNewGroupName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") createSignalGroup();
                      }}
                    />
                    <Button
                      variant="light"
                      size="sm"
                      leftSection={<FolderPlus size={14} />}
                      disabled={!newGroupName.trim()}
                      onClick={createSignalGroup}
                    >
                      Group
                    </Button>
                  </div>
                </Popover.Dropdown>
              </Popover>

              <Button
                variant={delayConsoleOpen ? "light" : "subtle"}
                color={delayConsoleOpen ? "violet" : "gray"}
                size="compact-sm"
                leftSection={<SlidersHorizontal size={15} />}
                aria-expanded={delayConsoleOpen}
                aria-controls="delay-console"
                onClick={() => {
                  setDelayConsoleOpen((opened) => !opened);
                  setDelayConsoleCollapsed(false);
                }}
              >
                Delays
                {consoleDelayCount > 0 && ` · ${consoleDelayCount}`}
              </Button>

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
                  <Menu.Item leftSection={<Layers3 size={16} />} onClick={addBus}>Bus</Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<GitBranch size={16} />}
                    disabled={
                      !project.signals.some((signal) => signal.kind === "clock") ||
                      !project.signals.some((signal) => signal.kind === "data")
                    }
                    onClick={addDerivedSignal}
                  >
                    Derived data
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
              <Popover width={300} position="bottom-end" shadow="md" withArrow>
                <Popover.Target>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Canvas settings"
                  >
                    <Settings2 size={16} />
                  </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown className="grid-settings-panel">
                  <div className="waveform-style-settings">
                    <strong>Waveform appearance</strong>
                    <div className="palette-options" role="radiogroup" aria-label="Waveform palette">
                      {PALETTE_CHOICES.map(({ value, label }) => (
                        <UnstyledButton
                          key={value}
                          className="palette-option"
                          data-active={waveformPalette === value || undefined}
                          role="radio"
                          aria-checked={waveformPalette === value}
                          onClick={() =>
                            setProject((current) => {
                              const nextPalette = WAVEFORM_PALETTES[value].signal;
                              return {
                                ...current,
                                signals: current.signals.map((signal, index) => ({
                                  ...signal,
                                  color: nextPalette[index % nextPalette.length],
                                })),
                                canvasSettings: {
                                  ...(current.canvasSettings ?? DEFAULT_CANVAS_SETTINGS),
                                  waveformPalette: value,
                                },
                              };
                            })
                          }
                        >
                          <span className="palette-option-label">{label}</span>
                          <span className="palette-swatches" aria-hidden="true">
                            {(value === "monochrome"
                              ? ["#111111", "#ffffff"]
                              : colorScheme === "dark"
                              ? WAVEFORM_PALETTES[value].darkSignal ?? WAVEFORM_PALETTES[value].signal
                              : WAVEFORM_PALETTES[value].signal).slice(0, 6).map((color, index) => (
                              <i key={`${index}-${color}`} style={{ backgroundColor: color }} />
                            ))}
                          </span>
                        </UnstyledButton>
                      ))}
                    </div>
                    <div className="clock-color-settings">
                      <div className="grid-settings-heading">
                        <span>CLK colors</span>
                        <SegmentedControl
                          size="xs"
                          aria-label="Clock color mode"
                          value={clockColorMode}
                          disabled={monochrome}
                          data={[
                            { label: "Single", value: "single" },
                            { label: "Multi", value: "multi" },
                          ]}
                          onChange={(clockColorMode) =>
                            setProject((current) => ({
                              ...current,
                              canvasSettings: {
                                ...(current.canvasSettings ?? DEFAULT_CANVAS_SETTINGS),
                                clockColorMode: clockColorMode as "single" | "multi",
                              },
                            }))
                          }
                        />
                      </div>
                      {clockColorMode === "single" && !monochrome && (
                        <div className="clock-color-swatches" role="radiogroup" aria-label="Single CLK color">
                          {displaySignalColors.map((color, index) => (
                            <UnstyledButton
                              key={`${index}-${color}`}
                              role="radio"
                              aria-label={`Clock color ${index + 1}`}
                              aria-checked={clockColorIndex === index}
                              data-active={clockColorIndex === index || undefined}
                              title={color}
                              style={{ backgroundColor: color }}
                              onClick={() =>
                                setProject((current) => ({
                                  ...current,
                                  canvasSettings: {
                                    ...(current.canvasSettings ?? DEFAULT_CANVAS_SETTINGS),
                                    clockColorIndex: index,
                                  },
                                }))
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="grid-settings-heading">
                      <span>Waveform glow</span>
                      <Switch
                        aria-label="Waveform glow"
                        size="xs"
                        checked={waveformGlow}
                        disabled={monochrome}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setProject((current) => ({
                            ...current,
                            canvasSettings: {
                              ...(current.canvasSettings ?? DEFAULT_CANVAS_SETTINGS),
                              waveformGlow: checked,
                            },
                          }));
                        }}
                      />
                    </div>
                    <SegmentedControl
                      fullWidth
                      size="xs"
                      aria-label="Data label size"
                      value={dataLabelSize}
                      data={[
                        { label: "Small", value: "small" },
                        { label: "Medium", value: "medium" },
                        { label: "Large", value: "large" },
                      ]}
                      onChange={(dataLabelSize) =>
                        setProject((current) => ({
                          ...current,
                          canvasSettings: {
                            ...(current.canvasSettings ?? DEFAULT_CANVAS_SETTINGS),
                            dataLabelSize: dataLabelSize as DataLabelSize,
                          },
                        }))
                      }
                    />
                    <Select
                      label="Data label color"
                      value={dataLabelColor}
                      allowDeselect={false}
                      data={[
                        { label: "Match data color", value: "token" },
                        { label: "High contrast", value: "contrast" },
                        { label: "Muted", value: "muted" },
                      ]}
                      onChange={(dataLabelColor) =>
                        dataLabelColor &&
                        setProject((current) => ({
                          ...current,
                          canvasSettings: {
                            ...(current.canvasSettings ?? DEFAULT_CANVAS_SETTINGS),
                            dataLabelColor: dataLabelColor as DataLabelColor,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="canvas-layout-settings">
                    <strong>Track layout</strong>
                    <NumberInput
                      label="Track height"
                      description="Also adjustable with Shift + wheel"
                      suffix=" px"
                      min={MIN_TRACK_HEIGHT}
                      max={MAX_TRACK_HEIGHT}
                      step={4}
                      value={Math.round(trackHeight)}
                      onChange={(value) =>
                        updateTrackHeight(Number(value) || MIN_TRACK_HEIGHT)
                      }
                    />
                  </div>
                  <div className="grid-settings-heading">
                    <strong>Vertical grid</strong>
                    <Switch
                      aria-label="Show vertical grid"
                      size="xs"
                      checked={canvasSettings.showVerticalGrid}
                      onChange={(event) => {
                        const showVerticalGrid = event.currentTarget.checked;
                        setProject((current) => ({
                          ...current,
                          canvasSettings: {
                            ...(current.canvasSettings ??
                              DEFAULT_CANVAS_SETTINGS),
                            showVerticalGrid,
                          },
                        }));
                      }}
                    />
                  </div>
                  <SegmentedControl
                    fullWidth
                    size="xs"
                    value={canvasSettings.gridMode}
                    data={[
                      { label: "Auto reference", value: "auto" },
                      { label: "Custom interval", value: "custom" },
                    ]}
                    onChange={(gridMode) =>
                      setProject((current) => ({
                        ...current,
                        canvasSettings: {
                          ...(current.canvasSettings ?? DEFAULT_CANVAS_SETTINGS),
                          gridMode: gridMode as "auto" | "custom",
                        },
                      }))
                    }
                  />
                  <NumberInput
                    label="Grid interval"
                    description={
                      canvasSettings.gridMode === "auto"
                        ? `Reference subdivision · ${formatAxisTime(gridIntervalPs)}`
                        : "Distance between vertical lines"
                    }
                    suffix=" ps"
                    min={1}
                    step={10}
                    disabled={canvasSettings.gridMode !== "custom"}
                    value={canvasSettings.gridIntervalPs}
                    onChange={(value) =>
                      setProject((current) => ({
                        ...current,
                        canvasSettings: {
                          ...(current.canvasSettings ?? DEFAULT_CANVAS_SETTINGS),
                          gridIntervalPs: Math.max(1, Number(value) || 1),
                        },
                      }))
                    }
                  />
                </Popover.Dropdown>
              </Popover>
            </div>
          </div>

          <div
            ref={canvasViewportRef}
            className="canvas-viewport"
            data-palette={waveformPalette}
            role="region"
            aria-label="Timing canvas viewport"
          >
            <div
              className="canvas-content"
              style={{
                gridTemplateColumns: `${labelWidth}px auto`,
                width: labelWidth + canvasWidth,
                minHeight: canvasHeight,
              }}
            >
              <div
                className="fixed-signal-labels"
                style={{ width: labelWidth, height: canvasHeight }}
              >
                <div className="axis-label">
                  <span>TRACKS</span>
                  <small>{isLabelWidthAuto ? "Auto · P85" : `${Math.round(labelWidth)} px`}</small>
                </div>
                {trackLayouts.map(({ height, signal }) => {
                  const bus = busById.get(signal.id);
                  const child = signal.kind === "data" && signal.busId;
                  return (
                  <div
                    key={signal.id}
                    className={[
                      "track-header",
                      bus ? "bus-track-header" : "",
                      child ? "bus-child-header" : "",
                      signal.id === selectedId ? "selected" : "",
                      signal.id === dragOverId ? "drag-over" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ height }}
                    draggable={!child}
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
                    {bus && <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`${bus.displayMode === "collapsed" ? "Expand" : "Collapse"} ${bus.name}`} onClick={() => updateBus(bus.id, { displayMode: bus.displayMode === "collapsed" ? bus.expandedMode ?? "all" : "collapsed" })}>{bus.displayMode === "collapsed" ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</ActionIcon>}
                    <UnstyledButton
                      className="track-select"
                      aria-pressed={signal.id === selectedId}
                      onClick={() => {
                        setSelectedId(signal.id);
                        setInspectorOpen(true);
                      }}
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
                      {bus && <small className="bus-track-count">{bus.displayMode === "selected" ? `${bus.width - bus.selectedChannels.length} hidden` : `${bus.width} ch`}</small>}
                    </UnstyledButton>
                    {!child &&
                    <div className="track-actions">
                      <Tooltip label={`Duplicate ${signal.name}`}>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          aria-label={`Duplicate ${signal.name}`}
                          onClick={() => bus ? duplicateBus(bus.id) : duplicateSignal(signal.id)}
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
                          <span>Delete {signal.name}? {bus ? `${bus.width} channels and linked Timing will be removed.` : ""}</span>
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
                                  if (bus) deleteBus(bus.id); else deleteSignal(signal.id);
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
                    }
                  </div>
                ); })}
                <div
                  className="signal-column-resizer"
                  role="separator"
                  aria-label="Resize signal column"
                  aria-orientation="vertical"
                  aria-valuemin={MIN_LABEL_WIDTH}
                  aria-valuemax={MAX_LABEL_WIDTH}
                  aria-valuenow={Math.round(labelWidth)}
                  title="Drag to resize · Double-click to auto fit"
                  tabIndex={0}
                  onPointerDown={startLabelResize}
                  onPointerMove={moveLabelResize}
                  onPointerUp={endLabelResize}
                  onPointerCancel={endLabelResize}
                  onDoubleClick={resetLabelWidth}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                      event.preventDefault();
                      setIsLabelWidthAuto(false);
                      setLabelWidth((current) =>
                        Math.min(
                          MAX_LABEL_WIDTH,
                          Math.max(
                            MIN_LABEL_WIDTH,
                            current + (event.key === "ArrowRight" ? 8 : -8),
                          ),
                        ),
                      );
                    }
                    if (event.key === "Home") resetLabelWidth();
                  }}
                />
              </div>

              <svg
                ref={svgRef}
                data-palette={waveformPalette}
                className={[
                  "timing-canvas",
                  waveformGlow && !monochrome ? "has-glow" : "",
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
                  {canvasSettings.showVerticalGrid && gridMarks.map((mark) => {
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

                {renderConstraintWindows()}
                {renderDelayBackgrounds()}
                {renderSequentialGuides()}

                {trackLayouts.map(({ height, signal, y }) => {
                  const bus = busById.get(signal.id);
                  if (bus) {
                    const segments = buildBusSummarySegments(
                      busChannels(project, bus.id), project.durationPs, resolvedDelayLinks.signalShiftsPs,
                    );
                    return <g key={bus.id} className="wave-row bus-wave-row">
                      <rect className="row-hitbox" x="0" y={y} width="100%" height={height} />
                      <line className="row-divider" x1="0" x2="100%" y1={y + height - 1} y2={y + height - 1} />
                      {segments.map((segment, index) => {
                        const x = timelineX(segment.startPs);
                        const width = Math.max(0, timelineX(segment.endPs) - x);
                        const left = x + 0.5;
                        const right = x + width - 0.5;
                        const center = y + height / 2;
                        const top = center - Math.max(11, height * 0.24);
                        const bottom = center + Math.max(11, height * 0.24);
                        const notch = Math.min(8, width / 4);
                        const label = fitBusSlotLabel(segment.tokens, width - 28, measureBusSummaryText);
                        const clipId = `bus-summary-clip-${bus.id}-${index}`;
                        return <g key={index}>
                          <title>{segment.detail}</title>
                          <defs><clipPath id={clipId}><rect x={x + 12} y={y} width={Math.max(0, width - 24)} height={height} /></clipPath></defs>
                          <path className="bus-summary-shape" d={`M ${left} ${center} L ${left + notch} ${top} L ${right - notch} ${top} L ${right} ${center} L ${right - notch} ${bottom} L ${left + notch} ${bottom} Z`} />
                          {width > 30 && <path className="bus-summary-rails" d={`M ${left + notch + 3} ${top + 4} H ${right - notch - 3} M ${left + notch + 3} ${bottom - 4} H ${right - notch - 3}`} />}
                          {label && <text className="bus-summary-label" x={x + 14} y={center + 3.5} clipPath={`url(#${clipId})`}>{label}</text>}
                        </g>;
                      })}
                    </g>;
                  }
                  const signalIndex = project.signals.findIndex(
                    (projectSignal) => projectSignal.id === signal.id,
                  );
                  const renderedSignal = {
                    ...signalWithLinkedStart(signal),
                    color: signal.kind === "clock" && clockColorMode === "single"
                      ? singleClockColor
                      : displaySignalColors[
                        Math.max(0, signalIndex) % displaySignalColors.length
                      ],
                  } as Signal;
                  const renderedStartPs = Math.min(
                    project.durationPs,
                    Math.max(
                      0,
                      renderedSignal.startPs +
                        (renderedSignal.kind === "clock"
                          ? renderedSignal.phasePs
                          : 0),
                    ),
                  );
                  const startX = timelineX(renderedStartPs);
                  const rowCenterY = y + height / 2;
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
                      {renderedStartPs > 0 && (
                        <g className="wave-start-continuity" aria-hidden="true">
                          {renderedSignal.kind === "data" && (
                            <line
                              className="wave-prelude"
                              x1={timelineX(0)}
                              x2={startX}
                              y1={rowCenterY}
                              y2={rowCenterY}
                              stroke={renderedSignal.color}
                            />
                          )}
                          <line
                            className="wave-start-guide"
                            x1={startX}
                            x2={startX}
                            y1={rowCenterY - Math.max(9, height * 0.22)}
                            y2={rowCenterY + Math.max(9, height * 0.22)}
                            stroke={renderedSignal.color}
                          />
                        </g>
                      )}
                      {renderedSignal.kind === "clock" ? (
                        <>
                          <path
                            d={pathForPoints(
                              clockWavePoints(renderedSignal, project.durationPs),
                              project.durationPs,
                              canvasWidth,
                              y,
                              height,
                            )}
                            fill="none"
                            stroke={renderedSignal.color}
                            className="wave-path-glow"
                          />
                          <path
                            d={pathForPoints(
                              clockWavePoints(renderedSignal, project.durationPs),
                              project.durationPs,
                              canvasWidth,
                              y,
                              height,
                            )}
                            fill="none"
                            stroke={renderedSignal.color}
                            className="wave-path"
                          />
                        </>
                      ) : (
                        <g
                          className="data-symbols"
                          style={
                            { "--signal-color": renderedSignal.color } as CSSProperties
                          }
                        >
                          {(() => {
                            const resolvedWaveform =
                              resolvedSequentialSignals.bySignalId[renderedSignal.id];
                            const segments = isSequentialDataSignal(renderedSignal) && resolvedWaveform
                              ? segmentsForResolvedWaveform(
                                  resolvedWaveform,
                                  project.durationPs,
                                )
                              : buildDataSegments(
                                  renderedSignal,
                                  project.durationPs,
                                );
                            return segments.map((segment, segmentIndex) => {
                              const x1 = timelineX(segment.startPs);
                              const x2 = timelineX(segment.endPs);
                              const centerY = y + height / 2;
                              const halfHeight = Math.max(
                                9,
                                height * 0.22,
                              );
                              const notch = Math.min(7, (x2 - x1) / 4);
                              const token = segment.token.trim().toUpperCase();
                              const color = dataTokenColors.get(token) ?? colorForDataToken(
                                segment.token,
                                waveformPalette,
                                colorScheme === "dark",
                              );
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
                                        style={{
                                          fontSize: dataLabelFontSize,
                                          fill: dataLabelFill(color),
                                        }}
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
                                        style={{
                                          fontSize: dataLabelFontSize,
                                          fill: dataLabelFill(color),
                                        }}
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
                                      style={{
                                        fontSize: dataLabelFontSize,
                                        fill: dataLabelFill(color),
                                      }}
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
                {renderDelayLinks()}
              </svg>
            </div>
          </div>

          {delayConsoleOpen && (
            <DelayConsole
              collapsed={delayConsoleCollapsed}
              delayLinks={project.delayLinks ?? []}
              edgeTimes={(signal, polarity) =>
                resolvedProjectTiming.edgeTimes(signal.id, polarity)
              }
              onAddDelay={addDelayForTarget}
              onClose={() => setDelayConsoleOpen(false)}
              onRemoveDelay={removeDelayForTarget}
              onSelectSignal={setSelectedId}
              onToggleCollapsed={() =>
                setDelayConsoleCollapsed((collapsed) => !collapsed)
              }
              onUpdateDerivedDelay={updateDerivedDelay}
              onUpdateDelay={updateDelayForTarget}
              selectedSignalId={selected?.id ?? ""}
              signals={project.signals}
            />
          )}

          <div className="statusbar">
            <div className="status-item" aria-live="polite">
              <span className="status-dot" />
              {statusMessage}
            </div>
            <div>Schema v{project.version}</div>
            <div>
              Grid: {canvasSettings.showVerticalGrid ? formatAxisTime(gridIntervalPs) : "off"}
            </div>
          </div>
        </main>

        {!inspectorOpen && (
          <aside className="inspector-rail" aria-label="Collapsed properties">
            <Tooltip label="Show properties" position="left">
              <UnstyledButton className="inspector-rail-toggle" aria-label="Show properties"
                aria-expanded={false} onClick={() => setInspectorOpen(true)}>
                <PanelRightOpen size={18} />
                <span>Properties</span>
              </UnstyledButton>
            </Tooltip>
          </aside>
        )}
        {inspectorOpen && selectedBus && <aside className="property-panel"><div className="panel-heading property-heading"><div><span className="eyebrow">INSPECTOR</span><h2>Bus properties</h2></div><ActionIcon variant="subtle" aria-label="Collapse properties" onClick={() => setInspectorOpen(false)}><PanelRightClose size={16} /></ActionIcon></div><div className="property-content"><BusEditor key={`${selectedBus.id}-${busEditorVersion}`} bus={selectedBus} channels={busChannels(project, selectedBus.id)} referencePeriodPs={referencePeriodPs}
          onChange={(patch) => updateBus(selectedBus.id, patch)}
          onResize={(width) => resizeSelectedBus(selectedBus.id, width)}
          onApplyPatterns={(patterns, indexes, replaceOverrides, generated) => applyPatternsToBus(selectedBus.id, patterns, indexes, replaceOverrides, generated)}
        /></div></aside>}
        {inspectorOpen && !selectedBus && <PropertyPanel
          onCollapse={() => setInspectorOpen(false)}
          project={project}
          selected={selected}
          parentBus={selected?.kind === "data" && selected.busId ? busById.get(selected.busId) : undefined}
          onRestoreBusParameter={(parameter) => selected && restoreBusParameter(selected.id, parameter)}
          patternResetVersion={patternResetVersion}
          referenceClock={referenceClock}
          referencePeriodPs={referencePeriodPs}
          sequentialError={
            isSequentialDataSignal(selected)
              ? resolvedSequentialSignals.errors[selected.id]
              : undefined
          }
          edgeTimes={(signal, polarity) =>
            resolvedProjectTiming.edgeTimes(signal.id, polarity)
          }
          delayLink={selectedDelayLink}
          constraint={selectedConstraint}
          onUpdateSelected={updateSelected}
          onAddDelay={addSelectedDelay}
          onChangeDelay={updateSelectedDelay}
          onRemoveDelay={() => selected && removeDelayForTarget(selected.id)}
          onAddConstraint={addSelectedConstraint}
          onChangeConstraint={updateSelectedConstraint}
          onRemoveConstraint={() => {
            if (!selected) return;
            setProject((current) => ({
              ...current,
              timingConstraints: (current.timingConstraints ?? []).filter(
                (constraint) => constraint.targetSignalId !== selected.id,
              ),
            }));
            setStatusMessage(`${selected.name} constraint removed`);
          }}
        />}
      </div>
    </div>
  );
}

export default App;
