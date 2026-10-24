import * as THREE from 'three';

/**
 * Shell-stack core shared by both fur styles (knit `furShells`, plush
 * `shellFur`): one opaque base mesh + ONE instanced draw for all shells.
 * Each instance carries its shell data as a vec4 attribute
 * (h 0..1, normal offset, strand cut, layer fade) holding exactly the values
 * the per-shell uniforms used to hold, forwarded to the fragment shader as a
 * flat varying, so shader output is unchanged. Instances are drawn inner →
 * outer (same order as the old per-shell meshes); the visible count is the
 * instance count. The base mesh reads the same data from `uFurShell`.
 */
export const SHELL_VERTEX_GLSL = /* glsl */ `
#ifdef USE_INSTANCING
attribute vec4 furShell;
#else
uniform vec4 uFurShell;
#endif
flat varying vec4 vFurShell;
`;
/** Vertex statement: `furShellV` = this shell's data (also forwarded to the fragment). */
export const SHELL_ASSIGN_GLSL = /* glsl */ `
#ifdef USE_INSTANCING
vec4 furShellV = furShell;
#else
vec4 furShellV = uFurShell;
#endif
vFurShell = furShellV;`;
export const SHELL_FRAGMENT_GLSL = 'flat varying vec4 vFurShell;\n';

export class ShellStack {
  readonly group: THREE.Group;
  readonly base: THREE.Mesh;
  /** Instanced shells (replaced by a larger one when capacity grows; same material). */
  shells: THREE.InstancedMesh;
  /** Called with every new shells mesh (capacity growth). */
  onShells?: (m: THREE.InstancedMesh) => void;
  private data: Float32Array;
  private attr: THREE.InstancedBufferAttribute;
  private dirty = false;
  private configure: (m: THREE.InstancedMesh) => void;

  private readonly geo: THREE.BufferGeometry;
  readonly material: THREE.Material;

  constructor(group: THREE.Group, geo: THREE.BufferGeometry, baseMaterial: THREE.Material, material: THREE.Material, capacity: number, configure: (m: THREE.InstancedMesh) => void = () => {}) {
    this.group = group;
    this.geo = geo;
    this.material = material;
    this.configure = configure;
    this.base = new THREE.Mesh(geo, baseMaterial);
    group.add(this.base);
    this.data = new Float32Array(0);
    this.attr = new THREE.InstancedBufferAttribute(this.data, 4);
    this.shells = this.build(Math.max(1, capacity));
  }

  get capacity(): number {
    return this.data.length / 4;
  }

  /** Make room for at least `count` shells (grows by replacing the instanced mesh; nothing visible is disposed). */
  reserve(count: number): void {
    if (count <= this.capacity) return;
    const old = this.shells;
    this.shells = this.build(Math.max(count, this.capacity * 2));
    this.shells.count = old.count;
    this.group.remove(old);
    old.dispose();
  }

  /** Shell `i` (0-based, inner → outer) data; uploads only when a value changed. */
  set(i: number, h: number, off: number, cut: number, fade: number): void {
    const d = this.data;
    const o = i * 4;
    // compare in float32 (what the GPU sees)
    if (d[o] === Math.fround(h) && d[o + 1] === Math.fround(off) && d[o + 2] === Math.fround(cut) && d[o + 3] === Math.fround(fade)) return;
    d[o] = h;
    d[o + 1] = off;
    d[o + 2] = cut;
    d[o + 3] = fade;
    this.dirty = true;
  }

  /** Visible shells (a prefix of the stack); pushes pending data. */
  setCount(n: number): void {
    const m = this.shells;
    m.count = n;
    m.visible = n > 0;
    if (this.dirty) {
      this.attr.needsUpdate = true;
      this.dirty = false;
    }
  }

  private build(cap: number): THREE.InstancedMesh {
    const prev = this.data;
    this.data = new Float32Array(cap * 4);
    this.data.set(prev.subarray(0, Math.min(prev.length, this.data.length)));
    this.attr = new THREE.InstancedBufferAttribute(this.data, 4);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    // the per-instance attribute rides on the shared body geometry (non-instanced programs ignore it)
    this.geo.setAttribute('furShell', this.attr);
    const src = this.geo;
    const m = new THREE.InstancedMesh(src, this.material, cap);
    m.count = 0;
    m.visible = false;
    m.name = 'shells';
    // culling / raycast bounds follow the (morphing) body geometry, exactly like the old per-shell meshes
    Object.defineProperty(m, 'boundingSphere', { get: () => src.boundingSphere ?? (src.computeBoundingSphere(), src.boundingSphere), set: () => {} });
    Object.defineProperty(m, 'boundingBox', { get: () => src.boundingBox ?? (src.computeBoundingBox(), src.boundingBox), set: () => {} });
    m.computeBoundingSphere = () => {};
    m.computeBoundingBox = () => {};
    this.configure(m);
    this.group.add(m);
    this.dirty = true;
    this.onShells?.(m);
    return m;
  }
}
