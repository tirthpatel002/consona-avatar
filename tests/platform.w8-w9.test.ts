import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AssetManager, sanitizeSvgContent, fitRect } from '../src/core/assets/index.ts';
import { createThreeAdapter, THREE_ADAPTER_PACKAGE } from '../src/adapters/three/index.ts';

describe('W8–W9 platform cores', () => {
  it('AssetManager sanitizes script tags in SVG', () => {
    const am = new AssetManager();
    const dirty = `<svg><script>alert(1)</script><circle r="1" onclick="x()"/></svg>`;
    const asset = am.registerSvg('hat', dirty);
    assert.equal(asset.status, 'ready');
    assert.ok(!asset.content!.includes('<script'));
    assert.ok(!asset.content!.includes('onclick'));
    am.release('hat');
    assert.equal(am.size(), 0);
  });

  it('sanitizeSvgContent strips javascript URLs', () => {
    const out = sanitizeSvgContent(`<a href="javascript:alert(1)">x</a>`);
    assert.ok(!out.includes('javascript:'));
  });

  it('fitRect contain centers the asset', () => {
    const r = fitRect('contain', 100, 100, 50, 25);
    assert.equal(r.width, 100);
    assert.equal(r.height, 50);
    assert.equal(r.y, 25);
  });

  it('three adapter registers models without importing three package', () => {
    const fakeThree = {
      Scene: class {},
      PerspectiveCamera: class {
        constructor() {}
      },
      WebGLRenderer: class {
        domElement = {} as HTMLElement;
        render() {}
        dispose() {}
      },
    };
    const adapter = createThreeAdapter(fakeThree as any);
    adapter.registerModel('head', 'https://example.com/head.glb');
    assert.deepEqual(adapter.listModels(), ['head']);
    assert.equal(THREE_ADAPTER_PACKAGE, '@consona/avatar/three');
    adapter.dispose();
  });
});
