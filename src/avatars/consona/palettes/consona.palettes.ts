/**
 * Curated Minimalist & Luxury Palette Registry for Consona.
 * Generates dynamic, harmonized color schemes adjusted for Light and Dark modes
 * based on expressive accent color ramps.
 */

export type AccentColor =
  | 'mono'
  | 'red'
  | 'blue'
  | 'purple'
  | 'green'
  | 'indigo'
  | 'orange'
  | 'yellow'
  | 'brown'
  | 'emerald'
  | 'gold';

export type PaletteMode = 'light' | 'dark';

export interface AccentColorMeta {
  readonly id: AccentColor;
  readonly name: string;
  readonly swatch: string;
  readonly description: string;
}

/** A palette (a type alias, so it is a valid render-context theme record). */
export type PaletteDefinition = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly background: string;
  readonly head: readonly string[];
  readonly shadow?: string;
  readonly iris: readonly string[];
  readonly pupil: string;
  readonly sclera: string;
  readonly highlight: string;
  readonly accent: string;
  readonly accentSoft?: string;     // Curated soft pastel/tinted accent
  readonly eyeBorder?: string;      // Curated matching accent stroke
  readonly eyeBorderAlt?: string;   // Curated contrasting / alternative accent stroke
  readonly accentColor?: AccentColor;
  readonly mode?: PaletteMode;
};

/**
 * Curated list of all supported accent colors with preview swatches.
 */
export const ACCENT_COLORS: readonly AccentColorMeta[] = [
  { id: 'mono', name: 'Mono', swatch: '#71717A', description: 'Timeless minimalist obsidian and porcelain balance' },
  { id: 'red', name: 'Red', swatch: '#EF4444', description: 'Passionate crimson and radiant ruby luster' },
  { id: 'blue', name: 'Blue', swatch: '#3B82F6', description: 'Electric cobalt and deep sapphire serenity' },
  { id: 'purple', name: 'Purple', swatch: '#A855F7', description: 'Imperial violet and glowing amethyst bloom' },
  { id: 'green', name: 'Green', swatch: '#22C55E', description: 'Alpine forest and vibrant cyber-jade vitality' },
  { id: 'indigo', name: 'Indigo', swatch: '#6366F1', description: 'Deep cosmic ultramarine and twilight aura' },
  { id: 'orange', name: 'Orange', swatch: '#F97316', description: 'Warm sunset terracotta and blazing solar embers' },
  { id: 'yellow', name: 'Yellow', swatch: '#EAB308', description: 'Brilliant solar citron and golden honey warmth' },
  { id: 'brown', name: 'Brown', swatch: '#A3683B', description: 'Velvet espresso mocha and hazelnut mahogany' },
  { id: 'emerald', name: 'Emerald', swatch: '#10B981', description: 'Lush oceanic emerald and fresh mint radiance' },
  { id: 'gold', name: 'Gold', swatch: '#E5A910', description: 'Opulent 24k champagne gold and antique bronze' },
] as const;

/**
 * Builds a curated PaletteDefinition tailored for the given accent and mode.
 */
