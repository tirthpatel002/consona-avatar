import { AvatarNode } from './AvatarNode.ts';
import { AtomNode } from './AtomNode.ts';
import { GroupNode } from './GroupNode.ts';
import type { UpdateContext } from '../types/Lifecycle.ts';

/**
 * SceneGraph: Root hierarchy manager for an avatar instance.
 * Maintains the node tree, performs dirty updates, world transform propagation,
 * and extracts sorted visual nodes for renderers.
 */
export class SceneGraph {
  public readonly root: GroupNode;
  private flatNodesCache: AvatarNode[] = [];
  private renderListCache: AtomNode[] = [];
  private structureDirty: boolean = true;
  private readonly findCache = new Map<string, AvatarNode>();

  constructor(rootId: string = 'root') {
    this.root = new GroupNode(rootId);
  }

  add(node: AvatarNode, parentId?: string): this {
    if (parentId) {
      const parent = this.find(parentId);
      if (parent) {
        parent.add(node);
      } else {
        this.root.add(node);
      }
    } else {
      this.root.add(node);
    }
    this.structureDirty = true;
    return this;
  }

  remove(nodeOrId: AvatarNode | string): this {
    const node = typeof nodeOrId === 'string' ? this.find(nodeOrId) : nodeOrId;
    if (node && node !== this.root) {
      if (node.parent) {
        node.parent.remove(node);
      }
      this.structureDirty = true;
    }
    return this;
  }

  /** Node by id. Hits are cached and re-validated (same id, still attached under `root`), so edits never go stale. */
  find(id: string): AvatarNode | null {
    const hit = this.findCache.get(id);
    if (hit && hit.id === id && this.attached(hit)) return hit;
    const node = this.root.find(id);
    if (node) this.findCache.set(id, node);
    else this.findCache.delete(id);
    return node;
  }

  private attached(node: AvatarNode): boolean {
    let n: AvatarNode | null = node;
    while (n) {
      if (n === this.root) return true;
      n = n.parent;
    }
    return false;
  }

  findAtom(id: string): AtomNode | null {
    const node = this.find(id);
    return node instanceof AtomNode ? node : null;
  }

  update(context: UpdateContext): void {
    this.root.update(context);
    this.root.updateWorldTransform();
  }

  /**
   * A5: Returns AtomNodes in tree order with sibling zIndex sort.
   * List is rebuilt only when structure changes (not re-sorted every call).
   */
  getRenderList(): AtomNode[] {
    if (this.structureDirty) {
      this.rebuildCaches();
    }
    return this.renderListCache;
  }

  private rebuildCaches(): void {
    this.flatNodesCache = [];
    this.renderListCache = [];
    this.collectRenderList(this.root);
    this.structureDirty = false;
  }

  /** Depth-first: sort each group's children by zIndex, then emit atoms. */
  private collectRenderList(node: AvatarNode): void {
    this.flatNodesCache.push(node);

    if (node.children.length > 1) {
      node.children.sort((a, b) => a.zIndex - b.zIndex);
    }

    if (node instanceof AtomNode) {
      this.renderListCache.push(node);
    }

    for (let i = 0; i < node.children.length; i++) {
      this.collectRenderList(node.children[i]!);
    }
  }
}
