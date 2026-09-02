import { deepFreeze } from './configUtils.js';

export const EDITOR_CONFIG = deepFreeze({
    playfield: {
        lossBufferX: 200,
        lossBufferY: 200,
        minimumWidth: 400,
        minimumHeight: 300,
        maximumDimension: 20000,
        minimumZoom: 0.01,
        maximumZoom: 4,
        wheelZoomFactor: 1.12
    },
    authoringDefaults: {
        planet: {
            radius: 50,
            mass: 1000,
            gravitationalReach: 0,
            planetType: 'planet_grey'
        },
        bonus: { value: 100 },
        slingshot: { maxPullback: 150 },
        orbit: {
            radius: 100,
            speed: 1,
            gravityStrength: 5000,
            initialVelocity: { x: 0, y: 3 }
        }
    },
    cloneOffset: { x: 50, y: 50 },
    deserializationFallbacks: {
        textContent: 'Text',
        textColor: '#FFFFFF'
    },
    interaction: {
        longPressMs: 500,
        deferredListenerMs: 100,
        orbitVerificationMs: 100,
        touchMovementThreshold: 15,
        orbitCenterHitRadius: { pointer: 10, touch: 15 },
        waypointHitRadius: { pointer: 12, touch: 20 },
        rotationHandleRadius: { pointer: 11, touch: 18 },
        rotationHandleOffset: 18,
        minimumTouchTargetRadius: 30
    },
    orbitReset: {
        minimumInitialDistance: 50,
        maximumInitialDistance: 400,
        fallbackInitialDistance: 150
    },
    overlay: {
        gridSize: 50,
        figure8StepRadians: 0.1,
        gravityPreviewRadius: 100,
        velocityVectorScale: 2
    },
    gravitySculpt: {
        candidateCount: 4,
        budgetMultiplier: 1,
        budgetMultiplierRange: { minimum: 0.5, maximum: 5, step: 0.25 },
        maximumPopulation: 64,
        eliteSeedCount: 8,
        differentialWeight: 0.72,
        crossoverRate: 0.88,
        robustLaunchOffsets: [
            { angleDegrees: -2, powerFraction: 0 },
            { angleDegrees: 2, powerFraction: 0 },
            { angleDegrees: 0, powerFraction: -0.06 },
            { angleDegrees: 0, powerFraction: 0.06 }
        ],
        robustCentralWeight: 0.35,
        robustAverageWeight: 0.4,
        robustWorstWeight: 0.25,
        robustOptimizationFraction: 0.25,
        hardConstraintPenalty: 1000000000,
        waypointConstraintPenalty: 10000000000,
        unmatchedWaypointDistance: 1000,
        stages: {
            launch: { population: 18, generations: 6 },
            mass: { population: 20, generations: 7 },
            position: { population: 28, generations: 10 },
            joint: { population: 36, generations: 24 }
        },
        previewSeconds: 5,
        trajectoryDistanceBudgetMultiplier: 2,
        trajectoryTimeSafetyMultiplier: 3,
        sampleEverySteps: 2,
        checkpointTolerance: 60,
        checkpointToleranceRange: { minimum: 20, maximum: 120, step: 5 },
        waypointProximityWeight: 0.08,
        pathEfficiencyWeight: 4000,
        peakGravityAccelerationSoftLimit: 900,
        meanGravityAccelerationSoftLimit: 450,
        peakGravityAccelerationWeight: 12000,
        meanGravityAccelerationWeight: 6000,
        positionRange: 260,
        pathPlanetOffset: { minimum: 55, maximum: 170 },
        minimumMass: 10,
        maximumMassMultiplier: 8,
        influenceGuidanceEnabled: false,
        influencePerturbationFraction: 0.05,
        influenceSeedScales: [0.35, 0.7, 1],
        influencePopulationFraction: 0.3,
        influenceMinimumPopulation: 18,
        influenceCorrectionPasses: 5,
        influenceRegularization: 0.000001,
        influenceActivationThreshold: 0.2,
        influenceMinimumActiveVariables: 3,
        influenceBackgroundCrossoverRate: 0.2,
        waypointCurriculumEnabled: true,
        waypointCurriculumFullRouteFraction: 0.5,
        waypointCurriculumArchiveSize: 8,
        convergenceMinimumGenerations: 4,
        convergencePatience: 4,
        convergenceRelativeTolerance: 0.000001,
        launchAngleRange: 70,
        minimumLaunchPowerFraction: 0.25,
        movementPenalty: 3,
        massPenalty: 800,
        launchPenalty: 1,
        terminalPenalty: 40000,
        diversityThreshold: 0.14,
        seed: 1548501076,
        waypointMinimumSpacing: 12
    }
});
