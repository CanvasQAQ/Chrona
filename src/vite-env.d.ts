/// <reference types="vite/client" />

interface ChronaWindowControls {
  platform: string;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (listener: (maximized: boolean) => void) => () => void;
}

interface Window {
  chronaWindow?: ChronaWindowControls;
  chronaAgent?: {
    getStatus: () => Promise<AgentConnectionStatus>;
    setEnabled: (enabled: boolean) => Promise<AgentConnectionStatus>;
    onStatus: (listener: (status: AgentConnectionStatus) => void) => () => void;
    onRequest: (listener: (request: { id: string; method: string; args: unknown; deadline: number }) => void) => () => void;
    respond: (id: string, result: unknown) => void;
  };
}

interface AgentConnectionStatus {
  enabled: boolean;
  endpoint?: string;
  token?: string;
}

interface ProjectFileInfo {
  name: string;
  path?: string;
}

interface Window {
  chronaFiles?: {
    open: () => Promise<(ProjectFileInfo & { text: string }) | null>;
    save: (request: { currentPath?: string; saveAs: boolean; name: string; text: string }) => Promise<ProjectFileInfo | null>;
  };
  showOpenFilePicker?: (options: ProjectPickerOptions) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: ProjectPickerOptions & { suggestedName: string; startIn?: FileSystemFileHandle }) => Promise<FileSystemFileHandle>;
}

interface ProjectPickerOptions {
  types: { description: string; accept: Record<string, string[]> }[];
}
