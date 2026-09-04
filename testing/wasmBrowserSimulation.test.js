import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    advanceSimulationWorldMutable,
    launchSimulationPenguinMutable,
    stepSimulationMutable
} from '../js/simulation/simulationEngine.js';
import { cloneSimulationState, createSimulationStateFromLevel } from '../js/simulation/simulationState.js';
import { captureGameSimulationState } from '../js/runtime/gameSimulationAdapter.js';
import {
    activeSimulationBackend,
    initializeWasmSimulation,
    stepSimulationSliceWasmMutable
} from '../js/simulation/wasmSimulationBridge.js';

function parityLevel() {
    return {
        name: 'Browser Wasm parity',
        startPosition: { x: 0, y: 300 },
        targetPosition: { x: 700, y: 300 },
        objects: [
            { type: 'slingshot', position: { x: 0, y: 300 }, properties: { velocityMultiplier: 15 } },
            { type: 'speedbooster', position: { x: 100, y: 300 }, properties: {
                id: 'boost', rotation: 0, speedMultiplier: 1.25
            } },
            { type: 'portal', position: { x: 250, y: 300 }, properties: {
                id: 'a', pairedPortalId: 'b', color: 'red', rotation: 270
            } },
            { type: 'portal', position: { x: 450, y: 300 }, properties: {
                id: 'b', pairedPortalId: 'a', color: 'blue', rotation: 90
            } },
            { type: 'bonus', position: { x: 575, y: 300 }, properties: { id: 'bonus', value: 250 } },
            { type: 'target', position: { x: 700, y: 300 }, properties: { width: 80, height: 80 } }
        ],
        rules: { gravitationalConstant: 0, requiredBonuses: 1 }
    };
}

function assertPointClose(actual, expected, message) {
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9, `${message} x`);
    assert.ok(Math.abs(actual.y - expected.y) < 1e-9, `${message} y`);
}

test('browser Wasm slice matches the JavaScript transition kernel', async () => {
    const bytes = await readFile(new URL('../rust/simulator/pkg/spaced_penguin_simulator.wasm', import.meta.url));
    await initializeWasmSimulation(bytes);
    assert.equal(activeSimulationBackend(), 'wasm');

    const initial = createSimulationStateFromLevel(parityLevel());
    launchSimulationPenguinMutable(initial, 0, 100);
    const javascript = cloneSimulationState(initial);
    const wasm = cloneSimulationState(initial);

    for (let step = 0; step < 120 && javascript.penguin.state === 'soaring'; step++) {
        const expected = stepSimulationMutable(javascript, 1 / 60);
        advanceSimulationWorldMutable(wasm, 1 / 60);
        const actual = stepSimulationSliceWasmMutable(wasm, 1 / 60, false);
        assert.deepEqual(actual.events, expected.events, `events at step ${step}`);
        assert.deepEqual(wasm.penguin, javascript.penguin, `penguin at step ${step}`);
        assert.deepEqual(wasm.counters, javascript.counters, `counters at step ${step}`);
        assert.deepEqual(
            wasm.bonuses.map(bonus => bonus.collected),
            javascript.bonuses.map(bonus => bonus.collected),
            `bonuses at step ${step}`
        );
    }
    assert.equal(wasm.penguin.state, 'hitTarget');
});

test('browser Wasm slice preserves collision, crash, and rule events', async () => {
    const state = createSimulationStateFromLevel({
        name: 'Collision rule parity',
        startPosition: { x: 100, y: 100 },
        targetPosition: { x: 700, y: 300 },
        objects: [
            { type: 'slingshot', position: { x: 100, y: 100 }, properties: {} },
            { type: 'planet', position: { x: 100, y: 100 }, properties: {
                id: 'planet', radius: 30, mass: 0, gravitationalReach: 5000
            } },
            { type: 'target', position: { x: 700, y: 300 }, properties: {} }
        ],
        rules: { allowedMisses: 0 }
    });
    state.penguin.state = 'soaring';
    const javascript = cloneSimulationState(state);
    const wasm = cloneSimulationState(state);

    const expected = stepSimulationMutable(javascript, 1 / 60);
    advanceSimulationWorldMutable(wasm, 1 / 60);
    const actual = stepSimulationSliceWasmMutable(wasm, 1 / 60, false);

    assert.deepEqual(actual.events, expected.events);
    assert.deepEqual(wasm.penguin, javascript.penguin);
    assert.deepEqual(wasm.counters, javascript.counters);
});

