/**
 * Declarative, typed channel schemas for avatar nodes and atoms.
 * Guarantees type safety, serialization, and high-performance blending without `any` bags.
 */

export type ChannelType = 'float' | 'vec2' | 'color' | 'enum' | 'boolean' | 'string';
export type BlendMode = 'override' | 'additive' | 'multiply';

export type ChannelInterpolator<T = any> = (a: T, b: T, t: number) => T;
export type ChannelBlender<T = any> = (base: T, delta: T, weight: number) => T;

export interface ChannelDefinition<T = any> {
  name: string;
  type: ChannelType;
  defaultValue: T;
  blendMode: BlendMode;
  interpolate?: ChannelInterpolator<T>;
  blend?: ChannelBlender<T>;
  min?: number;
  max?: number;
  /**
   * Periodic value (an angle: `2π`). A weighted additive delta (fade in / out, partial blend)
   * scales the shortest equivalent delta, so a finished full turn fading to rest stays put
   * instead of unwinding backwards. At full weight the delta is applied as is.
   */
  period?: number;
  description?: string;
}

export type ChannelSchemaMap = Record<string, ChannelDefinition<any>>;

export function defineChannel<T>(def: ChannelDefinition<T>): ChannelDefinition<T> {
  return def;
}

export const TransformChannelSchema: ChannelSchemaMap = {
  xOffset: defineChannel<number>({ name: 'xOffset', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  yOffset: defineChannel<number>({ name: 'yOffset', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  zOffset: defineChannel<number>({ name: 'zOffset', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  rotateX: defineChannel<number>({ name: 'rotateX', type: 'float', defaultValue: 0, blendMode: 'additive', period: Math.PI * 2 }),
  rotateY: defineChannel<number>({ name: 'rotateY', type: 'float', defaultValue: 0, blendMode: 'additive', period: Math.PI * 2 }),
  rotateZ: defineChannel<number>({ name: 'rotateZ', type: 'float', defaultValue: 0, blendMode: 'additive', period: Math.PI * 2 }),
  scaleX: defineChannel<number>({ name: 'scaleX', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
  scaleY: defineChannel<number>({ name: 'scaleY', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
  scaleZ: defineChannel<number>({ name: 'scaleZ', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
  opacity: defineChannel<number>({ name: 'opacity', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
};
