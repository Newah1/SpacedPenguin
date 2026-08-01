import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';
import {
    calculateLaunchVelocity,
    calculateLevelScore,
    evaluateFailureRules,
    launchSimulationPenguin,
    SimulationEventType,
    stepSimulation
} from '../js/simulationEngine.js';
import {
    cloneSimulationState,
    createSimulationStateFromLevel,
    resetSimulationAttempt
} from '../js/simulationState.js';
import { HeadlessGameEngine } from './headlessEngine.js';

function levelWith(objects = [], rules = {}) {
    return {
        name: 'Simulation fixture',
        startPosition: { x: 0, y: 0 },
        targetPosition: { x: 700, y: 300 },
        objects: [
            { type: 'slingshot', position: { x: 0, y: 0 }, properties: { velocityMultiplier: 8 } },
            { type: 'target', position: { x: 700, y: 300 }, properties: { width: 60, height: 60 } },
            ...objects
        ],
        rules
    };
}

function runFor(state, rate, seconds) {
    let current = cloneSimulationState(state);
    for (let frame = 0; frame < rate * seconds; frame++) {
        current = stepSimulation(current, 1 / rate).state;
    }
    return current;
}

function assertPointClose(actual, expected, epsilon = 1e-8) {
    assert.ok(Math.abs(actual.x - expected.x) < epsilon, `${actual.x} != ${expected.x}`);
    assert.ok(Math.abs(actual.y - expected.y) < epsilon, `${actual.y} != ${expected.y}`);
}

test('simulation steps are immutable and deterministic across 30 and 60 FPS', () => {
    const initial = createSimulationStateFromLevel(levelWith([
        {
            type: 'planet',
            position: { x: 400, y: 300 },
            properties: { id: 'root', radius: 30, mass: 100, gravitationalReach: 0 }
        },
        {
            type: 'planet',
            position: { x: 500, y: 300 },
            properties: {
                id: 'child',
                radius: 20,
                mass: 50,
                gravitationalReach: 0,
                orbit: { orbitTargetId: 'root', orbitRadius: 100, orbitSpeed: 1, orbitAngle: 0 }
            }
        }
    ]));
    const snapshot = cloneSimulationState(initial);
    const at30 = runFor(initial, 30, 1);
    const at60 = runFor(initial, 60, 1);

    assert.deepEqual(initial, snapshot);
    assertPointClose(at30.planets[1].position, at60.planets[1].position);
    assert.ok(Math.abs(at30.planets[1].orbit.angle - at60.planets[1].orbit.angle) < 1e-10);
});

test('moving gravity sources produce the same flight at 30 and 60 FPS', () => {
    const initial = createSimulationStateFromLevel(levelWith([
        {
            type: 'planet',
            position: { x: 500, y: 300 },
            properties: {
                id: 'moving', radius: 20, mass: 100, gravitationalReach: 5000,
                orbit: { orbitCenter: { x: 400, y: 300 }, orbitRadius: 100, orbitSpeed: 0.5, orbitAngle: 0 }
            }
        }
    ]));
    initial.penguin.position = { x: 100, y: 100 };
    initial.penguin.velocity = { x: 100, y: 20 };
    initial.penguin.state = 'soaring';
    const at30 = runFor(initial, 30, 1);
    const at60 = runFor(initial, 60, 1);

    assertPointClose(at30.planets[0].position, at60.planets[0].position);
    assertPointClose(at30.penguin.position, at60.penguin.position);
    assertPointClose(at30.penguin.velocity, at60.penguin.velocity);
    assert.ok(Math.abs(at30.counters.distance - at60.counters.distance) < 1e-8);
});

