import type { ResolvedAvatarDefinition } from '../../../../core/define/resolveAvatar.ts';
import type { AvatarDiffTween } from '../../../../core/define/diffAvatar.ts';
import { furShellStyle } from '../../../../core/plugins/fur.schema.ts';
import { PROP_SPRING, SLOW_PROP_SPRING, Spring } from '../../../../core/math/Spring.ts';

/**
 * Live (spring-tweened) fur values of one rig, owned by its fur part
 * (`furShells` / `shellFur`): definition edits retarget them, the controller
 * steps them, the fur layers and eye clearing read them.
 */
export class FurTweens {
  readonly length: Spring;
  readonly density: Spring;
  readonly shells: Spring;
  readonly rootShade: Spring;
  readonly droop: Spring;
  readonly patternShade: Spring;
  readonly bumpScale: Spring;
  private readonly all: Spring[];

  constructor(def: ResolvedAvatarDefinition) {
    const f = def.fur || null;
    const fd = { ...furShellStyle(def.family).defaults, ...(f ?? {}) };
    this.length = new Spring(fd.length, PROP_SPRING);
    this.density = new Spring(fd.density, PROP_SPRING);
    this.shells = new Spring(f ? fd.shells : 0, SLOW_PROP_SPRING);
    this.rootShade = new Spring(fd.rootShade, PROP_SPRING);
    this.droop = new Spring(fd.droop, PROP_SPRING);
    this.patternShade = new Spring(fd.knit ? fd.patternShade : 0, PROP_SPRING);
    this.bumpScale = new Spring(f && fd.knit ? fd.bumpScale : 0, PROP_SPRING);
    this.all = [this.length, this.density, this.shells, this.rootShade, this.droop, this.patternShade, this.bumpScale];
  }

  /** Retarget from a definition diff's tween fields. */
  retarget(t: AvatarDiffTween): void {
    if (t.furLength !== undefined) this.length.set(t.furLength);
    if (t.furDensity !== undefined) this.density.set(t.furDensity);
    if (t.furShells !== undefined) this.shells.set(t.furShells);
    if (t.furRootShade !== undefined) this.rootShade.set(t.furRootShade);
    if (t.furDroop !== undefined) this.droop.set(t.furDroop);
    if (t.furPatternShade !== undefined) this.patternShade.set(t.furPatternShade);
    if (t.furBumpScale !== undefined) this.bumpScale.set(t.furBumpScale);
  }

  update(dt: number): void {
    for (const s of this.all) s.update(dt);
  }

  get settled(): boolean {
    for (const s of this.all) if (!s.settled) return false;
    return true;
  }

  /** Live pile length in body units for `family`'s style. */
  liveLength(family?: string): number {
    return Math.max(0, this.length.x) * furShellStyle(family).lengthBoost;
  }

  /** Pile height the embedded eyes clear (0 when the fur is faded out). */
  eyeClearance(family?: string): number {
    return this.liveLength(family) * (this.shells.x > 0.01 ? 1 : 0);
  }
}
