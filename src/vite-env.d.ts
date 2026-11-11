/// <reference types="vite/client" />

/** package.json version, injected by vite.config.ts. */
declare const __APP_VERSION__: string;

interface SaraElectronBridge {
  openLiveCore?: () => Promise<{ ok: boolean; error?: string }>;
  getLiveCoreSurfaceStatus?: () => Promise<{ ok: boolean; supported?: boolean; built?: boolean; running?: boolean; behindIcons?: boolean; error?: string }>;
  setLiveCoreSurface?: (enabled: boolean) => Promise<{ ok: boolean; built?: boolean; running?: boolean; behindIcons?: boolean; error?: string }>;
}

interface Window {
  sara?: SaraElectronBridge;
}
