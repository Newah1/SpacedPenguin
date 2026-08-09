import { deepFreeze } from './configUtils.js';

export const WORLD_CONFIG = deepFreeze({
    stage: { width: 800, height: 600 },
    defaultStartPosition: { x: 100, y: 300 },
    defaultTargetPosition: { x: 700, y: 300 },
    // Preserve the port's existing expanded flight area exactly. It is wider
    // than a conventional one-border-per-side rectangle by design.
    flightBounds: { x: -400, y: -400, width: 2400, height: 2200 }
});

export const LEVEL_CATALOG_CONFIG = deepFreeze({
    firstLevel: 1,
    shippedLevelCount: 20,
    // Levels above the shipped catalog use procedural fallback generation.
    maxGeneratedLevel: 25,
    pathPrefix: 'levels/level',
    pathSuffix: '.json'
});

export function builtInLevelPath(levelNumber) {
    return `${LEVEL_CATALOG_CONFIG.pathPrefix}${levelNumber}${LEVEL_CATALOG_CONFIG.pathSuffix}`;
}

export const LEVEL_GENERATOR_CONFIG = deepFreeze({
    planets: {
        baseCount: 1,
        perLevel: 1,
        maximumCount: 5,
        xRange: [200, 600],
        yRange: [100, 500],
        radiusRange: [20, 40],
        massRange: [50, 200]
    },
    bonuses: {
        perLevel: 2,
        maximumCount: 8,
        xRange: [150, 650],
        yRange: [50, 550],
        valueRange: [50, 500]
    },
    scoreMultiplierBase: 1,
    scoreMultiplierPerLevel: 0.1
});

export const SIMULATION_CONFIG = deepFreeze({
    legacyPhysicsFps: 60,
    launchCurve: {
        lowBreakpoint: 0.3,
        highBreakpoint: 0.7,
        baseScale: 0.5,
        middleBaseScale: 1,
        highBaseScale: 1.5,
        bandScaleGain: 0.5,
        highExponent: 1.5,
        speedDivisor: 250,
        minimumSpeedFactor: 8,
        maximumSpeedFactor: 80,
        responseExponent: 0.9
    },
    collision: {
        planetCrashFrames: 150,
        terminalCrashFrames: 2,
        restitution: 0.8,
        minimumBounceSpeed: 50,
        separationPadding: 5
    }
});

export const PHYSICS_CONFIG = deepFreeze({
    gravitationalConstant: 3,
    defaultGravitationalReach: 5000,
    orbit: {
        gravityStrength: 1000,
        maxGravityAcceleration: 50,
        initialVelocity: { x: 0, y: 50 },
        ellipseMinorAxisRatio: 0.7
    }
});

export const LEVEL_DEFAULTS = deepFreeze({
    planet: {
        radius: 30,
        mass: 100,
        collisionPadding: 8,
        gravitationalReach: PHYSICS_CONFIG.defaultGravitationalReach
    },
    bonus: {
        value: 100,
        width: 42.5,
        height: 43,
        collectionPadding: 8
    },
    target: {
        width: 60,
        height: 60,
        spriteType: 'ship_open'
    },
    text: {
        content: 'Sample Text',
        width: 200,
        height: 100,
        visible: true,
        textAlign: 'left',
        fontSize: 16,
        fontFamily: 'Arial, sans-serif',
        color: '#FFFFCC',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        padding: 10,
        maxWidth: null,
        autoSize: true,
        fadeIn: false,
        fadeInDuration: 1,
        renderOrder: 8
    },
    pointingArrow: {
        color: '#00FFFF',
        glowColor: '#0099FF',
        baseWidth: 20,
        scaleWithDistance: true,
        maxDistance: 300,
        minWidth: 15,
        maxWidth: 60,
        pulseSpeed: 3,
        minAlpha: 0.6,
        maxAlpha: 1,
        renderOrder: 9
    },
    penguin: {
        radius: 16,
        mass: 1
    },
    slingshot: {
        velocityMultiplier: 15,
        maxPullback: 100,
        minPullback: 10
    },
    rules: {
        scoreMultiplier: 1
    }
});
