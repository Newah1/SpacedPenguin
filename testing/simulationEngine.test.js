import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';
import {
    calculateLaunchVelocity,
    calculateLevelScore,
    evaluateFailureRules,
    launchSimulationPenguin,
    launchSimulationPenguinMutable,
    SimulationEventType,
    stepSimulation,
    stepSimulationMutable
} from '../js/simulation/simulationEngine.js';
import {
    cloneSimulationState,
    createSimulationStateFromLevel,
    resetSimulationAttempt
} from '../js/simulation/simulationState.js';
import { HeadlessGameEngine } from './headlessEngine.js';
import { CompiledWorldTimeline } from '../js/simulation/compiledWorldTimeline.js';
import {
    advanceOrbitGraph,
    advanceOrbitGraphMutable,
    compileOrbitGraph
} from '../js/simulation/orbitSimulation.js';
import {
    MAX_TRAJECTORY_WORKERS,
    resolveTrajectoryWorkerCount
} from './parallelTrajectoryRunner.js';

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

test('speed boosters redirect momentum along their rotation and apply their multiplier once per contact', () => {
    const state = createSimulationStateFromLevel(levelWith([
        { type: 'speedbooster', position: { x: 50, y: 0 }, properties: {
            id: 'boost', width: 20, height: 20, rotation: 90, speedMultiplier: 1.5
        } }
    ], { gravitationalConstant: 0 }));
    state.penguin.state = 'soaring';
    state.penguin.velocity = { x: 120, y: 0 };

    const result = stepSimulation(state, 0.5);
    const boost = result.events.find(event => event.type === SimulationEventType.SPEED_BOOSTER_ACTIVATED);

    assert.ok(boost);
    assertPointClose(boost.incomingVelocity, { x: 120, y: 0 });
    assertPointClose(boost.velocity, { x: 0, y: 180 });
    assertPointClose(result.state.penguin.velocity, { x: 0, y: 180 });
    assert.equal(result.events.filter(event => event.type === SimulationEventType.SPEED_BOOSTER_ACTIVATED).length, 1);
});

test('speed booster contacts are swept, so fast penguins cannot pass through a panel', () => {
    const state = createSimulationStateFromLevel(levelWith([
        { type: 'speedbooster', position: { x: 100, y: 0 }, properties: {
            id: 'boost', width: 12, height: 20, rotation: 180, speedMultiplier: 1
        } }
    ], { gravitationalConstant: 0 }));
    state.penguin.state = 'soaring';
    state.penguin.velocity = { x: 1000, y: 0 };

    const result = stepSimulation(state, 0.2);

    assert.equal(result.events.some(event => event.type === SimulationEventType.SPEED_BOOSTER_ACTIVATED), true);
    assertPointClose(result.state.penguin.velocity, { x: -1000, y: 0 });
});

test('deflector bumpers sweep fast contacts and reflect momentum across the impact normal', () => {
    const state = createSimulationStateFromLevel(levelWith([
        { type: 'deflectorbumper', position: { x: 50, y: 20 }, properties: {
            id: 'bumper', radius: 10, restitution: 1.25, playSound: false
        } }
    ], { gravitationalConstant: 0 }));
    state.penguin.state = 'soaring';
    state.penguin.velocity = { x: 3000, y: 0 };

    const result = stepSimulation(state, 1 / 60);
    const bounce = result.events.find(event => event.type === SimulationEventType.DEFLECTOR_BOUNCED);

    assert.ok(bounce);
    assert.equal(bounce.deflectorBumperId, 'bumper');
    assert.equal(bounce.playSound, false);
    assertPointClose(bounce.incomingVelocity, { x: 3000, y: 0 });
    assert.ok(bounce.velocity.y < 0, 'an off-center impact must deflect vertically');
    assert.ok(Math.abs(Math.hypot(bounce.velocity.x, bounce.velocity.y) - 3750) < 1e-8);
    assertPointClose(result.state.penguin.velocity, bounce.velocity);
    assert.equal(result.state.penguin.state, 'soaring');
    assert.equal(result.state.counters.planetCollisions, 0);
});

test('deflector restitution can damp a head-on bounce without tunneling', () => {
    const state = createSimulationStateFromLevel(levelWith([
        { type: 'bumper', position: { x: 50, y: 0 }, properties: {
            id: 'bumper', radius: 10, restitution: 0.5
        } }
    ], { gravitationalConstant: 0 }));
    state.penguin.state = 'soaring';
    state.penguin.velocity = { x: 3000, y: 0 };

    const result = stepSimulation(state, 1 / 60);

    assertPointClose(result.state.penguin.velocity, { x: -1500, y: 0 });
    assert.ok(result.state.penguin.position.x < 24, 'the remaining tick motion must continue away from the bumper');
});

