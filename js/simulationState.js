import { effectiveGravitationalReach, GRAVITATIONAL_CONSTANT } from './globalConstants.js';
import {
    LevelObjectType,
    normalizeLevelObjectType,
    normalizeOrbitDefinition
} from './levelSchema.js';
import { assertValidLevelDefinition } from './levelValidation.js';
import { cloneOrbitState } from './orbitSimulation.js';
import { clonePoint } from './simulationGeometry.js';

export const DEFAULT_STAGE_BOUNDS = Object.freeze({ x: 0, y: 0, width: 800, height: 600 });
export const DEFAULT_FLIGHT_BOUNDS = Object.freeze({ x: -400, y: -400, width: 2400, height: 2200 });

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
        gravityStrength: params.gravityStrength ?? 1000,
        maxGravityAccel: params.maxGravityAccel ?? 50
    };
}

export function createSimulationStateFromLevel(level, options = {}) {
    if (options.validate !== false) assertValidLevelDefinition(level, options.source || 'simulation level');
    const objects = level.objects || [];
    const slingshotDefinition = objects.find(object => normalizeLevelObjectType(object.type) === LevelObjectType.SLINGSHOT);
    const targetDefinition = objects.find(object => normalizeLevelObjectType(object.type) === LevelObjectType.TARGET);
    const startPosition = clonePoint(
        slingshotDefinition ? objectPosition(slingshotDefinition) : (level.startPosition || { x: 100, y: 300 })
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
                radius: properties.radius ?? 30,
                collisionRadius: properties.collisionRadius ?? (properties.radius ?? 30) + 8,
                mass: properties.mass ?? 100,
                gravitationalReach: effectiveGravitationalReach(properties.gravitationalReach),
                orbit: orbitFromDefinition(definition)
            });
        } else if (type === LevelObjectType.BONUS) {
            const width = properties.width ?? 42.5;
            bonuses.push({
                id: nextId(type, properties.id),
                position: clonePoint(objectPosition(definition)),
                width,
                value: properties.value ?? 100,
                collected: properties.collected === true || properties.state === 'Hit',
                collectionRadius: 8 + width / 2,
                orbit: orbitFromDefinition(definition)
            });
        }
    }

    const targetProperties = targetDefinition?.properties || {};
    const targetPosition = targetDefinition
        ? objectPosition(targetDefinition)
        : (level.targetPosition || { x: 700, y: 300 });
    const target = {
        id: nextId(LevelObjectType.TARGET, targetProperties.id),
        position: clonePoint(targetPosition),
        width: targetProperties.width ?? 60,
        height: targetProperties.height ?? 60,
        orbit: targetDefinition ? orbitFromDefinition(targetDefinition) : null
    };
    const slingshotProperties = slingshotDefinition?.properties || {};

    return {
        time: 0,
        penguin: {
            position: clonePoint(startPosition),
            velocity: { x: 0, y: 0 },
            radius: options.penguinRadius ?? 16,
            state: 'idle',
            crashFramesRemaining: 0
        },
        planets,
        bonuses,
        target,
        slingshot: {
            position: clonePoint(startPosition),
            velocityMultiplier: slingshotProperties.velocityMultiplier ?? 15,
            maxPullback: slingshotProperties.maxPullback ?? slingshotProperties.stretchLimit ?? 100,
            minPullback: slingshotProperties.minPullback ?? 10
        },
        bounds: {
            stage: { ...(options.stageBounds || DEFAULT_STAGE_BOUNDS) },
            flight: { ...(options.flightBounds || DEFAULT_FLIGHT_BOUNDS) }
        },
        rules: {
            maxTries: level.rules?.maxTries ?? null,
            requiredBonuses: level.rules?.requiredBonuses ?? null,
            allowedMisses: level.rules?.allowedMisses ?? null,
            scoreMultiplier: level.rules?.scoreMultiplier ?? 1,
            gravitationalConstant: level.rules?.gravitationalConstant ?? GRAVITATIONAL_CONSTANT
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
