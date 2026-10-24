import { test } from 'node:test';
import assert from 'node:assert/strict';
import { premultipliedToImageRows, snapshotFilename, snapshotSize } from '../src/adapters/three/stage/snapshot.ts';

test('snapshotSize: CSS × uncapped dpr × scale', () => {
  assert.deepEqual(snapshotSize({ cssWidth: 580, cssHeight: 580, devicePixelRatio: 2 }), { width: 2320, height: 2320, pixelRatio: 4 });
  // dpr 3 is NOT capped at the live stage's 2
  const s = snapshotSize({ cssWidth: 400, cssHeight: 300, devicePixelRatio: 3, scale: 1 });
  assert.equal(s.width, 1200);
  assert.equal(s.height, 900);
});

test('snapshotSize: clamps to size / GPU / pixel limits, keeps aspect', () => {
  const a = snapshotSize({ cssWidth: 1600, cssHeight: 900, devicePixelRatio: 2, scale: 2 });
  assert.equal(a.width, 4096);
  assert.equal(a.height, 2304);
  const g = snapshotSize({ cssWidth: 1000, cssHeight: 500, devicePixelRatio: 2, scale: 4, gpuMaxSize: 2048, maxSize: 99999 });
  assert.deepEqual([g.width, g.height], [2048, 1024]);
  const p = snapshotSize({ cssWidth: 1000, cssHeight: 1000, devicePixelRatio: 1, scale: 10, maxSize: 99999, maxPixels: 1_000_000 });
  assert.deepEqual([p.width, p.height], [1000, 1000]);
  const bad = snapshotSize({ cssWidth: 100, cssHeight: 50, devicePixelRatio: 0, scale: -1 });
  assert.deepEqual([bad.width, bad.height], [200, 100]);
});

test('premultipliedToImageRows: flips rows and un-premultiplies alpha', () => {
  // 1×2 image, GL order: row 0 = bottom
  const gl = new Uint8Array([
    100, 50, 0, 128, // bottom: half-transparent premultiplied
    10, 20, 30, 255, // top: opaque
  ]);
  const out = premultipliedToImageRows(gl, 1, 2);
  assert.deepEqual(Array.from(out.slice(0, 4)), [10, 20, 30, 255]);
  assert.deepEqual(Array.from(out.slice(4, 8)), [199, 100, 0, 128]);
  const clear = premultipliedToImageRows(new Uint8Array([5, 5, 5, 0]), 1, 1);
  assert.deepEqual(Array.from(clear), [0, 0, 0, 0]);
});

test('snapshotFilename', () => {
  const d = new Date(2026, 9, 17, 18, 5, 9);
  assert.equal(snapshotFilename('Allie Classic!', d), 'allie-classic-snapshot-20261017-180509.png');
  assert.equal(snapshotFilename('', d), 'avatar-snapshot-20261017-180509.png');
});
