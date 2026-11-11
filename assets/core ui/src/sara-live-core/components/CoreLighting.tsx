import React from 'react';
import { SaraCoreState } from '../types';

interface CoreLightingProps {
  backgroundIntensity: number;
  glowIntensity: number;
  brightness: number;
  activeState: SaraCoreState;
}

export const CoreLighting: React.FC<CoreLightingProps> = ({
  backgroundIntensity,
  glowIntensity,
  brightness,
  activeState,
}) => {
  const auraOpacity = Math.min(
    1,
    Math.max(0, 0.42 * backgroundIntensity * brightness)
  );
  const coreBloomOpacity = Math.min(
    0.85,
    Math.max(0, 0.28 * glowIntensity * brightness)
  );

  const isAlert = activeState === 'error' || activeState === 'warning';

  return (
    <div
      className="sara-core-lighting pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Deep Obsidian Void Base */}
      <div className="absolute inset-0 bg-[#03050a]" />

      {/* Primary Chromatic Nebula Backdrop */}
      <div
        className="sara-lighting-transition absolute inset-0"
        style={{
          opacity: auraOpacity,
          background: `
            radial-gradient(circle at 50% 50%, rgba(var(--sara-bg-glow-rgb, 6, 26, 54), 0.95) 0%, rgba(var(--sara-primary-rgb, 0, 168, 255), 0.14) 34%, rgba(3, 5, 10, 0.98) 74%),
            radial-gradient(circle at 20% 25%, rgba(var(--sara-glow-rgb, 0, 149, 255), 0.12) 0%, transparent 45%),
            radial-gradient(circle at 80% 75%, rgba(var(--sara-accent-rgb, 77, 247, 255), 0.1) 0%, transparent 48%)
          `,
        }}
      />

      {/* Central Volumetric Core Ambient Bloom */}
      <div
        className={`sara-lighting-transition absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${
          isAlert ? 'animate-pulse' : ''
        }`}
        style={{
          width: 'min(66vw, 66vh)',
          height: 'min(66vw, 66vh)',
          opacity: coreBloomOpacity,
          background:
            'radial-gradient(circle, rgba(var(--sara-accent-rgb, 77, 247, 255), 0.42) 0%, rgba(var(--sara-primary-rgb, 0, 168, 255), 0.18) 45%, transparent 72%)',
        }}
      />

      {/* Subtle Holographic Micro-Grid Vignette */}
      <div
        className="sara-micro-grid absolute inset-0"
        style={{
          opacity: Math.min(0.22, 0.12 * backgroundIntensity),
        }}
      />

      {/* Edge Vignette for Desktop Icon Contrast */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 48%, rgba(2, 4, 9, 0.72) 100%)',
        }}
      />
    </div>
  );
};