test('compiled mutable orbit graphs preserve dependency ordering across repeated steps', () => {
    const entities = [
        {
            id: 'moon',
            position: { x: 140, y: 100 },
            orbit: {
                type: 'circular', targetId: 'planet', center: null,
                radius: 40, speed: 1, angle: 0, params: {}, velocity: { x: 0, y: 0 }
            }
        },
        {
            id: 'planet',
            position: { x: 100, y: 100 },
            orbit: {
                type: 'circular', targetId: null, center: { x: 200, y: 200 },
                radius: 100, speed: 0.5, angle: 0, params: {}, velocity: { x: 0, y: 0 }
            }
        }
    ];
    const expectedFirst = advanceOrbitGraph(entities, 1 / 60);
    const mutable = structuredClone(entities);
    const graph = compileOrbitGraph(mutable);

    assert.deepEqual(graph.order, [1, 0]);
    assert.equal(advanceOrbitGraphMutable(mutable, 1 / 60, graph), mutable);
    assert.deepEqual(mutable, expectedFirst);

    const expectedSecond = advanceOrbitGraph(expectedFirst, 1 / 60);
    advanceOrbitGraphMutable(mutable, 1 / 60, graph);
    assert.deepEqual(mutable, expectedSecond);
});

test('Director gravity preserves 30 Hz multi-source behavior inside the 60 Hz runtime', () => {
    const entities = [
        { id: 'left', position: { x: 0, y: 0 }, orbit: null },
        { id: 'right', position: { x: 10, y: 0 }, orbit: null },
        {
            id: 'satellite',
            position: { x: 5, y: 0 },
            orbit: {
                type: 'director-gravity',
                targetId: 'left',
                center: null,
                params: {
                    sourceFrameRate: 30,
                    gravityStrength: 1,
                    initialVelocity: { x: 0, y: 0 },
                    gravitySources: [
                        { targetId: 'left', mass: 1, collisionRadius: 0 },
                        { targetId: 'right', mass: 2, collisionRadius: 0 }
                    ]
                },
                velocity: { x: 0, y: 0 },
                frameAccumulator: 0
            }
        }
    ];

    const halfFrame = advanceOrbitGraph(entities, 1 / 60);
    assertPointClose(halfFrame[2].position, { x: 5, y: 0 });
    assert.equal(halfFrame[2].orbit.frameAccumulator, 0.5);
    const fullFrame = advanceOrbitGraph(halfFrame, 1 / 60);
    assertPointClose(fullFrame[2].position, { x: 5.2, y: 0 });
    assertPointClose(fullFrame[2].orbit.velocity, { x: 0.2, y: 0 });
    assert.equal(fullFrame[2].orbit.frameAccumulator, 0);
});

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

test('compiled world frames and mutable stepping exactly match immutable simulation', () => {
    const initial = createSimulationStateFromLevel(levelWith([
        {
            type: 'planet',
            position: { x: 400, y: 300 },
            properties: {
                id: 'root', mass: 0, gravitationalReach: 5000,
                orbit: { orbitCenter: { x: 350, y: 300 }, orbitRadius: 50, orbitSpeed: 0.75 }
            }
        },
        {
            type: 'bonus',
            position: { x: 500, y: 300 },
            properties: {
                id: 'child',
                orbit: { orbitTargetId: 'root', orbitRadius: 100, orbitSpeed: 1.25 }
            }
        }
    ]));
    const timeline = new CompiledWorldTimeline(initial, 1 / 60, 120);
    let immutable = launchSimulationPenguin(initial, 180, 10);
    const compiled = cloneSimulationState(initial);
    launchSimulationPenguinMutable(compiled, 180, 10);

    for (let step = 0; step < 120; step++) {
        immutable = stepSimulation(immutable, 1 / 60).state;
        timeline.applyFrame(compiled, step);
        stepSimulationMutable(compiled, 1 / 60, {
            advanceWorld: false,
            emitMovementEvents: false
        });
        assert.deepEqual(compiled.penguin, immutable.penguin);
        assert.deepEqual(compiled.counters, immutable.counters);
        assert.deepEqual(compiled.planets, immutable.planets);
        assert.deepEqual(compiled.bonuses, immutable.bonuses);
        assert.deepEqual(compiled.target, immutable.target);
    }
});

