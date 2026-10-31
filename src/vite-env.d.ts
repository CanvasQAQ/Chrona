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