test('hierarchical orbit graph uses the updated parent regardless of declaration order', () => {
    const state = createSimulationStateFromLevel(levelWith([
        {
            type: 'bonus',
            position: { x: 470, y: 300 },
            properties: {
                id: 'child',
                orbit: { orbitTargetId: 'root', orbitRadius: 20, orbitSpeed: 2, orbitAngle: 0 }
            }
        },
        {
            type: 'planet',
            position: { x: 450, y: 300 },
            properties: {
                id: 'root', radius: 20, mass: 0, gravitationalReach: 0,
                orbit: { orbitCenter: { x: 400, y: 300 }, orbitRadius: 50, orbitSpeed: 1, orbitAngle: 0 }
            }
        }
    ]));
    const stepped = stepSimulation(state, 1).state;
    const root = stepped.planets[0];
    const child = stepped.bonuses[0];

    assertPointClose(root.position, { x: 400 + Math.cos(1) * 50, y: 300 + Math.sin(1) * 50 });
    assertPointClose(child.position, {
        x: root.position.x + Math.cos(2) * 20,
        y: root.position.y + Math.sin(2) * 20
    });
});

test('planet collision produces a finite shared bounce and collision event', () => {
    const state = createSimulationStateFromLevel(levelWith([
        {
            type: 'planet',
            position: { x: 100, y: 100 },
            properties: { id: 'planet', radius: 30, mass: 0, gravitationalReach: 0 }
        }
    ]));
    state.penguin.position = { x: 100, y: 100 };
    state.penguin.velocity = { x: 0, y: 0 };
    state.penguin.state = 'soaring';
    const result = stepSimulation(state, 1 / 60);

    assert.equal(result.state.penguin.state, 'crashed');
    assert.equal(result.state.counters.planetCollisions, 1);
    assert.equal(result.events[0].type, SimulationEventType.PLANET_COLLISION);
    assert.equal(Number.isFinite(result.state.penguin.position.x), true);
    assert.equal(Number.isFinite(result.state.penguin.velocity.x), true);
});

test('flight gravity consumes normalized planet positions without producing non-finite state', () => {
    const state = createSimulationStateFromLevel(levelWith([
        {
            type: 'planet',
            position: { x: 400, y: 200 },
            properties: { id: 'planet', radius: 20, mass: 100, gravitationalReach: 5000 }
        }
    ]));
    state.penguin.position = { x: 0, y: 0 };
    state.penguin.velocity = { x: 100, y: 0 };
    state.penguin.state = 'soaring';
    const result = stepSimulation(state, 1 / 60);

    assert.equal(Number.isFinite(result.state.penguin.position.x), true);
    assert.equal(Number.isFinite(result.state.penguin.position.y), true);
    assert.equal(Number.isFinite(result.state.penguin.velocity.x), true);
    assert.equal(Number.isFinite(result.state.counters.distance), true);
});

test('bonus collection happens before target victory evaluation', () => {
    const fixture = levelWith([
        { type: 'bonus', position: { x: 100, y: 0 }, properties: { id: 'bonus', value: 250, width: 42.5 } }
    ], { requiredBonuses: 1 });
    fixture.objects[1].position = { x: 100, y: 0 };
    const state = createSimulationStateFromLevel(fixture);
    state.penguin.position = { x: 90, y: 0 };
    state.penguin.velocity = { x: 600, y: 0 };
    state.penguin.state = 'soaring';
    const result = stepSimulation(state, 1 / 60);

    assert.deepEqual(result.events.map(event => event.type), [
        SimulationEventType.PENGUIN_MOVED,
        SimulationEventType.BONUS_COLLECTED,
        SimulationEventType.TARGET_HIT
    ]);
    assert.equal(result.state.counters.currentAttemptScore, 250);
    assert.equal(result.state.penguin.state, 'hitTarget');
});

test('a target hit on the final allowed try is not overwritten by rule failure', () => {
    const fixture = levelWith([], { maxTries: 1 });
    fixture.objects[1].position = { x: 100, y: 0 };
    const state = createSimulationStateFromLevel(fixture);
    state.counters.tries = 1;
    state.penguin.position = { x: 90, y: 0 };
    state.penguin.velocity = { x: 600, y: 0 };
    state.penguin.state = 'soaring';
    const result = stepSimulation(state, 1 / 60);

    assert.equal(result.state.penguin.state, 'hitTarget');
    assert.equal(result.events.some(event => event.type === SimulationEventType.TARGET_HIT), true);
    assert.equal(result.events.some(event => event.type === SimulationEventType.RULE_FAILURE), false);
});

