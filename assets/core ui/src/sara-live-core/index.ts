export { LiveCoreApp, default } from './LiveCoreApp';
export type { LiveCoreAppProps } from './LiveCoreApp';

export * from './types';
export {
  THEME_REGISTRY,
  THEME_LIST,
  DEFAULT_CUSTOM_COLORS,
  resolveThemeColors,
} from './themes/themeRegistry';
export { ColorEngine } from './themes/colorEngine';
export {
  CoreStateManager,
  STATE_DESCRIPTORS,
  STATE_PROFILES,
} from './states/CoreStateManager';
export {
  LiveCoreSettingsStore,
  QUALITY_PROFILES,
  createDefaultSettings,
} from './settings/LiveCoreSettings';
export { CoreRenderer } from './engine/CoreRenderer';
export { AnimationController } from './engine/AnimationController';
export { ParticleSystem } from './engine/ParticleSystem';
export { ShaderManager } from './engine/ShaderManager';
export { useCoreAnimation } from './hooks/useCoreAnimation';
export { useSaraEvents } from './hooks/useSaraEvents';
