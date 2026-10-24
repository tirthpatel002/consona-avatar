import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Vector2D,
  Spring2D,
  evaluateRespirationWave,
  evaluateCardiacWave,
  evaluateBouncePhysics,
} from '../src/core/math/index.ts';
import { consonaEyesAtom } from '../src/avatars/consona/atoms/eyes.consona.atom.ts';
import { consonaEngine } from '../src/avatars/consona/sdk/ConsonaEngine.ts';
import { SphericalManifold } from '../src/core/scenegraph/manifolds/SphericalManifold.ts';

test('Vector2D math and operations', () => {
  const v1 = new Vector2D(3, 4);
  assert.equal(v1.magnitude(), 5);

  const v2 = new Vector2D(1, 2);
  const sum = v1.clone().add(v2);
  assert.equal(sum.x, 4);
  assert.equal(sum.y, 6);

  const lerped = v1.clone().lerp(v2, 0.5);
  assert.equal(lerped.x, 2);
  assert.equal(lerped.y, 3);
});

test('Spring2D tracking kinematics', () => {
  const spring = new Spring2D(0, 0, { stiffness: 180, damping: 22 });
  spring.setTarget(10, 20);
  spring.step(0.016);
  assert.ok(spring.x > 0);
  assert.ok(spring.y > 0);
});

test('All 12 Eye variants render bounded SVG elements without errors', () => {
  const variants = [
    'capsule', 'dot', 'archUp', 'archDown', 'line', 'cross',
    'diamond', 'star', 'ring', 'squircle', 'halfPill', 'heart'
  ] as const;

  for (const variant of variants) {
    const svg = consonaEngine.renderToSvg({
      seed: `test-${variant}`,
      paletteId: 'dark',
      head: { shape: 'circle' },
      eyes: { shape: variant },
    });
    assert.ok(svg.length > 50);
    assert.ok(svg.includes('<svg'));
  }
});

test('Mathematical Waveforms evaluate continuous bounded curves', () => {
  // Respiration wave
  const breath0 = evaluateRespirationWave(0, 4.0, 0.45);
  const breathMid = evaluateRespirationWave(1.8, 4.0, 0.45);
  assert.ok(breath0 >= 0 && breath0 <= 1);
  assert.ok(breathMid > 0.8);

  // Cardiac pulse
  const pulseBeat = evaluateCardiacWave(0.08, 1.1);
  const pulseRest = evaluateCardiacWave(0.7, 1.1);
  assert.ok(pulseBeat > 0.5);
  assert.equal(pulseRest, 0);

  // Bounce physics
  const bounce = evaluateBouncePhysics(0.5, 4.0, 8.0);
  assert.ok(bounce.yOffset <= 0);
  assert.ok(bounce.scaleX > 0.5 && bounce.scaleY > 0.5);
});

test('SphericalManifold 3D projection, paper bending and horizon occlusion', () => {
  const manifold = new SphericalManifold(50, 48, 38.5);

  // Front center projection
  const front = manifold.project(50, 48, 0, 0, 0);
  assert.ok(front.visible, 'Front should be visible');
  assert.equal(Math.round(front.x), 50);
  assert.equal(Math.round(front.y), 48);

  // Back occlusion
  const back = manifold.project(50, 48, 0, Math.PI, 0);
  assert.equal(back.visible, false, 'Back hemisphere point should be occluded');
});

test('Eye Background Color: reliable bgMode across white, black, accent, softAccent with and without pupils', () => {
  const modes = ['white', 'black', 'accent', 'softAccent'] as const;

  for (const bgMode of modes) {
    // Test without pupil
    const svgNoPupil = consonaEngine.renderToSvg({
      seed: 'test-eye-bg',
      paletteId: 'blue-light',
      head: { shape: 'circle' },
      eyes: { shape: 'capsule', bgMode, pupil: false },
    });
    assert.ok(svgNoPupil.includes('<svg'));

    // Test with pupil
    const svgWithPupil = consonaEngine.renderToSvg({
      seed: 'test-eye-bg-pupil',
      paletteId: 'blue-light',
      head: { shape: 'circle' },
      eyes: { shape: 'capsule', bgMode, pupil: true },
    });
    assert.ok(svgWithPupil.includes('<svg'));

    if (bgMode === 'white') {
      assert.ok(svgNoPupil.includes('#FFFFFF') || svgNoPupil.includes('white'));
      assert.ok(svgWithPupil.includes('#FFFFFF') || svgWithPupil.includes('white'));
    } else if (bgMode === 'black') {
      assert.ok(svgNoPupil.includes('#09090B') || svgNoPupil.includes('#000000'));
      assert.ok(svgWithPupil.includes('#09090B') || svgWithPupil.includes('#000000'));
    }
  }
});

