import * as THREE from 'three';
import { CoreThemeColors, SaraCoreState } from '../types';
import { THEME_REGISTRY } from './themeRegistry';

export interface LiveColorUniformSet {
  primary: THREE.Color;
  secondary: THREE.Color;
  accent: THREE.Color;
  ring: THREE.Color;
  glow: THREE.Color;
  backgroundGlow: THREE.Color;
  highlight: THREE.Color;
  shadow: THREE.Color;
}

const WARNING_OVERRIDE_COLORS: CoreThemeColors = {
  primary: '#ff9800',
  secondary: '#b24b00',
  accent: '#ffe082',
  ring: '#ffb74d',
  glow: '#ff6d00',
  backgroundGlow: '#291402',
  highlight: '#fff0c2',
  shadow: '#0d0500',
};

const ERROR_OVERRIDE_COLORS: CoreThemeColors = {
  primary: '#ff1744',
  secondary: '#8e001c',
  accent: '#ff8a80',
  ring: '#ff4569',
  glow: '#d50000',
  backgroundGlow: '#2e030b',
  highlight: '#ffd6dc',
  shadow: '#100004',
};

function hexToRgbTriplet(color: THREE.Color): string {
  const r = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
  const g = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
  const b = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
  return `${r}, ${g}, ${b}`;
}

const AUTO_CYCLE_SEQUENCE = [
  'ultron-blue',
  'neon-purple',
  'crimson-red',
  'golden-amber',
  'emerald-green',
  'ice-white',
] as const;

export class ColorEngine {
  public readonly current: LiveColorUniformSet;
  private readonly baseTarget: LiveColorUniformSet;
  private readonly effectiveTarget: LiveColorUniformSet;
  private readonly cyclePalettes: LiveColorUniformSet[];
  private autoCyclePhase = 0;
  private cssHostElement: HTMLElement | null = null;
  private lastCssSyncTime = 0;

  constructor(initialColors: CoreThemeColors = THEME_REGISTRY['ultron-blue'].colors) {
    this.current = this.createColorSet(initialColors);
    this.baseTarget = this.createColorSet(initialColors);
    this.effectiveTarget = this.createColorSet(initialColors);
    this.cyclePalettes = AUTO_CYCLE_SEQUENCE.map((id) =>
      this.createColorSet(THEME_REGISTRY[id].colors)
    );
  }

  private createColorSet(colors: CoreThemeColors): LiveColorUniformSet {
    return {
      primary: new THREE.Color(colors.primary),
      secondary: new THREE.Color(colors.secondary),
      accent: new THREE.Color(colors.accent),
      ring: new THREE.Color(colors.ring),
      glow: new THREE.Color(colors.glow),
      backgroundGlow: new THREE.Color(colors.backgroundGlow),
      highlight: new THREE.Color(colors.highlight),
      shadow: new THREE.Color(colors.shadow),
    };
  }

  public attachCssHost(element: HTMLElement | null): void {
    this.cssHostElement = element;
    if (element) {
      this.applyCssVariables(element);
    }
  }

  public setTargetThemeColors(colors: CoreThemeColors, immediate = false): void {
    this.baseTarget.primary.set(colors.primary);
    this.baseTarget.secondary.set(colors.secondary);
    this.baseTarget.accent.set(colors.accent);
    this.baseTarget.ring.set(colors.ring);
    this.baseTarget.glow.set(colors.glow);
    this.baseTarget.backgroundGlow.set(colors.backgroundGlow);
    this.baseTarget.highlight.set(colors.highlight);
    this.baseTarget.shadow.set(colors.shadow);

    if (immediate) {
      this.copySet(this.baseTarget, this.effectiveTarget);
      this.copySet(this.baseTarget, this.current);
      if (this.cssHostElement) {
        this.applyCssVariables(this.cssHostElement);
      }
    }
  }

  private copySet(src: LiveColorUniformSet, dst: LiveColorUniformSet): void {
    dst.primary.copy(src.primary);
    dst.secondary.copy(src.secondary);
    dst.accent.copy(src.accent);
    dst.ring.copy(src.ring);
    dst.glow.copy(src.glow);
    dst.backgroundGlow.copy(src.backgroundGlow);
    dst.highlight.copy(src.highlight);
    dst.shadow.copy(src.shadow);
  }

  private interpolateSets(
    a: LiveColorUniformSet,
    b: LiveColorUniformSet,
    t: number,
    out: LiveColorUniformSet
  ): void {
    out.primary.copy(a.primary).lerp(b.primary, t);
    out.secondary.copy(a.secondary).lerp(b.secondary, t);
    out.accent.copy(a.accent).lerp(b.accent, t);
    out.ring.copy(a.ring).lerp(b.ring, t);
    out.glow.copy(a.glow).lerp(b.glow, t);
    out.backgroundGlow.copy(a.backgroundGlow).lerp(b.backgroundGlow, t);
    out.highlight.copy(a.highlight).lerp(b.highlight, t);
    out.shadow.copy(a.shadow).lerp(b.shadow, t);
  }

