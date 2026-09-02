import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSimulationStateFromLevel } from '../js/simulation/simulationState.js';
import {
    createLaunchVariables,
    evaluateSculptCandidate,
    solveGravitySculpt
} from '../js/simulation/gravitySculptor.js';
import {
    createGravitySculptWasmEvaluator,
    initializeWasmSimulation
} from '../js/simulation/wasmSimulationBridge.js';
import { SIMULATION_CONFIG } from '../js/config/gameConfig.js';
import { EDITOR_CONFIG } from '../js/config/editorConfig.js';

function sculptState() {
    return createSimulationStateFromLevel({
        name: 'Gravity Sculpt Wasm parity',
        startPosition: { x: 70, y: 300 },
        targetPosition: { x: 760, y: 300 },
        objects: [
            { type: 'slingshot', position: { x: 70, y: 300 }, properties: {
                velocityMultiplier: 1, maxPullback: 150, minPullback: 25
            } },
            { type: 'planet', position: { x: 270, y: 175 }, properties: {
                id: 'upper', radius: 18, mass: 120, gravitationalReach: 900
            } },
            { type: 'planet', position: { x: 470, y: 430 }, properties: {
                id: 'lower', radius: 18, mass: 120, gravitationalReach: 900
            } },
            { type: 'target', position: { x: 760, y: 300 }, properties: {
                width: 20, height: 20
            } }
        ],
        rules: { gravitationalConstant: 3 }
    });
}

const desiredPath = [
    { x: 70, y: 300 },
    { x: 280, y: 225 },
    { x: 500, y: 350 },
    { x: 730, y: 245 }
];

const options = {
    adjustPosition: false,
    adjustMass: true,
    adjustLaunch: false,
    seed: 284117,
    previewSeconds: 2,
    budgetMultiplier: 0.5,
    influenceGuidanceEnabled: false,
    waypointCurriculumEnabled: false,
    robustLaunchOffsets: [],
    stages: {
        mass: { population: 8, generations: 2 },
        joint: { population: 8, generations: 2 }
    }
};

function assertClose(actual, expected, label, epsilon = 1e-7) {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${label}: ${actual} !== ${expected}`);
}

test('Gravity Sculpt batches preserve JavaScript optimizer results in Rust/Wasm', async () => {
    const javascript = await solveGravitySculpt({
        state: sculptState(), desiredPath, planetIndices: [0, 1],
        launch: { velocity: { x: 235, y: 0 }, angleDegrees: 0, pullbackPower: 150 },
        options
    });
    assert.equal(javascript.evaluationBackend, 'javascript');

    const bytes = await readFile(new URL('../rust/simulator/pkg/spaced_penguin_simulator.wasm', import.meta.url));
    await initializeWasmSimulation(bytes);
    const wasm = await solveGravitySculpt({
        state: sculptState(), desiredPath, planetIndices: [0, 1],
        launch: { velocity: { x: 235, y: 0 }, angleDegrees: 0, pullbackPower: 150 },
        options
    });

    assert.equal(wasm.evaluationBackend, 'wasm');
    assert.equal(wasm.evaluations, javascript.evaluations);
    assert.equal(wasm.candidates.length, javascript.candidates.length);
    assert.deepEqual(wasm.candidates.map(value => value.missedWaypointCount),
        javascript.candidates.map(value => value.missedWaypointCount));
    wasm.candidates.forEach((candidate, index) => {
        const expected = javascript.candidates[index];
        assertClose(candidate.score, expected.score, `candidate ${index} score`, 1e-4);
        assertClose(candidate.checkpointCoverage, expected.checkpointCoverage,
            `candidate ${index} coverage`);
        assert.equal(candidate.trajectory.length, expected.trajectory.length);
        candidate.trajectory.forEach((point, pointIndex) => {
            assertClose(point.x, expected.trajectory[pointIndex].x,
                `candidate ${index} trajectory ${pointIndex} x`);
            assertClose(point.y, expected.trajectory[pointIndex].y,
                `candidate ${index} trajectory ${pointIndex} y`);
        });
    });
});

test('Gravity Sculpt retains JavaScript fallback for moving-world candidates', async () => {
    const state = sculptState();
    state.target.orbit = {
        type: 'circular', center: { x: 700, y: 300 }, radius: 60, speed: 0.2, angle: 0
    };
    const result = await solveGravitySculpt({
        state, desiredPath, planetIndices: [0, 1],
        launch: { velocity: { x: 235, y: 0 }, angleDegrees: 0, pullbackPower: 150 },
        options
    });
    assert.equal(result.evaluationBackend, 'javascript');
});

test('Gravity Sculpt Wasm batches preserve robust launch and hard-goal scoring', () => {
    const state = sculptState();
    const variables = createLaunchVariables(state, desiredPath);
    const launch = {
        angleDegrees: variables[0].initial,
        pullbackPower: variables[1].initial,
        velocity: { x: 0, y: 0 }
    };
    const values = variables.map(variable => variable.initial);
    const config = {
        previewSeconds: 2,
        goals: { requireTarget: true, avoidPlanetCollisions: true },
        robustLaunchOffsets: [
            { angleDegrees: -2, powerFraction: 0 },
            { angleDegrees: 2, powerFraction: 0 }
        ]
    };
    const expected = evaluateSculptCandidate(
        state, desiredPath, launch, variables, values, config
    );
    const evaluator = createGravitySculptWasmEvaluator({
        state, launch, variables, simulation: SIMULATION_CONFIG
    });
    assert.ok(evaluator);
    try {
        const [actual] = evaluator.evaluateBatch(
            desiredPath,
            { ...EDITOR_CONFIG.gravitySculpt, ...options, ...config },
            [values],
            { captureTrajectories: true }
        );
        assert.equal(actual.simulationCount, expected.simulationCount);
        assert.deepEqual(actual.constraintViolations, expected.constraintViolations);
        assertClose(actual.score, expected.score, 'robust score', 1e-4);
        assertClose(actual.robustCheckpointCoverage, expected.robustCheckpointCoverage,
            'robust coverage');
        assertClose(actual.robustGoalSuccessRate, expected.robustGoalSuccessRate,
            'robust goals');
    } finally {
        evaluator.dispose();
    }
});

test('Gravity Sculpt comfort metrics exclude target-hit stopping acceleration', () => {
    const state = sculptState();
    state.planets = [];
    state.rules.gravitationalConstant = 0;
    const path = [{ x: 70, y: 300 }, { x: 760, y: 300 }];
    const variables = createLaunchVariables(state, path);
    const launch = {
        angleDegrees: variables[0].initial,
        pullbackPower: variables[1].initial,
        velocity: { x: 0, y: 0 }
    };
    const values = variables.map(variable => variable.initial);
    const config = {
        ...EDITOR_CONFIG.gravitySculpt,
        robustLaunchOffsets: [],
        goals: { requireTarget: true }
    };
    const expected = evaluateSculptCandidate(state, path, launch, variables, values, config);
    const evaluator = createGravitySculptWasmEvaluator({
        state, launch, variables, simulation: SIMULATION_CONFIG
    });
    assert.ok(evaluator);
    try {
        const [actual] = evaluator.evaluateBatch(path, config, [values]);
        assert.equal(expected.terminal, 'hitTarget');
        assert.equal(actual.terminal, 'hitTarget');
        assertClose(actual.peakGravityAcceleration, expected.peakGravityAcceleration, 'peak gravity');
        assertClose(actual.meanGravityAcceleration, expected.meanGravityAcceleration, 'mean gravity');
        assertClose(actual.score, expected.score, 'target-hit score', 1e-4);
    } finally {
        evaluator.dispose();
    }
});