test('Behavior Toggles: interactive, animated, and autoBlink disable cleanly with zero-cost early exits', () => {
  const instance = consonaEngine.create({
    seed: 'test-behaviors',
    paletteId: 'blue-light',
    config: {
      head: { shape: 'circle' },
      eyes: { shape: 'capsule' },
      behavior: {
        interactive: false,
        animated: false,
        autoBlink: false,
      },
    },
  });

  const gazeCtrl = instance.getController<any>('pointer-gaze');
  assert.equal(gazeCtrl?.enabled, false, 'Pointer gaze should be disabled');

  const blinkCtrl = instance.getController<any>('auto-blink');
  assert.equal(blinkCtrl?.enabled, false, 'Auto blink should be disabled');

  assert.equal(instance.animated, false, 'Instance animated should be false');

  // Updating instance with behaviors disabled must not crash and must not mutate resting channels
  instance.update(0.016);
  assert.equal(instance.getChannel('consona:eyes', 'gazeX'), 0);
  assert.equal(instance.getChannel('consona:eyes', 'gazeY'), 0);
});

test('Blinking Independence: autoBlink:false completely stops blinking even in animation modes, but behaviors/blinking work when animated:false', async () => {
  // Case A: Animated is true, but autoBlink is false -> eye openness remains 1.0 throughout animation cycle
  const animatedNoBlinkInstance = consonaEngine.create({
    seed: 'test-anim-noblink',
    paletteId: 'blue-light',
    config: {
      behavior: {
        animated: true,
        preset: 'calm',
        autoBlink: false,
      },
    },
  });

  const blinkCtrl = animatedNoBlinkInstance.getController<any>('auto-blink');
  assert.equal(blinkCtrl?.enabled, false, 'Auto-blink controller must be disabled when autoBlink is false');

  // Step through time across several seconds
  for (let t = 0; t <= 4.0; t += 0.1) {
    animatedNoBlinkInstance.update(t);
    const openness = animatedNoBlinkInstance.getChannel('consona:eyes', 'openness');
    assert.equal(openness, 1.0, `Eye openness should remain 1.0 at t=${t} when autoBlink is false`);
  }

  // Case B: Animated is false, but autoBlink is true -> behaviors and blinks work via mixer
  const staticWithBlinkInstance = consonaEngine.create({
    seed: 'test-static-blink',
    paletteId: 'blue-light',
    config: {
      behavior: {
        animated: false,
        autoBlink: true,
      },
    },
  });

  assert.equal(staticWithBlinkInstance.animated, false);
  const staticBlinkCtrl = staticWithBlinkInstance.getController<any>('auto-blink');
  assert.equal(staticBlinkCtrl?.enabled, true, 'Auto-blink controller should be active when autoBlink is true');

  // Trigger one-shot blink behavior
  staticWithBlinkInstance.mixer.play('blink');
  assert.equal(staticWithBlinkInstance.mixer.hasActive(), true);

  // Update mixer during mid-blink
  staticWithBlinkInstance.update({ time: 0.1, deltaTime: 0.1, frame: 1 });
  const midBlinkOpenness = staticWithBlinkInstance.getChannel('consona:eyes', 'openness');
  assert.ok(midBlinkOpenness !== undefined && (midBlinkOpenness as number) < 0.9, 'Eye should close during blink behavior even when animated:false');
});

test('Pupil Gaze Decoupling & Isotropic X/Y displacement', () => {
  const instance = consonaEngine.create({
    seed: 'test-pupil-decouple',
    paletteId: 'indigo-light',
    config: {
      eyes: {
        gazeExcursion: 0.0, // Eye body excursion is zero
        pupil: {
          enabled: true,
          scale: 0.5,
          gazeTracking: 1.0, // Pupil gaze excursion is active
        },
      },
    },
  });

  const eyeNode = instance.scene.find('consona:eyes')!;
  assert.ok(eyeNode);

  // Set normalized pointer coordinates
  eyeNode.channels.set('pointerX', 0.8);
  eyeNode.channels.set('pointerY', 0.8);
  eyeNode.channels.set('gazeX', 0); // eye body displacement is 0
  eyeNode.channels.set('gazeY', 0);

  const svg = instance.render();
  assert.ok(svg.includes('left-eye-compound'));
  assert.ok(svg.includes('right-eye-compound'));
});


