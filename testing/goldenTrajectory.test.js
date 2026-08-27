import assert from 'node:assert/strict';
import test from 'node:test';

import { replayRun } from '../js/replay/runReplay.js';

const level = {
    name: 'Golden straight shot',
    startPosition: { x: 0, y: 0 },
    targetPosition: { x: 300, y: 0 },
    objects: [
        {
            type: 'slingshot',
            position: { x: 0, y: 0 },
            properties: { velocityMultiplier: 8, minPullback: 10, maxPullback: 100 }
        },
        {
            type: 'target',
            position: { x: 300, y: 0 },
            properties: { width: 60, height: 60 }
        }
    ],
    rules: { scoreMultiplier: 1 }
};

const proof = {
    proofVersion: 1,
    simulationVersion: 1,
    actions: [{ tick: 0, type: 'launch', angle: 0, power: 50 }]
};

test('golden straight-shot replay preserves deterministic tick, position, distance, and score', () => {
    const replay = replayRun(level, proof);

    assert.equal(replay.success, true);
    assert.equal(replay.reason, 'target_hit');
    assert.equal(replay.runTick, 48);
    assert.equal(replay.events.at(-1).tick, 47);
    assert.equal(replay.events.at(-1).type, 'target_hit');
    assert.ok(Math.abs(replay.state.penguin.position.x - 273.29981874128873) < 1e-12);
    assert.ok(Math.abs(replay.state.penguin.position.y) < 1e-12);
    assert.ok(Math.abs(replay.state.counters.distance - 273.29981874128873) < 1e-12);
    assert.equal(replay.score.score, 273);
});
