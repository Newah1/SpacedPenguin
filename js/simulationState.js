import { effectiveGravitationalReach, GRAVITATIONAL_CONSTANT } from './globalConstants.js';
import {
    LevelObjectType,
    normalizeLevelDefinition,
    normalizeLevelObjectType,
    normalizeOrbitDefinition
} from './levelSchema.js';
import { assertValidLevelDefinition } from './levelValidation.js';
import { cloneOrbitState } from './orbitSimulation.js';
import { clonePoint } from './simulationGeometry.js';
import { LEVEL_DEFAULTS, PHYSICS_CONFIG, WORLD_CONFIG } from './config/gameConfig.js';

export const DEFAULT_STAGE_BOUNDS = Object.freeze({
    x: 0,
    y: 0,
    width: WORLD_CONFIG.stage.width,
    height: WORLD_CONFIG.stage.height
});
export const DEFAULT_FLIGHT_BOUNDS = WORLD_CONFIG.flightBounds;

function objectPosition(definition) {
    return definition.position || {
        x: definition.properties.x,
        y: definition.properties.y
    };
}

function orbitFromDefinition(definition) {
    const source = definition.properties?.orbit;
    if (!source) return null;
    const normalized = normalizeOrbitDefinition(source);
    const params = { ...normalized.params };
    return {
        ...normalized,
        center: normalized.center ? clonePoint(normalized.center) : null,
        params,
        velocity: clonePoint(params.initialVelocity || { x: 0, y: 0 }),
        gravityStrength: params.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength,
        maxGravityAccel: params.maxGravityAccel ?? PHYSICS_CONFIG.orbit.maxGravityAcceleration
    };
}

export function createSimulationStateFromLevel(level, options = {}) {
    if (options.validate !== false) assertValidLevelDefinition(level, options.source || 'simulation level');
    const normalizedLevel = normalizeLevelDefinition(level);
    const objects = normalizedLevel.objects;
    const slingshotDefinition = objects.find(object => normalizeLevelObjectType(object.type) === LevelObjectType.SLINGSHOT);
    const targetDefinition = objects.find(object => normalizeLevelObjectType(object.type) === LevelObjectType.TARGET);
    const startPosition = clonePoint(
        slingshotDefinition ? objectPosition(slingshotDefinition) : normalizedLevel.startPosition
    );
    const counters = new Map();
    const nextId = (type, configuredId) => {
        if (configuredId) return configuredId;
        const next = (counters.get(type) || 0) + 1;
        counters.set(type, next);
        return `__${type}_${next}`;
    };

    const planets = [];
    const bonuses = [];
    for (const definition of objects) {
        const type = normalizeLevelObjectType(definition.type);
        const properties = definition.properties || {};
        if (type === LevelObjectType.PLANET) {
            planets.push({
                id: nextId(type, properties.id),
                position: clonePoint(objectPosition(definition)),
                radius: properties.radius ?? LEVEL_DEFAULTS.planet.radius,
                collisionRadius: properties.collisionRadius ??
                    (properties.radius ?? LEVEL_DEFAULTS.planet.radius) + LEVEL_DEFAULTS.planet.collisionPadding,
                mass: properties.mass ?? LEVEL_DEFAULTS.planet.mass,
                gravitationalReach: effectiveGravitationalReach(properties.gravitationalReach),
                orbit: orbitFromDefinition(definition)
            });
        } else if (type === LevelObjectType.BONUS) {
            const width = properties.width ?? LEVEL_DEFAULTS.bonus.width;
            bonuses.push({
                id: nextId(type, properties.id),
                position: clonePoint(objectPosition(definition)),
                width,
                value: properties.value ?? LEVEL_DEFAULTS.bonus.value,
                collected: properties.collected === true || properties.state === 'Hit',
                collectionRadius: LEVEL_DEFAULTS.bonus.collectionPadding + width / 2,
                orbit: orbitFromDefinition(definition)
            });
        }
    }

    const targetProperties = targetDefinition?.properties || {};
    const targetPosition = targetDefinition
        ? objectPosition(targetDefinition)
        : normalizedLevel.targetPosition;
    const target = {
        id: nextId(LevelObjectType.TARGET, targetProperties.id),
        position: clonePoint(targetPosition),
        width: targetProperties.width ?? LEVEL_DEFAULTS.target.width,
        height: targetProperties.height ?? LEVEL_DEFAULTS.target.height,
        orbit: targetDefinition ? orbitFromDefinition(targetDefinition) : null
    };
    const slingshotProperties = slingshotDefinition?.properties || {};

    return {
        time: 0,
        penguin: {
            position: clonePoint(startPosition),
            velocity: { x: 0, y: 0 },
            radius: options.penguinRadius ?? LEVEL_DEFAULTS.penguin.radius,
            state: 'idle',
            crashFramesRemaining: 0
        },
        planets,
        bonuses,
        target,
        slingshot: {
            position: clonePoint(startPosition),
            velocityMultiplier: slingshotProperties.velocityMultiplier ?? LEVEL_DEFAULTS.slingshot.velocityMultiplier,
            maxPullback: slingshotProperties.maxPullback ?? slingshotProperties.stretchLimit ?? LEVEL_DEFAULTS.slingshot.maxPullback,
            minPullback: slingshotProperties.minPullback ?? LEVEL_DEFAULTS.slingshot.minPullback
        },
        bounds: {
            stage: { ...(options.stageBounds || DEFAULT_STAGE_BOUNDS) },
            flight: { ...(options.flightBounds || DEFAULT_FLIGHT_BOUNDS) }
        },
        rules: {
            maxTries: normalizedLevel.rules.maxTries ?? null,
            requiredBonuses: normalizedLevel.rules.requiredBonuses ?? null,
            allowedMisses: normalizedLevel.rules.allowedMisses ?? null,
            scoreMultiplier: normalizedLevel.rules.scoreMultiplier,
            gravitationalConstant: normalizedLevel.rules.gravitationalConstant ?? GRAVITATIONAL_CONSTANT
        },
        counters: {
            tries: options.tries ?? 0,
            planetCollisions: options.planetCollisions ?? 0,
            currentAttemptScore: 0,
            distance: 0
        }
    };
}

export function cloneSimulationState(state) {
    return {
        ...state,
        penguin: {
            ...state.penguin,
            position: clonePoint(state.penguin.position),
            velocity: clonePoint(state.penguin.velocity)
        },
        planets: state.planets.map(planet => ({
            ...planet,
            position: clonePoint(planet.position),
            orbit: cloneOrbitState(planet.orbit)
        })),
        bonuses: state.bonuses.map(bonus => ({
            ...bonus,
            position: clonePoint(bonus.position),
            orbit: cloneOrbitState(bonus.orbit)
        })),
        target: {
            ...state.target,
            position: clonePoint(state.target.position),
            orbit: cloneOrbitState(state.target.orbit)
        },
        slingshot: { ...state.slingshot, position: clonePoint(state.slingshot.position) },
        bounds: { stage: { ...state.bounds.stage }, flight: { ...state.bounds.flight } },
        rules: { ...state.rules },
        counters: { ...state.counters }
    };
}

export function resetSimulationAttempt(initialState, currentState = initialState) {
    const reset = cloneSimulationState(initialState);
    reset.counters.tries = currentState.counters.tries;
    reset.counters.planetCollisions = currentState.counters.planetCollisions;
    reset.time = 0;
    return reset;
}
