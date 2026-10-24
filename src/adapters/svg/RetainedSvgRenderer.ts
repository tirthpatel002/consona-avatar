import type { IRenderer, RendererType } from '../../core/renderers/IRenderer.ts';
import { SceneGraph } from '../../core/scenegraph/SceneGraph.ts';
import type { RenderContext } from '../../core/types/RenderContext.ts';
import type { AvatarDescriptor } from '../../core/types/AvatarDescriptor.ts';
import { formatCoord } from '../../core/math/Bezier.ts';
import { parseMarkup, patchMarkup, type ParsedMarkup } from './markupPatch.ts';

/**
 * RetainedSvgRenderer: High-performance retained-mode DOM SVG renderer.
 * Maintains persistent SVG DOM elements and slots, mutating only dirty subtrees
 * to achieve 60-144fps without full HTML re-parsing. Every DOM write is
 * write-on-change (root transform, visibility, opacity), and a changed atom
 * whose markup keeps its structure is patched attribute by attribute.
 */
export class RetainedSvgRenderer implements IRenderer {
  readonly type: RendererType = 'retained-svg';

  private container: HTMLElement | null = null;
  private svgElement: SVGSVGElement | null = null;
  private defsElement: SVGDefsElement | null = null;
  private rootGroup: SVGGElement | null = null;

  private descriptor?: AvatarDescriptor;
  private customDefs: string = '';
  private currentPaletteId: string = '';

  private nodeSlots: Map<string, SVGGElement> = new Map();
  private lastRenderedMarkup: Map<string, string> = new Map();
  private lastParsed: Map<string, ParsedMarkup | null> = new Map();
  /** Last written per-slot state (display / opacity), to skip identical writes. */
  private slotState: Map<string, { hidden: boolean; opacity: string | null; seen: number }> = new Map();
  private rootTransform: string | null = null;
  private frame = 0;

  initialize(container: HTMLElement | null, descriptor: AvatarDescriptor): void {
    this.container = container;
    this.descriptor = descriptor;
    this.resetCaches();
    this.currentPaletteId = '';

    if (!container || typeof document === 'undefined') return;

    // Create persistent SVGSVGElement
    this.svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const canvas = descriptor.canvas;
    this.svgElement.setAttribute('viewBox', canvas.viewBox);
    this.svgElement.setAttribute('width', '100%');
    this.svgElement.setAttribute('height', '100%');
    this.svgElement.setAttribute('data-avatar', descriptor.id);

    this.defsElement = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    this.rootGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    this.svgElement.appendChild(this.defsElement);
    this.svgElement.appendChild(this.rootGroup);

    container.innerHTML = '';
    container.appendChild(this.svgElement);
  }

  private resetCaches(): void {
    this.nodeSlots.clear();
    this.lastRenderedMarkup.clear();
    this.lastParsed.clear();
    this.slotState.clear();
    this.rootTransform = null;
  }

  getContainer(): HTMLElement | null {
    return this.container;
  }

  getSvgElement(): SVGSVGElement | null {
    return this.svgElement;
  }

  mount(container: HTMLElement): void {
    if (this.descriptor) {
      this.initialize(container, this.descriptor);
    } else {
      this.container = container;
    }
  }

  unmount(): void {
    this.dispose();
  }

  setDefs(defsXml: string): void {
    this.customDefs = defsXml;
    if (this.defsElement) {
      this.defsElement.innerHTML = defsXml;
    }
  }