export function createAccentPalette(accent: AccentColor, mode: PaletteMode): PaletteDefinition {
  switch (accent) {
    case 'mono':
      return mode === 'light'
        ? {
          id: 'mono-light',
          name: 'Mono Light',
          description: 'Crisp porcelain white spherical body with sharp obsidian eyes.',
          background: '#F4F4F5',
          head: ['#FFFFFF', '#F4F4F5', '#E4E4E7', '#CBD5E1'],
          shadow: '#94A3B8',
          iris: ['#18181B', '#09090B'],
          pupil: '#000000',
          sclera: '#FFFFFF',
          highlight: '#18181B',
          accent: '#18181B',
          eyeBorder: '#A1A1AA',
          eyeBorderAlt: '#E4E4E7',
          accentColor: 'mono',
          mode: 'light',
        }
        : {
          id: 'mono-dark',
          name: 'Mono Dark',
          description: 'Minimalist deep obsidian body with glowing white capsule eyes.',
          background: '#121316',
          head: ['#3F3F46', '#27272A', '#18181B', '#09090B'],
          shadow: '#040405',
          iris: ['#FFFFFF', '#F4F4F5'],
          pupil: '#0A0A0C',
          sclera: '#FFFFFF',
          highlight: '#FFFFFF',
          accent: '#FFFFFF',
          eyeBorder: '#71717A',
          eyeBorderAlt: '#27272A',
          accentColor: 'mono',
          mode: 'dark',
        };

    case 'red':
      return mode === 'light'
        ? {
          id: 'red-light',
          name: 'Ruby Crimson (Light)',
          description: 'Luminous scarlet ember head with deep garnet optics on soft rose canvas.',
          background: '#FEF2F2',
          head: ['#FCA5A5', '#F87171', '#DC2626', '#991B1B'],
          shadow: '#450A0A',
          iris: ['#450A0A', '#1F0404'],
          pupil: '#0F0202',
          sclera: '#FFFFFF',
          highlight: '#FFFFFF',
          accent: '#EF4444',
          eyeBorder: '#F87171',
          eyeBorderAlt: '#FCA5A5',
          accentColor: 'red',
          mode: 'light',
        }
        : {
          id: 'red-dark',
          name: 'Ruby Crimson (Dark)',
          description: 'Deep lustrous ruby obsidian body with bright scarlet accents on dark garnet base.',
          background: '#140809',
          head: ['#991B1B', '#7F1D1D', '#540E0E', '#2D0606'],
          shadow: '#1A0303',
          iris: ['#FCA5A5', '#EF4444'],
          pupil: '#2B0707',
          sclera: '#FFFFFF',
          highlight: '#FEE2E2',
          accent: '#EF4444',
          eyeBorder: '#EF4444',
          eyeBorderAlt: '#B91C1C',
          accentColor: 'red',
          mode: 'dark',
        };

    case 'blue':
      return mode === 'light'
        ? {
          id: 'blue-light',
          name: 'Sapphire Cobalt (Light)',
          description: 'Radiant cobalt azure head with deep cosmic midnight optics on sky canvas.',
          background: '#EFF6FF',
          head: ['#93C5FD', '#60A5FA', '#2563EB', '#1D4ED8'],
          shadow: '#1E3A8A',
          iris: ['#172554', '#0F172A'],
          pupil: '#020617',
          sclera: '#FFFFFF',
          highlight: '#FFFFFF',
          accent: '#60A5FA',
          eyeBorder: '#60A5FA',
          eyeBorderAlt: '#93C5FD',
          accentColor: 'blue',
          mode: 'light',
        }
        : {
          id: 'blue-dark',
          name: 'Sapphire Cobalt (Dark)',
          description: 'Deep sapphire obsidian body with glowing electric blue eyes on starry void.',
          background: '#070D18',
          head: ['#1E40AF', '#1E3A8A', '#172554', '#081026'],
          shadow: '#030712',
          iris: ['#93C5FD', '#3B82F6'],
          pupil: '#0A1128',
          sclera: '#FFFFFF',
          highlight: '#DBEAFE',
          accent: '#3B82F6',
          eyeBorder: '#3B82F6',
          eyeBorderAlt: '#1D4ED8',
          accentColor: 'blue',
          mode: 'dark',
        };

    case 'purple':
      return mode === 'light'
        ? {
          id: 'purple-light',
          name: 'Imperial Amethyst (Light)',
          description: 'Luminous amethyst bloom head with dark violet optics on soft lilac canvas.',
          background: '#FAF5FF',
          head: ['#D8B4FE', '#C084FC', '#9333EA', '#6B21A8'],
          shadow: '#3B0764',
          iris: ['#3B0764', '#1E0538'],
          pupil: '#0D001A',
          sclera: '#FFFFFF',
          highlight: '#FFFFFF',
          accent: '#C084FC',
          eyeBorder: '#C084FC',
          eyeBorderAlt: '#E9D5FF',
          accentColor: 'purple',
          mode: 'light',
        }
        : {
          id: 'purple-dark',
          name: 'Imperial Amethyst (Dark)',
          description: 'Deep imperial violet body with glowing lilac optics on obsidian void canvas.',
          background: '#10071A',
          head: ['#6B21A8', '#581C87', '#3B0764', '#1F0338'],
          shadow: '#120124',
          iris: ['#D8B4FE', '#A855F7'],
          pupil: '#19042B',
          sclera: '#FFFFFF',
          highlight: '#F3E8FF',
          accent: '#A855F7',
          eyeBorder: '#A855F7',
          eyeBorderAlt: '#7E22CE',
          accentColor: 'purple',
          mode: 'dark',
        };

    case 'green':
      return mode === 'light'
        ? {
          id: 'green-light',
          name: 'Alpine Forest (Light)',
          description: 'Luminous cyber-green head with deep forest shadow optics on soft mint canvas.',
          background: '#F0FDF4',
          head: ['#86EFAC', '#4ADE80', '#16A34A', '#15803D'],
          shadow: '#14532D',
          iris: ['#14532D', '#052E16'],
          pupil: '#02140A',
          sclera: '#FFFFFF',
          highlight: '#FFFFFF',
          accent: '#4ADE80',
          eyeBorder: '#4ADE80',
          eyeBorderAlt: '#86EFAC',
          accentColor: 'green',
          mode: 'light',
        }
        : {
          id: 'green-dark',
          name: 'Alpine Forest (Dark)',
          description: 'Deep evergreen obsidian body with glowing jade accents on dark woodland base.',
          background: '#05130A',
          head: ['#166534', '#14532D', '#0D381E', '#051C0E'],
          shadow: '#020F07',
          iris: ['#86EFAC', '#22C55E'],
          pupil: '#072111',
          sclera: '#FFFFFF',
          highlight: '#DCFCE7',
          accent: '#22C55E',
          eyeBorder: '#22C55E',
          eyeBorderAlt: '#15803D',
          accentColor: 'green',
          mode: 'dark',
        };

    case 'indigo':
      return mode === 'light'
        ? {
          id: 'indigo-light',
          name: 'Deep Ultramarine (Light)',
          description: 'Radiant twilight indigo head with dark cosmic optics on light mist backdrop.',
          background: '#EEF2FF',
          head: ['#A5B4FC', '#818CF8', '#4F46E5', '#3730A3'],
          shadow: '#1E1B4B',
          iris: ['#1E1B4B', '#0F0E2A'],
          pupil: '#050414',
          sclera: '#FFFFFF',
          highlight: '#FFFFFF',
          accent: '#818CF8',
          eyeBorder: '#818CF8',
          eyeBorderAlt: '#C7D2FE',
          accentColor: 'indigo',
          mode: 'light',
        }
        : {
          id: 'indigo-dark',
          name: 'Deep Ultramarine (Dark)',
          description: 'Deep indigo velvet body with illuminated periwinkle eyes on starry void.',
          background: '#08081A',
          head: ['#3730A3', '#312E81', '#1E1B4B', '#0E0C2B'],
          shadow: '#070617',
          iris: ['#A5B4FC', '#6366F1'],
          pupil: '#0D0B26',
          sclera: '#FFFFFF',
          highlight: '#E0E7FF',
          accent: '#6366F1',
          eyeBorder: '#6366F1',
          eyeBorderAlt: '#4338CA',
          accentColor: 'indigo',
          mode: 'dark',
        };

    case 'orange':
      return mode === 'light'
        ? {
          id: 'orange-light',
          name: 'Sunset Terracotta (Light)',
          description: 'Blazing solar orange head with deep roasted umber optics on warm peach canvas.',
          background: '#FFF7ED',
          head: ['#FDBA74', '#FB923C', '#EA580C', '#C2410C'],
          shadow: '#7C2D12',
          iris: ['#431407', '#270B04'],
          pupil: '#130401',
          sclera: '#FFFFFF',
          highlight: '#FFFFFF',
          accent: '#FB923C',
          eyeBorder: '#FB923C',
          eyeBorderAlt: '#FDBA74',
          accentColor: 'orange',
          mode: 'light',
        }
        : {
          id: 'orange-dark',
          name: 'Sunset Terracotta (Dark)',
          description: 'Rich terracotta bronze body with glowing amber-orange eyes on dark embers.',
          background: '#150A03',
          head: ['#9A3412', '#7C2D12', '#521C0B', '#2E0E05'],
          shadow: '#1A0702',
          iris: ['#FDBA74', '#F97316'],
          pupil: '#260B04',
          sclera: '#FFFFFF',
          highlight: '#FFEDD5',
          accent: '#F97316',
          eyeBorder: '#F97316',
          eyeBorderAlt: '#C2410C',
          accentColor: 'orange',
          mode: 'dark',
        };

    case 'yellow':
      return mode === 'light'
        ? {
          id: 'yellow-light',
          name: 'Solar Citron (Light)',
          description: 'Luminous electric citron head with rich warm shadow optics on buttermilk backdrop.',
          background: '#FEFCE8',
          head: ['#FEF08A', '#FDE047', '#CA8A04', '#A16207'],
          shadow: '#713F12',
          iris: ['#422006', '#261202'],
          pupil: '#120901',
          sclera: '#FFFFFF',
          highlight: '#000000',
          accent: '#FDE047',
          eyeBorder: '#FDE047',
          eyeBorderAlt: '#FEF08A',
          accentColor: 'yellow',
          mode: 'light',
        }
        : {
          id: 'yellow-dark',
          name: 'Solar Citron (Dark)',
          description: 'Deep golden bronze body with brilliant citron highlights on dark base.',
          background: '#131003',
          head: ['#e1c253', '#edd747', '#d5883d', '#e8721c'],
          shadow: '#170C02',
          iris: ['#FDE047', '#EAB308'],
          pupil: '#241403',
          sclera: '#FFFFFF',
          highlight: '#ffffff',
          accent: '#EAB308',
          eyeBorder: '#EAB308',
          eyeBorderAlt: '#A16207',
          accentColor: 'yellow',
          mode: 'dark',
        };

    case 'brown':
      return mode === 'light'
        ? {
          id: 'brown-light',
          name: 'Velvet Espresso (Light)',
          description: 'Rich warm hazelnut mahogany head with deep espresso shadow optics on cream canvas.',
          background: '#FAF5F0',
          head: ['#D7A87F', '#B87B4C', '#8A532C', '#5C3D2E'],
          shadow: '#381E13',
          iris: ['#361B10', '#1C0D07'],
          pupil: '#0C0502',
          sclera: '#FFFFFF',
          highlight: '#FFFFFF',
          accent: '#D7A87F',
          eyeBorder: '#D7A87F',
          eyeBorderAlt: '#F3E5D8',
          accentColor: 'brown',
          mode: 'light',
        }
        : {
          id: 'brown-dark',
          name: 'Velvet Espresso (Dark)',
          description: 'Deep velvet mocha espresso body with warm almond eye highlights on dark roast.',
          background: '#120B07',
          head: ['#5C3D2E', '#44281D', '#2E1911', '#1A0C07'],
          shadow: '#0E0603',
          iris: ['#D7A87F', '#A3683B'],
          pupil: '#1E0F09',
          sclera: '#FFFFFF',
          highlight: '#F3E5D8',
          accent: '#B87B4C',
          eyeBorder: '#B87B4C',
          eyeBorderAlt: '#784624',
          accentColor: 'brown',
          mode: 'dark',
        };

    case 'emerald':
      return mode === 'light'
        ? {
          id: 'emerald-light',
          name: 'Jade Emerald (Light)',
          description: 'Luminous radiant emerald head with deep jade abyss shadow optics on fresh mint.',
          background: '#ECFDF5',
          head: ['#6EE7B7', '#34D399', '#059669', '#047857'],
          shadow: '#064E3B',
          iris: ['#064E3B', '#022C20'],
          pupil: '#01140E',
          sclera: '#FFFFFF',
          highlight: '#FFFFFF',
          accent: '#34D399',
          eyeBorder: '#34D399',
          eyeBorderAlt: '#A7F3D0',
          accentColor: 'emerald',
          mode: 'light',
        }
        : {
          id: 'emerald-dark',
          name: 'Jade Emerald (Dark)',
          description: 'Deep mineral jade body with glowing mint emerald eyes on deep forest abyss.',
          background: '#04140E',
          head: ['#065F46', '#064E3B', '#033527', '#011C15'],
          shadow: '#010E0A',
          iris: ['#6EE7B7', '#10B981'],
          pupil: '#031E16',
          sclera: '#FFFFFF',
          highlight: '#D1FAE5',
          accent: '#10B981',
          eyeBorder: '#10B981',
          eyeBorderAlt: '#047857',
          accentColor: 'emerald',
          mode: 'dark',
        };

    case 'gold':
      return mode === 'light'
        ? {
          id: 'gold-light',
          name: 'Imperial Gold (Light)',
          description: 'Luminous 24k molten gold head with deep bronze shadow optics on soft pearl.',
          background: '#FCF9EE',
          head: ['#FEF08A', '#FACC15', '#D97706', '#92400E'],
          shadow: '#5C3606',
          iris: ['#451A03', '#250E01'],
          pupil: '#120700',
          sclera: '#FFFFFF',
          highlight: '#FFFFFF',
          accent: '#FACC15',
          eyeBorder: '#FBBF24',
          eyeBorderAlt: '#FDE68A',
          accentColor: 'gold',
          mode: 'light',
        }
        : {
          id: 'gold-dark',
          name: 'Imperial Gold (Dark)',
          description: 'Burnished antique gold body with radiant champagne optics on royal dark.',
          background: '#141005',
          head: ['#785412', '#63440D', '#442E07', '#251903'],
          shadow: '#140D01',
          iris: ['#FACC15', '#E5A910'],
          pupil: '#211603',
          sclera: '#FFFFFF',
          highlight: '#FEF3C7',
          accent: '#E5A910',
          eyeBorder: '#E5A910',
          eyeBorderAlt: '#A37207',
          accentColor: 'gold',
          mode: 'dark',
        };
  }
}

