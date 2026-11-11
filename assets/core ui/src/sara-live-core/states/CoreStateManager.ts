import * as THREE from 'three';
import { SaraCoreState } from '../types';

export interface StateMotionProfile {
  coreRotationSpeed: number;
  ringSpeedMultiplier: number;
  particleOrbitSpeed: number;
  particleRadialPull: number; // + attracts inward, - expands outward
  turbulenceAmplitude: number;
  turbulenceFrequency: number;
  pulseFrequency: number;
  pulseAmplitude: number;
  waveEmissionRate: number;
  waveExpansionSpeed: number;
  synapticDensityBoost: number;
  scanSweepSpeed: number;
  jitterAmount: number;
  coreLuminanceBoost: number;
}

export interface StateDescriptor {
  id: SaraCoreState;
  label: string;
  code: string;
  description: string;
}

export const STATE_DESCRIPTORS: Record<SaraCoreState, StateDescriptor> = {
  idle: {
    id: 'idle',
    label: 'Idle Standby',
    code: 'SYS-IDLE',
    description: 'Slow rotating energy core in harmonic equilibrium',
  },
  listening: {
    id: 'listening',
    label: 'Listening',
    code: 'AUD-RX',
    description: 'Expanding cyan acoustic waves & inward field focus',
  },
  thinking: {
    id: 'thinking',
    label: 'Thinking',
    code: 'NEU-PROC',
    description: 'Accelerated particle convection & cognitive synthesis',
  },
  speaking: {
    id: 'speaking',
    label: 'Speaking',
    code: 'VOX-TX',
    description: 'Core pulses & harmonic waves synchronized to voice activity',
  },
  executing: {
    id: 'executing',
    label: 'Executing',
    code: 'EXE-ACT',
    description: 'High-velocity multi-axis holographic rings engaged',
  },
  learning: {
    id: 'learning',
    label: 'Learning',
    code: 'SYN-MAP',
    description: 'Dense particle connections forming neural network topologies',
  },
  researching: {
    id: 'researching',
    label: 'Researching',
    code: 'SCN-DEEP',
    description: 'Sweeping volumetric scanning energy waves across matrix',
  },
  warning: {
    id: 'warning',
    label: 'Warning',
    code: 'ALR-WARN',
    description: 'Amber thermal-magnetic tension & cautionary oscillation',
  },
  error: {
    id: 'error',
    label: 'Error Fault',
    code: 'ERR-CRIT',
    description: 'Disturbed crimson plasma turbulence & field destabilization',
  },
  completed: {
    id: 'completed',
    label: 'Task Completed',
    code: 'ACK-DONE',
    description: 'Coherent confirmation shockwave returning to standby',
  },
};

