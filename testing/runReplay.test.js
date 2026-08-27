import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateCommunityScore } from '../js/replay/communityScore.js';
import {
    launchSimulationPenguinMutable,
    SimulationEventType,
    stepSimulationTickMutable
} from '../js/simulation/simulationEngine.js';
import { createSimulationStateFromLevel } from '../js/simulation/simulationState.js';
import { replayRun } from '../js/replay/runReplay.js';
import {
    PROOF_VERSION,
    RunTranscriptError,
    RunTranscriptRecorder,
    SIMULATION_VERSION,
    validateRunTranscript
} from '../js/replay/runTranscript.js';

function simpleLevel(overrides = {}) {
    return {
        name: 'Proof fixture',
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
                properties: { width: 60, height: 60, ...(overrides.targetProperties || {}) }
            },
            ...(overrides.objects || [])
        ],
        rules: { scoreMultiplier: 1, ...(overrides.rules || {}) }
    };
}

function proof(actions) {
    return { proofVersion: PROOF_VERSION, simulationVersion: SIMULATION_VERSION, actions };
}

test('versioned transcripts reject unknown, unordered, non-finite, and excessive actions', () => {
    assert.equal(validateRunTranscript({ ...proof([{ tick: 0, type: 'launch', angle: 0, power: 50 }]), forged: true }).errors[0].code, 'UNKNOWN_FIELD');
    assert.equal(validateRunTranscript(proof([
        { tick: 2, type: 'launch', angle: 0, power: 50 },
        { tick: 2, type: 'retry' }
    ])).errors[0].code, 'UNORDERED_ACTIONS');
    assert.equal(validateRunTranscript(proof([
        { tick: 0, type: 'launch', angle: Number.NaN, power: 50 }
    ])).errors[0].code, 'INVALID_LAUNCH_ANGLE');
    assert.equal(validateRunTranscript(proof(Array.from({ length: 21 }, (_, index) => ({
        tick: index,
        type: index % 2 ? 'retry' : 'launch',
        ...(index % 2 ? {} : { angle: 0, power: 50 })
    })))).errors[0].code, 'TOO_MANY_ACTIONS');
});

test('recorder freezes an immutable normalized transcript', () => {
    const recorder = new RunTranscriptRecorder();
    recorder.recordLaunch(0, 0, 50).recordRetry(5);
    const transcript = recorder.freeze();

    assert.equal(Object.isFrozen(transcript), true);
    assert.equal(Object.isFrozen(transcript.actions), true);
    assert.throws(() => recorder.recordLaunch(6, 0, 50), error => error.code === 'TRANSCRIPT_FROZEN');
});

test('recorder canonicalizes floating-point noise at maximum launch power', () => {
    const recorder = new RunTranscriptRecorder();
    recorder.recordLaunch(0, 213.3685795892742, 100.00000000000001);

    assert.equal(recorder.freeze().actions[0].power, 100);
    assert.throws(
        () => new RunTranscriptRecorder().recordLaunch(0, 0, 100.001),
        error => error instanceof RunTranscriptError && error.code === 'INVALID_LAUNCH_POWER'
    );
});

test('replay reaches the target and exactly matches direct fixed-tick execution', () => {
    const level = simpleLevel();
    const transcript = proof([{ tick: 0, type: 'launch', angle: 0, power: 50 }]);
    const replay = replayRun(level, transcript);

    const direct = createSimulationStateFromLevel(level);
    launchSimulationPenguinMutable(direct, 0, 50);
    let hit = null;
    while (!hit) {
        const result = stepSimulationTickMutable(direct, { emitMovementEvents: false });
        hit = result.events.find(event => event.type === SimulationEventType.TARGET_HIT);
    }

    assert.equal(replay.success, true);
    assert.equal(replay.reason, 'target_hit');
    assert.deepEqual(replay.state, direct);
    assert.equal(replay.score.score, Math.floor(replay.state.counters.distance));
});

test('manual retry resets the attempt while preserving run tick and aggregate tries', () => {
    const replay = replayRun(simpleLevel(), proof([
        { tick: 0, type: 'launch', angle: 90, power: 50 },
        { tick: 5, type: 'retry' },
        { tick: 6, type: 'launch', angle: 0, power: 50 }
    ]));

    assert.equal(replay.success, true);
    assert.equal(replay.state.counters.tries, 2);
    assert.ok(replay.runTick > 6);
    assert.ok(replay.state.counters.distance < 400, 'failed-attempt distance must not leak into score');
});

test('planet collision performs the same immediate attempt reset as the browser', () => {
    const level = simpleLevel({
        objects: [{
            type: 'planet',
            position: { x: 0, y: 50 },
            properties: { radius: 10, collisionRadius: 20, mass: 0, gravitationalReach: 0 }
        }]
    });
    const replay = replayRun(level, proof([
        { tick: 0, type: 'launch', angle: 90, power: 50 },
        { tick: 10, type: 'launch', angle: 0, power: 50 }
    ]));

    assert.equal(replay.success, true);
    assert.equal(replay.state.counters.tries, 2);
    assert.equal(replay.state.counters.planetCollisions, 1);
    assert.equal(replay.events.some(event => event.type === SimulationEventType.PLANET_COLLISION), true);
});

test('waiting advances a moving world on the proof clock', () => {
    const level = simpleLevel({
        targetProperties: {
            orbit: {
                orbitCenter: { x: 300, y: 0 },
                orbitRadius: 100,
                orbitSpeed: 1,
                orbitAngle: 0
            }
        }
    });
    const replay = replayRun(level, proof([
        { tick: 10, type: 'launch', angle: 0, power: 0 }
    ]), { limits: { maxTotalTicks: 12 } });

    assert.equal(replay.success, false);
    assert.equal(replay.runTick, 12);
    assert.ok(Math.abs(replay.state.target.orbit.angle - 12 / 60) < 1e-12);
});

test('illegal launch power and actions after terminal outcome are rejected', () => {
    assert.throws(
        () => replayRun(simpleLevel(), proof([{ tick: 0, type: 'launch', angle: 0, power: 101 }])),
        error => error instanceof RunTranscriptError && error.code === 'INVALID_LAUNCH_POWER'
    );
    assert.throws(
        () => replayRun(simpleLevel(), proof([
            { tick: 0, type: 'launch', angle: 0, power: 50 },
            { tick: 100, type: 'retry' }
        ])),
        error => error instanceof RunTranscriptError && error.code === 'ACTION_AFTER_TERMINAL'
    );
});

test('community score is isolated and reports the authoritative breakdown', () => {
    assert.deepEqual(calculateCommunityScore({
        distance: 100.9,
        tries: 2,
        bonusScore: 25,
        multiplier: 1.5
    }), {
        scoreVersion: 1,
        score: 112,
        baseScore: 50,
        rawScore: 75,
        tries: 2,
        distance: 100.9,
        bonusScore: 25,
        multiplier: 1.5
    });
});