test('browser Wasm matches one-way force-field front reflection and back passage', async () => {
    const bytes = await readFile(new URL('../rust/simulator/pkg/spaced_penguin_simulator.wasm', import.meta.url));
    await initializeWasmSimulation(bytes);
    const makeState = () => createSimulationStateFromLevel({
        name: 'Force field parity', startPosition: { x: 160, y: 100 }, targetPosition: { x: 700, y: 500 },
        objects: [
            { type: 'slingshot', position: { x: 160, y: 100 }, properties: {} },
            { type: 'onewayforcefield', position: { x: 100, y: 100 }, properties: {
                id: 'field', width: 12, height: 80, rotation: 0, restitution: 0.8, playSound: false
            } },
            { type: 'target', position: { x: 700, y: 500 }, properties: {} }
        ], rules: { gravitationalConstant: 0 }
    });

    for (const [position, velocity] of [
        [{ x: 160, y: 100 }, { x: -3000, y: 0 }],
        [{ x: 40, y: 100 }, { x: 3000, y: 0 }]
    ]) {
        const initial = makeState();
        initial.penguin.position = position;
        initial.penguin.velocity = velocity;
        initial.penguin.state = 'soaring';
        const javascript = cloneSimulationState(initial);
        const wasm = cloneSimulationState(initial);
        const expected = stepSimulationMutable(javascript, 1 / 60);
        advanceSimulationWorldMutable(wasm, 1 / 60);
        const actual = stepSimulationSliceWasmMutable(wasm, 1 / 60, false);
        assert.deepEqual(actual.events, expected.events);
        assert.deepEqual(wasm.penguin, javascript.penguin);
    }
});

test('browser Wasm slice preserves collidable planets captured from runtime objects', async () => {
    const bytes = await readFile(new URL('../rust/simulator/pkg/spaced_penguin_simulator.wasm', import.meta.url));
    await initializeWasmSimulation(bytes);
    const game = {
        simulationTime: 0,
        runTick: 0,
        penguin: { x: 100, y: 100, vx: 0, vy: 0, radius: 8, state: 'soaring', crashedFrameCount: 0 },
        planets: [{
            position: { x: 100, y: 100 },
            radius: 30,
            collisionRadius: 38,
            mass: 0,
            gravitationalReach: 5000,
            orbitSystem: null
        }],
        bonuses: [],
        portals: [],
        speedBoosters: [],
        deflectorBumpers: [],
        target: { position: { x: 700, y: 300 }, width: 50, height: 50, orbitSystem: null },
        slingshot: { anchor: { x: 100, y: 100 }, launchModel: 'modern', velocityMultiplier: 10, maxPullback: 100, minPullback: 0 },
        stageRect: { x: 0, y: 0, width: 800, height: 600 },
        flightRect: { x: 0, y: 0, width: 800, height: 600 },
        levelRules: { allowedMisses: 0 },
        physics: { gravitationalConstant: 3 },
        tries: 0,
        planetCollisions: 0,
        currentAttemptScore: 0,
        distance: 0
    };
    const state = captureGameSimulationState(game);
    assert.equal(state.planets[0].collidable, true);

    const result = stepSimulationSliceWasmMutable(state, 1 / 60, false);
    assert.equal(result.events.some(event => event.type === 'planet_collision'), true);
    assert.equal(state.penguin.state, 'crashed');
    assert.equal(state.counters.planetCollisions, 1);
});

test('browser Wasm slice matches swept planet collision on fast trajectories', async () => {
    const state = createSimulationStateFromLevel({
        name: 'Swept planet parity',
        startPosition: { x: 0, y: 100 },
        targetPosition: { x: 700, y: 300 },
        objects: [
            { type: 'slingshot', position: { x: 0, y: 100 }, properties: {} },
            { type: 'planet', position: { x: 100, y: 100 }, properties: {
                id: 'planet', radius: 30, mass: 0, gravitationalReach: 0
            } },
            { type: 'target', position: { x: 700, y: 300 }, properties: {} }
        ]
    });
    state.penguin.state = 'soaring';
    state.penguin.velocity = { x: 12000, y: 0 };
    const javascript = cloneSimulationState(state);
    const wasm = cloneSimulationState(state);

    const expected = stepSimulationMutable(javascript, 1 / 60);
    advanceSimulationWorldMutable(wasm, 1 / 60);
    const actual = stepSimulationSliceWasmMutable(wasm, 1 / 60, false);

    assert.deepEqual(actual.events, expected.events);
    assert.equal(wasm.penguin.state, 'crashed');
    assert.equal(wasm.counters.planetCollisions, 1);
    assertPointClose(wasm.penguin.position, javascript.penguin.position, 'swept planet position');
    assertPointClose(wasm.penguin.velocity, javascript.penguin.velocity, 'swept planet velocity');
});

