import {
  createDefaultAvatarConfig,
  type ConsonaAvatarConfig,
  type PartialConsonaAvatarConfig,
} from '../consona.config.ts';

const CODE_PREFIX = 'avatar-';

/**
 * Cross-platform Base64URL encoder (Node.js & Browser compatible).
 */
function toBase64Url(input: string): string {
  const nodeBuffer = (globalThis as any).Buffer;
  if (typeof nodeBuffer !== 'undefined' && typeof nodeBuffer.from === 'function') {
    return nodeBuffer
      .from(input, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // Browser standard UTF-8 Base64URL
  const utf8Bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    const byte = utf8Bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Cross-platform Base64URL decoder (Node.js & Browser compatible).
 */
function fromBase64Url(base64url: string): string {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  const nodeBuffer = (globalThis as any).Buffer;
  if (typeof nodeBuffer !== 'undefined' && typeof nodeBuffer.from === 'function') {
    return nodeBuffer.from(padded, 'base64').toString('utf-8');
  }

  // Browser standard UTF-8 Base64URL
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Recursively sanitizes and rounds floats to 3 decimal places to ensure compact JSON.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : Math.round(value * 1000) / 1000;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (typeof value === 'object' && value !== null) {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        cleaned[k] = sanitizeValue(v);
      }
    }
    return cleaned;
  }
  return value;
}

/**
 * Recursively extracts only keys that differ from reference default config.
 */
function extractDelta(current: Record<string, any>, reference: Record<string, any>): Record<string, any> {
  const delta: Record<string, any> = {};

  for (const key of Object.keys(current)) {
    const curVal = current[key];
    const refVal = reference?.[key];

    if (curVal === undefined) continue;

    if (typeof curVal === 'object' && curVal !== null && !Array.isArray(curVal)) {
      const nestedDelta = extractDelta(curVal, refVal || {});
      if (Object.keys(nestedDelta).length > 0) {
        delta[key] = nestedDelta;
      }
    } else if (curVal !== refVal) {
      delta[key] = curVal;
    }
  }

  return delta;
}

/**
 * Encodes any ConsonaAvatarConfig into a compact, scalable share code with prefix 'avatar-'.
 * Fully forward and backward compatible with any new fields added to ConsonaAvatarConfig.
 * 
 * @example
 * const code = encodeAvatarConfig(config); // "avatar-eyJzZWVkIjoiR3JvayIsImhlYWQiOnsic2hhcGUiOiJzcXVpcmNsZSJ9fQ"
 */
export function encodeAvatarConfig(config: ConsonaAvatarConfig): string {
  const defaults = createDefaultAvatarConfig(config.seed ?? 'Default', config.paletteId ?? 'light');
  const delta = extractDelta(sanitizeValue(config) as Record<string, any>, defaults as Record<string, any>);

  // Always retain identity identifiers if provided
  if (config.seed) delta.seed = config.seed;
  if (config.paletteId) delta.paletteId = config.paletteId;
  if (config.mode) delta.mode = config.mode;

  const json = JSON.stringify(delta);
  const base64url = toBase64Url(json);
  return `${CODE_PREFIX}${base64url}`;
}

/**
 * Decodes a share code string into a complete, validated ConsonaAvatarConfig.
 * Missing or newly-introduced fields automatically fall back to clean default values.
 * 
 * @example
 * const config = decodeAvatarConfig("avatar-eyJzZWVkIjoiR3JvayJ9");
 */
export function decodeAvatarConfig(code: string): ConsonaAvatarConfig {
  if (!code || typeof code !== 'string') {
    throw new Error('Invalid avatar code: Expected non-empty string');
  }

  const raw = code.startsWith(CODE_PREFIX) ? code.slice(CODE_PREFIX.length) : code;

  try {
    const json = fromBase64Url(raw);
    const delta = JSON.parse(json) as PartialConsonaAvatarConfig;
    const seed = delta.seed ?? 'avatar-bot-01';
    const paletteId = delta.paletteId ?? 'light';

    return createDefaultAvatarConfig(seed, paletteId, delta);
  } catch (err: any) {
    throw new Error(`Failed to decode avatar code "${code}": ${err?.message || 'Invalid format'}`);
  }
}

/**
 * Validates whether a given string is a correctly formatted avatar share code.
 */
export function isAvatarCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  try {
    decodeAvatarConfig(code);
    return true;
  } catch {
    return false;
  }
}
