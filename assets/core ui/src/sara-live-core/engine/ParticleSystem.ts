import * as THREE from 'three';
import { QualityProfile } from '../types';
import { StateMotionProfile } from '../states/CoreStateManager';
import { LiveColorUniformSet } from '../themes/colorEngine';
import { ParticleShaderUniforms, ShaderManager } from './ShaderManager';

export class ParticleSystem {
  public readonly group = new THREE.Group();

  private orbitalPoints: THREE.Points | null = null;
  private orbitalGeometry: THREE.BufferGeometry | null = null;
  private orbitalMaterial: THREE.ShaderMaterial | null = null;

  private ambientPoints: THREE.Points | null = null;
  private ambientGeometry: THREE.BufferGeometry | null = null;
  private ambientMaterial: THREE.ShaderMaterial | null = null;

  private synapticLines: THREE.LineSegments | null = null;
  private synapticGeometry: THREE.BufferGeometry | null = null;
  private synapticMaterial: THREE.LineBasicMaterial | null = null;

  private activeParticleCount = 0;
  private activeSynapticLinkCount = 0;
  private maxSynapticLinks = 650;
  private synapticSampleLimit = 260;

  // Per-particle kinematic state arrays (zero GC during animation loop)
  private baseRadius = new Float32Array(0);
  private currentRadius = new Float32Array(0);
  private theta = new Float32Array(0);
  private phi = new Float32Array(0);
  private angularSpeed = new Float32Array(0);
  private inclination = new Float32Array(0);
  private phaseOffset = new Float32Array(0);
  private orbitalPositions = new Float32Array(0);

  private ambientBasePositions = new Float32Array(0);
  private ambientPositions = new Float32Array(0);
  private ambientPhases = new Float32Array(0);

  private synapticPositions = new Float32Array(0);
  private synapticColors = new Float32Array(0);

  private readonly orbitalUniforms: ParticleShaderUniforms;
  private readonly ambientUniforms: ParticleShaderUniforms;
  private readonly shaderManager: ShaderManager;

  constructor(shaderManager: ShaderManager, initialColors: LiveColorUniformSet) {
    this.shaderManager = shaderManager;

    this.orbitalUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSizeScale: { value: 1.0 },
      uPrimaryColor: { value: initialColors.primary.clone() },
      uAccentColor: { value: initialColors.accent.clone() },
      uHighlightColor: { value: initialColors.highlight.clone() },
      uGlowIntensity: { value: 1.15 },
      uBrightness: { value: 1.0 },
    };