test('browser Wasm slice matches swept deflector reflection', async () => {
    const state = createSimulationStateFromLevel({
        name: 'Deflector parity',
        startPosition: { x: 0, y: 0 },
        targetPosition: { x: 700, y: 300 },
        objects: [
            { type: 'slingshot', position: { x: 0, y: 0 }, properties: {} },
            { type: 'deflectorbumper', position: { x: 50, y: 20 }, properties: {
                id: 'bumper', radius: 10, restitution: 1.25, playSound: false
            } },
            { type: 'target', position: { x: 700, y: 300 }, properties: {} }
        ],
        rules: { gravitationalConstant: 0 }
    });
    state.penguin.state = 'soaring';
    state.penguin.velocity = { x: 3000, y: 0 };
    const javascript = cloneSimulationState(state);
    const wasm = cloneSimulationState(state);

    const expected = stepSimulationMutable(javascript, 1 / 60);
    advanceSimulationWorldMutable(wasm, 1 / 60);
    const actual = stepSimulationSliceWasmMutable(wasm, 1 / 60, false);

    assert.deepEqual(actual.events.map(event => event.type), expected.events.map(event => event.type));
    const actualBounce = actual.events.find(event => event.type === 'deflector_bounced');
    const expectedBounce = expected.events.find(event => event.type === 'deflector_bounced');
    assert.equal(actualBounce.deflectorBumperId, expectedBounce.deflectorBumperId);
    assert.equal(actualBounce.deflectorBumperIndex, expectedBounce.deflectorBumperIndex);
    assert.equal(actualBounce.playSound, expectedBounce.playSound);
    for (const key of ['position', 'normal', 'incomingVelocity', 'velocity']) {
        assertPointClose(actualBounce[key], expectedBounce[key], `deflector ${key}`);
    }
    assert.equal(wasm.penguin.state, javascript.penguin.state);
    assertPointClose(wasm.penguin.position, javascript.penguin.position, 'deflector position');
    assertPointClose(wasm.penguin.velocity, javascript.penguin.velocity, 'deflector velocity');
    assert.ok(Math.abs(wasm.counters.distance - javascript.counters.distance) < 1e-9);
});

test('browser Wasm composes with the shared moving-world transition', async () => {
    const state = createSimulationStateFromLevel({
        name: 'Orbit parity',
        startPosition: { x: 50, y: 50 },
        targetPosition: { x: 750, y: 550 },
        objects: [
            { type: 'slingshot', position: { x: 50, y: 50 }, properties: {} },
            { type: 'planet', position: { x: 500, y: 300 }, properties: {
                id: 'moving', mass: 100, gravitationalReach: 5000,
                orbit: { orbitCenter: { x: 400, y: 300 }, orbitRadius: 100, orbitSpeed: 0.5 }
            } },
            { type: 'target', position: { x: 750, y: 550 }, properties: {} }
        ],
        rules: {}
    });
    state.penguin.position = { x: 100, y: 100 };
    state.penguin.velocity = { x: 80, y: 10 };
    state.penguin.state = 'soaring';
    const javascript = cloneSimulationState(state);
    const wasm = cloneSimulationState(state);

    for (let step = 0; step < 60 && javascript.penguin.state === 'soaring'; step++) {
        const expected = stepSimulationMutable(javascript, 1 / 60);
        advanceSimulationWorldMutable(wasm, 1 / 60);
        const actual = stepSimulationSliceWasmMutable(wasm, 1 / 60, false);
        assert.deepEqual(
            actual.events.map(event => event.type),
            expected.events.map(event => event.type),
            `event types at orbit step ${step}`
        );
        assert.equal(wasm.penguin.state, javascript.penguin.state, `state at orbit step ${step}`);
        assertPointClose(wasm.penguin.position, javascript.penguin.position, `position at orbit step ${step}`);
        assertPointClose(wasm.penguin.velocity, javascript.penguin.velocity, `velocity at orbit step ${step}`);
        assert.deepEqual(wasm.planets, javascript.planets, `world at orbit step ${step}`);
    }
});
