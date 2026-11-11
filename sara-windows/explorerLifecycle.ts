export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ExplorerWindowState {
  hwnd: number;
  processId: number;
  processName: string;
  className: string;
  title: string;
  visible: boolean;
  rect: RectLike;
  parentHwnd: number | null;
}

export interface ExplorerSnapshot {
  pid: number;
  explorerName: string;
  windows: ExplorerWindowState[];
}

export interface ExplorerLifecycleResult {
  explorerMissing: boolean;
  explorerRestarted: boolean;
  processReplaced: boolean;
  hwndReuseDetected: boolean;
  windowDisappeared: boolean;
  desktopSurfaceAvailable: boolean;
  safeFallbackRequired: boolean;
}

export interface MonitorGeometry {
  left: number;
  top: number;
  right: number;
  bottom: number;
  deviceId?: string;
  dpi?: number;
  primary?: boolean;
}

export interface PrototypeState {
  enabled: boolean;
  ready: boolean;
  attached: boolean;
  reason: string;
  telemetry: string[];
}

export interface PrototypeSummary {
  safeToAttach: boolean;
  ready: boolean;
  attached: boolean;
  reason: string;
}

export function isExpectedDesktopHierarchy(snapshot: ExplorerSnapshot): boolean {
  const classes = new Set(snapshot.windows.map((window) => window.className));
  const hasProgman = classes.has('Progman');
  const hasShellDefView = classes.has('SHELLDLL_DefView');
  const hasIconHost = classes.has('SysListView32') || classes.has('FolderView');
  const hasWorkerW = classes.has('WorkerW');
  const hasDesktopSurface = hasProgman && hasShellDefView && hasIconHost && hasWorkerW;

  if (!snapshot.pid || snapshot.pid <= 0) return false;
  return hasDesktopSurface;
}

export function analyzeHierarchy(snapshot: ExplorerSnapshot) {
  const classes = new Set(snapshot.windows.map((window) => window.className));
  return {
    programManagerPresent: classes.has('Progman'),
    shellDefViewPresent: classes.has('SHELLDLL_DefView'),
    iconSurfacePresent: classes.has('SysListView32') || classes.has('FolderView'),
    workerWPresent: classes.has('WorkerW'),
    desktopReady: isExpectedDesktopHierarchy(snapshot),
  };
}

export function compareExplorerSnapshots(before: ExplorerSnapshot, after: ExplorerSnapshot): ExplorerLifecycleResult & { hwndReuseDetected: boolean } {
  const beforeMap = new Map<number, ExplorerWindowState>();
  const afterMap = new Map<number, ExplorerWindowState>();

  for (const window of before.windows) beforeMap.set(window.hwnd, window);
  for (const window of after.windows) afterMap.set(window.hwnd, window);

  const processReplaced = before.pid !== after.pid;
  const hwndReuseDetected = before.windows.some((window) => {
    const peer = afterMap.get(window.hwnd);
    return Boolean(peer) && (peer!.className !== window.className || peer!.processId !== window.processId);
  });
  const windowDisappeared = before.windows.some((window) => !afterMap.has(window.hwnd));
  const desktopSurfaceAvailable = isExpectedDesktopHierarchy(after) && !windowDisappeared;

  return {
    explorerMissing: after.pid <= 0 || after.windows.length === 0,
    explorerRestarted: processReplaced,
    processReplaced,
    hwndReuseDetected,
    windowDisappeared,
    desktopSurfaceAvailable,
    safeFallbackRequired: after.pid <= 0 || !desktopSurfaceAvailable || processReplaced,
  };
}

export function detectExplorerLifecycle(before: ExplorerSnapshot, after: ExplorerSnapshot): ExplorerLifecycleResult {
  const baseline = compareExplorerSnapshots(before, after);
  return {
    ...baseline,
    explorerMissing: after.pid <= 0 || after.windows.length === 0,
    explorerRestarted: baseline.processReplaced || before.pid !== after.pid,
    safeFallbackRequired: baseline.safeFallbackRequired || baseline.explorerMissing,
  };
}

export function evaluateDesktopGeometry(monitors: MonitorGeometry[]) {
  const hasNegativeCoordinates = monitors.some((monitor) =>
    monitor.left < 0 || monitor.top < 0 || monitor.right < 0 || monitor.bottom < 0,
  );
  const primaryMonitor = monitors.find((monitor) => monitor.primary) ?? monitors[0] ?? null;

  return {
    monitorCount: monitors.length,
    hasNegativeCoordinates,
    multiMonitor: monitors.length > 1,
    primaryMonitorDeviceId: primaryMonitor?.deviceId ?? null,
    primaryMonitorBounds: primaryMonitor ? { left: primaryMonitor.left, top: primaryMonitor.top, right: primaryMonitor.right, bottom: primaryMonitor.bottom } : null,
    validGeometry: monitors.every((monitor) => monitor.right >= monitor.left && monitor.bottom >= monitor.top),
    monitors,
  };
}

export function describeArchitecture() {
  return {
    workerW: {
      name: 'Experimental WorkerW-based desktop hosting',
      supported: false,
      canAppearBehindIcons: false,
      keepsIconsClickable: false,
      keepsIconsDraggable: false,
      keepsTaskbarFunctional: false,
      recoveryComplexity: 'High',
      note: 'Undocumented Explorer shell integration; not supported for this milestone.',
    },
    nativeSurface: {
      name: 'Separate native desktop surface coordinated with Explorer',
      supported: false,
      canAppearBehindIcons: false,
      keepsIconsClickable: false,
      keepsIconsDraggable: false,
      keepsTaskbarFunctional: false,
      recoveryComplexity: 'Medium-High',
      note: 'Requires explicit Windows shell testing and safe fallback before activation.',
    },
    wallpaperApi: {
      name: 'Supported Windows wallpaper API integration',
      supported: false,
      canAppearBehindIcons: false,
      keepsIconsClickable: false,
      keepsIconsDraggable: false,
      keepsTaskbarFunctional: false,
      recoveryComplexity: 'Low',
      note: 'Static wallpaper APIs do not host an interactive SARA surface behind desktop icons.',
    },
  };
}

export function buildPrototypeState(overrides: Partial<PrototypeState> = {}): PrototypeState {
  return {
    enabled: false,
    ready: false,
    attached: false,
    reason: 'Prototype disabled by default. No shell attachment is active.',
    telemetry: ['Prototype disabled', 'Explorer remains active'],
    ...overrides,
  };
}

export function summarizePrototypeResult(state: PrototypeState): PrototypeSummary {
  const safeToAttach = state.enabled && state.ready && !state.attached && !state.reason.toLowerCase().includes('fail');
  return {
    safeToAttach,
    ready: state.ready,
    attached: state.attached,
    reason: state.reason,
  };
}
