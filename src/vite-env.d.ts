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
}
