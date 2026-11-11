import { useEffect, useRef, useState } from 'react';
import { LiveCoreSettings, WebGLContextHealth, WebGLRenderStats } from '../types';
import { CoreStateManager } from '../states/CoreStateManager';
import { ColorEngine } from '../themes/colorEngine';
import { resolveThemeColors } from '../themes/themeRegistry';
import { CoreRenderer } from '../engine/CoreRenderer';
import { AnimationController } from '../engine/AnimationController';

export function useCoreAnimation(
  containerRef: { current: HTMLDivElement | null },
  settings: LiveCoreSettings,
  stateManager: CoreStateManager,
  colorEngine: ColorEngine
) {
  const settingsRef = useRef<LiveCoreSettings>(settings);
  settingsRef.current = settings;

  const rendererRef = useRef<CoreRenderer | null>(null);
  const controllerRef = useRef<AnimationController | null>(null);

  const [renderStats, setRenderStats] = useState<WebGLRenderStats>({
    health: settings.enabled ? 'initializing' : 'disabled',
    fps: 60,
    particleCount: 0,
    synapticLinkCount: 0,
    drawCalls: 0,
    rendererName: 'Initializing...',
    reducedMotionActive: false,
    isDocumentHidden: false,
  });

  // Update ColorEngine target whenever themeId or customColors change (zero reload!)
  useEffect(() => {
    const colors = resolveThemeColors(settings.themeId, settings.customColors);
    colorEngine.setTargetThemeColors(colors, false);
  }, [settings.themeId, settings.customColors, colorEngine]);

  // Sync quality & particle density to live CoreRenderer
  useEffect(() => {
    rendererRef.current?.syncSettings(settings);
  }, [settings]);

  // Mount / unmount WebGL CoreRenderer & AnimationController when enabled toggles
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !settings.enabled) {
      setRenderStats((prev) => ({
        ...prev,
        health: 'disabled',
        fps: 0,
        particleCount: 0,
        synapticLinkCount: 0,
        drawCalls: 0,
      }));
      return;
    }

    const initialColors = resolveThemeColors(
      settingsRef.current.themeId,
      settingsRef.current.customColors
    );
    colorEngine.setTargetThemeColors(initialColors, true);

    const handleHealth = (health: WebGLContextHealth) => {
      setRenderStats((prev) => ({ ...prev, health }));
    };

    const renderer = new CoreRenderer(
      container,
      colorEngine,
      settingsRef.current,
      handleHealth
    );
    rendererRef.current = renderer;

    const controller = new AnimationController(
      renderer,
      stateManager,
      colorEngine,
      () => settingsRef.current,
      (stats) => setRenderStats(stats)
    );
    controllerRef.current = controller;
    controller.start();

    return () => {
      controller.dispose();
      controllerRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [containerRef, settings.enabled, stateManager, colorEngine]);

  const pulseWaveManually = () => {
    rendererRef.current?.spawnEnergyWave(true);
  };

  return {
    renderStats,
    pulseWaveManually,
  };
}