  public update(
    dt: number,
    activeState: SaraCoreState,
    elapsedSeconds: number,
    autoColorCycle = false,
    colorCycleSpeed = 1.0
  ): void {
    const clampedDt = Math.min(dt, 0.1);

    if (autoColorCycle && this.cyclePalettes.length > 1) {
      // Advance smoothly through spectral themes (~6.5s per full chromatic shift at 1.0x)
      this.autoCyclePhase =
        (this.autoCyclePhase + clampedDt * colorCycleSpeed * 0.16) %
        this.cyclePalettes.length;
      const idxA = Math.floor(this.autoCyclePhase);
      const idxB = (idxA + 1) % this.cyclePalettes.length;
      const rawT = this.autoCyclePhase - idxA;
      const smoothT = rawT * rawT * (3 - 2 * rawT);

      this.interpolateSets(
        this.cyclePalettes[idxA],
        this.cyclePalettes[idxB],
        smoothT,
        this.effectiveTarget
      );
    } else {
      this.copySet(this.baseTarget, this.effectiveTarget);
    }

    if (activeState === 'warning') {
      const pulse = 0.68 + 0.24 * Math.sin(elapsedSeconds * 5.0);
      this.blendOverride(WARNING_OVERRIDE_COLORS, pulse);
    } else if (activeState === 'error') {
      const flicker =
        0.78 +
        0.22 *
          Math.abs(
            Math.sin(elapsedSeconds * 11.5) * Math.cos(elapsedSeconds * 4.3)
          );
      this.blendOverride(ERROR_OVERRIDE_COLORS, Math.min(1, flicker));
    } else if (activeState === 'listening') {
      // Subtle cyan-accent lift during active listening
      const cyanTint = new THREE.Color('#38f6ff');
      this.effectiveTarget.accent.lerp(cyanTint, 0.45);
      this.effectiveTarget.ring.lerp(cyanTint, 0.3);
    }

    const lerpAlpha = 1 - Math.exp(-4.8 * Math.min(dt, 0.1));
    this.current.primary.lerp(this.effectiveTarget.primary, lerpAlpha);
    this.current.secondary.lerp(this.effectiveTarget.secondary, lerpAlpha);
    this.current.accent.lerp(this.effectiveTarget.accent, lerpAlpha);
    this.current.ring.lerp(this.effectiveTarget.ring, lerpAlpha);
    this.current.glow.lerp(this.effectiveTarget.glow, lerpAlpha);
    this.current.backgroundGlow.lerp(this.effectiveTarget.backgroundGlow, lerpAlpha);
    this.current.highlight.lerp(this.effectiveTarget.highlight, lerpAlpha);
    this.current.shadow.lerp(this.effectiveTarget.shadow, lerpAlpha);

    // Sync CSS variables at ~30Hz max to avoid DOM style recalc overhead
    if (this.cssHostElement && elapsedSeconds - this.lastCssSyncTime > 0.032) {
      this.lastCssSyncTime = elapsedSeconds;
      this.applyCssVariables(this.cssHostElement);
    }
  }

  private blendOverride(override: CoreThemeColors, factor: number): void {
    const tmp = new THREE.Color();
    this.effectiveTarget.primary.lerp(tmp.set(override.primary), factor);
    this.effectiveTarget.secondary.lerp(tmp.set(override.secondary), factor);
    this.effectiveTarget.accent.lerp(tmp.set(override.accent), factor);
    this.effectiveTarget.ring.lerp(tmp.set(override.ring), factor);
    this.effectiveTarget.glow.lerp(tmp.set(override.glow), factor);
    this.effectiveTarget.backgroundGlow.lerp(
      tmp.set(override.backgroundGlow),
      factor
    );
    this.effectiveTarget.highlight.lerp(tmp.set(override.highlight), factor);
    this.effectiveTarget.shadow.lerp(tmp.set(override.shadow), factor);
  }

  private applyCssVariables(el: HTMLElement): void {
    const style = el.style;
    style.setProperty('--sara-primary', `#${this.current.primary.getHexString()}`);
    style.setProperty(
      '--sara-secondary',
      `#${this.current.secondary.getHexString()}`
    );
    style.setProperty('--sara-accent', `#${this.current.accent.getHexString()}`);
    style.setProperty('--sara-ring', `#${this.current.ring.getHexString()}`);
    style.setProperty('--sara-glow', `#${this.current.glow.getHexString()}`);
    style.setProperty(
      '--sara-bg-glow',
      `#${this.current.backgroundGlow.getHexString()}`
    );
    style.setProperty(
      '--sara-highlight',
      `#${this.current.highlight.getHexString()}`
    );
    style.setProperty('--sara-shadow', `#${this.current.shadow.getHexString()}`);

    style.setProperty(
      '--sara-primary-rgb',
      hexToRgbTriplet(this.current.primary)
    );
    style.setProperty('--sara-accent-rgb', hexToRgbTriplet(this.current.accent));
    style.setProperty('--sara-ring-rgb', hexToRgbTriplet(this.current.ring));
    style.setProperty('--sara-glow-rgb', hexToRgbTriplet(this.current.glow));
    style.setProperty(
      '--sara-bg-glow-rgb',
      hexToRgbTriplet(this.current.backgroundGlow)
    );
  }
}
