import * as THREE from 'three';

const SIMPLEX_NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

export interface CoreShaderUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uPrimaryColor: THREE.IUniform<THREE.Color>;
  uSecondaryColor: THREE.IUniform<THREE.Color>;
  uAccentColor: THREE.IUniform<THREE.Color>;
  uHighlightColor: THREE.IUniform<THREE.Color>;
  uGlowColor: THREE.IUniform<THREE.Color>;
  uTurbulenceAmp: THREE.IUniform<number>;
  uTurbulenceFreq: THREE.IUniform<number>;
  uPulseScale: THREE.IUniform<number>;
  uGlowIntensity: THREE.IUniform<number>;
  uBrightness: THREE.IUniform<number>;
  uLuminanceBoost: THREE.IUniform<number>;
  uScanPhase: THREE.IUniform<number>;
  uScanStrength: THREE.IUniform<number>;
  uVoiceLevel: THREE.IUniform<number>;
}

export interface ParticleShaderUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uPixelRatio: THREE.IUniform<number>;
  uSizeScale: THREE.IUniform<number>;
  uPrimaryColor: THREE.IUniform<THREE.Color>;
  uAccentColor: THREE.IUniform<THREE.Color>;
  uHighlightColor: THREE.IUniform<THREE.Color>;
  uGlowIntensity: THREE.IUniform<number>;
  uBrightness: THREE.IUniform<number>;
}

export class ShaderManager {
  public createPlasmaCoreMaterial(
    uniforms: CoreShaderUniforms
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uTurbulenceAmp;
        uniform float uTurbulenceFreq;
        uniform float uPulseScale;
        uniform float uVoiceLevel;

        varying vec3 vNormalWorld;
        varying vec3 vViewDir;
        varying vec3 vLocalPos;
        varying float vDisplacement;

        ${SIMPLEX_NOISE_GLSL}

        void main() {
          vec3 pos = position;
          vec3 dir = normalize(pos);

          float t = uTime * 0.55;
          float n1 = snoise(dir * uTurbulenceFreq + vec3(t, -t * 0.7, t * 0.4));
          float n2 = snoise(dir * (uTurbulenceFreq * 2.15) - vec3(t * 1.2, t * 0.5, -t));
          float harmonic = sin(dir.y * 8.0 + uTime * 3.2) * cos(dir.x * 6.0 - uTime * 2.4) * 0.15;

          float disp = (n1 * 0.65 + n2 * 0.35 + harmonic * (0.4 + uVoiceLevel)) * uTurbulenceAmp;
          vDisplacement = disp;

          vec3 displaced = pos * uPulseScale + dir * disp;
          vLocalPos = displaced;

          vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uPrimaryColor;
        uniform vec3 uSecondaryColor;
        uniform vec3 uAccentColor;
        uniform vec3 uHighlightColor;
        uniform float uGlowIntensity;
        uniform float uBrightness;
        uniform float uLuminanceBoost;
        uniform float uScanPhase;
        uniform float uScanStrength;
        uniform float uVoiceLevel;

        varying vec3 vNormalWorld;
        varying vec3 vViewDir;
        varying vec3 vLocalPos;
        varying float vDisplacement;

        ${SIMPLEX_NOISE_GLSL}

        void main() {
          vec3 N = normalize(vNormalWorld);
          vec3 V = normalize(vViewDir);
          float NdotV = max(dot(N, V), 0.0);

          // Multi-scale neural plasma filaments (Ultron-inspired sentient energy veins)
          vec3 p = normalize(vLocalPos);
          float t = uTime * 0.42;
          float vein1 = 1.0 - abs(snoise(p * 3.4 + vec3(t, -t * 0.6, t * 0.8)));
          float vein2 = 1.0 - abs(snoise(p * 6.8 - vec3(t * 1.1, t * 0.9, -t * 0.5)));
          float filament = pow(clamp(vein1, 0.0, 1.0), 4.2) * 0.85
                         + pow(clamp(vein2, 0.0, 1.0), 5.5) * 0.65;

          // Equatorial & meridional energy currents
          float latWave = pow(0.5 + 0.5 * sin(p.y * 14.0 - uTime * 2.8 + vDisplacement * 10.0), 6.0);
          float lonWave = pow(0.5 + 0.5 * cos(atan(p.z, p.x) * 8.0 + uTime * 1.9), 8.0);

          // Researching / listening sweeping scanner wave
          float scanBand = exp(-pow((p.y - sin(uScanPhase)) * 6.5, 2.0)) * uScanStrength;

          // Fresnel atmospheric rim
          float fresnel = pow(1.0 - NdotV, 2.35);
          float coreCenter = pow(NdotV, 1.6);

          vec3 basePlasma = mix(uSecondaryColor, uPrimaryColor, clamp(coreCenter * 0.75 + vDisplacement * 2.2 + 0.35, 0.0, 1.0));
          vec3 filamentColor = mix(uAccentColor, uHighlightColor, clamp(filament * 0.85 + uVoiceLevel * 0.35, 0.0, 1.0));

          vec3 col = basePlasma * (0.65 + 0.55 * coreCenter);
          col += filamentColor * filament * (1.15 + 0.4 * uGlowIntensity);
          col += uAccentColor * (latWave * 0.28 + lonWave * 0.18);
          col += uHighlightColor * fresnel * (0.85 * uGlowIntensity);
          col += uHighlightColor * scanBand * 1.35;

          col *= uBrightness * uLuminanceBoost;

          float alpha = clamp(0.84 + fresnel * 0.16 + filament * 0.12, 0.0, 1.0);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: true,
    });
  }

