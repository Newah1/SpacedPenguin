import assert from 'node:assert/strict';
import test from 'node:test';
import {
    analyzeSculptTrajectory,
    compareSculptCandidates,
    createLaunchVariables,
    createExistingPlanetVariables,
    evaluateSculptCandidate,
    scoreSculptTrajectory,
    solveGravitySculpt
} from '../js/simulation/gravitySculptor.js';
import { solveGravitySculptOffThread } from '../js/simulation/gravitySculptWorkerClient.js';

function simulationState() {
    return {
        time: 0,
        penguin: {
            position: { x: 80, y: 300 }, velocity: { x: 0, y: 0 },
            radius: 10, state: 'idle', crashFramesRemaining: 0
        },
        planets: [{
            id: 'planet_1', position: { x: 360, y: 190 }, radius: 20,
            collisionRadius: 25, mass: 100, gravitationalReach: 5000, orbit: null
        }],
        bonuses: [],
        target: { id: 'target', position: { x: 5000, y: 5000 }, width: 20, height: 20, orbit: null },
        slingshot: {
            position: { x: 80, y: 300 }, velocityMultiplier: 1,
            maxPullback: 150, minPullback: 25
        },
        bounds: {
            stage: { x: 0, y: 0, width: 800, height: 600 },
            flight: { x: -1000, y: -1000, width: 6000, height: 6000 }
        },
        rules: {
            maxTries: null, requiredBonuses: null, allowedMisses: null,
            scoreMultiplier: 1, gravitationalConstant: 3
        },
        counters: { tries: 0, planetCollisions: 0, currentAttemptScore: 0, distance: 0 }
    };
}

test('existing-planet variables are composable and exclude orbit-controlled planets', () => {
    const state = simulationState();
    state.planets.push({ ...state.planets[0], id: 'orbiting', orbit: { type: 'circular' } });
    const positionOnly = createExistingPlanetVariables(state, [0, 1], {
        adjustPosition: true,
        adjustMass: false
    });
    assert.deepEqual(positionOnly.map(variable => variable.key), ['planet.0.x', 'planet.0.y']);
});

test('checkpoint scoring strongly prefers an ordered bend over a simple shortcut', () => {
    const desired = [
        { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 },
        { x: 200, y: 100 }, { x: 200, y: 200 }
    ];
    const shortcut = [
        { x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 },
        { x: 150, y: 150 }, { x: 200, y: 200 }
    ];
    const exactScore = scoreSculptTrajectory(desired, desired, 'soaring', [], []);
    const shortcutScore = scoreSculptTrajectory(shortcut, desired, 'soaring', [], []);
    assert.ok(shortcutScore > exactScore + 1000);
});

test('waypoint scoring does not constrain the trajectory between reached checkpoints', () => {
    const waypoints = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 0 }];
    const direct = waypoints;
    const expressive = [
        { x: 0, y: 0 }, { x: 30, y: -80 }, { x: 100, y: 100 },
        { x: 170, y: 170 }, { x: 200, y: 0 }
    ];
    assert.equal(
        scoreSculptTrajectory(expressive, waypoints, 'soaring', [], []),
        scoreSculptTrajectory(direct, waypoints, 'soaring', [], [])
    );
});

test('waypoint coverage excludes the automatic start and requires forward ordered progress', () => {
    const waypoints = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
    const reversed = [
        { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }
    ];
    const metrics = analyzeSculptTrajectory(reversed, waypoints, 'soaring', [], [], {
        checkpointTolerance: 10
    });
    assert.equal(metrics.checkpointCoverage, 0.5);
    assert.equal(metrics.missedWaypointCount, 1);
    assert.ok(metrics.score >= 10000000000);
});

test('launch angle and power are independent solver dimensions', () => {
    const state = simulationState();
    const variables = createLaunchVariables(state, [
        { x: 80, y: 300 }, { x: 300, y: 200 }
    ]);
    assert.deepEqual(variables.map(variable => variable.key), [
        'launch.angleDegrees', 'launch.pullbackPower'
    ]);
    assert.ok(variables[0].min < variables[0].initial);
    assert.ok(variables[1].min < variables[1].max);
});

test('candidate evaluation measures nearby launch robustness and hard-goal violations', () => {
    const state = simulationState();
    const variables = createLaunchVariables(state, [
        { x: 80, y: 300 }, { x: 400, y: 300 }
    ]);
    const launch = { velocity: { x: 240, y: 0 }, angleDegrees: 0, pullbackPower: 150 };
    const candidate = evaluateSculptCandidate(
        state,
        [{ x: 80, y: 300 }, { x: 400, y: 300 }],
        launch,
        variables,
        variables.map(variable => variable.initial),
        { goals: { requireTarget: true } }
    );
    assert.equal(candidate.simulationCount, 5);
    assert.ok(candidate.constraintViolations.includes('target'));
    assert.ok(candidate.score >= 1000000000);
    assert.ok(candidate.robustGoalSuccessRate >= 0 && candidate.robustGoalSuccessRate <= 1);
});

