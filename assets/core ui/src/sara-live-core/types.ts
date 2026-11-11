export type SaraCoreState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'executing'
  | 'learning'
  | 'researching'
  | 'warning'
  | 'error'
  | 'completed';

export type ThemeId =
  | 'ultron-blue'
  | 'crimson-red'
  | 'neon-purple'
  | 'emerald-green'
  | 'golden-amber'
  | 'ice-white'
  | 'custom-rgb';

export interface CoreThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  ring: string;
  glow: string;
  backgroundGlow: string;
  highlight: string;
  shadow: string;
}

export interface CoreThemeDefinition {
  id: ThemeId;
  name: string;
  subtitle: string;
  code: string;
  colors: CoreThemeColors;
}

export interface CustomThemePreset {
  id: string;
  name: string;
  colors: CoreThemeColors;
  createdAt: number;
}

export type PerformanceQuality = 'low' | 'balanced' | 'high' | 'ultra';

export type HudPresentationMode = 'minimal' | 'telemetry' | 'zen';

export interface HudIndicatorVisibility {
  dateTime: boolean;
  saraStatus: boolean;
  aiModel: boolean;
  cpuUsage: boolean;
  ramUsage: boolean;
  networkStatus: boolean;
  activeApp: boolean;
  missionStatus: boolean;
  microphoneStatus: boolean;
  voiceActivity: boolean;
}

export interface MultiMonitorConfig {
  spanMode: 'primary' | 'span-all' | 'independent';
  targetDisplayIndex: number;
  backgroundFpsCap: number;
  pauseWhenOccluded: boolean;
  clickThroughDesktopMode: boolean;
}

export interface LiveCoreSettings {
  enabled: boolean;
  autoColorCycle: boolean;
  colorCycleSpeed: number;
  themeId: ThemeId;
  customColors: CoreThemeColors;
  savedCustomThemes: CustomThemePreset[];
  animationSpeed: number;
  particleDensity: number;
  glowIntensity: number;
  coreSize: number;
  ringSpeed: number;
  brightness: number;
  backgroundIntensity: number;
  quality: PerformanceQuality;
  respectReducedMotion: boolean;
  hudMode: HudPresentationMode;
  indicators: HudIndicatorVisibility;
  multiMonitor: MultiMonitorConfig;
  bridgeWebSocketUrl: string;
}

export interface QualityProfile {
  id: PerformanceQuality;
  label: string;
  baseParticleCount: number;
  ambientParticleCount: number;
  maxSynapticLinks: number;
  synapticSampleLimit: number;
  sphereSegments: number;
  maxPixelRatio: number;
  enableBloomLayers: boolean;
  enableSynapticWeb: boolean;
}

export type BridgeConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected-webview2'
  | 'connected-electron'
  | 'connected-broadcast'
  | 'connected-websocket'
  | 'error';

export interface SaraBridgeEventPayload {
  type:
    | 'state'
    | 'voice'
    | 'telemetry'
    | 'mission'
    | 'model'
    | 'theme'
    | 'ping';
  state?: SaraCoreState;
  voiceLevel?: number;
  aiModel?: string;
  missionStatus?: string;
  operationalStatus?: string;
  activeApp?: string;
  cpuUsagePercent?: number;
  ramUsagePercent?: number;
  ramUsedGb?: number;
  ramTotalGb?: number;
  microphoneActive?: boolean;
  themeId?: ThemeId;
  timestamp?: number;
}

export interface SystemTelemetrySnapshot {
  bridgeStatus: BridgeConnectionStatus;
  bridgeSourceLabel: string;
  lastEventTimestamp: number | null;
  lastEventSummary: string;
  operationalStatus: string;
  aiModel: string | null;
  missionStatus: string | null;
  activeApp: string | null;
  cpuCoresLogical: number | null;
  cpuUsagePercent: number | null;
  ramUsagePercent: number | null;
  ramDetail: string | null;
  networkOnline: boolean;
  networkDetail: string;
  microphoneStatus: 'granted' | 'denied' | 'prompt' | 'active-mic' | 'unknown';
  voiceActivityLevel: number;
  displayResolution: string;
  devicePixelRatio: number;
}

export type WebGLContextHealth =
  | 'initializing'
  | 'active'
  | 'context-lost'
  | 'recovering'
  | 'unsupported'
  | 'disabled';

export interface WebGLRenderStats {
  health: WebGLContextHealth;
  fps: number;
  particleCount: number;
  synapticLinkCount: number;
  drawCalls: number;
  rendererName: string;
  reducedMotionActive: boolean;
  isDocumentHidden: boolean;
}