export const STATE_PROFILES: Record<SaraCoreState, StateMotionProfile> = {
  idle: {
    coreRotationSpeed: 0.28,
    ringSpeedMultiplier: 1.0,
    particleOrbitSpeed: 0.45,
    particleRadialPull: 0.0,
    turbulenceAmplitude: 0.08,
    turbulenceFrequency: 1.4,
    pulseFrequency: 1.35,
    pulseAmplitude: 0.035,
    waveEmissionRate: 0.35,
    waveExpansionSpeed: 0.9,
    synapticDensityBoost: 0.55,
    scanSweepSpeed: 0.2,
    jitterAmount: 0.0,
    coreLuminanceBoost: 1.0,
  },
  listening: {
    coreRotationSpeed: 0.42,
    ringSpeedMultiplier: 1.25,
    particleOrbitSpeed: 0.68,
    particleRadialPull: 0.38,
    turbulenceAmplitude: 0.11,
    turbulenceFrequency: 2.2,
    pulseFrequency: 2.8,
    pulseAmplitude: 0.055,
    waveEmissionRate: 1.45,
    waveExpansionSpeed: 1.45,
    synapticDensityBoost: 0.65,
    scanSweepSpeed: 0.5,
    jitterAmount: 0.0,
    coreLuminanceBoost: 1.18,
  },
  thinking: {
    coreRotationSpeed: 1.15,
    ringSpeedMultiplier: 1.75,
    particleOrbitSpeed: 1.95,
    particleRadialPull: 0.15,
    turbulenceAmplitude: 0.2,
    turbulenceFrequency: 3.6,
    pulseFrequency: 4.2,
    pulseAmplitude: 0.06,
    waveEmissionRate: 0.85,
    waveExpansionSpeed: 1.3,
    synapticDensityBoost: 1.15,
    scanSweepSpeed: 1.1,
    jitterAmount: 0.005,
    coreLuminanceBoost: 1.28,
  },
  speaking: {
    coreRotationSpeed: 0.65,
    ringSpeedMultiplier: 1.4,
    particleOrbitSpeed: 1.05,
    particleRadialPull: -0.18,
    turbulenceAmplitude: 0.16,
    turbulenceFrequency: 3.0,
    pulseFrequency: 6.5,
    pulseAmplitude: 0.12,
    waveEmissionRate: 1.7,
    waveExpansionSpeed: 1.65,
    synapticDensityBoost: 0.75,
    scanSweepSpeed: 0.4,
    jitterAmount: 0.0,
    coreLuminanceBoost: 1.32,
  },
  executing: {
    coreRotationSpeed: 1.45,
    ringSpeedMultiplier: 2.85,
    particleOrbitSpeed: 1.6,
    particleRadialPull: 0.22,
    turbulenceAmplitude: 0.14,
    turbulenceFrequency: 2.8,
    pulseFrequency: 3.5,
    pulseAmplitude: 0.05,
    waveEmissionRate: 1.15,
    waveExpansionSpeed: 1.75,
    synapticDensityBoost: 0.85,
    scanSweepSpeed: 1.4,
    jitterAmount: 0.004,
    coreLuminanceBoost: 1.35,
  },
  learning: {
    coreRotationSpeed: 0.58,
    ringSpeedMultiplier: 1.3,
    particleOrbitSpeed: 0.88,
    particleRadialPull: 0.08,
    turbulenceAmplitude: 0.12,
    turbulenceFrequency: 2.0,
    pulseFrequency: 2.1,
    pulseAmplitude: 0.045,
    waveEmissionRate: 0.7,
    waveExpansionSpeed: 1.1,
    synapticDensityBoost: 1.65,
    scanSweepSpeed: 0.85,
    jitterAmount: 0.0,
    coreLuminanceBoost: 1.22,
  },
  researching: {
    coreRotationSpeed: 0.75,
    ringSpeedMultiplier: 1.6,
    particleOrbitSpeed: 1.2,
    particleRadialPull: -0.1,
    turbulenceAmplitude: 0.13,
    turbulenceFrequency: 2.4,
    pulseFrequency: 2.4,
    pulseAmplitude: 0.04,
    waveEmissionRate: 1.25,
    waveExpansionSpeed: 1.5,
    synapticDensityBoost: 1.0,
    scanSweepSpeed: 2.65,
    jitterAmount: 0.0,
    coreLuminanceBoost: 1.24,
  },
  warning: {
    coreRotationSpeed: 0.85,
    ringSpeedMultiplier: 1.55,
    particleOrbitSpeed: 1.3,
    particleRadialPull: -0.15,
    turbulenceAmplitude: 0.24,
    turbulenceFrequency: 4.2,
    pulseFrequency: 4.8,
    pulseAmplitude: 0.09,
    waveEmissionRate: 1.3,
    waveExpansionSpeed: 1.45,
    synapticDensityBoost: 0.5,
    scanSweepSpeed: 1.5,
    jitterAmount: 0.018,
    coreLuminanceBoost: 1.35,
  },
  error: {
    coreRotationSpeed: 1.65,
    ringSpeedMultiplier: 2.2,
    particleOrbitSpeed: 2.35,
    particleRadialPull: -0.35,
    turbulenceAmplitude: 0.42,
    turbulenceFrequency: 7.5,
    pulseFrequency: 8.5,
    pulseAmplitude: 0.14,
    waveEmissionRate: 1.9,
    waveExpansionSpeed: 2.0,
    synapticDensityBoost: 0.3,
    scanSweepSpeed: 0.3,
    jitterAmount: 0.055,
    coreLuminanceBoost: 1.45,
  },
  completed: {
    coreRotationSpeed: 0.5,
    ringSpeedMultiplier: 1.5,
    particleOrbitSpeed: 0.9,
    particleRadialPull: -0.42,
    turbulenceAmplitude: 0.06,
    turbulenceFrequency: 1.5,
    pulseFrequency: 1.8,
    pulseAmplitude: 0.15,
    waveEmissionRate: 2.2,
    waveExpansionSpeed: 2.2,
    synapticDensityBoost: 1.1,
    scanSweepSpeed: 0.6,
    jitterAmount: 0.0,
    coreLuminanceBoost: 1.55,
  },
};

export class CoreStateManager {
  private currentState: SaraCoreState = 'idle';
  private stateEnteredAt = performance.now();
  private voiceLevel = 0;
  private smoothedVoiceLevel = 0;
  private completionPulseTrigger = 0;
  public readonly profile: StateMotionProfile = { ...STATE_PROFILES.idle };
  private stateListeners = new Set<(state: SaraCoreState) => void>();

  public getState(): SaraCoreState {
    return this.currentState;
  }