test('compiled world frames preserve a distinct Director slingshot anchor', () => {
    const initial = createSimulationStateFromLevel({
        name: 'Director slingshot fixture',
        startPosition: { x: 10, y: 20 },
        targetPosition: { x: 700, y: 300 },
        objects: [
            {
                type: 'slingshot',
                position: { x: 10, y: 20 },
                properties: {
                    anchorPosition: { x: 30, y: 40 },
                    launchModel: 'director',
                    sourceFrameRate: 30,
                    coordinateScale: 1.5
                }
            },
            { type: 'target', position: { x: 700, y: 300 }, properties: { width: 60, height: 60 } }
        ],
        rules: {}
    });
    const timeline = new CompiledWorldTimeline(initial, 1 / 60, 1);
    const compiled = cloneSimulationState(initial);

    timeline.applyFrame(compiled, 0);

    assert.deepEqual(compiled.slingshot.position, { x: 10, y: 20 });
    assert.deepEqual(compiled.slingshot.anchorPosition, { x: 30, y: 40 });
});

test('movement-event suppression changes observations but not simulation state', () => {
    const initial = createSimulationStateFromLevel(levelWith([]));
    const withEvents = launchSimulationPenguin(initial, 0, 20);
    const withoutEvents = cloneSimulationState(withEvents);
    const immutable = stepSimulation(withEvents, 1 / 60);
    const lean = stepSimulationMutable(withoutEvents, 1 / 60, { emitMovementEvents: false });

    assert.deepEqual(lean.state, immutable.state);
    assert.equal(immutable.events.some(event => event.type === SimulationEventType.PENGUIN_MOVED), true);
    assert.equal(lean.events.some(event => event.type === SimulationEventType.PENGUIN_MOVED), false);
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

test('planet collision is swept so a fast penguin cannot tunnel through a planet', () => {
    const state = createSimulationStateFromLevel(levelWith([
        {
            type: 'planet',
            position: { x: 100, y: 100 },
            properties: { id: 'planet', radius: 30, mass: 0, gravitationalReach: 0 }
        }
    ]));
    state.penguin.position = { x: 0, y: 100 };
    state.penguin.velocity = { x: 12000, y: 0 };
    state.penguin.state = 'soaring';
    const result = stepSimulation(state, 1 / 60);

    assert.equal(result.state.penguin.state, 'crashed');
    assert.equal(result.state.counters.planetCollisions, 1);
    assert.equal(result.events[0].type, SimulationEventType.PLANET_COLLISION);
    assert.ok(result.state.penguin.position.x < 100);
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

test('attempt reset preserves moving world state and aggregate attempt counters', () => {
    const initial = createSimulationStateFromLevel(levelWith([
        { type: 'bonus', position: { x: 50, y: 0 }, properties: { id: 'bonus', value: 100 } }
    ]));
    const current = cloneSimulationState(initial);
    current.counters.tries = 3;
    current.counters.planetCollisions = 2;
    current.counters.currentAttemptScore = 100;
    current.bonuses[0].collected = true;
    current.time = 4;
    current.runTick = 240;
    current.bonuses[0].position.x = 75;
    current.penguin.position = { x: 500, y: 500 };
    const reset = resetSimulationAttempt(initial, current);

    assert.deepEqual(reset.penguin.position, initial.slingshot.position);
    assert.equal(reset.bonuses[0].collected, false);
    assert.equal(reset.counters.currentAttemptScore, 0);
    assert.equal(reset.counters.tries, 3);
    assert.equal(reset.counters.planetCollisions, 2);
    assert.equal(reset.time, 4);
    assert.equal(reset.runTick, 240);
    assert.equal(reset.bonuses[0].position.x, 75);
});

test('launch and scoring calculations are shared deterministic functions', () => {
    assert.deepEqual(calculateLaunchVelocity(0, 100, {
        launchModel: 'director',
        maxPullback: 100,
        coordinateScale: 1.5,
        sourceFrameRate: 30
    }), { x: 1800, y: 0 });
    assert.deepEqual(calculateLaunchVelocity(0, 100, {
        velocityMultiplier: 8,
        maxPullback: 100,
        minPullback: 10
    }), { x: 640, y: 0 });

    const launchSpeed = power => calculateLaunchVelocity(0, power, {
        velocityMultiplier: 15,
        maxPullback: 100,
        minPullback: 10
    }).x;
    const none = launchSpeed(0);
    const tiny = launchSpeed(1);
    const gentle = launchSpeed(5);
    const minimum = launchSpeed(10);
    const low = launchSpeed(20);
    const middle = launchSpeed(50);
    const maximum = launchSpeed(100);
    assert.equal(none, 0);
    assert.ok(tiny > none);
    assert.ok(gentle > tiny);
    assert.ok(gentle < minimum);
    assert.equal(minimum, 120);
    assert.ok(low > minimum);
    assert.ok(middle > low);
    assert.equal(maximum, 1200);
    assert.ok(maximum / minimum <= 10);
    assert.deepEqual(calculateLevelScore({
        distance: 100,
        level: 2,
        tries: 2,
        attemptBonus: 50,
        totalScore: 1000,
        multiplier: 1.5
    }), {
        levelScore: 100,
        levelContribution: 725,
        scoreImprovement: 725,
        totalScore: 1725
    });

    assert.deepEqual(calculateLevelScore({
        distance: 80,
        level: 2,
        tries: 2,
        attemptBonus: 25,
        totalScore: 1725,
        previousLevelContribution: 725,
        multiplier: 1.5
    }), {
        levelScore: 80,
        levelContribution: 725,
        scoreImprovement: 0,
        totalScore: 1725
    });

    assert.deepEqual(calculateLevelScore({
        distance: 200,
        level: 2,
        tries: 2,
        attemptBonus: 100,
        totalScore: 1725,
        previousLevelContribution: 725,
        multiplier: 1.5
    }), {
        levelScore: 200,
        levelContribution: 950,
        scoreImprovement: 225,
        totalScore: 1950
    });
});

test('opaque custom level IDs use a finite neutral scoring factor', () => {
    const result = calculateLevelScore({
        distance: 240,
        level: 'custom-1755298123456-ab12cd',
        tries: 2,
        attemptBonus: 25,
        totalScore: 0,
        multiplier: 1
    });

    assert.deepEqual(result, {
        levelScore: 120,
        levelContribution: 145,
        scoreImprovement: 145,
        totalScore: 145
    });
    assert.equal(Number.isFinite(result.totalScore), true);
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

test('bounded worker sweeps preserve sequential candidate results', async () => {
    const level = levelWith([]);
    level.objects[1].position = { x: 300, y: 0 };
    const sequentialEngine = new HeadlessGameEngine();
    const workerEngine = new HeadlessGameEngine();
    sequentialEngine.logger = { info() {} };
    workerEngine.logger = { info() {} };
    sequentialEngine.loadLevel(level);
    workerEngine.loadLevel(level);

    const sequential = sequentialEngine.findWorkingTrajectories([0, 180], [10, 100], 25, 5);
    const parallel = await workerEngine.findWorkingTrajectoriesAsync(
        [0, 180], [10, 100], 25, 5, { workers: 2 }
    );

    assert.deepEqual(parallel, sequential);
    assert.equal(resolveTrajectoryWorkerCount(999, 1000) <= MAX_TRAJECTORY_WORKERS, true);
    assert.equal(resolveTrajectoryWorkerCount('auto', 100), 1);
});

test('swept portals preserve speed and exclude the teleport gap from distance', () => {
    const level = levelWith([
        { type: 'portal', position: { x: 50, y: 0 }, properties: {
            id: 'red', pairedPortalId: 'blue', color: 'red', width: 48, height: 18, rotation: 270
        } },
        { type: 'portal', position: { x: 300, y: 0 }, properties: {
            id: 'blue', pairedPortalId: 'red', color: 'blue', width: 48, height: 18, rotation: 90
        } }
    ], { gravitationalConstant: 0 });
    let state = createSimulationStateFromLevel(level);
    state.penguin.state = 'soaring';
    state.penguin.velocity = { x: 6000, y: 0 };

    const result = stepSimulation(state, 1 / 60);
    const teleport = result.events.find(event => event.type === SimulationEventType.PORTAL_TELEPORTED);
    assert.ok(teleport);
    assert.ok(result.state.penguin.position.x > 300);
    assert.ok(Math.abs(Math.hypot(result.state.penguin.velocity.x, result.state.penguin.velocity.y) - 6000) < 1e-8);
    assert.ok(Math.abs(result.state.counters.distance - 100) < 1e-8);
});

test('portal orientation rotates heading while preserving momentum magnitude', () => {
    const level = levelWith([
        { type: 'portal', position: { x: 50, y: 0 }, properties: {
            id: 'red', pairedPortalId: 'blue', color: 'red', width: 48, height: 18, rotation: 270
        } },
        { type: 'portal', position: { x: 300, y: 200 }, properties: {
            id: 'blue', pairedPortalId: 'red', color: 'blue', width: 48, height: 18, rotation: 180
        } }
    ], { gravitationalConstant: 0 });
    let state = createSimulationStateFromLevel(level);
    state.penguin.state = 'soaring';
    state.penguin.velocity = { x: 6000, y: 0 };

    const result = stepSimulation(state, 1 / 60);
    assert.ok(Math.abs(result.state.penguin.velocity.x) < 1e-8);
    assert.ok(Math.abs(result.state.penguin.velocity.y - 6000) < 1e-8);
});
