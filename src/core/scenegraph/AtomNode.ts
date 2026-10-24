import { AvatarNode } from './AvatarNode.ts';
import type { ChannelSchemaMap } from '../channel/ChannelSchema.ts';
import type { RenderContext } from '../types/RenderContext.ts';
import { ChannelBuffer } from '../channel/ChannelBuffer.ts';

/**
 * Universal Atom interface: The visual rendering unit attached to an AtomNode.
 */
export interface IAtom {
  readonly id: string;
  readonly type?: string;
  readonly zIndex?: number;
  readonly schema: ChannelSchemaMap;
  renderSvg(context: RenderContext, channels: ChannelBuffer, node: AtomNode): string;
  renderCanvas2D?(ctx: CanvasRenderingContext2D, context: RenderContext, channels: ChannelBuffer, node: AtomNode): void;
}

/**
 * AtomNode: A scene graph node representing a visual, parametric atom.
 */
export class AtomNode extends AvatarNode {
  public readonly atom: IAtom;

  constructor(id: string, atom: IAtom, initialChannels?: Record<string, any>) {
    super(id, 'atom', atom.schema, initialChannels);
    this.atom = atom;
    this.zIndex = atom.zIndex ?? 0;
  }

  renderSvg(context: RenderContext): string {
    if (!this.visible || this.opacity <= 0) return '';
    return this.atom.renderSvg(context, this.channels, this);
  }

  renderCanvas2D(ctx: CanvasRenderingContext2D, context: RenderContext): void {
    if (!this.visible || this.opacity <= 0) return;
    if (this.atom.renderCanvas2D) {
      this.atom.renderCanvas2D(ctx, context, this.channels, this);
    }
  }
}
