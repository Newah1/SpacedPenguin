import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './nodeShims.js';

import LevelEditor from '../js/editor/levelEditor.js';
import { GameObjectFactory } from '../js/levels/levelLoader.js';
import { LevelObjectType } from '../js/levels/levelSchema.js';
import { validateLevelDefinition } from '../js/levels/levelValidation.js';
import { RepulsorStar } from '../js/runtime/entities/repulsorStar.js';
import { getGameObjectDefinition, listEditableRuntimeClassNames } from '../js/runtime/gameObjectRegistry.js';
import { serializeRuntimeObject } from '../js/runtime/runtimeObjectSerialization.js';
import { cloneSimulationState, createSimulationStateFromLevel } from '../js/simulation/simulationState.js';
import { advanceSimulationWorldMutable, stepSimulationMutable } from '../js/simulation/simulationEngine.js';
import { createExistingPlanetVariables } from '../js/simulation/gravitySculptor.js';
import { initializeWasmSimulation, stepSimulationSliceWasmMutable } from '../js/simulation/wasmSimulationBridge.js';

function repulsorLevel(position = { x: 300, y: 300 }) {
    return {
        name: 'Repulsor Star Test',
        startPosition: { x: 100, y: 300 },
        targetPosition: { x: 700, y: 300 },
        objects: [{
            type: 'repulsorstar',
            position,
            properties: { id: 'repulsor-1', radius: 34, strength: 500, repulsionReach: 5000 }
        }],
        rules: { gravitationalConstant: 3 }
    };
}

test('repulsor star projects positive authored strength to non-colliding negative simulation mass', () => {
    const state = createSimulationStateFromLevel(repulsorLevel());
    assert.equal(state.planets.length, 1);
    assert.equal(state.planets[0].type, LevelObjectType.REPULSOR_STAR);
    assert.equal(state.planets[0].mass, -500);
    assert.equal(state.planets[0].gravitationalReach, 5000);
    assert.equal(state.planets[0].collisionRadius, 0);
    assert.equal(state.planets[0].collidable, false);

    state.penguin.state = 'soaring';
    state.penguin.position = { x: 100, y: 300 };
    state.penguin.velocity = { x: 0, y: 0 };
    stepSimulationMutable(state, 1 / 60);

    assert.ok(state.penguin.velocity.x < 0, 'star should accelerate the penguin away from its center');
    assert.equal(state.penguin.state, 'soaring');
});

test('Rust/Wasm and JavaScript apply the same repulsor-star force', async () => {
    const bytes = await readFile(new URL('../rust/simulator/pkg/spaced_penguin_simulator.wasm', import.meta.url));
    await initializeWasmSimulation(bytes);
    const initial = createSimulationStateFromLevel(repulsorLevel());
    initial.penguin.state = 'soaring';
    initial.penguin.position = { x: 100, y: 300 };
    initial.penguin.velocity = { x: 2, y: 0 };
    const javascript = cloneSimulationState(initial);
    const wasm = cloneSimulationState(initial);

    const expected = stepSimulationMutable(javascript, 1 / 60);
    advanceSimulationWorldMutable(wasm, 1 / 60);
    const actual = stepSimulationSliceWasmMutable(wasm, 1 / 60, false);

    assert.deepEqual(actual.events, expected.events);
    assert.deepEqual(wasm.penguin, javascript.penguin);
});

test('repulsor star is editable, validates aliases, and round-trips canonical properties', () => {
    assert.equal(listEditableRuntimeClassNames({ RepulsorStar }).includes('RepulsorStar'), true);
    const descriptor = getGameObjectDefinition('repulsor');
    assert.equal(descriptor.type, LevelObjectType.REPULSOR_STAR);
    assert.deepEqual(descriptor.collections, ['planets']);
    assert.deepEqual(descriptor.properties.map(property => property.key), [
        'radius', 'strength', 'repulsionReach'
    ]);

    const aliased = repulsorLevel();
    aliased.objects[0].type = 'repulsor_star';
    assert.equal(validateLevelDefinition(aliased).valid, true);

    const object = GameObjectFactory.create(aliased.objects[0], null, null);
    assert.ok(object instanceof RepulsorStar);
    assert.equal(object.mass, -500);
    const exported = serializeRuntimeObject(object);
    assert.equal(exported.type, 'repulsorstar');
    assert.equal(exported.properties.strength, 500);
    assert.equal(exported.properties.repulsionReach, 5000);
    assert.equal('mass' in exported.properties, false);
    assert.equal('gravitationalReach' in exported.properties, false);
    assert.equal(GameObjectFactory.create(exported, null, null).mass, -500);
});

test('Gravity Sculpt leaves signed repulsor strength outside its attractive-mass search space', () => {
    const state = createSimulationStateFromLevel(repulsorLevel());
    assert.deepEqual(createExistingPlanetVariables(state, [0]), []);
});

test('repulsor-star inspector edits keep signed gravity fields synchronized', () => {
    const editor = Object.create(LevelEditor.prototype);
    const refreshed = [];
    editor.game = {
        invalidateSimulationState() {},
        physics: { refreshPlanet(object) { refreshed.push(object); } }
    };
    editor.overlayRenderer = null;
    const star = new RepulsorStar(10, 20);

    editor.applyObjectProperty(star, 'strength', 275);
    editor.applyObjectProperty(star, 'repulsionReach', 900);
    editor.applyObjectProperty(star, 'radius', 42);

    assert.equal(star.strength, 275);
    assert.equal(star.mass, -275);
    assert.equal(star.repulsionReach, 900);
    assert.equal(star.gravitationalReach, 900);
    assert.equal(star.width, 84);
    assert.equal(star.height, 84);
    assert.equal(refreshed.length, 3);
});

test('repulsor-star renderer draws a bright core and outward fading particle streaks', () => {
    const radialGradients = [];
    const alphas = [];
    const segments = [];
    let currentStart = null;
    const ctx = {
        createRadialGradient() {
            const stops = [];
            radialGradients.push(stops);
            return { addColorStop(offset, color) { stops.push([offset, color]); } };
        },
        beginPath() { currentStart = null; },
        arc() {}, fill() {}, stroke() {}, save() {}, restore() {}, rotate() {},
        moveTo(x, y) { currentStart = { x, y }; },
        lineTo(x, y) {
            if (currentStart) segments.push({ start: currentStart, end: { x, y } });
        },
        set globalAlpha(value) { alphas.push(value); },
        set fillStyle(_value) {}, set strokeStyle(_value) {}, set lineWidth(_value) {},
        set shadowColor(_value) {}, set shadowBlur(_value) {}
    };

    new RepulsorStar(0, 0, 30, 100, 800).drawSprite(ctx);

    assert.equal(radialGradients.length, 2);
    assert.ok(radialGradients.some(stops => stops.some(([, color]) => color === '#ffffff')));
    assert.ok(alphas.some(alpha => alpha > 0 && alpha < 1), 'particles should fade during flight');
    assert.ok(segments.length >= 26, 'particles should render as outward streaks');
    assert.ok(segments.some(({ start, end }) => Math.hypot(end.x, end.y) > Math.hypot(start.x, start.y)));
});
