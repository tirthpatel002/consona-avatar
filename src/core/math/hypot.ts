// Fixed-arity lengths: the variadic Math.hypot allocates its arguments array
// on every call, which shows up in per-frame code.
export const hypot2 = (x: number, y: number): number => Math.sqrt(x * x + y * y);
export const hypot3 = (x: number, y: number, z: number): number => Math.sqrt(x * x + y * y + z * z);
export const hypot4 = (x: number, y: number, z: number, w: number): number => Math.sqrt(x * x + y * y + z * z + w * w);
