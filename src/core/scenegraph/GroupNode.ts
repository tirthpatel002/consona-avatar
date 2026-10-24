import { AvatarNode } from './AvatarNode.ts';
import type { IProjectionManifold } from './manifolds/IProjectionManifold.ts';
import { TransformChannelSchema } from '../channel/ChannelSchema.ts';

/**
 * GroupNode: Container / plane node for grouping child nodes and applying transforms or projection manifolds.
 */
export class GroupNode extends AvatarNode {
  constructor(id: string, manifold?: IProjectionManifold) {
    super(id, 'group', TransformChannelSchema);
    this.projectionManifold = manifold;
  }
}
