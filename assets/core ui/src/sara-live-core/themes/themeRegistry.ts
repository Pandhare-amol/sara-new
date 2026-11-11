import { CoreThemeColors, CoreThemeDefinition, ThemeId } from '../types';

export const DEFAULT_CUSTOM_COLORS: CoreThemeColors = {
  primary: '#00d8ff',
  secondary: '#6a5cff',
  accent: '#ff4ecd',
  ring: '#38f6ff',
  glow: '#1a9bff',
  backgroundGlow: '#071b38',
  highlight: '#b8f7ff',
  shadow: '#020612',
};

export const THEME_REGISTRY: Record<ThemeId, CoreThemeDefinition> = {
  'ultron-blue': {
    id: 'ultron-blue',
    name: 'Ultron Blue',
    subtitle: 'Electric Blue & High-Voltage Cyan',
    code: 'ULT-01',
    colors: {
      primary: '#00a8ff',
      secondary: '#0051ff',
      accent: '#4df7ff',
      ring: '#29d9ff',
      glow: '#0095ff',
      backgroundGlow: '#061a36',
      highlight: '#b5f8ff',
      shadow: '#020611',
    },
  },
  'crimson-red': {
    id: 'crimson-red',
    name: 'Crimson Red',
    subtitle: 'Ultron Prime Molten Crimson',
    code: 'CRM-02',
    colors: {
      primary: '#ff1e38',
      secondary: '#990018',
      accent: '#ff7b54',
      ring: '#ff3b52',
      glow: '#ff142f',
      backgroundGlow: '#2b050c',
      highlight: '#ffd0d6',
      shadow: '#0d0104',
    },
  },
  'neon-purple': {
    id: 'neon-purple',
    name: 'Neon Purple',
    subtitle: 'Hyper-Violet & Quantum Magenta',
    code: 'NPR-03',
    colors: {
      primary: '#a855f7',
      secondary: '#5b21b6',
      accent: '#f472b6',
      ring: '#c084fc',
      glow: '#9333ea',
      backgroundGlow: '#1c0933',
      highlight: '#f3e8ff',
      shadow: '#070210',
    },
  },
  'emerald-green': {
    id: 'emerald-green',
    name: 'Emerald Green',
    subtitle: 'Intelligent Bio-Neural Emerald',
    code: 'EMR-04',
    colors: {
      primary: '#00e676',
      secondary: '#007a43',
      accent: '#69ffbe',
      ring: '#1de9b6',
      glow: '#00c853',
      backgroundGlow: '#042619',
      highlight: '#ccffea',
      shadow: '#010a06',
    },
  },
  'golden-amber': {
    id: 'golden-amber',
    name: 'Golden Amber',
    subtitle: 'Solar Gold & Amber Singularity',
    code: 'GLD-05',
    colors: {
      primary: '#ffb300',
      secondary: '#c76800',
      accent: '#ffe57f',
      ring: '#ffca28',
      glow: '#ff9100',
      backgroundGlow: '#291703',
      highlight: '#fff3cc',
      shadow: '#0c0601',
    },
  },
  'ice-white': {
    id: 'ice-white',
    name: 'Ice White',
    subtitle: 'Crystalline White & Glacial Cyan',
    code: 'ICE-06',
    colors: {
      primary: '#e2f4ff',
      secondary: '#7dd3fc',
      accent: '#ffffff',
      ring: '#bae6fd',
      glow: '#93c5fd',
      backgroundGlow: '#0c1c2c',
      highlight: '#ffffff',
      shadow: '#030810',
    },
  },
  'custom-rgb': {
    id: 'custom-rgb',
    name: 'Custom RGB',
    subtitle: 'User-Defined Spectral Matrix',
    code: 'RGB-07',
    colors: { ...DEFAULT_CUSTOM_COLORS },
  },
};

export const THEME_LIST: CoreThemeDefinition[] = Object.values(THEME_REGISTRY);

export function resolveThemeColors(
  themeId: ThemeId,
  customColors?: CoreThemeColors
): CoreThemeColors {
  if (themeId === 'custom-rgb' && customColors) {
    return customColors;
  }
  return (THEME_REGISTRY[themeId] ?? THEME_REGISTRY['ultron-blue']).colors;
}
