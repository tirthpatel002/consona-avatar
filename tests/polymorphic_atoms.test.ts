import { test } from 'node:test';
import assert from 'node:assert';
import { consonaHeadAtom } from '../src/avatars/consona/atoms/head.consona.atom.ts';
import { consonaEyesAtom } from '../src/avatars/consona/atoms/eyes.consona.atom.ts';
import { createSvgAssetAtom } from '../src/avatars/consona/atoms/assets/svg.consona.atom.ts';
import { createRasterAssetAtom } from '../src/avatars/consona/atoms/assets/raster.consona.atom.ts';
import { AvatarEngine } from '../src/core/engine/AvatarEngine.ts';
import { consonaAvatar } from '../src/avatars/consona/consona.avatar.ts';
import { AtomNode } from '../src/core/scenegraph/AtomNode.ts';
import { SvgStringRenderer } from '../src/adapters/svg/index.ts';

test('Polymorphic Atoms: Consona atoms exist and have schemas', () => {
  assert.strictEqual(consonaHeadAtom.id, 'consona:head');
  assert.strictEqual(consonaEyesAtom.id, 'consona:eyes');
  assert.ok(consonaHeadAtom.schema);
  assert.ok(consonaEyesAtom.schema);
});

test('Polymorphic Atoms: SvgAssetAtom and RasterAssetAtom creation', () => {
  const hatSvg = createSvgAssetAtom({
    id: 'cyber-hat',
    name: 'Cybernetic Hat',
    zIndex: 60,
    anchorSocket: 'socket_forehead',
    svgUrl: '/assets/hat.svg',
    scale: 1.2,
  });

  assert.strictEqual(hatSvg.id, 'cyber-hat');

  const badgePng = createRasterAssetAtom({
    id: 'badge',
    imageUrl: '/assets/verified.png',
    anchorSocket: 'socket_eyes_bridge',
    parallaxDepth: 1.8,
  });

  assert.strictEqual(badgePng.id, 'badge');
});

test('Polymorphic Atoms: SceneGraph Custom Atom Integration', () => {
  const engine = new AvatarEngine();
  engine.registerAvatar(consonaAvatar);
  const instance = engine.createInstance('test-custom-atom', 'consona');

  // Custom avatar atom
  const customAtom = {
    id: 'custom:badge',
    name: 'Custom Badge',
    schema: {},
    renderSvg: () => '<circle cx="50" cy="50" r="10" fill="#FF5722"/>',
  };

  const customNode = new AtomNode('custom:badgeNode', customAtom as any);
  customNode.zIndex = 50;
  instance.scene.add(customNode);

  const renderer = new SvgStringRenderer();
  const svg = renderer.renderToString(instance, { width: 100, height: 100 });

  assert.ok(svg.includes('#FF5722'), 'Custom atom should be rendered');
  engine.destroyInstance(instance.id);
});
