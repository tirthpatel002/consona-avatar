import { ChannelBuffer } from '../channel/ChannelBuffer.ts';
import type { ChannelSchemaMap } from '../channel/ChannelSchema.ts';

/**
 * Reusable ChannelBuffer pool to avoid per-frame clone allocations on the morph hot path.
 */
export class ChannelBufferPool {
  private readonly free: ChannelBuffer[] = [];
  private readonly schema: ChannelSchemaMap;

  constructor(schema: ChannelSchemaMap) {
    this.schema = schema;
  }

  acquire(source?: ChannelBuffer): ChannelBuffer {
    let buf = this.free.pop();
    if (!buf) {
      buf = new ChannelBuffer(this.schema);
    }
    if (source) {
      buf.copyFrom(source);
    }
    return buf;
  }

  release(buf: ChannelBuffer): void {
    buf.resetToRestingState();
    this.free.push(buf);
  }

  clear(): void {
    this.free.length = 0;
  }
}
