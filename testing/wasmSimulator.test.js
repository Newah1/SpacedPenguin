import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { HeadlessGameEngine } from './headlessEngine.js';

const candidates = [
    { candidateIndex: 0, angle: 315, power: 100 },
    { candidateIndex: 1, angle: 280, power: 60 },
    { candidateIndex: 2, angle: 120, power: 60 },
    { candidateIndex: 3, angle: 80, power: 60 },
    { candidateIndex: 4, angle: 0, power: 10 }
];

function close(actual, expected, message) {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
}

test('Rust/Wasm headless batch preserves JavaScript outcomes and trajectories', async () => {
    const level = JSON.parse(await readFile(new URL('../levels/level10.json', import.meta.url), 'utf8'));
    const javascript = new HeadlessGameEngine();
    const wasm = new HeadlessGameEngine();
    javascript.loadLevel(level);
    wasm.loadLevel(level);

    const expected = candidates.map(candidate => ({
        candidateIndex: candidate.candidateIndex,
        ...javascript.simulateTrajectory(candidate.angle, candidate.power, 5)
    }));
    const successes = await wasm.simulateCandidatesWasm(candidates, 5, {
        nearMissLimit: candidates.length,
        preserveCandidateIndex: true
    });
    const actual = [...successes, ...wasm.lastNearMisses]
        .sort((left, right) => left.candidateIndex - right.candidateIndex);

    assert.equal(actual.length, expected.length);
    for (let index = 0; index < expected.length; index++) {
        const left = actual[index];
        const right = expected[index];
        assert.equal(left.success, right.success);
        assert.equal(left.reason, right.reason);
        assert.equal(left.steps, right.steps);
        assert.deepEqual(left.collectedBonuses, right.collectedBonuses);
        assert.deepEqual(left.events.map(event => event.type), right.events.map(event => event.type));
        close(left.finalPosition.x, right.finalPosition.x, `candidate ${index} final x`);
        close(left.finalPosition.y, right.finalPosition.y, `candidate ${index} final y`);
        close(left.distance, right.distance, `candidate ${index} distance`);
        close(left.targetDistance, right.targetDistance, `candidate ${index} target distance`);
        assert.equal(left.trajectory.length, right.trajectory.length);
        for (let point = 0; point < right.trajectory.length; point++) {
            close(left.trajectory[point].x, right.trajectory[point].x, `candidate ${index} trajectory ${point} x`);
            close(left.trajectory[point].y, right.trajectory[point].y, `candidate ${index} trajectory ${point} y`);
        }
    }
});

test('Rust/Wasm terminal summaries agree across every shipped level', async () => {
    const sample = candidates.slice(0, 3);
    for (let levelNumber = 1; levelNumber <= 25; levelNumber++) {
        const filename = `../levels/level${String(levelNumber).padStart(2, '0')}.json`;
        const level = JSON.parse(await readFile(new URL(filename, import.meta.url), 'utf8'));
        const javascript = new HeadlessGameEngine();
        const wasm = new HeadlessGameEngine();
        javascript.loadLevel(level);
        wasm.loadLevel(level);

        const expected = sample.map(candidate => ({
            candidateIndex: candidate.candidateIndex,
            ...javascript.simulateTrajectory(candidate.angle, candidate.power, 3)
        }));
        const successes = await wasm.simulateCandidatesWasm(sample, 3, {
            nearMissLimit: sample.length,
            preserveCandidateIndex: true
        });
        const actual = [...successes, ...wasm.lastNearMisses]
            .sort((left, right) => left.candidateIndex - right.candidateIndex);

        assert.equal(actual.length, expected.length, `level ${levelNumber} result count`);
        for (let index = 0; index < expected.length; index++) {
            assert.equal(actual[index].success, expected[index].success, `level ${levelNumber} success`);
            assert.equal(actual[index].reason, expected[index].reason, `level ${levelNumber} reason`);
            assert.equal(actual[index].steps, expected[index].steps, `level ${levelNumber} steps`);
            assert.deepEqual(
                actual[index].collectedBonuses,
                expected[index].collectedBonuses,
                `level ${levelNumber} bonuses`
            );
            close(actual[index].finalPosition.x, expected[index].finalPosition.x, `level ${levelNumber} final x`);
            close(actual[index].finalPosition.y, expected[index].finalPosition.y, `level ${levelNumber} final y`);
            close(actual[index].distance, expected[index].distance, `level ${levelNumber} distance`);
        }
    }
});

test('Rust/Wasm preserves speed-booster, portal, and deflector transitions', async () => {
    const level = {
        name: 'Wasm interactive-object parity fixture',
        startPosition: { x: 0, y: 0 },
        targetPosition: { x: 700, y: 300 },
        objects: [
            { type: 'slingshot', position: { x: 0, y: 300 }, properties: { velocityMultiplier: 15 } },
            { type: 'speedbooster', position: { x: 100, y: 300 }, properties: {
                id: 'boost', width: 64, height: 32, rotation: 0, speedMultiplier: 1.5
            } },
            { type: 'portal', position: { x: 250, y: 300 }, properties: {
                id: 'a', pairedPortalId: 'b', color: 'red', rotation: 270
            } },
            { type: 'portal', position: { x: 450, y: 300 }, properties: {
                id: 'b', pairedPortalId: 'a', color: 'blue', rotation: 90
            } },
            { type: 'deflectorbumper', position: { x: 600, y: 300 }, properties: {
                id: 'bumper', radius: 24, restitution: 1.1, playSound: false
            } },
            { type: 'target', position: { x: 700, y: 300 }, properties: { width: 80, height: 80 } }
        ],
        rules: { gravitationalConstant: 0 }
    };
    const javascript = new HeadlessGameEngine();
    const wasm = new HeadlessGameEngine();
    javascript.loadLevel(level);
    wasm.loadLevel(level);

    const expected = javascript.simulateTrajectory(0, 100, 3);
    const actual = await wasm.simulateTrajectoryWasm(0, 100, 3);

    assert.equal(actual.success, expected.success);
    assert.equal(actual.reason, expected.reason);
    assert.equal(actual.steps, expected.steps);
    assert.deepEqual(actual.events.map(event => event.type), expected.events.map(event => event.type));
    const expectedBooster = expected.events.find(event => event.type === 'speed_booster_activated');
    const actualBooster = actual.events.find(event => event.type === 'speed_booster_activated');
    const expectedPortal = expected.events.find(event => event.type === 'portal_teleported');
    const actualPortal = actual.events.find(event => event.type === 'portal_teleported');
    const expectedDeflector = expected.events.find(event => event.type === 'deflector_bounced');
    const actualDeflector = actual.events.find(event => event.type === 'deflector_bounced');
    assert.deepEqual(actualBooster, expectedBooster);
    assert.deepEqual(actualPortal, expectedPortal);
    assert.deepEqual(actualDeflector, expectedDeflector);
    close(actual.finalPosition.x, expected.finalPosition.x, 'interactive final x');
    close(actual.finalPosition.y, expected.finalPosition.y, 'interactive final y');
    close(actual.distance, expected.distance, 'interactive distance');
});
