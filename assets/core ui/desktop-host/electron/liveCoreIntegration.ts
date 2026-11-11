/**
 * Optional Electron Main-Process Integration Module for SARA Live Core.
 *
 * Mounts SARA Live Core in dedicated, borderless, non-focus-stealing windows
 * across connected displays without modifying existing SARA assistant windows.
 *
 * Note: Import this module in your Electron main process only when Electron is installed.
 */

export interface ElectronLiveCoreOptions {
  coreUrl: string;
  clickThrough?: boolean;
  spanAllDisplays?: boolean;
}

export interface ElectronLikeApp {
  whenReady(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

export interface ElectronLikeScreen {
  getAllDisplays(): Array<{
    id: number;
    bounds: { x: number; y: number; width: number; height: number };
    scaleFactor: number;
  }>;
  getPrimaryDisplay(): {
    id: number;
    bounds: { x: number; y: number; width: number; height: number };
    scaleFactor: number;
  };
  on(event: string, listener: () => void): void;
}

export interface ElectronLikeBrowserWindow {
  new (options: Record<string, unknown>): {
    loadURL(url: string): Promise<void>;
    setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void;
    setBounds(bounds: { x: number; y: number; width: number; height: number }): void;
    on(event: string, listener: () => void): void;
    close(): void;
    isDestroyed(): boolean;
    webContents: {
      send(channel: string, payload: unknown): void;
      on(event: string, listener: () => void): void;
      reload(): void;
    };
  };
}

export class SaraLiveCoreElectronManager {
  private windows = new Map<number, InstanceType<ElectronLikeBrowserWindow>>();
  private readonly BrowserWindowCtor: ElectronLikeBrowserWindow;
  private readonly screenApi: ElectronLikeScreen;
  private options: ElectronLiveCoreOptions;

  constructor(
    BrowserWindowCtor: ElectronLikeBrowserWindow,
    screenApi: ElectronLikeScreen,
    options: ElectronLiveCoreOptions
  ) {
    this.BrowserWindowCtor = BrowserWindowCtor;
    this.screenApi = screenApi;
    this.options = options;
  }

  public start(): void {
    this.reconcileDisplays();
    this.screenApi.on('display-added', () => this.reconcileDisplays());
    this.screenApi.on('display-removed', () => this.reconcileDisplays());
    this.screenApi.on('display-metrics-changed', () => this.reconcileDisplays());
  }

  public broadcastSaraEvent(payload: unknown): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send('sara:live-core-event', payload);
      }
    }
  }

  public reconcileDisplays(): void {
    const targetDisplays = this.options.spanAllDisplays
      ? this.screenApi.getAllDisplays()
      : [this.screenApi.getPrimaryDisplay()];

    const activeIds = new Set(targetDisplays.map((d) => d.id));

    for (const [id, win] of this.windows.entries()) {
      if (!activeIds.has(id)) {
        if (!win.isDestroyed()) win.close();
        this.windows.delete(id);
      }
    }

    for (const display of targetDisplays) {
      const existing = this.windows.get(display.id);
      if (existing && !existing.isDestroyed()) {
        existing.setBounds(display.bounds);
        continue;
      }

      const win = new this.BrowserWindowCtor({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        backgroundColor: '#03050a',
        skipTaskbar: true,
        focusable: false,
        hasShadow: false,
        resizable: false,
        type: 'desktop',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: true,
        },
      });

      if (this.options.clickThrough) {
        win.setIgnoreMouseEvents(true, { forward: true });
      }

      // Automatic renderer crash recovery
      win.webContents.on('render-process-gone', () => {
        if (!win.isDestroyed()) {
          win.webContents.reload();
        }
      });

      win.loadURL(this.options.coreUrl).catch(() => {});
      this.windows.set(display.id, win);
    }
  }

  public stop(): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.close();
      }
    }
    this.windows.clear();
  }
}