  public setState(nextState: SaraCoreState): void {
    if (nextState === this.currentState && nextState !== 'completed') return;
    this.currentState = nextState;
    this.stateEnteredAt = performance.now();
    if (nextState === 'completed') {
      this.completionPulseTrigger = 1.0;
    }
    for (const listener of this.stateListeners) {
      listener(this.currentState);
    }
  }

  public setVoiceActivity(level: number): void {
    this.voiceLevel = THREE.MathUtils.clamp(level, 0, 1);
  }

  public getSmoothedVoiceLevel(): number {
    return this.smoothedVoiceLevel;
  }

  public consumeCompletionPulse(): number {
    const val = this.completionPulseTrigger;
    this.completionPulseTrigger = Math.max(0, this.completionPulseTrigger - 0.05);
    return val;
  }

  public update(dt: number): StateMotionProfile {
    const clampedDt = Math.min(dt, 0.1);

    // Automatically settle from 'completed' back into 'idle' after 2.4 seconds
    if (
      this.currentState === 'completed' &&
      performance.now() - this.stateEnteredAt > 2400
    ) {
      this.setState('idle');
    }

    // Smooth voice activity level
    const voiceLerp = 1 - Math.exp(-14 * clampedDt);
    this.smoothedVoiceLevel = THREE.MathUtils.lerp(
      this.smoothedVoiceLevel,
      this.voiceLevel,
      voiceLerp
    );

    const target = STATE_PROFILES[this.currentState];
    const alpha = 1 - Math.exp(-4.2 * clampedDt);

    this.profile.coreRotationSpeed = THREE.MathUtils.lerp(
      this.profile.coreRotationSpeed,
      target.coreRotationSpeed,
      alpha
    );
    this.profile.ringSpeedMultiplier = THREE.MathUtils.lerp(
      this.profile.ringSpeedMultiplier,
      target.ringSpeedMultiplier,
      alpha
    );
    this.profile.particleOrbitSpeed = THREE.MathUtils.lerp(
      this.profile.particleOrbitSpeed,
      target.particleOrbitSpeed,
      alpha
    );
    this.profile.particleRadialPull = THREE.MathUtils.lerp(
      this.profile.particleRadialPull,
      target.particleRadialPull,
      alpha
    );
    this.profile.turbulenceAmplitude = THREE.MathUtils.lerp(
      this.profile.turbulenceAmplitude,
      target.turbulenceAmplitude,
      alpha
    );
    this.profile.turbulenceFrequency = THREE.MathUtils.lerp(
      this.profile.turbulenceFrequency,
      target.turbulenceFrequency,
      alpha
    );
    this.profile.pulseFrequency = THREE.MathUtils.lerp(
      this.profile.pulseFrequency,
      target.pulseFrequency,
      alpha
    );
    this.profile.pulseAmplitude = THREE.MathUtils.lerp(
      this.profile.pulseAmplitude,
      target.pulseAmplitude,
      alpha
    );
    this.profile.waveEmissionRate = THREE.MathUtils.lerp(
      this.profile.waveEmissionRate,
      target.waveEmissionRate,
      alpha
    );
    this.profile.waveExpansionSpeed = THREE.MathUtils.lerp(
      this.profile.waveExpansionSpeed,
      target.waveExpansionSpeed,
      alpha
    );
    this.profile.synapticDensityBoost = THREE.MathUtils.lerp(
      this.profile.synapticDensityBoost,
      target.synapticDensityBoost,
      alpha
    );
    this.profile.scanSweepSpeed = THREE.MathUtils.lerp(
      this.profile.scanSweepSpeed,
      target.scanSweepSpeed,
      alpha
    );
    this.profile.jitterAmount = THREE.MathUtils.lerp(
      this.profile.jitterAmount,
      target.jitterAmount,
      alpha
    );
    this.profile.coreLuminanceBoost = THREE.MathUtils.lerp(
      this.profile.coreLuminanceBoost,
      target.coreLuminanceBoost,
      alpha
    );

    // Modulate speaking & listening with real voice activity amplitude when active
    if (this.currentState === 'speaking') {
      const v = this.smoothedVoiceLevel;
      this.profile.pulseAmplitude = 0.05 + v * 0.22;
      this.profile.coreLuminanceBoost = 1.15 + v * 0.75;
      this.profile.waveEmissionRate = 0.9 + v * 2.4;
      this.profile.turbulenceAmplitude = 0.1 + v * 0.22;
    } else if (this.currentState === 'listening') {
      const v = this.smoothedVoiceLevel;
      this.profile.pulseAmplitude = 0.04 + v * 0.12;
      this.profile.waveEmissionRate = 1.1 + v * 1.6;
    }

    return this.profile;
  }

  public subscribe(listener: (state: SaraCoreState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }
}
