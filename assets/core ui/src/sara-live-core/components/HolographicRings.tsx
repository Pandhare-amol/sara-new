import React from 'react';
import { SaraCoreState } from '../types';

interface HolographicRingsProps {
  coreSize: number;
  ringSpeed: number;
  glowIntensity: number;
  activeState: SaraCoreState;
  reducedMotion: boolean;
}

export const HolographicRings: React.FC<HolographicRingsProps> = ({
  coreSize,
  ringSpeed,
  glowIntensity,
  activeState,
  reducedMotion,
}) => {
  const speedFactor =
    activeState === 'executing'
      ? 2.2
      : activeState === 'thinking'
      ? 1.65
      : activeState === 'error'
      ? 1.9
      : 1.0;

  const effectiveSpeed = Math.max(0.15, ringSpeed * speedFactor);
  const outerDuration = `${(48 / effectiveSpeed).toFixed(1)}s`;
  const midDuration = `${(32 / effectiveSpeed).toFixed(1)}s`;
  const innerDuration = `${(22 / effectiveSpeed).toFixed(1)}s`;

  const ringOpacity = Math.min(0.62, Math.max(0.12, 0.34 * glowIntensity));
  const scale = 0.85 + coreSize * 0.22;

  return (
    <div
      className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 800 800"
        className="sara-holo-reticle select-none"
        style={{
          width: 'min(82vw, 82vh)',
          height: 'min(82vw, 82vh)',
          transform: `scale(${scale.toFixed(3)})`,
          opacity: ringOpacity,
          transition: 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease',
        }}
      >
        <defs>
          <radialGradient id="saraRingFade" cx="50%" cy="50%" r="50%">
            <stop offset="68%" stopColor="var(--sara-ring, #29d9ff)" stopOpacity="0" />
            <stop offset="88%" stopColor="var(--sara-ring, #29d9ff)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--sara-accent, #4df7ff)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer Azimuth Compass Ring */}
        <g
          style={{
            transformOrigin: '400px 400px',
            animation: reducedMotion
              ? 'none'
              : `saraSpinCw ${outerDuration} linear infinite`,
          }}
        >
          <circle
            cx="400"
            cy="400"
            r="368"
            fill="none"
            stroke="var(--sara-ring, #29d9ff)"
            strokeWidth="0.85"
            strokeDasharray="4 10 24 10"
            opacity="0.55"
          />
          {/* Cardinal Azimuth Ticks */}
          {Array.from({ length: 24 }).map((_, idx) => {
            const angle = idx * 15;
            const isMajor = idx % 3 === 0;
            return (
              <line
                key={idx}
                x1="400"
                y1={isMajor ? '24' : '30'}
                x2="400"
                y2="38"
                stroke="var(--sara-accent, #4df7ff)"
                strokeWidth={isMajor ? '1.5' : '0.75'}
                opacity={isMajor ? '0.85' : '0.4'}
                transform={`rotate(${angle} 400 400)`}
              />
            );
          })}
        </g>

        {/* Mid Segmented Telemetry Arc Ring */}
        <g
          style={{
            transformOrigin: '400px 400px',
            animation: reducedMotion
              ? 'none'
              : `saraSpinCcw ${midDuration} linear infinite`,
          }}
        >
          <circle
            cx="400"
            cy="400"
            r="322"
            fill="none"
            stroke="var(--sara-accent, #4df7ff)"
            strokeWidth="1.15"
            strokeDasharray="95 55 30 55 120 65"
            opacity="0.62"
          />
          <circle
            cx="400"
            cy="400"
            r="312"
            fill="none"
            stroke="var(--sara-primary, #00a8ff)"
            strokeWidth="0.6"
            strokeDasharray="2 6"
            opacity="0.45"
          />
        </g>

        {/* Inner Harmonic Stabilizer Ring */}
        <g
          style={{
            transformOrigin: '400px 400px',
            animation: reducedMotion
              ? 'none'
              : `saraSpinCw ${innerDuration} linear infinite`,
          }}
        >
          <circle
            cx="400"
            cy="400"
            r="268"
            fill="none"
            stroke="var(--sara-ring, #29d9ff)"
            strokeWidth="0.95"
            strokeDasharray="60 140"
            opacity="0.58"
          />
          <circle cx="400" cy="132" r="2.6" fill="var(--sara-highlight, #b5f8ff)" />
          <circle cx="400" cy="668" r="2.6" fill="var(--sara-highlight, #b5f8ff)" />
        </g>
      </svg>
    </div>
  );
};
