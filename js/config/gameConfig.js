import { deepFreeze } from './configUtils.js';
import { LEVEL_DEFAULTS } from '../../generated/js/gameObjectTypes.js';

export { LEVEL_DEFAULTS };

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
    shippedLevelCount: 25,
    maxGeneratedLevel: 25,
    pathPrefix: 'levels/level',
    pathSuffix: '.json',
    padWidth: 2
});

export const LEVEL_COLLECTION_CONFIG = deepFreeze({
    shipped: {
        id: 'shipped', aliases: [], firstLevel: 1,
        levelCount: LEVEL_CATALOG_CONFIG.shippedLevelCount,
        maximumSelectableLevel: LEVEL_CATALOG_CONFIG.maxGeneratedLevel,
        pathPrefix: LEVEL_CATALOG_CONFIG.pathPrefix, pathSuffix: LEVEL_CATALOG_CONFIG.pathSuffix,
        padWidth: LEVEL_CATALOG_CONFIG.padWidth
    },
    manual: {
        id: 'manual', aliases: ['manual'], firstLevel: 1,
        levelCount: 20, maximumSelectableLevel: 20,
        pathPrefix: 'levels/manual/level', pathSuffix: '.json', padWidth: 0
    },
    challenge: {
        id: 'challenge', aliases: ['puzzle'], firstLevel: 1,
        levelCount: 1, maximumSelectableLevel: 1,
        pathPrefix: 'levels/challenge/level', pathSuffix: '.json', padWidth: 2
    }
});

export function levelCollectionPath(collectionId, levelNumber) {
    const collection = LEVEL_COLLECTION_CONFIG[collectionId];
    if (!collection) return null;
    const number = String(levelNumber).padStart(collection.padWidth, '0');
    return `${collection.pathPrefix}${number}${collection.pathSuffix}`;
}

export function parseLevelSelector(rawValue) {
    if (typeof rawValue !== 'string' || rawValue.trim() === '') return null;
    const value = rawValue.trim();
    const separator = value.indexOf(':');
    const rawCollection = separator >= 0 ? value.slice(0, separator).trim().toLowerCase() : null;
    const rawLevel = separator >= 0 ? value.slice(separator + 1).trim() : value;
    const collection = rawCollection === null
        ? LEVEL_COLLECTION_CONFIG.shipped
        : Object.values(LEVEL_COLLECTION_CONFIG).find(candidate => candidate.id !== 'shipped' && (
            candidate.id === rawCollection || candidate.aliases.includes(rawCollection)
        )
        );
    const level = Number(rawLevel);
    if (!collection || !Number.isInteger(level) ||
        level < collection.firstLevel || level > collection.maximumSelectableLevel) return null;
    return { collection: collection.id, level };
}

export function formatLevelSelector(collectionId, levelNumber) {
    return collectionId === 'shipped' ? String(levelNumber) : `${collectionId}:${levelNumber}`;
}

export function builtInLevelPath(levelNumber) {
    return levelCollectionPath('shipped', levelNumber);
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
    aimAssist: {
        previewSeconds: 1.25,
        timeStep: 1 / 60,
        sampleEverySteps: 2
    },
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
    defaultGravitationalReach: LEVEL_DEFAULTS.planet.gravitationalReach,
    orbit: {
        gravityStrength: 1000,
        maxGravityAcceleration: 50,
        initialVelocity: { x: 0, y: 50 },
        ellipseMinorAxisRatio: 0.7
    }
});
