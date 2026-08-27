import { performance } from 'node:perf_hooks';
import {
    createExistingPlanetVariables,
    evaluateSculptCandidate,
    solveGravitySculpt
} from '../js/simulation/gravitySculptor.js';

function benchmarkState() {
    return {
        time: 0,
        penguin: {
            position: { x: 70, y: 300 }, velocity: { x: 0, y: 0 },
            radius: 10, state: 'idle', crashFramesRemaining: 0
        },
        planets: [
            { id: 'upper', position: { x: 270, y: 175 }, radius: 18, collisionRadius: 24, mass: 120, gravitationalReach: 900, orbit: null },
            { id: 'lower', position: { x: 470, y: 430 }, radius: 18, collisionRadius: 24, mass: 120, gravitationalReach: 900, orbit: null },
            { id: 'exit', position: { x: 650, y: 170 }, radius: 18, collisionRadius: 24, mass: 120, gravitationalReach: 900, orbit: null }
        ],
        bonuses: [],
        target: { id: 'target', position: { x: 760, y: 300 }, width: 20, height: 20, orbit: null },
        slingshot: {
            position: { x: 70, y: 300 }, velocityMultiplier: 1,
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

const state = benchmarkState();
const planetIndices = state.planets.map((_planet, index) => index);
const launch = { velocity: { x: 235, y: 0 }, angleDegrees: 0, pullbackPower: 150 };
const variables = createExistingPlanetVariables(state, planetIndices, {
    adjustPosition: false,
    adjustMass: true,
    maximumMassMultiplier: 14
});
const desiredPath = [
    { x: 70, y: 300 },
    { x: 280, y: 225 },
    { x: 500, y: 350 },
    { x: 730, y: 245 }
];
const initial = evaluateSculptCandidate(
    state,
    desiredPath,
    launch,
    variables,
    variables.map(variable => variable.initial),
    { previewSeconds: 3.2, checkpointTolerance: 20, robustLaunchOffsets: [] }
);
const sharedOptions = {
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
        robustLaunchOffsets: []
};

async function benchmark(seed, overrides) {
    const started = performance.now();
    const result = await solveGravitySculpt({
        state,
        desiredPath,
        planetIndices,
        launch,
        options: { ...sharedOptions, ...overrides, seed }
    });
    return {
        elapsedMilliseconds: Math.round(performance.now() - started),
        evaluations: result.evaluations,
        missedWaypoints: result.missedWaypointCount,
        checkpointCoverage: result.checkpointCoverage,
        score: Math.round(result.score),
        masses: result.adjustments.map(adjustment => Math.round(adjustment.mass))
    };
}

const seeds = [284117, 912733, 441029, 778151, 630211, 159733];
const runs = await Promise.all(seeds.map(async seed => ({
    seed,
    unguided: await benchmark(seed, {
        influenceGuidanceEnabled: false,
        waypointCurriculumEnabled: false
    }),
    guided: await benchmark(seed, {
        influenceGuidanceEnabled: true,
        waypointCurriculumEnabled: false
    }),
    curriculum: await benchmark(seed, {
        influenceGuidanceEnabled: false,
        waypointCurriculumEnabled: true
    }),
    guidedCurriculum: await benchmark(seed, {
        influenceGuidanceEnabled: true,
        waypointCurriculumEnabled: true
    })
})));

function summarize(name) {
    const results = runs.map(run => run[name]);
    return {
        averageMilliseconds: Math.round(results.reduce((sum, result) => sum + result.elapsedMilliseconds, 0) / results.length),
        averageEvaluations: Math.round(results.reduce((sum, result) => sum + result.evaluations, 0) / results.length),
        averageMissedWaypoints: Number((results.reduce((sum, result) => sum + result.missedWaypoints, 0) / results.length).toFixed(2)),
        averageCoverage: Number((results.reduce((sum, result) => sum + result.checkpointCoverage, 0) / results.length).toFixed(3)),
        completeRoutes: results.filter(result => result.missedWaypoints === 0).length,
        massAdjustmentsUp: results.flatMap(result => result.masses).filter(mass => mass > 120).length,
        massAdjustmentsDown: results.flatMap(result => result.masses).filter(mass => mass < 120).length
    };
}

console.log(JSON.stringify({
    initial: {
        missedWaypoints: initial.missedWaypointCount,
        score: Math.round(initial.score)
    },
    seeds,
    unguided: summarize('unguided'),
    guided: summarize('guided'),
    curriculum: summarize('curriculum'),
    guidedCurriculum: summarize('guidedCurriculum'),
    runs
}, null, 2));
