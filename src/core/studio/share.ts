import { applyAvatarOverrides, getAvatarControls } from '../controls/controls.ts';
import { composeAvatar, getAvatarAtomVariant, getAvatarPreset, listAvatarFamilies } from '../catalog/catalog.ts';

/**
 * Shareable studio state (renderer-agnostic). Randomization: `randomizer.ts`.
 *
 * Code format: `av1.` + base64url(JSON `{ f: family, p: presetId, a?: atoms, o?: overrides }`).
 * `a` = atom → variant ids (catalog composition), `o` = control path → value
 * (see `applyAvatarOverrides`).
 */
export interface AvatarStudioState {
  family: string;
  preset: string;
  atoms?: Record<string, string>;
  overrides?: Record<string, unknown>;
}

const PREFIX = 'av1.';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function isAvatarStudioCode(text: string): boolean {
  return text.trim().startsWith(PREFIX);
}

export function encodeAvatarStudioState(state: AvatarStudioState): string {
  const payload: Record<string, unknown> = { f: state.family, p: state.preset };
  if (state.atoms && Object.keys(state.atoms).length) payload.a = state.atoms;
  if (state.overrides && Object.keys(state.overrides).length) payload.o = state.overrides;
  return PREFIX + toBase64Url(JSON.stringify(payload));
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Decode + validate against the catalog. Throws an `Error` with a readable
 * message for any problem (bad format, unknown / disallowed family, unknown
 * preset, atom variant or control). Never returns a state that can't compose.
 */
export function decodeAvatarStudioState(code: string, allowedFamilies?: readonly string[]): AvatarStudioState {
  const text = code.trim();
  if (!text.startsWith(PREFIX)) throw new Error(`Not an avatar code (expected "${PREFIX}…")`);
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(text.slice(PREFIX.length)));
  } catch {
    throw new Error('Corrupted avatar code');
  }
  if (!isRecord(raw) || typeof raw.f !== 'string' || typeof raw.p !== 'string') throw new Error('Avatar code is missing family / preset');
  const family = raw.f;
  if (!listAvatarFamilies().some((f) => f.id === family)) throw new Error(`Unknown avatar family "${family}"`);
  if (allowedFamilies && !allowedFamilies.includes(family)) throw new Error(`Code is for "${family}", not this studio`);
  const preset = getAvatarPreset(raw.p);
  if (!preset || preset.family !== family) throw new Error(`Unknown ${family} preset "${raw.p}"`);
  if (raw.a !== undefined && !isRecord(raw.a)) throw new Error('Invalid atoms in avatar code');
  if (raw.o !== undefined && !isRecord(raw.o)) throw new Error('Invalid parameters in avatar code');
  const atoms = raw.a as Record<string, unknown> | undefined;
  if (atoms) {
    if (!preset.composition) throw new Error(`Preset "${preset.id}" has no atoms`);
    for (const [atom, id] of Object.entries(atoms)) {
      if (typeof id !== 'string' || !(atom in preset.composition.atoms) || !getAvatarAtomVariant(atom, id, family)) throw new Error(`Unknown ${atom} variant "${String(id)}"`);
    }
  }
  const state: AvatarStudioState = { family, preset: preset.id, atoms: atoms as Record<string, string> | undefined, overrides: raw.o as Record<string, unknown> | undefined };
  // compose + check every override names a control of the resulting definition
  try {
    const base = state.atoms && preset.composition ? composeAvatar({ ...preset.composition, atoms: { ...preset.composition.atoms, ...state.atoms } }) : preset.definition;
    if (state.overrides) {
      const def = applyAvatarOverrides(base, state.overrides, preset.controls);
      const paths = new Set(getAvatarControls(def, preset.controls).map((c) => c.path));
      const known = new Set([...paths, ...getAvatarControls(base, preset.controls).map((c) => c.path)]);
      const bad = Object.keys(state.overrides).find((p) => !known.has(p));
      if (bad) throw new Error(`Unknown parameter "${bad}"`);
    }
  } catch (e) {
    throw e instanceof Error && e.message.startsWith('Unknown') ? e : new Error('Avatar code does not compose');
  }
  return state;
}
