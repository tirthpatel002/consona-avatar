import type { IProjectionManifold } from '../scenegraph/manifolds/IProjectionManifold.ts';
import { createManifoldFromPlane } from '../scenegraph/manifolds/createManifold.ts';
import type { NodeSpaceOptions, PlaneDesc } from '../scenegraph/PlaneSpace.ts';
import type { IAtom } from '../scenegraph/AtomNode.ts';
import { AtomNode } from '../scenegraph/AtomNode.ts';
import { GroupNode } from '../scenegraph/GroupNode.ts';
import type { AvatarNode } from '../scenegraph/AvatarNode.ts';
import type { SceneGraph } from '../scenegraph/SceneGraph.ts';

export type SceneAtomDecl = {
  kind: 'atom';
  localId: string;
  zIndex?: number;
  visible?: boolean;
  /** Opt out of parent curvature, or attach a local plane. */
  space?: NodeSpaceOptions;
};

export type SceneGroupDecl = {
  kind: 'group';
  localId: string;
  /** Instantiated manifold (takes precedence over plane desc). */
  manifold?: IProjectionManifold;
  /** Declarative plane — built via createManifoldFromPlane when manifold omitted. */
  plane?: PlaneDesc;
  /** Default true: children without a plane inherit this group's surface. */
  inheritPlane?: boolean;
  children: SceneDecl[];
  zIndex?: number;
  space?: NodeSpaceOptions;
};

export type SceneDecl = SceneAtomDecl | SceneGroupDecl;

export interface AtomDeclOptions {
  zIndex?: number;
  visible?: boolean;
  space?: NodeSpaceOptions;
}

/** Declarative atom node (local id resolved via nodePrefix). */
export function atom(localId: string, opts?: AtomDeclOptions): SceneAtomDecl {
  return {
    kind: 'atom',
    localId,
    zIndex: opts?.zIndex,
    visible: opts?.visible,
    space: opts?.space,
  };
}

export interface GroupDeclOptions {
  /** Live manifold instance (e.g. new SphericalManifold(...)). */
  manifold?: IProjectionManifold;
  /** Or declarative plane desc (preferred for portable scene graphs). */
  plane?: PlaneDesc;
  inheritPlane?: boolean;
  zIndex?: number;
  space?: NodeSpaceOptions;
}

/** Declarative group = shared plane/surface for children. */
export function group(
  localId: string,
  children: SceneDecl[],
  opts?: GroupDeclOptions
): SceneGroupDecl {
  return {
    kind: 'group',
    localId,
    children,
    manifold: opts?.manifold,
    plane: opts?.plane ?? opts?.space?.plane,
    inheritPlane: opts?.inheritPlane ?? opts?.space?.inheritPlane,
    zIndex: opts?.zIndex,
    space: opts?.space,
  };
}

export interface BuildSceneOptions {
  nodePrefix: string;
  atoms: Record<string, IAtom>;
  scene: SceneDecl[];
}

function qualify(prefix: string, localId: string): string {
  if (localId.includes(':')) return localId;
  return `${prefix}:${localId}`;
}

function resolveManifold(decl: SceneGroupDecl): IProjectionManifold | undefined {
  if (decl.manifold) return decl.manifold;
  const plane = decl.plane ?? decl.space?.plane;
  if (plane) return createManifoldFromPlane(plane);
  return undefined;
}

function applySpace(node: AvatarNode, space?: NodeSpaceOptions, inheritPlane?: boolean): void {
  if (space) node.spaceOptions = space;
  if (inheritPlane !== undefined) {
    node.inheritPlane = inheritPlane;
  } else if (space?.inheritPlane !== undefined) {
    node.inheritPlane = space.inheritPlane;
  }
}

function buildDecl(decl: SceneDecl, opts: BuildSceneOptions): AvatarNode {
  const id = qualify(opts.nodePrefix, decl.localId);

  if (decl.kind === 'group') {
    const manifold = resolveManifold(decl);
    const node = new GroupNode(id, manifold);
    if (decl.zIndex !== undefined) node.zIndex = decl.zIndex;
    applySpace(node, decl.space, decl.inheritPlane);
    for (let i = 0; i < decl.children.length; i++) {
      node.add(buildDecl(decl.children[i]!, opts));
    }
    return node;
  }

  const atomDef = opts.atoms[decl.localId];
  if (!atomDef) {
    throw new Error(`SceneBuilder: unknown atom "${decl.localId}" (node ${id})`);
  }
  const node = new AtomNode(id, atomDef);
  if (decl.zIndex !== undefined) node.zIndex = decl.zIndex;
  else if (atomDef.zIndex !== undefined) node.zIndex = atomDef.zIndex;
  if (decl.visible !== undefined) node.visible = decl.visible;
  applySpace(node, decl.space);
  // Atom-local plane override
  if (decl.space?.plane) {
    node.projectionManifold = createManifoldFromPlane(decl.space.plane);
  }
  return node;
}

/** Materialize declarative scene decls onto a SceneGraph. */
export function buildScene(graph: SceneGraph, opts: BuildSceneOptions): void {
  for (let i = 0; i < opts.scene.length; i++) {
    graph.add(buildDecl(opts.scene[i]!, opts));
  }
}