test('allowedMisses represents tolerated collisions rather than an eager threshold', () => {
    const state = createSimulationStateFromLevel(levelWith([], { allowedMisses: 0 }));
    assert.equal(evaluateFailureRules(state), null);
    state.counters.planetCollisions = 1;
    assert.equal(evaluateFailureRules(state).rule, 'allowedMisses');
});

test('target reports a blocked outcome when required bonuses remain', () => {
    const fixture = levelWith([]);
    fixture.objects[1].position = { x: 100, y: 0 };
    const state = createSimulationStateFromLevel(fixture);
    state.rules.requiredBonuses = 1;
    state.penguin.position = { x: 90, y: 0 };
    state.penguin.velocity = { x: 600, y: 0 };
    state.penguin.state = 'soaring';
    const result = stepSimulation(state, 1 / 60);
    const blocked = result.events.find(event => event.type === SimulationEventType.TARGET_BLOCKED);

    assert.equal(blocked.remaining, 1);
    assert.equal(result.state.penguin.state, 'crashed');
});

test('attempt reset restores world state while preserving aggregate attempt counters', () => {
    const initial = createSimulationStateFromLevel(levelWith([
        { type: 'bonus', position: { x: 50, y: 0 }, properties: { id: 'bonus', value: 100 } }
    ]));
    const current = cloneSimulationState(initial);
    current.counters.tries = 3;
    current.counters.planetCollisions = 2;
    current.counters.currentAttemptScore = 100;
    current.bonuses[0].collected = true;
    current.penguin.position = { x: 500, y: 500 };
    const reset = resetSimulationAttempt(initial, current);

    assert.deepEqual(reset.penguin.position, initial.slingshot.position);
    assert.equal(reset.bonuses[0].collected, false);
    assert.equal(reset.counters.currentAttemptScore, 0);
    assert.equal(reset.counters.tries, 3);
    assert.equal(reset.counters.planetCollisions, 2);
});

test('launch and scoring calculations are shared deterministic functions', () => {
    assert.deepEqual(calculateLaunchVelocity(0, 100, {
        velocityMultiplier: 8,
        maxPullback: 100,
        minPullback: 10
    }), { x: 1280, y: 0 });
    assert.deepEqual(calculateLevelScore({
        distance: 100,
        level: 2,
        tries: 2,
        attemptBonus: 50,
        totalScore: 1000,
        multiplier: 1.5
    }), { levelScore: 100, totalScore: 1725 });
});

test('headless runner is a thin consumer of the same deterministic steps', () => {
    const level = levelWith([]);
    level.objects[1].position = { x: 300, y: 0 };
    const engine = new HeadlessGameEngine();
    engine.loadLevel(level);
    const headless = engine.simulateTrajectory(0, 50, 5);

    let direct = launchSimulationPenguin(createSimulationStateFromLevel(level), 0, 50);
    let directHit = null;
    for (let step = 0; step < 300 && !directHit; step++) {
        const result = stepSimulation(direct, 1 / 60);
        direct = result.state;
        directHit = result.events.find(event => event.type === SimulationEventType.TARGET_HIT);
    }

    assert.equal(headless.success, true);
    assert.deepEqual(headless.finalPosition, directHit.position);
    assert.equal(headless.distance, direct.counters.distance);
});

test('headless trajectory candidates do not consume one another\'s attempt budget', () => {
    const level = levelWith([], { maxTries: 1 });
    level.objects[1].position = { x: 300, y: 0 };
    const engine = new HeadlessGameEngine();
    engine.loadLevel(level);

    assert.equal(engine.simulateTrajectory(0, 50, 5).success, true);
    assert.equal(engine.simulateTrajectory(0, 50, 5).success, true);
    assert.equal(engine.state.counters.tries, 1);
});
