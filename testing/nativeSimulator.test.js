import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { HeadlessGameEngine } from './headlessEngine.js';
import {
    buildNativeHeadlessExecutable,
    nativeHeadlessExecutablePath
} from './nativeHeadlessBackend.js';
import { normalizeNativeHeadlessArguments } from './nativeHeadlessCli.js';

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

function assertOutcomeParity(actual, expected, label) {
    assert.equal(actual.success, expected.success, `${label} success`);
    assert.equal(actual.reason, expected.reason, `${label} reason`);
    assert.equal(actual.steps, expected.steps, `${label} steps`);
    assert.deepEqual(actual.collectedBonuses, expected.collectedBonuses, `${label} bonuses`);
    assert.deepEqual(
        actual.events.map(event => event.type),
        expected.events.map(event => event.type),
        `${label} events`
    );
    close(actual.finalPosition.x, expected.finalPosition.x, `${label} final x`);
    close(actual.finalPosition.y, expected.finalPosition.y, `${label} final y`);
    close(actual.distance, expected.distance, `${label} distance`);
    close(actual.targetDistance, expected.targetDistance, `${label} target distance`);
    assert.equal(actual.trajectory.length, expected.trajectory.length, `${label} trajectory length`);
}

test('native npm launcher preserves named flags and repairs PowerShell positional forwarding', () => {
    assert.deepEqual(
        normalizeNativeHeadlessArguments(['--level', '.\\levels\\level10.json', '--samples', '10000']),
        ['--level', '.\\levels\\level10.json', '--samples', '10000']
    );
    assert.deepEqual(
        normalizeNativeHeadlessArguments(['.\\levels\\level10.json', '10000', '5']),
        ['--level', '.\\levels\\level10.json', '--samples', '10000', '--max-time', '5']
    );
    assert.throws(
        () => normalizeNativeHeadlessArguments(['level.json', '100', '5', 'extra']),
        /LEVEL \[SAMPLES\] \[MAX_TIME\]/
    );
});

test('native Rust headless executable is a release CLI with discoverable help', async () => {
    await buildNativeHeadlessExecutable();
    const result = spawnSync(nativeHeadlessExecutablePath(), ['--help'], {
        encoding: 'utf8',
        windowsHide: true
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Spaced Penguin native headless simulator/);
    assert.match(result.stdout, /--backend native/);
});

test('native Rust headless sweep preserves JavaScript outcomes and trajectories', async () => {
    const level = JSON.parse(await readFile(new URL('../levels/level10.json', import.meta.url), 'utf8'));
    const javascript = new HeadlessGameEngine();
    const native = new HeadlessGameEngine();
    javascript.loadLevel(level);
    native.loadLevel(level);

    const expected = candidates.map(candidate => ({
        candidateIndex: candidate.candidateIndex,
        ...javascript.simulateTrajectory(candidate.angle, candidate.power, 5)
    }));
    const successes = await native.simulateCandidatesNative(candidates, 5, {
        nearMissLimit: candidates.length,
        preserveCandidateIndex: true
    });
    const actual = [...successes, ...native.lastNearMisses]
        .sort((left, right) => left.candidateIndex - right.candidateIndex);

    assert.equal(actual.length, expected.length);
    for (let index = 0; index < expected.length; index++) {
        assertOutcomeParity(actual[index], expected[index], `candidate ${index}`);
    }
});

test('native Rust terminal summaries agree across every shipped level', async () => {
    const sample = candidates.slice(0, 3);
    for (let levelNumber = 1; levelNumber <= 25; levelNumber++) {
        const filename = `../levels/level${String(levelNumber).padStart(2, '0')}.json`;
        const level = JSON.parse(await readFile(new URL(filename, import.meta.url), 'utf8'));
        const javascript = new HeadlessGameEngine();
        const native = new HeadlessGameEngine();
        javascript.loadLevel(level);
        native.loadLevel(level);

        const expected = sample.map(candidate => ({
            candidateIndex: candidate.candidateIndex,
            ...javascript.simulateTrajectory(candidate.angle, candidate.power, 3)
        }));
        const successes = await native.simulateCandidatesNative(sample, 3, {
            nearMissLimit: sample.length,
            preserveCandidateIndex: true
        });
        const actual = [...successes, ...native.lastNearMisses]
            .sort((left, right) => left.candidateIndex - right.candidateIndex);

        assert.equal(actual.length, expected.length, `level ${levelNumber} result count`);
        for (let index = 0; index < expected.length; index++) {
            assertOutcomeParity(actual[index], expected[index], `level ${levelNumber} candidate ${index}`);
        }
    }
});

test('native Rust preserves speed-booster and portal transitions', async () => {
    const level = {
        name: 'Native interactive-object parity fixture',
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
            { type: 'target', position: { x: 700, y: 300 }, properties: { width: 80, height: 80 } }
        ],
        rules: { gravitationalConstant: 0 }
    };
    const javascript = new HeadlessGameEngine();
    const native = new HeadlessGameEngine();
    javascript.loadLevel(level);
    native.loadLevel(level);

    const expected = javascript.simulateTrajectory(0, 100, 3);
    const actual = await native.simulateTrajectoryNative(0, 100, 3);
    assertOutcomeParity(actual, expected, 'interactive fixture');
    assert.deepEqual(
        actual.events.find(event => event.type === 'speed_booster_activated'),
        expected.events.find(event => event.type === 'speed_booster_activated')
    );
    assert.deepEqual(
        actual.events.find(event => event.type === 'portal_teleported'),
        expected.events.find(event => event.type === 'portal_teleported')
    );
});