  render(scene: SceneGraph, context: RenderContext): SVGSVGElement | null {
    if (!this.svgElement || !this.rootGroup) return null;

    // 1. Update defs if palette/mode changed
    if (this.defsElement && context.paletteId !== this.currentPaletteId) {
      this.currentPaletteId = context.paletteId;
      let defsMarkup = this.customDefs;
      if (!defsMarkup && this.descriptor?.generateDefs) {
        defsMarkup = this.descriptor.generateDefs(context.theme, context.mode);
      }
      this.defsElement.innerHTML = defsMarkup || '';
    }

    // 2. Update Root Transform
    const canvas = context.canvas || this.descriptor?.canvas || { width: 100, height: 100 };
    const rootPos = scene.root.localTransform.position;
    const rootRot = scene.root.localTransform.rotation;
    const rootScale = scene.root.localTransform.scale;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const rotDeg = (rootRot[2] * 180) / Math.PI;

    const transforms: string[] = [];
    if (rootPos[0] !== 0 || rootPos[1] !== 0) {
      transforms.push(`translate(${formatCoord(rootPos[0])} ${formatCoord(rootPos[1])})`);
    }
    if (Math.abs(rotDeg) > 0.01) {
      transforms.push(`rotate(${formatCoord(rotDeg)} ${formatCoord(cx)} ${formatCoord(cy)})`);
    }
    if (rootScale[0] !== 1 || rootScale[1] !== 1) {
      transforms.push(
        `translate(${formatCoord(cx)} ${formatCoord(cy)}) scale(${formatCoord(rootScale[0])} ${formatCoord(rootScale[1])}) translate(${formatCoord(-cx)} ${formatCoord(-cy)})`
      );
    }

    const transform = transforms.join(' ');
    if (transform !== this.rootTransform) {
      this.rootGroup.setAttribute('transform', transform);
      this.rootTransform = transform;
    }

    // 3. Render AtomNodes into slots in sorted zIndex order
    const renderList = scene.getRenderList();
    const frame = ++this.frame;

    for (let i = 0; i < renderList.length; i++) {
      const atomNode = renderList[i]!;
      const nodeId = atomNode.id;

      let slot = this.nodeSlots.get(nodeId);
      let st = this.slotState.get(nodeId);
      if (!slot || !st) {
        slot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        slot.setAttribute('data-node-id', nodeId);
        this.nodeSlots.set(nodeId, slot);
        this.rootGroup.appendChild(slot);
        st = { hidden: false, opacity: null, seen: frame };
        this.slotState.set(nodeId, st);
      }
      st.seen = frame;

      // Ensure proper DOM order for zIndex
      const currentChild = this.rootGroup.children[i];
      if (currentChild !== slot) {
        this.rootGroup.insertBefore(slot, currentChild || null);
      }

      // A2: inherited visibility / opacity
      const hidden = !atomNode.worldVisible || atomNode.worldOpacity <= 0;
      if (hidden !== st.hidden) {
        slot.style.display = hidden ? 'none' : '';
        st.hidden = hidden;
      }
      if (hidden) continue;
      const opacity = atomNode.worldOpacity < 1.0 ? formatCoord(atomNode.worldOpacity) : null;
      if (opacity !== st.opacity) {
        if (opacity === null) slot.removeAttribute('opacity');
        else slot.setAttribute('opacity', opacity);
        st.opacity = opacity;
      }

      // Render atom SVG markup into slot if dirty or missing
      if (atomNode.isDirty || !this.lastRenderedMarkup.has(nodeId)) {
        const markup = atomNode.renderSvg(context);
        const prev = this.lastRenderedMarkup.get(nodeId);
        if (markup !== prev) {
          const parsed = parseMarkup(markup);
          if (prev === undefined || !patchMarkup(slot, this.lastParsed.get(nodeId) ?? null, parsed)) slot.innerHTML = markup;
          this.lastRenderedMarkup.set(nodeId, markup);
          this.lastParsed.set(nodeId, parsed);
        }
      }
    }

    // 4. Clean up slots for removed nodes
    for (const [nodeId, slot] of this.nodeSlots.entries()) {
      if (this.slotState.get(nodeId)?.seen !== frame) {
        slot.remove();
        this.nodeSlots.delete(nodeId);
        this.lastRenderedMarkup.delete(nodeId);
        this.lastParsed.delete(nodeId);
        this.slotState.delete(nodeId);
      }
    }

    return this.svgElement;
  }

  dispose(): void {
    if (this.svgElement && this.container) {
      this.svgElement.remove();
    }
    this.resetCaches();
    this.svgElement = null;
    this.defsElement = null;
    this.rootGroup = null;
    this.container = null;
  }
}
