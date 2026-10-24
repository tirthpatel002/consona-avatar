import { test } from 'node:test';
import assert from 'node:assert';
import { consonaEngine } from '../src/avatars/consona/sdk/ConsonaEngine.ts';
import { playConsonaClip } from '../src/avatars/consona/sdk/consonaClips.ts';
import { getPreset } from '../src/core/preset/presets.ts';
import {
  consonaJumpAnimation,
  consonaBounceAnimation,
  consonaSpinAnimation,
  consonaNodAnimation,
  consonaShakeAnimation,
  consonaLookawayAnimation,
  consonaSurpriseAnimation,
  consonaPulseAnimation,
  consonaWaveAnimation,
  consonaWinkAnimation,
  consonaBlinkAnimation,
} from '../src/avatars/consona/animations/index.ts';

test('Unified Animations: All one-shot Consona animations are defined with non-looping evaluation', () => {
  const oneShotAnimations = [
    consonaJumpAnimation,
    consonaBounceAnimation,
    consonaSpinAnimation,
    consonaNodAnimation,
    consonaShakeAnimation,
    consonaLookawayAnimation,
    consonaSurpriseAnimation,
    consonaPulseAnimation,
    consonaWaveAnimation,
    consonaWinkAnimation,
    consonaBlinkAnimation,
  ];

  for (const anim of oneShotAnimations) {
    assert.ok(anim.name, `Animation should have name`);
    assert.ok(anim.duration > 0, `${anim.name} should have positive duration`);
    assert.strictEqual(anim.loop, false, `${anim.name} should have loop: false`);
    assert.ok((anim.tracks && anim.tracks.length > 0) || typeof anim.evaluate === 'function', `${anim.name} should have tracks or evaluator`);

    // Verify evaluator produces non-empty channel deltas
    if (anim.evaluate) {
      const midDeltas = anim.evaluate(anim.duration * 0.5, 0.016);
      assert.ok(midDeltas && Object.keys(midDeltas).length > 0, `${anim.name} should produce deltas at midpoint`);
    }
  }
});

test('Unified Animations: One-shot behaviors apply deltas to scene nodes and finish cleanly', async () => {
  const instance = consonaEngine.create({ seed: 'Behavior-Verification-01' });

  const behaviorsToTest = ['bounce', 'jump', 'nod', 'shake', 'lookaway', 'surprise', 'pulse', 'wave', 'wink', 'blink', 'spin'];

  for (const behaviorName of behaviorsToTest) {
    const anim = instance.mixer.get(behaviorName);
    assert.ok(anim, `Behavior "${behaviorName}" must be registered in mixer`);
    assert.strictEqual(anim.loop, false, `Behavior "${behaviorName}" must be loop: false`);

    // Play behavior
    const playPromise = playConsonaClip(instance, behaviorName, { speed: 50.0 });
    assert.ok(instance.mixer.hasActive(), `Mixer should have active instance while playing "${behaviorName}"`);

    // Step mixer forward to verify channels update
    instance.update({ time: 0.1, deltaTime: 0.016, frame: 1 });

    await playPromise;

    // Advance mixer past duration to trigger pruning
    instance.update({ time: 2.0, deltaTime: 0.1, frame: 2 });
    assert.strictEqual(instance.mixer.isPlaying(behaviorName), false, `Behavior "${behaviorName}" should not be playing after completion`);
  }

  consonaEngine.core.destroyInstance(instance.id);
});

test('Unified Animations: Cardiac pulse behavior vs double-pulse preset separation', () => {
  const instance = consonaEngine.create({ seed: 'Pulse-Separation-Test' });

  const oneShotPulse = instance.mixer.get('pulse');
  const heartbeat = getPreset('double-pulse', 'consona');

  assert.ok(oneShotPulse, 'One-shot pulse must be registered');
  assert.strictEqual(oneShotPulse.loop, false, 'One-shot pulse must have loop: false');
  assert.strictEqual(oneShotPulse.duration, 0.62, 'One-shot pulse duration is 0.62s');

  // the former pulse loop is a preset now (periodic modulation), not a mixer clip
  assert.strictEqual(instance.mixer.get('pulseLoop'), undefined, 'no ambient loop clips in the mixer');
  assert.ok(heartbeat?.cycles, 'heartbeat preset is registered');
  const cycle = Object.values(heartbeat!.cycles!)[0]!;
  assert.strictEqual(cycle.period, 1.1, 'heartbeat period is the former loop duration (1.1s)');

  consonaEngine.core.destroyInstance(instance.id);
});