    this.ambientUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSizeScale: { value: 0.72 },
      uPrimaryColor: { value: initialColors.secondary.clone() },
      uAccentColor: { value: initialColors.primary.clone() },
      uHighlightColor: { value: initialColors.highlight.clone() },
      uGlowIntensity: { value: 0.75 },
      uBrightness: { value: 0.8 },
    };
  }

  public rebuild(profile: QualityProfile, densityMultiplier: number): void {
    this.disposeBuffersOnly();

    const count = Math.max(
      240,
      Math.round(profile.baseParticleCount * THREE.MathUtils.clamp(densityMultiplier, 0.2, 1.6))
    );
    const ambientCount = Math.max(
      60,
      Math.round(profile.ambientParticleCount * THREE.MathUtils.clamp(densityMultiplier, 0.25, 1.5))
    );

    this.activeParticleCount = count;
    this.maxSynapticLinks = profile.maxSynapticLinks;
    this.synapticSampleLimit = Math.min(count, profile.synapticSampleLimit);

    // 1. Orbital Particle Swarm
    this.baseRadius = new Float32Array(count);
    this.currentRadius = new Float32Array(count);
    this.theta = new Float32Array(count);
    this.phi = new Float32Array(count);
    this.angularSpeed = new Float32Array(count);
    this.inclination = new Float32Array(count);
    this.phaseOffset = new Float32Array(count);
    this.orbitalPositions = new Float32Array(count * 3);

    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const energies = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distribute across inner plasma corona (1.28..1.85) and outer magnetic belt (1.85..2.95)
      const band = Math.random();
      const r =
        band < 0.55
          ? 1.26 + Math.pow(Math.random(), 0.85) * 0.65
          : 1.9 + Math.pow(Math.random(), 1.35) * 1.15;

      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);

      this.baseRadius[i] = r;
      this.currentRadius[i] = r;
      this.theta[i] = t;
      this.phi[i] = p;
      this.angularSpeed[i] = (0.18 + Math.random() * 0.55) * (Math.random() < 0.15 ? -1 : 1);
      this.inclination[i] = (Math.random() - 0.5) * 0.9;
      this.phaseOffset[i] = Math.random() * Math.PI * 2;

      sizes[i] = 1.15 + Math.pow(Math.random(), 2.2) * 3.1;
      phases[i] = this.phaseOffset[i];
      energies[i] = Math.random();

      const sinPhi = Math.sin(p);
      this.orbitalPositions[i * 3] = r * sinPhi * Math.cos(t);
      this.orbitalPositions[i * 3 + 1] = r * Math.cos(p);
      this.orbitalPositions[i * 3 + 2] = r * sinPhi * Math.sin(t);
    }

    this.orbitalGeometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.orbitalPositions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.orbitalGeometry.setAttribute('position', posAttr);
    this.orbitalGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.orbitalGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.orbitalGeometry.setAttribute('aEnergy', new THREE.BufferAttribute(energies, 1));

    if (!this.orbitalMaterial) {
      this.orbitalMaterial = this.shaderManager.createParticleMaterial(
        this.orbitalUniforms
      );
    }

    this.orbitalPoints = new THREE.Points(this.orbitalGeometry, this.orbitalMaterial);
    this.orbitalPoints.frustumCulled = false;
    this.group.add(this.orbitalPoints);

    // 2. Ambient Deep-Space Particles
    this.ambientBasePositions = new Float32Array(ambientCount * 3);
    this.ambientPositions = new Float32Array(ambientCount * 3);
    this.ambientPhases = new Float32Array(ambientCount);

    const ambSizes = new Float32Array(ambientCount);
    const ambEnergies = new Float32Array(ambientCount);

    for (let i = 0; i < ambientCount; i++) {
      const r = 3.4 + Math.random() * 5.8;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      const sinPhi = Math.sin(p);

      const x = r * sinPhi * Math.cos(t);
      const y = r * Math.cos(p) * 0.72;
      const z = r * sinPhi * Math.sin(t) - 1.2;

      this.ambientBasePositions[i * 3] = x;
      this.ambientBasePositions[i * 3 + 1] = y;
      this.ambientBasePositions[i * 3 + 2] = z;

      this.ambientPositions[i * 3] = x;
      this.ambientPositions[i * 3 + 1] = y;
      this.ambientPositions[i * 3 + 2] = z;

      this.ambientPhases[i] = Math.random() * Math.PI * 2;
      ambSizes[i] = 0.85 + Math.random() * 1.9;
      ambEnergies[i] = Math.random() * 0.7;
    }

    this.ambientGeometry = new THREE.BufferGeometry();
    const ambPosAttr = new THREE.BufferAttribute(this.ambientPositions, 3);
    ambPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.ambientGeometry.setAttribute('position', ambPosAttr);
    this.ambientGeometry.setAttribute('aSize', new THREE.BufferAttribute(ambSizes, 1));
    this.ambientGeometry.setAttribute(
      'aPhase',
      new THREE.BufferAttribute(this.ambientPhases, 1)
    );
    this.ambientGeometry.setAttribute(
      'aEnergy',
      new THREE.BufferAttribute(ambEnergies, 1)
    );

    if (!this.ambientMaterial) {
      this.ambientMaterial = this.shaderManager.createParticleMaterial(
        this.ambientUniforms
      );
    }

    this.ambientPoints = new THREE.Points(this.ambientGeometry, this.ambientMaterial);
    this.ambientPoints.frustumCulled = false;
    this.group.add(this.ambientPoints);

    // 3. Synaptic Neural Network Connections
    if (profile.enableSynapticWeb) {
      const vertexCount = this.maxSynapticLinks * 2;
      this.synapticPositions = new Float32Array(vertexCount * 3);
      this.synapticColors = new Float32Array(vertexCount * 3);

      this.synapticGeometry = new THREE.BufferGeometry();
      const synPosAttr = new THREE.BufferAttribute(this.synapticPositions, 3);
      const synColAttr = new THREE.BufferAttribute(this.synapticColors, 3);
      synPosAttr.setUsage(THREE.DynamicDrawUsage);
      synColAttr.setUsage(THREE.DynamicDrawUsage);

      this.synapticGeometry.setAttribute('position', synPosAttr);
      this.synapticGeometry.setAttribute('color', synColAttr);
      this.synapticGeometry.setDrawRange(0, 0);

      if (!this.synapticMaterial) {
        this.synapticMaterial = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.52,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
      }

      this.synapticLines = new THREE.LineSegments(
        this.synapticGeometry,
        this.synapticMaterial
      );
      this.synapticLines.frustumCulled = false;
      this.group.add(this.synapticLines);
    }
  }

  public update(
    dt: number,
    elapsed: number,
    motion: StateMotionProfile,
    colors: LiveColorUniformSet,
    glowIntensity: number,
    brightness: number,
    backgroundIntensity: number,
    pixelRatio: number,
    voiceLevel: number
  ): void {
    const clampedDt = Math.min(dt, 0.05);

    // Sync shader uniforms
    this.orbitalUniforms.uTime.value = elapsed;
    this.orbitalUniforms.uPixelRatio.value = pixelRatio;
    this.orbitalUniforms.uPrimaryColor.value.copy(colors.primary);
    this.orbitalUniforms.uAccentColor.value.copy(colors.accent);
    this.orbitalUniforms.uHighlightColor.value.copy(colors.highlight);
    this.orbitalUniforms.uGlowIntensity.value = glowIntensity;
    this.orbitalUniforms.uBrightness.value = brightness;

    this.ambientUniforms.uTime.value = elapsed;
    this.ambientUniforms.uPixelRatio.value = pixelRatio;
    this.ambientUniforms.uPrimaryColor.value.copy(colors.secondary);
    this.ambientUniforms.uAccentColor.value.copy(colors.primary);
    this.ambientUniforms.uHighlightColor.value.copy(colors.highlight);
    this.ambientUniforms.uGlowIntensity.value = glowIntensity * 0.7;
    this.ambientUniforms.uBrightness.value = brightness * backgroundIntensity;

    // Update orbital particle kinematics
    const count = this.activeParticleCount;
    const orbitSpeed = motion.particleOrbitSpeed;
    const radialPull = motion.particleRadialPull;
    const turbAmp = motion.turbulenceAmplitude;
    const jitter = motion.jitterAmount;

    for (let i = 0; i < count; i++) {
      const w = this.angularSpeed[i];
      const phase = this.phaseOffset[i];

      this.theta[i] += w * orbitSpeed * clampedDt;
      const phiOsc = Math.sin(elapsed * 0.75 + phase) * 0.14 * this.inclination[i];
      const p = THREE.MathUtils.clamp(this.phi[i] + phiOsc, 0.12, Math.PI - 0.12);

      // Attraction / repulsion + harmonic wave breathing
      const waveOffset =
        Math.sin(elapsed * motion.pulseFrequency - this.baseRadius[i] * 2.4 + phase) *
        (0.05 + voiceLevel * 0.14 + turbAmp * 0.22);

      const targetR = Math.max(
        1.14,
        this.baseRadius[i] * (1.0 - radialPull * 0.22) + waveOffset
      );
      this.currentRadius[i] = THREE.MathUtils.lerp(
        this.currentRadius[i],
        targetR,
        1 - Math.exp(-6.0 * clampedDt)
      );

      const r = this.currentRadius[i];
      const t = this.theta[i];
      const sinPhi = Math.sin(p);

      let x = r * sinPhi * Math.cos(t);
      let y = r * Math.cos(p);
      let z = r * sinPhi * Math.sin(t);

      if (jitter > 0.001) {
        x += Math.sin(elapsed * 37.0 + i) * jitter;
        y += Math.cos(elapsed * 41.0 + i * 1.7) * jitter;
        z += Math.sin(elapsed * 31.0 + i * 2.3) * jitter;
      }

      const idx = i * 3;
      this.orbitalPositions[idx] = x;
      this.orbitalPositions[idx + 1] = y;
      this.orbitalPositions[idx + 2] = z;
    }

    if (this.orbitalGeometry) {
      const attr = this.orbitalGeometry.getAttribute('position') as THREE.BufferAttribute;
      attr.needsUpdate = true;
    }

    // Update ambient background floaters
    const ambCount = this.ambientPhases.length;
    for (let i = 0; i < ambCount; i++) {
      const idx = i * 3;
      const ph = this.ambientPhases[i];
      this.ambientPositions[idx] =
        this.ambientBasePositions[idx] + Math.sin(elapsed * 0.22 + ph) * 0.18;
      this.ambientPositions[idx + 1] =
        this.ambientBasePositions[idx + 1] + Math.cos(elapsed * 0.19 + ph * 1.3) * 0.16;
      this.ambientPositions[idx + 2] =
        this.ambientBasePositions[idx + 2] + Math.sin(elapsed * 0.15 + ph * 0.7) * 0.14;
    }

    if (this.ambientGeometry) {
      const ambAttr = this.ambientGeometry.getAttribute(
        'position'
      ) as THREE.BufferAttribute;
      ambAttr.needsUpdate = true;
    }

    // Update glowing synaptic particle connections
    if (this.synapticGeometry && this.synapticMaterial) {
      const sampleN = Math.min(this.synapticSampleLimit, count);
      const threshold = 0.56 + Math.min(motion.synapticDensityBoost, 1.8) * 0.18;
      const thresholdSq = threshold * threshold;
      let linkCount = 0;

      const pr = colors.primary.r;
      const pg = colors.primary.g;
      const pb = colors.primary.b;
      const ar = colors.accent.r;
      const ag = colors.accent.g;
      const ab = colors.accent.b;

      for (let i = 0; i < sampleN && linkCount < this.maxSynapticLinks; i++) {
        const i3 = i * 3;
        const ax = this.orbitalPositions[i3];
        const ay = this.orbitalPositions[i3 + 1];
        const az = this.orbitalPositions[i3 + 2];

        for (let j = i + 1; j < sampleN && linkCount < this.maxSynapticLinks; j++) {
          const j3 = j * 3;
          const dx = ax - this.orbitalPositions[j3];
          const dy = ay - this.orbitalPositions[j3 + 1];
          const dz = az - this.orbitalPositions[j3 + 2];
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq < thresholdSq) {
            const strength = 1.0 - distSq / thresholdSq;
            const outIdx = linkCount * 6;

            this.synapticPositions[outIdx] = ax;
            this.synapticPositions[outIdx + 1] = ay;
            this.synapticPositions[outIdx + 2] = az;
            this.synapticPositions[outIdx + 3] = this.orbitalPositions[j3];
            this.synapticPositions[outIdx + 4] = this.orbitalPositions[j3 + 1];
            this.synapticPositions[outIdx + 5] = this.orbitalPositions[j3 + 2];

            const r = THREE.MathUtils.lerp(pr, ar, strength) * strength;
            const g = THREE.MathUtils.lerp(pg, ag, strength) * strength;
            const b = THREE.MathUtils.lerp(pb, ab, strength) * strength;

            this.synapticColors[outIdx] = r;
            this.synapticColors[outIdx + 1] = g;
            this.synapticColors[outIdx + 2] = b;
            this.synapticColors[outIdx + 3] = r;
            this.synapticColors[outIdx + 4] = g;
            this.synapticColors[outIdx + 5] = b;

            linkCount++;
          }
        }
      }

      this.activeSynapticLinkCount = linkCount;
      this.synapticGeometry.setDrawRange(0, linkCount * 2);
      this.synapticMaterial.opacity = THREE.MathUtils.clamp(
        0.28 + motion.synapticDensityBoost * 0.25 * glowIntensity,
        0.15,
        0.85
      );

      (
        this.synapticGeometry.getAttribute('position') as THREE.BufferAttribute
      ).needsUpdate = true;
      (
        this.synapticGeometry.getAttribute('color') as THREE.BufferAttribute
      ).needsUpdate = true;
    }
  }

  public getStats(): { particleCount: number; synapticLinkCount: number } {
    return {
      particleCount: this.activeParticleCount,
      synapticLinkCount: this.activeSynapticLinkCount,
    };
  }

  private disposeBuffersOnly(): void {
    if (this.orbitalPoints) {
      this.group.remove(this.orbitalPoints);
      this.orbitalPoints = null;
    }
    if (this.orbitalGeometry) {
      this.orbitalGeometry.dispose();
      this.orbitalGeometry = null;
    }
    if (this.ambientPoints) {
      this.group.remove(this.ambientPoints);
      this.ambientPoints = null;
    }
    if (this.ambientGeometry) {
      this.ambientGeometry.dispose();
      this.ambientGeometry = null;
    }
    if (this.synapticLines) {
      this.group.remove(this.synapticLines);
      this.synapticLines = null;
    }
    if (this.synapticGeometry) {
      this.synapticGeometry.dispose();
      this.synapticGeometry = null;
    }
    this.activeSynapticLinkCount = 0;
  }

  public dispose(): void {
    this.disposeBuffersOnly();
    this.orbitalMaterial?.dispose();
    this.orbitalMaterial = null;
    this.ambientMaterial?.dispose();
    this.ambientMaterial = null;
    this.synapticMaterial?.dispose();
    this.synapticMaterial = null;
  }
}
