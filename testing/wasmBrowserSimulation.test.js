import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    advanceSimulationWorldMutable,
    launchSimulationPenguinMutable,
    stepSimulationMutable
} from '../js/simulation/simulationEngine.js';
import { cloneSimulationState, createSimulationStateFromLevel } from '../js/simulation/simulationState.js';
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
