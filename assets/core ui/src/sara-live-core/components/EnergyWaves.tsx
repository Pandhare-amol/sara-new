import React from 'react';
import { SaraCoreState } from '../types';

interface EnergyWavesProps {
  activeState: SaraCoreState;
  voiceLevel: number;
  glowIntensity: number;
  coreSize: number;
  reducedMotion: boolean;
}

export const EnergyWaves: React.FC<EnergyWavesProps> = ({
  activeState,
  voiceLevel,
  glowIntensity,
  coreSize,
  reducedMotion,
}) => {
  if (reducedMotion) return null;

  const isWaveIntense =
    activeState === 'listening' ||
    activeState === 'speaking' ||
    activeState === 'researching' ||
    activeState === 'completed';

  const waveOpacity = Math.min(
    0.55,
    (isWaveIntense ? 0.34 : 0.16) * glowIntensity + voiceLevel * 0.24
  );

  const cycleSeconds =
    activeState === 'speaking'
      ? 1.9
      : activeState === 'listening'
      ? 2.4
      : activeState === 'completed'
      ? 1.5
      : 4.2;

  const baseDiameter = `calc(min(44vw, 44vh) * ${coreSize.toFixed(2)})`;

  return (
    <div
      className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden"
      aria-hidden="true"
    >
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="sara-energy-wave-ring absolute rounded-full"
          style={{
            width: baseDiameter,
            height: baseDiameter,
            border: '1px solid rgba(var(--sara-accent-rgb, 77, 247, 255), 0.55)',
            boxShadow:
              '0 0 24px rgba(var(--sara-glow-rgb, 0, 149, 255), 0.25), inset 0 0 18px rgba(var(--sara-accent-rgb, 77, 247, 255), 0.16)',
            opacity: waveOpacity,
            animation: `saraWaveExpand ${cycleSeconds}s cubic-bezier(0.16, 1, 0.3, 1) infinite`,
            animationDelay: `${((cycleSeconds / 3) * index).toFixed(2)}s`,
          }}
        />
      ))}
    </div>
  );
};
