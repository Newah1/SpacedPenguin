import test from 'node:test';
import assert from 'node:assert/strict';

import {
    WaypointPathMode,
    stepWaypointPath
} from '../js/simulation/waypointSimulation.js';
import { validateLevelDefinition } from '../js/levels/levelValidation.js';
import { createSimulationStateFromLevel } from '../js/simulation/simulationState.js';
import {
    FIXED_TICK_SECONDS,
    stepSimulationMutable
} from '../js/simulation/simulationEngine.js';
import { CompiledWorldTimeline } from '../js/simulation/compiledWorldTimeline.js';
import { applyGameSimulationState } from '../js/runtime/gameSimulationAdapter.js';
import DocumentMutationService from '../js/editor/services/documentMutationService.js';
import { serializeRuntimeObject } from '../js/runtime/runtimeObjectSerialization.js';

const path = (mode = WaypointPathMode.PING_PONG) => ({
    waypoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    speed: 5,
    mode,
    phase: 0
});

test('ping-pong waypoint paths reverse at their endpoints without overshoot', () => {
    const outbound = stepWaypointPath(path(), { x: 0, y: 0 }, 1);
    assert.deepEqual(outbound.position, { x: 5, y: 0 });

    const returning = stepWaypointPath(outbound.waypointPath, outbound.position, 2);
    assert.deepEqual(returning.position, { x: 5, y: 0 });
    assert.equal(returning.waypointPath.phase, 15);
});

test('loop waypoint paths include the closing segment', () => {
    const result = stepWaypointPath({
        waypoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
        speed: 15,
        mode: WaypointPathMode.LOOP,
        phase: 0
    }, { x: 0, y: 0 }, 1);
    assert.deepEqual(result.position, { x: 10, y: 5 });
});

test('level validation accepts waypoint motion on decorative objects and rejects mixed motion systems', () => {
    const object = {
        type: 'textobject',
        position: { x: 10, y: 20 },
        properties: {
            id: 'moving_text',
            waypointPath: path()
        }
    };
    assert.equal(validateLevelDefinition({ objects: [object] }).valid, true);

    const conflict = structuredClone(object);
    conflict.properties.orbit = {
        orbitCenter: { x: 0, y: 0 }, orbitRadius: 10, orbitSpeed: 1
    };
    const validation = validateLevelDefinition({ objects: [conflict] });
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some(error => error.code === 'MOTION_CONFLICT'));
});

test('moving portal positions are authoritative and compiled headless frames stay exact', () => {
    const state = createSimulationStateFromLevel({
        objects: [{
            type: 'portal',
            position: { x: 0, y: 100 },
            properties: {
                id: 'portal_a', pairedPortalId: 'portal_b', color: 'red',
                waypointPath: {
                    waypoints: [{ x: 0, y: 100 }, { x: 120, y: 100 }],
                    speed: 60, mode: 'pingpong'
                }
            }
        }]
    }, { validate: false });
    const expected = structuredClone(state);
    for (let index = 0; index < 10; index++) stepSimulationMutable(expected, FIXED_TICK_SECONDS);

    const timeline = new CompiledWorldTimeline(state, FIXED_TICK_SECONDS, 10);
    const compiled = structuredClone(state);
    timeline.applyFrame(compiled, 9);
    assert.deepEqual(compiled.portals[0].position, expected.portals[0].position);
    assert.equal(compiled.portals[0].waypointPath.phase, expected.portals[0].waypointPath.phase);
});

test('decorations and an idle penguin follow their waypoint-controlled world objects', () => {
    const state = createSimulationStateFromLevel({
        objects: [
            {
                type: 'slingshot', position: { x: 0, y: 0 }, properties: {
                    waypointPath: {
                        waypoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                        speed: 50, mode: 'pingpong'
                    }
                }
            },
            {
                type: 'textobject', position: { x: 10, y: 10 }, properties: {
                    waypointPath: {
                        waypoints: [{ x: 10, y: 10 }, { x: 10, y: 110 }],
                        speed: 25, mode: 'pingpong'
                    }
                }
            }
        ]
    }, { validate: false });
    stepSimulationMutable(state, 1);
    assert.ok(Math.abs(state.slingshot.position.x - 50) < 1e-9);
    assert.equal(state.slingshot.position.y, 0);
    assert.deepEqual(state.penguin.position, state.slingshot.position);
    assert.equal(state.decorations[0].position.x, 10);
    assert.ok(Math.abs(state.decorations[0].position.y - 35) < 1e-9);
});