function buildPaletteRegistry(): Record<string, PaletteDefinition> {
  const registry: Record<string, PaletteDefinition> = {};

  const allAccents: AccentColor[] = [
    'mono',
    'red',
    'blue',
    'purple',
    'green',
    'indigo',
    'orange',
    'yellow',
    'brown',
    'emerald',
    'gold',
  ];

  for (const accent of allAccents) {
    const lightPal = createAccentPalette(accent, 'light');
    const darkPal = createAccentPalette(accent, 'dark');

    registry[`${accent}-light`] = lightPal;
    registry[`${accent}-dark`] = darkPal;
    registry[accent] = lightPal;
  }

  registry['light'] = {
    ...registry['mono-light']!,
    id: 'light',
    name: 'Light Shade',
  };
  registry['dark'] = {
    ...registry['mono-dark']!,
    id: 'dark',
    name: 'Dark Shade',
  };

  return registry;
}

export const CONSONA_PALETTES: Record<string, PaletteDefinition> = buildPaletteRegistry();

export function getPalette(accent: AccentColor = 'mono', mode: PaletteMode = 'light'): PaletteDefinition {
  return createAccentPalette(accent, mode);
}

export function resolvePalette(
  idOrAccent: string = 'mono',
  fallbackMode: PaletteMode = 'light'
): PaletteDefinition {
  if (
    idOrAccent === 'light' ||
    idOrAccent === 'dark' ||
    idOrAccent.endsWith('-light') ||
    idOrAccent.endsWith('-dark')
  ) {
    if (CONSONA_PALETTES[idOrAccent]) {
      return CONSONA_PALETTES[idOrAccent]!;
    }
  }

  const matchAccent = ACCENT_COLORS.find((a) => a.id === idOrAccent);
  if (matchAccent) {
    return createAccentPalette(matchAccent.id, fallbackMode);
  }

  if (CONSONA_PALETTES[idOrAccent]) {
    return CONSONA_PALETTES[idOrAccent]!;
  }

  return CONSONA_PALETTES['light']!;
}

export type ConsonaPaletteId =
  | 'light'
  | 'dark'
  | 'mono'
  | 'mono-light'
  | 'mono-dark'
  | 'red'
  | 'red-light'
  | 'red-dark'
  | 'blue'
  | 'blue-light'
  | 'blue-dark'
  | 'purple'
  | 'purple-light'
  | 'purple-dark'
  | 'green'
  | 'green-light'
  | 'green-dark'
  | 'indigo'
  | 'indigo-light'
  | 'indigo-dark'
  | 'orange'
  | 'orange-light'
  | 'orange-dark'
  | 'yellow'
  | 'yellow-light'
  | 'yellow-dark'
  | 'brown'
  | 'brown-light'
  | 'brown-dark'
  | 'emerald'
  | 'emerald-light'
  | 'emerald-dark'
  | 'gold'
  | 'gold-light'
  | 'gold-dark'
  | (string & {});
