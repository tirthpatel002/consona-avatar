import { defineAnimation } from '../../../core/define/defineAnimation.ts';

export const consonaLookawayAnimation = defineAnimation({
  name: 'lookaway',
  duration: 1.25,
  loop: false,
  evaluate: (time: number) => {
    const p = Math.max(0, Math.min(1.0, time / 1.25));
    const smoothEnvelope = Math.sin(p * Math.PI);

    // 4-phase smooth cognitive focal sequence: Top-Left -> Top-Center -> Top-Right -> Center
    const u = p * 4.0;
    const WAYPOINTS = [
      { x: -0.90, y: -1.00 }, // 0: Wide Top-Left
      { x: 0.00, y: -1.08 },  // 1: Wide Top-Center
      { x: 0.90, y: -1.00 },  // 2: Wide Top-Right
      { x: 0.00, y: 0.05 },   // 3: Center
    ];

    const idx = Math.min(3, Math.floor(u));
    const frac = u - idx;

    const p0 = WAYPOINTS[(idx - 1 + 4) % 4]!;
    const p1 = WAYPOINTS[idx]!;
    const p2 = WAYPOINTS[(idx + 1) % 4]!;
    const p3 = WAYPOINTS[(idx + 2) % 4]!;

    const f = frac;
    const f2 = f * f;
    const f3 = f2 * f;

    const rawGazeX = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * f +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * f2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * f3
    );

    const rawGazeY = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * f +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * f2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * f3
    );

    const gazeX = rawGazeX * smoothEnvelope;
    const gazeY = rawGazeY * smoothEnvelope;
    const topElevation = Math.max(0, -gazeY);

    const tiltDeg = gazeX * 14.0;
    const targetWidthScale = 1.0 + topElevation * 0.22 + Math.abs(rawGazeX) * 0.08;
    const targetHeightScale = 1.0 - topElevation * 0.35;
    const targetOpenness = 1.0 - topElevation * 0.32;

    const eyeWidthScale = 1.0 + (targetWidthScale - 1.0) * smoothEnvelope;
    const eyeHeightScale = 1.0 + (targetHeightScale - 1.0) * smoothEnvelope;
    const eyeOpenness = 1.0 + (targetOpenness - 1.0) * smoothEnvelope;

    return {
      'consona:headGroup': {
        rotateZ: (tiltDeg * 0.85 * Math.PI) / 180,
        xOffset: gazeX * 5.2,
        yOffset: gazeY * 3.4,
      },
      'consona:head': {
        scaleX: 1.0 - topElevation * 0.03 * smoothEnvelope,
        scaleY: 1.0 + topElevation * 0.04 * smoothEnvelope,
      },
      'consona:eyes': {
        rotateZ: (tiltDeg * Math.PI) / 180,
        xOffset: gazeX * 9.5,
        yOffset: gazeY * 6.8,
        scaleX: eyeWidthScale,
        scaleY: eyeHeightScale,
        openness: Math.max(0.25, eyeOpenness),
        gazeX: gazeX * 12,
        gazeY: gazeY * 12,
      },
    };
  },
});
