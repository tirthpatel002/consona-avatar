import { CONSONA_PALETTES, type PaletteDefinition } from '../palettes/consona.palettes.ts';

let cached: string | null = null;

/**
 * Consona's SVG <defs> block: gradient, inner shadow and ambient glow filters for
 * every palette (the palette registry is static, so it is built once and cached).
 */
export function generateConsonaDefs(): string {
  if (cached !== null) return cached;
  const defElements: string[] = [];

  for (const [key, palette] of Object.entries(CONSONA_PALETTES)) {
    const paletteKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
    const gradId = `consonaHeadGrad_${paletteKey}`;
    const filterId = `consonaHeadFilter_${paletteKey}`;
    const glowFilterId = `consonaGlow_${paletteKey}`;

    const colors = palette.head;
    const shadowColor = palette.shadow ?? colors[colors.length - 1] ?? '#000000';
    const rimLightColor = palette.highlight ?? colors[0] ?? '#ffffff';
    const glowColor = palette.accent ?? colors[0] ?? '#3B82F6';

    // 1. Multi-Stop Radial Soft Gradient
    const stops = colors
      .map((c, idx) => {
        const offset = Math.round((idx / Math.max(1, colors.length - 1)) * 100);
        return `<stop offset="${offset}%" stop-color="${c}"/>`;
      })
      .join('');

    defElements.push(
      `<radialGradient id="${gradId}" cx="38%" cy="32%" r="68%" fx="32%" fy="26%">${stops}</radialGradient>`
    );

    // 2. Head Inner Shadow & Specular Rim Filter
    defElements.push(
      `<filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%"><feComponentTransfer in="SourceAlpha" result="alphaMap"><feFuncA type="linear" slope="1"/></feComponentTransfer><feGaussianBlur in="alphaMap" stdDeviation="4.2" result="blurShadow"/><feOffset in="blurShadow" dx="0" dy="5.2" result="offsetShadow"/><feComposite in="offsetShadow" in2="alphaMap" operator="arithmetic" k2="-1" k3="1" result="inverseShadow"/><feFlood flood-color="${shadowColor}" flood-opacity="0.22" result="shadowPaint"/><feComposite in="shadowPaint" in2="inverseShadow" operator="in" result="deepShadow"/><feGaussianBlur in="alphaMap" stdDeviation="2.4" result="blurRim"/><feOffset in="blurRim" dx="0" dy="-2.8" result="offsetRim"/><feComposite in="offsetRim" in2="alphaMap" operator="arithmetic" k2="-1" k3="1" result="inverseRim"/><feFlood flood-color="${rimLightColor}" flood-opacity="0.45" result="rimPaint"/><feComposite in="rimPaint" in2="inverseRim" operator="in" result="specularRim"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="deepShadow"/><feMergeNode in="specularRim"/></feMerge></filter>`
    );

    // 3. Ambient Glow Filter
    defElements.push(
      `<filter id="${glowFilterId}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/><feFlood flood-color="${glowColor}" flood-opacity="0.32" result="color"/><feComposite in2="blur" operator="in" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    );
  }

  // Soft contact shadow: radial falloff + light blur (shared across palettes)
  defElements.push(
    `<radialGradient id="consonaGroundShadowGrad" cx="50%" cy="50%" fx="50%" fy="48%" r="50%">` +
      `<stop offset="0%" stop-color="#000000" stop-opacity="0.34"/>` +
      `<stop offset="40%" stop-color="#000000" stop-opacity="0.18"/>` +
      `<stop offset="72%" stop-color="#000000" stop-opacity="0.06"/>` +
      `<stop offset="100%" stop-color="#000000" stop-opacity="0"/>` +
      `</radialGradient>`
  );
  defElements.push(
    `<filter id="consonaGroundShadowBlur" x="-40%" y="-80%" width="180%" height="260%">` +
      `<feGaussianBlur in="SourceGraphic" stdDeviation="1.8"/>` +
      `</filter>`
  );

  return (cached = defElements.join(''));
}
