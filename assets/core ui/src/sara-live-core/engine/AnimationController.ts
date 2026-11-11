import { LiveCoreSettings, WebGLRenderStats } from '../types';
import { CoreStateManager } from '../states/CoreStateManager';
import { ColorEngine } from '../themes/colorEngine';
import { CoreRenderer } from './CoreRenderer';

export class AnimationController {
  private readonly renderer: CoreRenderer;
  private readonly stateManager: CoreStateManager;
  private readonly colorEngine: ColorEngine;
  private getSettings: () => LiveCoreSettings;
  private onStatsUpdate?: (stats: WebGLRenderStats) => void;

  private rafId: number | null = null;
  private isRunning = false;
  private lastTimestamp = 0;
  private elapsedSeconds = 0;
  private smoothedFps = 60;
  private lastStatsEmitTime = 0;
  private lastRenderTime = 0;

  private reducedMotionMedia: MediaQueryList | null = null;
  private osPrefersReducedMotion = false;
  private isDocumentHidden =
    typeof document !== 'undefined' ? document.hidden : false;

  private readonly handleVisibilityChange = (): void => {
    this.isDocumentHidden = document.hidden;
    if (!document.hidden) {
      this.lastTimestamp = performance.now();
    }
  };

  private readonly handleMotionChange = (e: MediaQueryListEvent): void => {
    this.osPrefersReducedMotion = e.matches;
  };

  constructor(
    renderer: CoreRenderer,
    stateManager: CoreStateManager,
    colorEngine: ColorEngine,
    getSettings: () => LiveCoreSettings,
    onStatsUpdate?: (stats: WebGLRenderStats) => void
  ) {
    this.renderer = renderer;
    this.stateManager = stateManager;
    this.colorEngine = colorEngine;
    this.getSettings = getSettings;
    this.onStatsUpdate = onStatsUpdate;

    if (typeof window !== 'undefined' && window.matchMedia) {
      this.reducedMotionMedia = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      );
      this.osPrefersReducedMotion = this.reducedMotionMedia.matches;
      this.reducedMotionMedia.addEventListener(
        'change',
        this.handleMotionChange
      );
    }

    if (typeof document !== 'undefined') {
      document.addEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTimestamp = performance.now();
    this.lastStatsEmitTime = this.lastTimestamp;
    this.rafId = requestAnimationFrame(this.tick);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public dispose(): void {
    this.stop();
    if (this.reducedMotionMedia) {
      this.reducedMotionMedia.removeEventListener(
        'change',
        this.handleMotionChange
      );
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.isRunning) return;
    this.rafId = requestAnimationFrame(this.tick);

    const settings = this.getSettings();
    if (!settings.enabled) return;

    // Pause completely if document is hidden and user configured pauseWhenOccluded
    if (this.isDocumentHidden && settings.multiMonitor.pauseWhenOccluded) {
      this.lastTimestamp = now;
      return;
    }

    // Cap FPS when window is unfocused if backgroundFpsCap < 60
    const isUnfocused =
      typeof document !== 'undefined' && !document.hasFocus();
    if (isUnfocused && settings.multiMonitor.backgroundFpsCap < 58) {
      const minIntervalMs =
        1000 / Math.max(5, settings.multiMonitor.backgroundFpsCap);
      if (now - this.lastRenderTime < minIntervalMs) {
        return;
      }
    }

    const rawDt = Math.max(0.001, (now - this.lastTimestamp) / 1000);
    this.lastTimestamp = now;
    this.lastRenderTime = now;

    const clampedDt = Math.min(rawDt, 0.1);
    const instantFps = Math.min(144, 1 / rawDt);
    this.smoothedFps = this.smoothedFps * 0.92 + instantFps * 0.08;

    const reducedMotionActive =
      settings.respectReducedMotion && this.osPrefersReducedMotion;
    const speedScale = reducedMotionActive
      ? settings.animationSpeed * 0.18
      : settings.animationSpeed;

    const simDt = clampedDt * speedScale;
    this.elapsedSeconds += simDt;

    const motion = this.stateManager.update(simDt);
    const activeState = this.stateManager.getState();
    const voiceLevel = this.stateManager.getSmoothedVoiceLevel();
    const completionPulse = this.stateManager.consumeCompletionPulse();

    const effectiveCycleSpeed = reducedMotionActive
      ? settings.colorCycleSpeed * 0.25
      : settings.colorCycleSpeed;

    this.colorEngine.update(
      clampedDt,
      activeState,
      this.elapsedSeconds,
      settings.autoColorCycle,
      effectiveCycleSpeed
    );

    this.renderer.renderFrame(
      simDt,
      this.elapsedSeconds,
      settings,
      motion,
      activeState,
      voiceLevel,
      completionPulse
    );

    if (this.onStatsUpdate && now - this.lastStatsEmitTime > 450) {
      this.lastStatsEmitTime = now;
      this.onStatsUpdate(
        this.renderer.getRenderStats(
          this.smoothedFps,
          reducedMotionActive,
          this.isDocumentHidden
        )
      );
    }
  };
}