test('moving slingshots preserve their launch anchor and do not cancel pullback', () => {
    const state = createSimulationStateFromLevel({
        startPosition: { x: 100, y: 100 },
        objects: [{
            type: 'slingshot', position: { x: 100, y: 100 }, properties: {
                anchorPosition: { x: 80, y: 100 },
                launchModel: 'director',
                waypointPath: {
                    waypoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
                    speed: 50, mode: 'pingpong'
                }
            }
        }]
    }, { validate: false });

    stepSimulationMutable(state, 0.5);
    assert.ok(Math.abs(state.slingshot.position.x - 125) < 1e-9);
    assert.equal(state.slingshot.position.y, 100);
    assert.ok(Math.abs(state.slingshot.anchorPosition.x - 105) < 1e-9);
    assert.equal(state.slingshot.anchorPosition.y, 100);
    assert.deepEqual(state.penguin.position, state.slingshot.position);

    state.penguin.state = 'pullback';
    state.penguin.position = { x: 75, y: 125 };
    stepSimulationMutable(state, 0.5);
    assert.ok(Math.abs(state.slingshot.position.x - 150) < 1e-9);
    assert.equal(state.slingshot.position.y, 100);
    assert.ok(Math.abs(state.slingshot.anchorPosition.x - 130) < 1e-9);
    assert.equal(state.slingshot.anchorPosition.y, 100);
    assert.deepEqual(state.penguin.position, { x: 75, y: 125 });
});

test('runtime application keeps a moving slingshot pullback detached from its anchor', () => {
    const state = createSimulationStateFromLevel({
        startPosition: { x: 100, y: 100 },
        objects: [{
            type: 'slingshot', position: { x: 100, y: 100 }, properties: {
                anchorPosition: { x: 80, y: 100 },
                launchModel: 'director',
                waypointPath: {
                    waypoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
                    speed: 50, mode: 'pingpong'
                }
            }
        }]
    }, { validate: false });
    state.slingshot.position = { x: 125, y: 100 };
    state.slingshot.anchorPosition = { x: 105, y: 100 };
    state.penguin.state = 'pullback';
    state.penguin.position = { x: 75, y: 125 };

    const anchor = { x: 80, y: 100 };
    const game = {
        penguin: {
            x: 0, y: 0, vx: 0, vy: 0, state: 'idle',
            setPosition(x, y) { this.x = x; this.y = y; }
        },
        planets: [], bonuses: [], portals: [], speedBoosters: [],
        deflectorBumpers: [], forceFields: [], textObjects: [], pointingArrows: [],
        target: { position: { x: 0, y: 0 }, orbitSystem: null, waypointSystem: null },
        slingshot: {
            position: anchor,
            anchor,
            resetPosition: { x: 100, y: 100 },
            waypointSystem: { phase: 0 }
        }
    };

    applyGameSimulationState(game, state);
    assert.deepEqual(game.slingshot.anchor, { x: 105, y: 100 });
    assert.deepEqual(game.slingshot.resetPosition, { x: 125, y: 100 });
    assert.deepEqual({ x: game.penguin.x, y: game.penguin.y }, { x: 75, y: 125 });
});

test('editor waypoint commands create, extend, edit, and remove canonical paths', () => {
    const service = new DocumentMutationService();
    const definition = {
        objects: [{
            type: 'planet', position: { x: 20, y: 30 },
            properties: { id: 'planet_a', orbit: { center: { x: 0, y: 0 }, radius: 5, speed: 1 } }
        }]
    };
    let next = service.setObjectProperty(definition, 'planet_a', 'waypointMode', 'loop');
    assert.equal(next.objects[0].properties.orbit, undefined);
    assert.equal(next.objects[0].properties.waypointPath.mode, 'loop');
    next = service.setObjectProperty(next, 'planet_a', 'waypointAdd', '');
    next = service.setObjectProperty(next, 'planet_a', 'waypoint2Y', 140);
    assert.deepEqual(next.objects[0].properties.waypointPath.waypoints[2], { x: 220, y: 140 });
    next = service.setObjectProperty(next, 'planet_a', 'waypointRemove', '');
    assert.equal(next.objects[0].properties.waypointPath.waypoints.length, 2);
});

test('runtime serialization preserves waypoint authoring data', () => {
    const exported = serializeRuntimeObject({
        levelType: 'textobject',
        position: { x: 4, y: 8 },
        waypointSystem: path()
    }, {
        serializeWaypointPath: system => structuredClone(system)
    });
    assert.deepEqual(exported.properties.waypointPath, path());
});