test('physics comfort favors floaty gravity and efficient distance without rewarding speed', () => {
    const state = simulationState();
    const variables = createExistingPlanetVariables(state, [0], {
        adjustPosition: false,
        adjustMass: true
    });
    const launch = { velocity: { x: 240, y: 0 }, angleDegrees: 0, pullbackPower: 150 };
    const options = {
        checkpointTolerance: 10000,
        previewSeconds: 1.5,
        terminalPenalty: 0,
        peakGravityAccelerationSoftLimit: 100,
        meanGravityAccelerationSoftLimit: 50
    };
    const floaty = evaluateSculptCandidate(
        state, [{ x: 80, y: 300 }, { x: 500, y: 300 }],
        launch, variables, [100], options
    );
    const harsh = evaluateSculptCandidate(
        state, [{ x: 80, y: 300 }, { x: 500, y: 300 }],
        launch, variables, [800], options
    );
    assert.ok(harsh.peakGravityAcceleration > floaty.peakGravityAcceleration);
    assert.ok(harsh.physicsComfortPenalty > floaty.physicsComfortPenalty);
    assert.ok(harsh.score > floaty.score);
    assert.ok(Number.isFinite(floaty.elapsedSeconds));
});

test('mass regularization treats reciprocal ratios symmetrically', () => {
    const trajectory = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const desiredPath = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const massVariable = {
        key: 'planet.0.mass',
        kind: 'mass',
        scale: 'log',
        initial: 100,
        min: 25,
        max: 400,
        apply() {}
    };
    const lighter = analyzeSculptTrajectory(
        trajectory, desiredPath, null, [massVariable], [50], { terminalPenalty: 0 }
    );
    const heavier = analyzeSculptTrajectory(
        trajectory, desiredPath, null, [massVariable], [200], { terminalPenalty: 0 }
    );

    assert.ok(Math.abs(lighter.score - heavier.score) < 1e-9);
});

test('slow trajectories receive distance-based opportunity beyond the old fixed time horizon', () => {
    const state = simulationState();
    state.planets = [];
    const result = evaluateSculptCandidate(
        state,
        [{ x: 80, y: 300 }, { x: 500, y: 300 }],
        { velocity: { x: 50, y: 0 }, angleDegrees: 0, pullbackPower: 50 },
        [],
        [],
        {
            previewSeconds: 1,
            trajectoryDistanceBudgetMultiplier: 2,
            trajectoryTimeSafetyMultiplier: 3,
            robustLaunchOffsets: []
        }
    );

    assert.ok(result.elapsedSeconds > 2.9);
    assert.ok(result.pathLength > 140);
});

test('waypoint-only evaluation stops when the ordered route is complete', () => {
    const state = simulationState();
    state.planets = [];
    state.rules.gravitationalConstant = 0;
    const result = evaluateSculptCandidate(
        state,
        [{ x: 80, y: 300 }, { x: 500, y: 300 }],
        { velocity: { x: 240, y: 0 }, angleDegrees: 0, pullbackPower: 150 },
        [],
        [],
        { robustLaunchOffsets: [], checkpointTolerance: 8 }
    );

    assert.equal(result.missedWaypointCount, 0);
    assert.ok(result.elapsedSeconds < 2);
    assert.ok(result.pathEfficiency < 1.05);
    assert.ok(result.endpointDistance <= 8);
});

test('hard-goal feasibility outranks waypoint coverage', () => {
    const feasible = {
        constraintViolations: [], missedWaypointCount: 1,
        checkpointCoverage: 0.5, score: 100
    };
    const infeasible = {
        constraintViolations: ['target'], missedWaypointCount: 0,
        checkpointCoverage: 1, score: 1
    };
    assert.ok(compareSculptCandidates(feasible, infeasible) < 0);
});

test('off-thread solves reject pre-aborted work without starting a search', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        solveGravitySculptOffThread({}, null, { signal: controller.signal }),
        error => error?.name === 'AbortError'
    );
});

test('aborting an active off-thread solve terminates its worker', async () => {
    const OriginalWorker = globalThis.Worker;
    let terminated = 0;
    class PendingWorker {
        postMessage() {}
        terminate() { terminated += 1; }
    }
    globalThis.Worker = PendingWorker;
    try {
        const controller = new AbortController();
        const pending = solveGravitySculptOffThread({}, null, { signal: controller.signal });
        controller.abort();
        await assert.rejects(pending, error => error?.name === 'AbortError');
        assert.ok(terminated >= 1);
    } finally {
        if (OriginalWorker === undefined) delete globalThis.Worker;
        else globalThis.Worker = OriginalWorker;
    }
});