  public createMagneticShellMaterial(
    uniforms: CoreShaderUniforms
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPulseScale;
        uniform float uVoiceLevel;

        varying vec3 vNormalWorld;
        varying vec3 vViewDir;
        varying vec3 vSphereDir;

        void main() {
          vec3 dir = normalize(position);
          vSphereDir = dir;

          float ripple = sin(dir.y * 10.0 - uTime * 3.5) * 0.012 * (1.0 + uVoiceLevel * 2.0);
          vec3 pos = position * (uPulseScale * 1.02 + ripple);

          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uPrimaryColor;
        uniform vec3 uAccentColor;
        uniform vec3 uHighlightColor;
        uniform float uGlowIntensity;
        uniform float uBrightness;
        uniform float uScanPhase;
        uniform float uScanStrength;

        varying vec3 vNormalWorld;
        varying vec3 vViewDir;
        varying vec3 vSphereDir;

        void main() {
          vec3 N = normalize(vNormalWorld);
          vec3 V = normalize(vViewDir);
          float NdotV = max(dot(N, V), 0.0);

          float fresnel = pow(1.0 - NdotV, 3.1);

          // Geodesic magnetic field latitude/longitude micro-lines
          float latGrid = pow(abs(cos(vSphereDir.y * 22.0)), 28.0);
          float lonAngle = atan(vSphereDir.z, vSphereDir.x);
          float lonGrid = pow(abs(cos(lonAngle * 16.0 + uTime * 0.35)), 32.0);

          // Travelling energy pulse wave along sphere
          float wave1 = pow(0.5 + 0.5 * sin(vSphereDir.y * 5.0 - uTime * 2.6), 10.0);
          float scanRing = exp(-pow((vSphereDir.y - sin(uScanPhase)) * 8.0, 2.0)) * uScanStrength;

          vec3 col = mix(uPrimaryColor, uAccentColor, fresnel * 0.7 + wave1 * 0.3);
          col += uHighlightColor * scanRing * 1.2;

          float intensity = fresnel * 0.72 + (latGrid + lonGrid) * 0.14 + wave1 * 0.22 + scanRing * 0.55;
          float alpha = clamp(intensity * 0.55 * uGlowIntensity, 0.0, 0.78);

          gl_FragColor = vec4(col * uBrightness, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  public createVolumetricCoronaMaterial(
    uniforms: CoreShaderUniforms
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vNormalWorld;
        varying vec3 vViewDir;

        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uGlowColor;
        uniform vec3 uAccentColor;
        uniform float uGlowIntensity;
        uniform float uBrightness;
        uniform float uLuminanceBoost;

        varying vec3 vNormalWorld;
        varying vec3 vViewDir;

        void main() {
          vec3 N = normalize(vNormalWorld);
          vec3 V = normalize(vViewDir);

          // BackSide: -dot(N, V) is 1.0 directly behind center and 0.0 at outer edge
          float centerAlignment = clamp(-dot(N, V), 0.0, 1.0);
          float corona = pow(centerAlignment, 3.1);
          float innerHotspot = pow(centerAlignment, 6.2);

          vec3 col = mix(uGlowColor, uAccentColor, innerHotspot * 0.45);
          float alpha = clamp((corona * 0.42 + innerHotspot * 0.28) * uGlowIntensity * uLuminanceBoost, 0.0, 0.85);

          gl_FragColor = vec4(col * uBrightness, alpha);
        }
      `,
    });
  }

  public createParticleMaterial(
    uniforms: ParticleShaderUniforms
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aPhase;
        attribute float aEnergy;

        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uSizeScale;

        varying float vEnergy;
        varying float vTwinkle;

        void main() {
          vEnergy = aEnergy;
          vTwinkle = 0.65 + 0.35 * sin(uTime * 3.2 + aPhase);

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float dist = max(-mvPosition.z, 0.8);
          gl_PointSize = clamp(aSize * uSizeScale * uPixelRatio * (18.0 / dist), 1.2, 42.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uPrimaryColor;
        uniform vec3 uAccentColor;
        uniform vec3 uHighlightColor;
        uniform float uGlowIntensity;
        uniform float uBrightness;

        varying float vEnergy;
        varying float vTwinkle;

        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard;

          float softGlow = exp(-d * d * 11.5);
          float hotCore = smoothstep(0.22, 0.0, d);

          vec3 col = mix(uPrimaryColor, uAccentColor, vEnergy);
          col = mix(col, uHighlightColor, hotCore * 0.65);

          float alpha = clamp((softGlow * 0.85 + hotCore * 0.45) * vTwinkle * min(uGlowIntensity, 1.5), 0.0, 1.0);
          gl_FragColor = vec4(col * uBrightness, alpha);
        }
      `,
    });
  }
}
