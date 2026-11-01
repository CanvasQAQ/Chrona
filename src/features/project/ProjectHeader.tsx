import {
  ActionIcon,
  Button,
  Popover,
  SegmentedControl,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { LiveNumberInput as NumberInput } from "../../components/LiveNumberInput";
import {
  Copy,
  Download,
  FolderOpen,
  Minus,
  Moon,
  Save,
  Square,
  Sun,
  X,
} from "lucide-react";
import {
  type ChangeEventHandler,
  type RefObject,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import chronaIcon from "../../assets/chrona.png";

export type ExportMode = "view" | "range" | "all";

interface ProjectHeaderProps {
  extraActions?: ReactNode;
  durationPs: number;
  exportEndPs: number;
  exportMode: ExportMode;
  exportPanelOpen: boolean;
  exportStartPs: number;
  fileInputRef: RefObject<HTMLInputElement | null>;
  formatTime: (timePs: number) => string;
  onExport: () => void;
  onExportEndChange: (value: number) => void;
  onExportModeChange: (mode: ExportMode) => void;
  onExportPanelOpenChange: (opened: boolean) => void;
  onExportStartChange: (value: number) => void;
  onOpenProject: ChangeEventHandler<HTMLInputElement>;
  onSaveProject: () => void;
}

export function ProjectHeader({
  extraActions,
  durationPs,
  exportEndPs,
  exportMode,
  exportPanelOpen,
  exportStartPs,
  fileInputRef,
  formatTime,
  onExport,
  onExportEndChange,
  onExportModeChange,
  onExportPanelOpenChange,
  onExportStartChange,
  onOpenProject,
  onSaveProject,
}: ProjectHeaderProps) {
  const { setColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme("light");
  const desktopPlatform = window.chronaWindow?.platform ?? "web";
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    const controls = window.chronaWindow;
    if (!controls || controls.platform !== "win32") return;
    void controls.isMaximized().then(setIsWindowMaximized);
    return controls.onMaximizedChange(setIsWindowMaximized);
  }, []);

  return (
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
        {extraActions}
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
          onChange={onOpenProject}
        />
        <Tooltip label="Save project">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            aria-label="Save project"
            onClick={onSaveProject}
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
        <Popover
          opened={exportPanelOpen}
          onChange={onExportPanelOpenChange}
          position="bottom-end"
          width={356}
          shadow="md"
          withArrow
        >
          <Popover.Target>
            <Button
              leftSection={<Download size={16} />}
              size="sm"
              onClick={() => onExportPanelOpenChange(!exportPanelOpen)}
            >
              Export SVG
            </Button>
          </Popover.Target>
          <Popover.Dropdown className="export-panel">
            <div className="export-panel-heading">
              <div>
                <strong>Export SVG</strong>
                <span>Choose the exact timeline to include</span>
              </div>
            </div>
            <SegmentedControl
              fullWidth
              value={exportMode}
              onChange={(value) => onExportModeChange(value as ExportMode)}
              data={[
                { label: "Current view", value: "view" },
                { label: "Time range", value: "range" },
                { label: "All time", value: "all" },
              ]}
            />
            {exportMode === "range" && (
              <div className="export-range-fields">
                <NumberInput
                  label="Start"
                  suffix=" ps"
                  min={0}
                  max={durationPs}
                  value={exportStartPs}
                  onChange={(value) =>
                    onExportStartChange(Number(value) || 0)
                  }
                />
                <NumberInput
                  label="End"
                  suffix=" ps"
                  min={0}
                  max={durationPs}
                  value={exportEndPs}
                  error={exportEndPs <= exportStartPs ? "After start" : undefined}
                  onChange={(value) =>
                    onExportEndChange(Number(value) || durationPs)
                  }
                />
              </div>
            )}
            <div className="export-summary">
              {exportMode === "view" &&
                "Exports the timeline currently visible in the canvas."}
              {exportMode === "range" &&
                `${formatTime(exportStartPs)} – ${formatTime(exportEndPs)}`}
              {exportMode === "all" &&
                `Exports the full ${formatTime(durationPs)} project.`}
            </div>
            <Button
              fullWidth
              leftSection={<Download size={15} />}
              onClick={onExport}
            >
              Export SVG
            </Button>
          </Popover.Dropdown>
        </Popover>
      </div>

      {desktopPlatform === "win32" && (
        <div className="window-controls" aria-label="Window controls">
          <UnstyledButton
            aria-label="Minimize window"
            onClick={() => window.chronaWindow?.minimize()}
          >
            <Minus size={16} />
          </UnstyledButton>
          <UnstyledButton
            aria-label={isWindowMaximized ? "Restore window" : "Maximize window"}
            onClick={() => window.chronaWindow?.toggleMaximize()}
          >
            {isWindowMaximized ? <Copy size={13} /> : <Square size={13} />}
          </UnstyledButton>
          <UnstyledButton
            className="window-close"
            aria-label="Close window"
            onClick={() => window.chronaWindow?.close()}
          >
            <X size={17} />
          </UnstyledButton>
        </div>
      )}
    </header>
  );
}
