import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeHierarchy,
  buildPrototypeState,
  compareExplorerSnapshots,
  describeArchitecture,
  detectExplorerLifecycle,
  evaluateDesktopGeometry,
  isExpectedDesktopHierarchy,
  summarizePrototypeResult,
  type ExplorerWindowState,
} from '../sara-windows/explorerLifecycle.js';

const makeWindow = (overrides: Partial<ExplorerWindowState> = {}): ExplorerWindowState => ({
  hwnd: 0x1000,
  processId: 1234,
  processName: 'explorer.exe',
  className: 'Progman',
  title: 'Program Manager',
  visible: true,
  rect: { left: 0, top: 0, right: 1920, bottom: 1080 },
  parentHwnd: null,
  ...overrides,
});

test('missing Progman is treated as not ready for shell hosting', () => {
  const snapshot = {
    pid: 1234,
    explorerName: 'explorer.exe',
    windows: [makeWindow({ className: 'WorkerW' })],
  };
  assert.equal(isExpectedDesktopHierarchy(snapshot), false);
});

test('missing WorkerW is treated as shell not ready', () => {
  const snapshot = {
    pid: 1234,
    explorerName: 'explorer.exe',
    windows: [makeWindow({ className: 'Progman' })],
  };
  assert.equal(isExpectedDesktopHierarchy(snapshot), false);
});

test('missing icon host is treated as not usable', () => {
  const snapshot = {
    pid: 1234,
    explorerName: 'explorer.exe',
    windows: [
      makeWindow({ className: 'Progman', hwnd: 10, parentHwnd: null }),
      makeWindow({ className: 'SHELLDLL_DefView', hwnd: 11, parentHwnd: 10 }),
    ],
  };
  assert.equal(isExpectedDesktopHierarchy(snapshot), false);
});

test('Explorer process replacement is detected as a lifecycle change', () => {
  const before = {
    pid: 1111,
    explorerName: 'explorer.exe',
    windows: [makeWindow({ className: 'Progman', hwnd: 10 }), makeWindow({ className: 'WorkerW', hwnd: 11, parentHwnd: 10 })],
  };
  const after = {
    pid: 2222,
    explorerName: 'explorer.exe',
    windows: [makeWindow({ className: 'Progman', hwnd: 20 }), makeWindow({ className: 'WorkerW', hwnd: 21, parentHwnd: 20 })],
  };
  const result = detectExplorerLifecycle(before, after);
  assert.equal(result.explorerRestarted, true);
  assert.equal(result.processReplaced, true);
});

test('HWND reuse without process change is treated as a window replacement and not a new desktop', () => {
  const before = {
    pid: 3333,
    explorerName: 'explorer.exe',
    windows: [makeWindow({ hwnd: 99, className: 'Progman' })],
  };
  const after = {
    pid: 3333,
    explorerName: 'explorer.exe',
    windows: [makeWindow({ hwnd: 99, className: 'WorkerW', processId: 3333 })],
  };
  const result = compareExplorerSnapshots(before, after);
  assert.equal(result.hwndReuseDetected, true);
  assert.equal(result.desktopSurfaceAvailable, false);
});

test('window disappearance is reported as a missing desktop surface', () => {
  const before = {
    pid: 4444,
    explorerName: 'explorer.exe',
    windows: [makeWindow({ className: 'Progman', hwnd: 10 }), makeWindow({ className: 'WorkerW', hwnd: 11, parentHwnd: 10 }), makeWindow({ className: 'SysListView32', hwnd: 12, parentHwnd: 11 })],
  };
  const after = {
    pid: 4444,
    explorerName: 'explorer.exe',
    windows: [makeWindow({ className: 'Progman', hwnd: 10 }), makeWindow({ className: 'WorkerW', hwnd: 11, parentHwnd: 10 })],
  };
  const result = compareExplorerSnapshots(before, after);
  assert.equal(result.windowDisappeared, true);
  assert.equal(result.desktopSurfaceAvailable, false);
});

test('monitor geometry evaluation accepts negative coordinates and reports multi-monitor layout', () => {
  const monitors = [
    { left: -1920, top: 0, right: -1, bottom: 1080, deviceId: 'DISPLAY1', dpi: 96, primary: false },
    { left: 0, top: 0, right: 1920, bottom: 1080, deviceId: 'DISPLAY2', dpi: 96, primary: true },
  ];
  const result = evaluateDesktopGeometry(monitors);
  assert.equal(result.hasNegativeCoordinates, true);
  assert.equal(result.primaryMonitorDeviceId, 'DISPLAY2');
  assert.equal(result.multiMonitor, true);
});

test('prototype startup failure is reported without exposing shell attachment', () => {
  const prototype = buildPrototypeState({
    enabled: true,
    ready: false,
    attached: false,
    reason: 'Explorer lifecycle validation failed',
    telemetry: ['Missing icon host'],
  });
  const summary = summarizePrototypeResult(prototype);
  assert.equal(summary.safeToAttach, false);
  assert.equal(prototype.attached, false);
});

test('prototype shutdown leaves the desktop configuration untouched', () => {
  const prototype = buildPrototypeState({
    enabled: true,
    ready: true,
    attached: false,
    reason: 'Safe shutdown',
    telemetry: ['Shutdown complete'],
  });
  const summary = summarizePrototypeResult(prototype);
  assert.equal(summary.safeToAttach, true);
  assert.equal(prototype.attached, false);
});

test('unexpected process termination is detected as a shell failure state', () => {
  const before = {
    pid: 7777,
    explorerName: 'explorer.exe',
    windows: [makeWindow({ className: 'Progman', hwnd: 10 }), makeWindow({ className: 'WorkerW', hwnd: 11, parentHwnd: 10 })],
  };
  const after = {
    pid: 0,
    explorerName: 'explorer.exe',
    windows: [],
  };
  const result = detectExplorerLifecycle(before, after);
  assert.equal(result.explorerMissing, true);
  assert.equal(result.safeFallbackRequired, true);
});

test('architecture comparison stays explicit about unsupported attachment paths', () => {
  const comparison = describeArchitecture();
  assert.equal(comparison.workerW.supported, false);
  assert.equal(comparison.nativeSurface.supported, false);
  assert.equal(comparison.wallpaperApi.supported, false);
});

test('desktop hierarchy analyzer classifies expected background hierarchy', () => {
  const snapshot = {
    pid: 9001,
    explorerName: 'explorer.exe',
    windows: [
      makeWindow({ className: 'Progman', hwnd: 10, parentHwnd: null }),
      makeWindow({ className: 'SHELLDLL_DefView', hwnd: 11, parentHwnd: 10 }),
      makeWindow({ className: 'SysListView32', hwnd: 12, parentHwnd: 11 }),
      makeWindow({ className: 'FolderView', hwnd: 13, parentHwnd: 12 }),
      makeWindow({ className: 'WorkerW', hwnd: 14, parentHwnd: null, visible: false }),
    ],
  };
  const result = analyzeHierarchy(snapshot);
  assert.equal(result.programManagerPresent, true);
  assert.equal(result.iconSurfacePresent, true);
  assert.equal(result.desktopReady, true);
});