test('gravity sculpt improves a layout without mutating the live simulation snapshot', async () => {
    const state = simulationState();
    const original = structuredClone(state);
    const launch = { velocity: { x: 240, y: 0 }, angleDegrees: 0, pullbackPower: 150 };
    const variables = createExistingPlanetVariables(state, [0], {
        adjustPosition: false,
        adjustMass: true,
        maximumMassMultiplier: 20
    });
    const reference = evaluateSculptCandidate(
        state,
        [{ x: 80, y: 300 }, { x: 700, y: 220 }],
        launch,
        variables,
        [1400],
        { previewSeconds: 2.5 }
    ).trajectory;
    const result = await solveGravitySculpt({
        state,
        desiredPath: reference,
        planetIndices: [0],
        launch,
        options: {
            adjustPosition: false,
            adjustMass: true,
            maximumMassMultiplier: 20,
            generations: 10,
            population: 14,
            searchFamilies: 3,
            candidateCount: 2,
            previewSeconds: 2.5,
            terminalPenalty: 0
        }
    });
    assert.ok(result.score < result.baselineScore);
    assert.equal(result.adjustments.length, 1);
    assert.notEqual(result.adjustments[0].mass, state.planets[0].mass);
    assert.deepEqual(state, original);
});

test('prefix curriculum improves a small multi-waypoint search without crowding its population', async () => {
    const state = simulationState();
    state.penguin.position = { x: 70, y: 300 };
    state.slingshot.position = { x: 70, y: 300 };
    state.target.position = { x: 760, y: 300 };
    state.planets = [
        { id: 'upper', position: { x: 270, y: 175 }, radius: 18, collisionRadius: 24, mass: 120, gravitationalReach: 900, orbit: null },
        { id: 'lower', position: { x: 470, y: 430 }, radius: 18, collisionRadius: 24, mass: 120, gravitationalReach: 900, orbit: null },
        { id: 'exit', position: { x: 650, y: 170 }, radius: 18, collisionRadius: 24, mass: 120, gravitationalReach: 900, orbit: null }
    ];
    const desiredPath = [
        { x: 70, y: 300 },
        { x: 280, y: 225 },
        { x: 500, y: 350 },
        { x: 730, y: 245 }
    ];
    const shared = {
        state,
        desiredPath,
        planetIndices: [0, 1, 2],
        launch: { velocity: { x: 235, y: 0 }, angleDegrees: 0, pullbackPower: 150 },
        options: {
            adjustPosition: false,
            adjustMass: true,
            maximumMassMultiplier: 14,
            previewSeconds: 3.2,
            checkpointTolerance: 20,
            candidateCount: 3,
            budgetMultiplier: 0.5,
            stages: {
                mass: { population: 12, generations: 4 },
                joint: { population: 16, generations: 6 }
            },
            robustLaunchOffsets: [],
            waypointCurriculumEnabled: false,
            seed: 778151
        }
    };
    const unguided = await solveGravitySculpt({
        ...shared,
        options: { ...shared.options, influenceGuidanceEnabled: false }
    });
    const curriculum = await solveGravitySculpt({
        ...shared,
        options: {
            ...shared.options,
            influenceGuidanceEnabled: false,
            waypointCurriculumEnabled: true
        }
    });

    assert.ok(curriculum.missedWaypointCount < unguided.missedWaypointCount);
    assert.ok(curriculum.checkpointCoverage > unguided.checkpointCoverage);
    assert.deepEqual(
        curriculum.prefixArchives.map(archive => archive.waypointCount),
        [1, 2, 3]
    );
});

test('staged differential evolution returns waypoint-tiered, distinct launch-and-layout candidates', async () => {
    const state = simulationState();
    const result = await solveGravitySculpt({
        state,
        desiredPath: [
            { x: 80, y: 300 }, { x: 220, y: 210 },
            { x: 430, y: 190 }, { x: 650, y: 320 }
        ],
        planetIndices: [0],
        options: {
            candidateCount: 3,
            previewSeconds: 2,
            influenceGuidanceEnabled: true,
            influenceActivationThreshold: 0.6
        }
    });
    assert.equal(result.candidates.length, 3);
    assert.ok(result.candidates.every(candidate => Number.isFinite(candidate.launch.angleDegrees)));
    assert.ok(result.candidates.every(candidate => candidate.checkpointCoverage >= 0));
    const jointAnalysis = result.influenceAnalyses.find(analysis =>
        analysis.stage.startsWith('joint') &&
        analysis.consideredVariables.some(key => key.startsWith('launch.')) &&
        analysis.consideredVariables.some(key => key.endsWith('.mass')) &&
        analysis.consideredVariables.some(key => key.endsWith('.x'))
    );
    assert.ok(jointAnalysis, 'joint influence analysis should span launch, mass, and position variables');
    assert.ok(jointAnalysis.activeVariables.length < jointAnalysis.consideredVariables.length);
    assert.ok(result.candidates.every(candidate =>
        candidate.missedWaypointCount === result.missedWaypointCount
    ));
    const signatures = new Set(result.candidates.map(candidate =>
        `${candidate.launch.angleDegrees.toFixed(3)}:${candidate.launch.pullbackPower.toFixed(3)}`
    ));
    assert.ok(signatures.size > 1);
    assert.equal(result.seed, 1548501076);
    assert.ok(result.prefixArchives.length > 1);
    assert.equal(result.prefixArchives.at(-1).waypointCount, 3);
    assert.ok(result.evaluations < 3000, `expected staged robustness below 3000 simulations, got ${result.evaluations}`);
    assert.ok(result.candidates.every(candidate => Number.isFinite(candidate.robustCheckpointCoverage)));
});
