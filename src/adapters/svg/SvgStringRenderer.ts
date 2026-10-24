import type { IRenderer, RendererType } from '../../core/renderers/IRenderer.ts';
import { SceneGraph } from '../../core/scenegraph/SceneGraph.ts';
import type { RenderContext } from '../../core/types/RenderContext.ts';
import type { AvatarDescriptor } from '../../core/types/AvatarDescriptor.ts';
import { formatCoord } from '../../core/math/Bezier.ts';

/**
 * SvgStringRenderer: Headless, stateless renderer producing raw SVG markup.
 * Perfect for SSR, static export, snapshots, and image caching.
 */
export class SvgStringRenderer implements IRenderer {
  readonly type: RendererType = 'svg-string';
  private descriptor?: AvatarDescriptor;
  private customDefs: string = '';

  initialize(_container: HTMLElement | null, descriptor: AvatarDescriptor): void {
    this.descriptor = descriptor;
  }

  setDefs(defsXml: string): void {
    this.customDefs = defsXml;
  }

  render(scene: SceneGraph, context: RenderContext): string {
    const canvas = context.canvas || this.descriptor?.canvas || {
      width: 100,
      height: 100,
      viewBox: '0 0 100 100',
    };

    const renderList = scene.getRenderList();
    let atomsMarkup = '';

    for (let i = 0; i < renderList.length; i++) {
      const atomNode = renderList[i]!;
      if (!atomNode.worldVisible || atomNode.worldOpacity <= 0) continue;
      const atomSvg = atomNode.renderSvg(context);
      if (atomSvg) {
        atomsMarkup += `<g id="${atomNode.id}" data-atom="${atomNode.atom.id}">${atomSvg}</g>`;
      }
    }

    let defsMarkup = this.customDefs;
    if (!defsMarkup && this.descriptor?.generateDefs) {
      defsMarkup = this.descriptor.generateDefs(context.theme, context.mode);
    }

    // Root spatial transform (if root has local translation/rotation/scale)
    const rootPos = scene.root.localTransform.position;
    const rootRot = scene.root.localTransform.rotation;
    const rootScale = scene.root.localTransform.scale;

    let content = atomsMarkup;
    const hasRootTransform =
      rootPos[0] !== 0 || rootPos[1] !== 0 ||
      rootRot[2] !== 0 ||
      rootScale[0] !== 1 || rootScale[1] !== 1;

    if (hasRootTransform) {
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

      content = `<g transform="${transforms.join(' ')}">${atomsMarkup}</g>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${canvas.viewBox}" width="${canvas.width}" height="${canvas.height}" data-avatar="${this.descriptor?.id ?? 'avatar'}">${defsMarkup ? `<defs>${defsMarkup}</defs>` : ''}${content}</svg>`;
  }

  renderToString(
    instance: any,
    options?: { width?: number; height?: number; viewBox?: string; backgroundColor?: string; extraDefs?: string }
  ): string {
    if (!this.descriptor && instance.descriptor) {
      this.descriptor = instance.descriptor;
    }
    if (options?.extraDefs) {
      this.setDefs(options.extraDefs);
    }
    const oldCanvas = instance.renderContext?.canvas;
    if (options?.width || options?.height || options?.viewBox) {
      instance.renderContext.canvas = {
        width: options.width ?? oldCanvas?.width ?? 100,
        height: options.height ?? oldCanvas?.height ?? 100,
        viewBox: options.viewBox ?? oldCanvas?.viewBox ?? '0 0 100 100',
      };
    }
    const result = this.render(instance.scene, instance.renderContext);
    if (instance.renderContext) {
      instance.renderContext.canvas = oldCanvas;
    }
    return result;
  }

  dispose(): void {
    this.customDefs = '';
    this.descriptor = undefined;
  }
}
