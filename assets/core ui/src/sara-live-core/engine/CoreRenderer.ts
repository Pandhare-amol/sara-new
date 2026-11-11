import * as THREE from 'three';
import {
  LiveCoreSettings,
  PerformanceQuality,
  SaraCoreState,
  WebGLContextHealth,
  WebGLRenderStats,
} from '../types';
import { QUALITY_PROFILES } from '../settings/LiveCoreSettings';
import { StateMotionProfile } from '../states/CoreStateManager';
import { ColorEngine } from '../themes/colorEngine';
import { ParticleSystem } from './ParticleSystem';
import { CoreShaderUniforms, ShaderManager } from './ShaderManager';

interface HolographicRingEntry {
  pivot: THREE.Group;
  mesh: THREE.Object3D;
  material: THREE.MeshBasicMaterial;
  speedX: number;
  speedY: number;
  speedZ: number;
  baseOpacity: number;
  useAccentColor: boolean;
}

interface EnergyWaveInstance {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  age: number;
  duration: number;
  maxScale: number;
  isShockwave: boolean;
}

export class CoreRenderer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private readonly shaderManager = new ShaderManager();
  private readonly colorEngine: ColorEngine;
  private particleSystem: ParticleSystem;

  private readonly coreRootGroup = new THREE.Group();
  private readonly ringsGroup = new THREE.Group();
  private readonly wavesGroup = new THREE.Group();

  private singularityMesh: THREE.Mesh | null = null;
  private singularityMaterial: THREE.MeshBasicMaterial | null = null;
  private plasmaMesh: THREE.Mesh | null = null;
  private plasmaMaterial: THREE.ShaderMaterial | null = null;
  private innerWireMesh: THREE.LineSegments | null = null;
  private innerWireMaterial: THREE.LineBasicMaterial | null = null;
  private outerLatticeMesh: THREE.LineSegments | null = null;
  private outerLatticeMaterial: THREE.LineBasicMaterial | null = null;
  private magneticShellMesh: THREE.Mesh | null = null;
  private magneticShellMaterial: THREE.ShaderMaterial | null = null;
  private coronaMesh: THREE.Mesh | null = null;
  private coronaMaterial: THREE.ShaderMaterial | null = null;

  private ringEntries: HolographicRingEntry[] = [];
  private wavePool: EnergyWaveInstance[] = [];
  private waveSpawnAccumulator = 0;

  private corePointLight: THREE.PointLight;
  private rimLightA: THREE.DirectionalLight;
  private rimLightB: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;

  private readonly coreUniforms: CoreShaderUniforms;

  private currentQuality: PerformanceQuality;
  private currentDensity: number;
  private health: WebGLContextHealth = 'initializing';
  private rendererName = 'Initializing WebGL...';

  private pointerTargetX = 0;
  private pointerTargetY = 0;
  private pointerCurrentX = 0;
  private pointerCurrentY = 0;

  private onHealthChange?: (health: WebGLContextHealth) => void;
  private resizeObserver: ResizeObserver | null = null;

  private readonly handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.health = 'context-lost';
    this.onHealthChange?.(this.health);
  };

  private readonly handleContextRestored = (): void => {
    this.health = 'recovering';
    this.onHealthChange?.(this.health);
    this.rebuildSceneGeometry(this.currentQuality, this.currentDensity);
    this.health = 'active';
    this.onHealthChange?.(this.health);
  };

  private readonly handlePointerMove = (e: PointerEvent): void => {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.pointerTargetX = (e.clientX / w - 0.5) * 2.0;
    this.pointerTargetY = (e.clientY / h - 0.5) * 2.0;
  };

  constructor(
    container: HTMLElement,
    colorEngine: ColorEngine,
    initialSettings: LiveCoreSettings,
    onHealthChange?: (health: WebGLContextHealth) => void
  ) {
    this.container = container;
    this.colorEngine = colorEngine;
    this.onHealthChange = onHealthChange;
    this.currentQuality = initialSettings.quality;
    this.currentDensity = initialSettings.particleDensity;

    this.scene = new THREE.Scene();
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    this.camera.position.set(0, 0, this.computeCameraDistance(width, height));

    const c = this.colorEngine.current;
    this.coreUniforms = {
      uTime: { value: 0 },
      uPrimaryColor: { value: c.primary.clone() },
      uSecondaryColor: { value: c.secondary.clone() },
      uAccentColor: { value: c.accent.clone() },
      uHighlightColor: { value: c.highlight.clone() },
      uGlowColor: { value: c.glow.clone() },
      uTurbulenceAmp: { value: 0.08 },
      uTurbulenceFreq: { value: 1.5 },
      uPulseScale: { value: 1.0 },
      uGlowIntensity: { value: initialSettings.glowIntensity },
      uBrightness: { value: initialSettings.brightness },
      uLuminanceBoost: { value: 1.0 },
      uScanPhase: { value: 0 },
      uScanStrength: { value: 0 },
      uVoiceLevel: { value: 0 },
    };

    // Dynamic Core Lighting
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.corePointLight = new THREE.PointLight(c.primary.getHex(), 3.2, 16, 1.5);
    this.corePointLight.position.set(0, 0, 0);

    this.rimLightA = new THREE.DirectionalLight(c.accent.getHex(), 1.6);
    this.rimLightA.position.set(4.5, 3.5, 4.0);

    this.rimLightB = new THREE.DirectionalLight(c.secondary.getHex(), 1.1);
    this.rimLightB.position.set(-4.5, -3.0, 2.5);

    this.scene.add(
      this.ambientLight,
      this.corePointLight,
      this.rimLightA,
      this.rimLightB
    );

    this.scene.add(this.coreRootGroup);
    this.coreRootGroup.add(this.ringsGroup);
    this.coreRootGroup.add(this.wavesGroup);

    this.particleSystem = new ParticleSystem(this.shaderManager, c);
    this.coreRootGroup.add(this.particleSystem.group);

    this.initWebGLRenderer(initialSettings);
  }

  private computeCameraDistance(width: number, height: number): number {
    const aspect = width / Math.max(height, 1);
    // Pull back gracefully on narrow/portrait monitors so rings never clip
    if (aspect < 1.0) {
      return 6.8 + (1.0 - aspect) * 2.4;
    }
    return 6.4;
  }

  private initWebGLRenderer(settings: LiveCoreSettings): void {
    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: settings.quality !== 'low',
        alpha: true,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      });

      const profile = QUALITY_PROFILES[settings.quality];
      const dpr = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
      renderer.setPixelRatio(dpr);
      renderer.setSize(
        Math.max(this.container.clientWidth, 1),
        Math.max(this.container.clientHeight, 1)
      );
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setClearColor(0x000000, 0);

      const canvas = renderer.domElement;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
      canvas.addEventListener(
        'webglcontextrestored',
        this.handleContextRestored,
        false
      );

      this.container.innerHTML = '';
      this.container.appendChild(canvas);
      this.renderer = renderer;

      // Read GPU renderer string safely
      try {
        const gl = renderer.getContext();
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const rawRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          this.rendererName = String(rawRenderer || 'Hardware WebGL');
        } else {
          this.rendererName = String(gl.getParameter(gl.RENDERER) || 'WebGL 2.0');
        }
      } catch {
        this.rendererName = 'Hardware WebGL';
      }

      this.buildCoreMeshes(settings.quality);
      this.buildHolographicRings();
      this.buildEnergyWavePool();
      this.particleSystem.rebuild(profile, settings.particleDensity);

      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
      window.addEventListener('pointermove', this.handlePointerMove, {
        passive: true,
      });

      this.health = 'active';
      this.onHealthChange?.(this.health);
    } catch {
      this.health = 'unsupported';
      this.rendererName = 'WebGL Unavailable';
      this.onHealthChange?.(this.health);
    }
  }

  private buildCoreMeshes(quality: PerformanceQuality): void {
    this.disposeCoreMeshesOnly();
    const profile = QUALITY_PROFILES[quality];
    const seg = profile.sphereSegments;
    const icoDetail = quality === 'ultra' ? 6 : quality === 'high' ? 5 : 4;

    // 1. Bright Central Singularity Heart
    const singGeo = new THREE.IcosahedronGeometry(0.42, 3);
    this.singularityMaterial = new THREE.MeshBasicMaterial({
      color: this.colorEngine.current.highlight.clone(),
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.singularityMesh = new THREE.Mesh(singGeo, this.singularityMaterial);
    this.coreRootGroup.add(this.singularityMesh);

    // 2. Turbulent Ultron Plasma Sphere
    const plasmaGeo = new THREE.IcosahedronGeometry(0.95, icoDetail);
    this.plasmaMaterial = this.shaderManager.createPlasmaCoreMaterial(
      this.coreUniforms
    );
    this.plasmaMesh = new THREE.Mesh(plasmaGeo, this.plasmaMaterial);
    this.coreRootGroup.add(this.plasmaMesh);

    // 3. Inner Counter-Rotating Geodesic Neural Cage
    const innerBaseGeo = new THREE.IcosahedronGeometry(1.04, 2);
    const innerWireGeo = new THREE.WireframeGeometry(innerBaseGeo);
    innerBaseGeo.dispose();
    this.innerWireMaterial = new THREE.LineBasicMaterial({
      color: this.colorEngine.current.accent.clone(),
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.innerWireMesh = new THREE.LineSegments(
      innerWireGeo,
      this.innerWireMaterial
    );
    this.coreRootGroup.add(this.innerWireMesh);

    // 4. Outer Geodesic Polyhedral Matrix
    const outerBaseGeo = new THREE.IcosahedronGeometry(1.14, 1);
    const outerWireGeo = new THREE.WireframeGeometry(outerBaseGeo);
    outerBaseGeo.dispose();
    this.outerLatticeMaterial = new THREE.LineBasicMaterial({
      color: this.colorEngine.current.ring.clone(),
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.outerLatticeMesh = new THREE.LineSegments(
      outerWireGeo,
      this.outerLatticeMaterial
    );
    this.coreRootGroup.add(this.outerLatticeMesh);

    // 5. Outer Magnetic Field Containment Shell
    const magGeo = new THREE.SphereGeometry(1.23, seg, seg);
    this.magneticShellMaterial = this.shaderManager.createMagneticShellMaterial(
      this.coreUniforms
    );
    this.magneticShellMesh = new THREE.Mesh(magGeo, this.magneticShellMaterial);
    this.coreRootGroup.add(this.magneticShellMesh);

    // 6. Volumetric Corona Halo
    if (profile.enableBloomLayers) {
      const coronaGeo = new THREE.SphereGeometry(1.92, 36, 36);
      this.coronaMaterial = this.shaderManager.createVolumetricCoronaMaterial(
        this.coreUniforms
      );
      this.coronaMesh = new THREE.Mesh(coronaGeo, this.coronaMaterial);
      this.coreRootGroup.add(this.coronaMesh);
    }
  }

  private buildHolographicRings(): void {
    this.disposeRingsOnly();

    const ringSpecs = [
      // Inner rapid accelerator ring
      {
        radius: 1.42,
        tube: 0.0085,
        tiltX: 0.35,
        tiltY: 0.1,
        tiltZ: -0.22,
        speedX: 0.25,
        speedY: 0.85,
        speedZ: 0.18,
        opacity: 0.72,
        accent: true,
        segmented: true,
        segments: 6,
      },
      // Primary equatorial holographic ring
      {
        radius: 1.66,
        tube: 0.011,
        tiltX: Math.PI * 0.46,
        tiltY: 0.08,
        tiltZ: 0.0,
        speedX: 0.06,
        speedY: 0.12,
        speedZ: 0.55,
        opacity: 0.82,
        accent: false,
        segmented: false,
        segments: 1,
      },
      // Gyroscopic stabilizer ring A
      {
        radius: 1.88,
        tube: 0.009,
        tiltX: -0.62,
        tiltY: 0.44,
        tiltZ: 0.31,
        speedX: -0.42,
        speedY: 0.31,
        speedZ: -0.24,
        opacity: 0.66,
        accent: true,
        segmented: true,
        segments: 4,
      },
      // Gyroscopic stabilizer ring B
      {
        radius: 2.08,
        tube: 0.008,
        tiltX: 0.78,
        tiltY: -0.52,
        tiltZ: -0.4,
        speedX: 0.32,
        speedY: -0.48,
        speedZ: 0.28,
        opacity: 0.58,
        accent: false,
        segmented: true,
        segments: 8,
      },
      // Polar scanner ring
      {
        radius: 2.26,
        tube: 0.007,
        tiltX: 1.24,
        tiltY: 0.22,
        tiltZ: 0.65,
        speedX: 0.18,
        speedY: 0.38,
        speedZ: -0.32,
        opacity: 0.48,
        accent: true,
        segmented: true,
        segments: 3,
      },
      // Outer magnetic containment halo ring
      {
        radius: 2.48,
        tube: 0.006,
        tiltX: Math.PI * 0.5 - 0.14,
        tiltY: -0.12,
        tiltZ: 0.05,
        speedX: -0.05,
        speedY: 0.08,
        speedZ: -0.22,
        opacity: 0.42,
        accent: false,
        segmented: false,
        segments: 1,
      },
    ];

    for (const spec of ringSpecs) {
      const pivot = new THREE.Group();
      pivot.rotation.set(spec.tiltX, spec.tiltY, spec.tiltZ);

      const mat = new THREE.MeshBasicMaterial({
        color: spec.accent
          ? this.colorEngine.current.accent.clone()
          : this.colorEngine.current.ring.clone(),
        transparent: true,
        opacity: spec.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      let ringObj: THREE.Object3D;

      if (!spec.segmented) {
        const geo = new THREE.TorusGeometry(spec.radius, spec.tube, 12, 128);
        ringObj = new THREE.Mesh(geo, mat);
      } else {
        const segGroup = new THREE.Group();
        const arcSpan = (Math.PI * 2) / spec.segments;
        const arcLength = arcSpan * 0.68;
        for (let s = 0; s < spec.segments; s++) {
          const arcGeo = new THREE.TorusGeometry(
            spec.radius,
            spec.tube,
            10,
            28,
            arcLength
          );
          const arcMesh = new THREE.Mesh(arcGeo, mat);
          arcMesh.rotation.z = s * arcSpan;
          segGroup.add(arcMesh);
        }
        ringObj = segGroup;
      }

      pivot.add(ringObj);
      this.ringsGroup.add(pivot);

      this.ringEntries.push({
        pivot,
        mesh: ringObj,
        material: mat,
        speedX: spec.speedX,
        speedY: spec.speedY,
        speedZ: spec.speedZ,
        baseOpacity: spec.opacity,
        useAccentColor: spec.accent,
      });
    }
  }

  private buildEnergyWavePool(): void {
    this.disposeWavesOnly();
    const poolSize = 8;

    for (let i = 0; i < poolSize; i++) {
      const geo = new THREE.RingGeometry(0.96, 1.0, 72);
      const mat = new THREE.MeshBasicMaterial({
        color: this.colorEngine.current.accent.clone(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.wavesGroup.add(mesh);

      this.wavePool.push({
        mesh,
        material: mat,
        active: false,
        age: 0,
        duration: 1.8,
        maxScale: 3.1,
        isShockwave: false,
      });
    }
  }

  public spawnEnergyWave(isShockwave = false): void {
    const slot = this.wavePool.find((w) => !w.active);
    if (!slot) return;

    slot.active = true;
    slot.age = 0;
    slot.isShockwave = isShockwave;
    slot.duration = isShockwave ? 1.55 : 2.15;
    slot.maxScale = isShockwave ? 3.85 : 2.85;

    slot.mesh.visible = true;
    slot.mesh.scale.setScalar(1.08);
    if (isShockwave) {
      slot.mesh.rotation.set(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        0
      );
    } else {
      slot.mesh.rotation.set(
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
        Math.random() * Math.PI
      );
    }
  }

  public syncSettings(settings: LiveCoreSettings): void {
    if (!this.renderer) return;

    const qualityChanged = settings.quality !== this.currentQuality;
    const densityChanged =
      Math.abs(settings.particleDensity - this.currentDensity) > 0.01;

    if (qualityChanged) {
      this.currentQuality = settings.quality;
      this.currentDensity = settings.particleDensity;
      const profile = QUALITY_PROFILES[settings.quality];
      const dpr = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
      this.renderer.setPixelRatio(dpr);
      this.rebuildSceneGeometry(settings.quality, settings.particleDensity);
    } else if (densityChanged) {
      this.currentDensity = settings.particleDensity;
      const profile = QUALITY_PROFILES[settings.quality];
      this.particleSystem.rebuild(profile, settings.particleDensity);
    }
  }

  private rebuildSceneGeometry(
    quality: PerformanceQuality,
    density: number
  ): void {
    this.buildCoreMeshes(quality);
    this.particleSystem.rebuild(QUALITY_PROFILES[quality], density);
  }

  public handleResize(): void {
    if (!this.renderer) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);

    this.camera.aspect = width / height;
    this.camera.position.z = this.computeCameraDistance(width, height);
    this.camera.updateProjectionMatrix();

    const profile = QUALITY_PROFILES[this.currentQuality];
    const dpr = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height);
  }

  public renderFrame(
    dt: number,
    elapsed: number,
    settings: LiveCoreSettings,
    motion: StateMotionProfile,
    activeState: SaraCoreState,
    voiceLevel: number,
    completionPulse: number
  ): void {
    if (!this.renderer || this.health !== 'active') return;

    const colors = this.colorEngine.current;
    const clampedDt = Math.min(dt, 0.05);

    // Trigger shockwave if completed state just fired
    if (completionPulse > 0.85) {
      this.spawnEnergyWave(true);
    }

    // Core breathing & voice pulse scale
    const breath =
      1.0 +
      Math.sin(elapsed * motion.pulseFrequency) * motion.pulseAmplitude +
      voiceLevel * 0.09 +
      completionPulse * 0.16;

    const targetCoreScale = settings.coreSize;
    const currentScale = this.coreRootGroup.scale.x;
    const smoothCoreScale = THREE.MathUtils.lerp(
      currentScale,
      targetCoreScale,
      1 - Math.exp(-7.0 * clampedDt)
    );
    this.coreRootGroup.scale.setScalar(smoothCoreScale);

    // Update shader uniforms
    this.coreUniforms.uTime.value = elapsed;
    this.coreUniforms.uPrimaryColor.value.copy(colors.primary);
    this.coreUniforms.uSecondaryColor.value.copy(colors.secondary);
    this.coreUniforms.uAccentColor.value.copy(colors.accent);
    this.coreUniforms.uHighlightColor.value.copy(colors.highlight);
    this.coreUniforms.uGlowColor.value.copy(colors.glow);
    this.coreUniforms.uTurbulenceAmp.value = motion.turbulenceAmplitude;
    this.coreUniforms.uTurbulenceFreq.value = motion.turbulenceFrequency;
    this.coreUniforms.uPulseScale.value = breath;
    this.coreUniforms.uGlowIntensity.value = settings.glowIntensity;
    this.coreUniforms.uBrightness.value = settings.brightness;
    this.coreUniforms.uLuminanceBoost.value = motion.coreLuminanceBoost;
    this.coreUniforms.uVoiceLevel.value = voiceLevel;

    // Scanning wave strength for researching / listening
    const targetScanStrength =
      activeState === 'researching'
        ? 0.95
        : activeState === 'listening'
        ? 0.45
        : 0.0;
    this.coreUniforms.uScanStrength.value = THREE.MathUtils.lerp(
      this.coreUniforms.uScanStrength.value,
      targetScanStrength,
      1 - Math.exp(-5.0 * clampedDt)
    );
    this.coreUniforms.uScanPhase.value += motion.scanSweepSpeed * clampedDt;

    // Rotate core & geodesic cages
    const rotSpeed = motion.coreRotationSpeed * clampedDt;
    if (this.plasmaMesh) {
      this.plasmaMesh.rotation.y += rotSpeed;
      this.plasmaMesh.rotation.x += rotSpeed * 0.35;
    }
    if (this.singularityMesh && this.singularityMaterial) {
      this.singularityMesh.rotation.y -= rotSpeed * 1.4;
      const singScale = 0.85 + breath * 0.25 + voiceLevel * 0.35;
      this.singularityMesh.scale.setScalar(singScale);
      this.singularityMaterial.color.copy(colors.highlight);
      this.singularityMaterial.opacity = THREE.MathUtils.clamp(
        0.72 + voiceLevel * 0.28 + Math.sin(elapsed * 4.0) * 0.1,
        0.5,
        1.0
      );
    }
    if (this.innerWireMesh && this.innerWireMaterial) {
      this.innerWireMesh.rotation.y -= rotSpeed * 1.25;
      this.innerWireMesh.rotation.z += rotSpeed * 0.65;
      this.innerWireMesh.scale.setScalar(breath * 1.01);
      this.innerWireMaterial.color.copy(colors.accent);
      this.innerWireMaterial.opacity = THREE.MathUtils.clamp(
        0.24 + motion.synapticDensityBoost * 0.16 * settings.glowIntensity,
        0.14,
        0.65
      );
    }
    if (this.outerLatticeMesh && this.outerLatticeMaterial) {
      this.outerLatticeMesh.rotation.y += rotSpeed * 0.72;
      this.outerLatticeMesh.rotation.x -= rotSpeed * 0.48;
      this.outerLatticeMesh.scale.setScalar(breath * 1.02);
      this.outerLatticeMaterial.color.copy(colors.ring);
      this.outerLatticeMaterial.opacity = THREE.MathUtils.clamp(
        0.16 + settings.glowIntensity * 0.12,
        0.08,
        0.48
      );
    }

    // Rotate holographic rings at distinct speeds
    const rSpeed = settings.ringSpeed * motion.ringSpeedMultiplier * clampedDt;
    for (let i = 0; i < this.ringEntries.length; i++) {
      const entry = this.ringEntries[i];
      entry.pivot.rotation.x += entry.speedX * rSpeed;
      entry.pivot.rotation.y += entry.speedY * rSpeed;
      entry.pivot.rotation.z += entry.speedZ * rSpeed;

      if (motion.jitterAmount > 0.002) {
        entry.mesh.position.set(
          Math.sin(elapsed * 45 + i) * motion.jitterAmount,
          Math.cos(elapsed * 39 + i) * motion.jitterAmount,
          0
        );
      } else {
        entry.mesh.position.set(0, 0, 0);
      }

      entry.material.color.copy(
        entry.useAccentColor ? colors.accent : colors.ring
      );
      entry.material.opacity = THREE.MathUtils.clamp(
        entry.baseOpacity * settings.glowIntensity * settings.brightness,
        0.12,
        0.95
      );
    }

    // Spawn & update expanding energy waves
    this.waveSpawnAccumulator += motion.waveEmissionRate * clampedDt;
    if (this.waveSpawnAccumulator >= 1.0) {
      this.waveSpawnAccumulator -= 1.0;
      this.spawnEnergyWave(false);
    }

    for (const wave of this.wavePool) {
      if (!wave.active) continue;
      wave.age += clampedDt * motion.waveExpansionSpeed;
      const progress = wave.age / wave.duration;
      if (progress >= 1.0) {
        wave.active = false;
        wave.mesh.visible = false;
        continue;
      }

      const eased = 1 - Math.pow(1 - progress, 2.4);
      const s = THREE.MathUtils.lerp(1.06, wave.maxScale, eased);
      wave.mesh.scale.setScalar(s);

      // Billboard slightly toward camera while preserving 3D tilt
      wave.mesh.lookAt(this.camera.position);

      const fade = Math.pow(1.0 - progress, 1.8);
      wave.material.color.copy(
        wave.isShockwave ? colors.highlight : colors.accent
      );
      wave.material.opacity = THREE.MathUtils.clamp(
        fade * (wave.isShockwave ? 0.72 : 0.42) * settings.glowIntensity,
        0,
        0.85
      );
    }

    // Update Particle System
    this.particleSystem.update(
      clampedDt,
      elapsed,
      motion,
      colors,
      settings.glowIntensity,
      settings.brightness,
      settings.backgroundIntensity,
      this.renderer.getPixelRatio(),
      voiceLevel
    );

    // Update Dynamic Lighting
    this.corePointLight.color.copy(colors.primary);
    this.corePointLight.intensity =
      (2.4 + Math.sin(elapsed * 3.1) * 0.45 + voiceLevel * 2.2) *
      settings.glowIntensity *
      settings.brightness;
    this.rimLightA.color.copy(colors.accent);
    this.rimLightA.intensity = 1.4 * settings.brightness;
    this.rimLightB.color.copy(colors.secondary);
    this.rimLightB.intensity = 1.0 * settings.brightness;

    // Smooth camera drift + gentle pointer parallax
    const camLerp = 1 - Math.exp(-3.5 * clampedDt);
    this.pointerCurrentX = THREE.MathUtils.lerp(
      this.pointerCurrentX,
      this.pointerTargetX,
      camLerp
    );
    this.pointerCurrentY = THREE.MathUtils.lerp(
      this.pointerCurrentY,
      this.pointerTargetY,
      camLerp
    );

    const driftX = Math.sin(elapsed * 0.24) * 0.22 + this.pointerCurrentX * 0.32;
    const driftY = Math.cos(elapsed * 0.19) * 0.15 - this.pointerCurrentY * 0.22;
    this.camera.position.x = driftX;
    this.camera.position.y = driftY;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  public getRenderStats(
    fps: number,
    reducedMotionActive: boolean,
    isDocumentHidden: boolean
  ): WebGLRenderStats {
    const pStats = this.particleSystem.getStats();
    return {
      health: this.health,
      fps: Math.round(fps),
      particleCount: pStats.particleCount,
      synapticLinkCount: pStats.synapticLinkCount,
      drawCalls: this.renderer ? this.renderer.info.render.calls : 0,
      rendererName: this.rendererName,
      reducedMotionActive,
      isDocumentHidden,
    };
  }

  private disposeCoreMeshesOnly(): void {
    const meshes = [
      this.singularityMesh,
      this.plasmaMesh,
      this.innerWireMesh,
      this.outerLatticeMesh,
      this.magneticShellMesh,
      this.coronaMesh,
    ];
    for (const m of meshes) {
      if (m) {
        this.coreRootGroup.remove(m);
        m.geometry.dispose();
      }
    }
    this.singularityMaterial?.dispose();
    this.plasmaMaterial?.dispose();
    this.innerWireMaterial?.dispose();
    this.outerLatticeMaterial?.dispose();
    this.magneticShellMaterial?.dispose();
    this.coronaMaterial?.dispose();

    this.singularityMesh = null;
    this.singularityMaterial = null;
    this.plasmaMesh = null;
    this.plasmaMaterial = null;
    this.innerWireMesh = null;
    this.innerWireMaterial = null;
    this.outerLatticeMesh = null;
    this.outerLatticeMaterial = null;
    this.magneticShellMesh = null;
    this.magneticShellMaterial = null;
    this.coronaMesh = null;
    this.coronaMaterial = null;
  }

  private disposeRingsOnly(): void {
    for (const entry of this.ringEntries) {
      this.ringsGroup.remove(entry.pivot);
      entry.pivot.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
        }
      });
      entry.material.dispose();
    }
    this.ringEntries = [];
  }

  private disposeWavesOnly(): void {
    for (const wave of this.wavePool) {
      this.wavesGroup.remove(wave.mesh);
      wave.mesh.geometry.dispose();
      wave.material.dispose();
    }
    this.wavePool = [];
  }

  public dispose(): void {
    window.removeEventListener('pointermove', this.handlePointerMove);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.disposeCoreMeshesOnly();
    this.disposeRingsOnly();
    this.disposeWavesOnly();
    this.particleSystem.dispose();

    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      canvas.removeEventListener(
        'webglcontextrestored',
        this.handleContextRestored
      );
      this.renderer.dispose();
      if (canvas.parentElement === this.container) {
        this.container.removeChild(canvas);
      }
      this.renderer = null;
    }

    this.health = 'disabled';
  }
}
