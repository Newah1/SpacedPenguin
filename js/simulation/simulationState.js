import { effectiveGravitationalReach, GRAVITATIONAL_CONSTANT } from '../config/legacyConstants.js';
import {
    LevelObjectType,
    normalizeLevelDefinition,
    normalizeLevelObjectType,
    normalizeOrbitDefinition,
    normalizeWaypointPathDefinition
} from '../levels/levelSchema.js';
import { assertValidLevelDefinition } from '../levels/levelValidation.js';
import { cloneOrbitState } from './orbitSimulation.js';
import { cloneWaypointPathState } from './waypointSimulation.js';
import { clonePoint } from './simulationGeometry.js';
import { LEVEL_DEFAULTS, PHYSICS_CONFIG, WORLD_CONFIG } from '../config/gameConfig.js';

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
        frameAccumulator: 0,
        gravityStrength: params.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength,
        maxGravityAccel: params.maxGravityAccel ?? PHYSICS_CONFIG.orbit.maxGravityAcceleration
    };
}

function waypointPathFromDefinition(definition) {
    const source = definition.properties?.waypointPath;
    return source ? cloneWaypointPathState(normalizeWaypointPathDefinition(source)) : null;
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
    const portals = [];
    const speedBoosters = [];
    const deflectorBumpers = [];
    const forceFields = [];
    const decorations = [];
    for (const definition of objects) {
        const type = normalizeLevelObjectType(definition.type);
        const properties = definition.properties || {};
        if (type === LevelObjectType.PLANET || type === LevelObjectType.BLACK_HOLE ||
            type === LevelObjectType.REPULSOR_STAR) {
            const isBlackHole = type === LevelObjectType.BLACK_HOLE;
            const isRepulsorStar = type === LevelObjectType.REPULSOR_STAR;
            const isNonCollidingGravitySource = isBlackHole || isRepulsorStar;
            planets.push({
                id: nextId(type, properties.id),
                type,
                position: clonePoint(objectPosition(definition)),
                radius: properties.radius ?? LEVEL_DEFAULTS.planet.radius,
                collisionRadius: isNonCollidingGravitySource ? 0 : properties.collisionRadius ??
                    (properties.radius ?? LEVEL_DEFAULTS.planet.radius) + LEVEL_DEFAULTS.planet.collisionPadding,
                collidable: !isNonCollidingGravitySource && properties.collidable !== false,
                mass: isRepulsorStar
                    ? -Math.abs(properties.strength ?? LEVEL_DEFAULTS.repulsorStar.strength)
                    : properties.mass ?? LEVEL_DEFAULTS.planet.mass,
                gravitationalReach: effectiveGravitationalReach(isRepulsorStar
                    ? properties.repulsionReach
                    : properties.gravitationalReach),
                orbit: orbitFromDefinition(definition),
                waypointPath: waypointPathFromDefinition(definition)
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
                orbit: orbitFromDefinition(definition),
                waypointPath: waypointPathFromDefinition(definition)
            });
        } else if (type === LevelObjectType.PORTAL) {
            portals.push({
                id: nextId(type, properties.id),
                position: clonePoint(objectPosition(definition)),
                width: properties.width ?? LEVEL_DEFAULTS.portal.width,
                height: properties.height ?? LEVEL_DEFAULTS.portal.height,
                rotation: properties.rotation ?? 0,
                color: properties.color ?? LEVEL_DEFAULTS.portal.color,
                pairedPortalId: properties.pairedPortalId,
                playSound: properties.playSound ?? LEVEL_DEFAULTS.portal.playSound,
                waypointPath: waypointPathFromDefinition(definition)
            });
        } else if (type === LevelObjectType.SPEED_BOOSTER) {
            speedBoosters.push({
                id: nextId(type, properties.id),
                position: clonePoint(objectPosition(definition)),
                width: properties.width ?? LEVEL_DEFAULTS.speedBooster.width,
                height: properties.height ?? LEVEL_DEFAULTS.speedBooster.height,
                rotation: properties.rotation ?? 0,
                speedMultiplier: properties.speedMultiplier ?? LEVEL_DEFAULTS.speedBooster.speedMultiplier,
                playSound: properties.playSound ?? LEVEL_DEFAULTS.speedBooster.playSound,
                waypointPath: waypointPathFromDefinition(definition)
            });
        } else if (type === LevelObjectType.DEFLECTOR_BUMPER) {
            deflectorBumpers.push({
                id: nextId(type, properties.id),
                position: clonePoint(objectPosition(definition)),
                radius: properties.radius ?? LEVEL_DEFAULTS.deflectorBumper.radius,
                restitution: properties.restitution ?? LEVEL_DEFAULTS.deflectorBumper.restitution,
                playSound: properties.playSound ?? LEVEL_DEFAULTS.deflectorBumper.playSound,
                waypointPath: waypointPathFromDefinition(definition)
            });
        } else if (type === LevelObjectType.ONE_WAY_FORCE_FIELD) {
            forceFields.push({
                id: nextId(type, properties.id),
                position: clonePoint(objectPosition(definition)),
                width: properties.width ?? LEVEL_DEFAULTS.oneWayForceField.width,
                height: properties.height ?? LEVEL_DEFAULTS.oneWayForceField.height,
                rotation: properties.rotation ?? LEVEL_DEFAULTS.oneWayForceField.rotation,
                restitution: properties.restitution ?? LEVEL_DEFAULTS.oneWayForceField.restitution,
                playSound: properties.playSound ?? LEVEL_DEFAULTS.oneWayForceField.playSound,
                waypointPath: waypointPathFromDefinition(definition)
            });
        } else if (type === LevelObjectType.TEXT || type === LevelObjectType.POINTING_ARROW) {
            decorations.push({
                id: nextId(type, properties.id),
                position: clonePoint(objectPosition(definition)),
                waypointPath: waypointPathFromDefinition(definition)
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
        collisionRadius: targetProperties.collisionRadius ??
            (targetProperties.width ?? LEVEL_DEFAULTS.target.width) / 2,
        orbit: targetDefinition ? orbitFromDefinition(targetDefinition) : null,
        waypointPath: targetDefinition ? waypointPathFromDefinition(targetDefinition) : null
    };
    const slingshotProperties = slingshotDefinition?.properties || {};

    return {
        time: 0,
        // Monotonic proof-protocol clock. Unlike `time`, this is preserved
        // across attempts and is advanced only by fixed simulation ticks.
        runTick: options.runTick ?? 0,
        penguin: {
            position: clonePoint(startPosition),
            velocity: { x: 0, y: 0 },
            radius: options.penguinRadius ?? LEVEL_DEFAULTS.penguin.radius,
            state: PenguinState.IDLE,
            crashFramesRemaining: 0,
            portalLockId: null,
            speedBoosterLockId: null
        },
        planets,
        bonuses,
        portals,
        speedBoosters,
        deflectorBumpers,
        forceFields,
        decorations,
        target,
        slingshot: {
            position: clonePoint(startPosition),
            anchorPosition: slingshotProperties.anchorPosition
                ? clonePoint(slingshotProperties.anchorPosition)
                : clonePoint(startPosition),
            launchModel: slingshotProperties.launchModel ?? 'modern',
            sourceFrameRate: slingshotProperties.sourceFrameRate ?? null,
            coordinateScale: slingshotProperties.coordinateScale ?? 1,
            velocityMultiplier: slingshotProperties.velocityMultiplier ?? LEVEL_DEFAULTS.slingshot.velocityMultiplier,
            maxPullback: slingshotProperties.maxPullback ?? slingshotProperties.stretchLimit ?? LEVEL_DEFAULTS.slingshot.maxPullback,
            minPullback: slingshotProperties.minPullback ?? LEVEL_DEFAULTS.slingshot.minPullback,
            waypointPath: slingshotDefinition ? waypointPathFromDefinition(slingshotDefinition) : null
        },
        bounds: {
            stage: { ...(options.stageBounds || normalizedLevel.bounds?.stage || DEFAULT_STAGE_BOUNDS) },
            flight: { ...(options.flightBounds || normalizedLevel.bounds?.flight || DEFAULT_FLIGHT_BOUNDS) }
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
            orbit: cloneOrbitState(planet.orbit),
            waypointPath: cloneWaypointPathState(planet.waypointPath)
        })),
        bonuses: state.bonuses.map(bonus => ({
            ...bonus,
            position: clonePoint(bonus.position),
            orbit: cloneOrbitState(bonus.orbit),
            waypointPath: cloneWaypointPathState(bonus.waypointPath)
        })),
        portals: (state.portals || []).map(portal => ({
            ...portal,
            position: clonePoint(portal.position),
            waypointPath: cloneWaypointPathState(portal.waypointPath)
        })),
        speedBoosters: (state.speedBoosters || []).map(speedBooster => ({
            ...speedBooster,
            position: clonePoint(speedBooster.position),
            waypointPath: cloneWaypointPathState(speedBooster.waypointPath)
        })),
        deflectorBumpers: (state.deflectorBumpers || []).map(bumper => ({
            ...bumper,
            position: clonePoint(bumper.position),
            waypointPath: cloneWaypointPathState(bumper.waypointPath)
        })),
        forceFields: (state.forceFields || []).map(field => ({
            ...field,
            position: clonePoint(field.position),
            waypointPath: cloneWaypointPathState(field.waypointPath)
        })),
        decorations: (state.decorations || []).map(decoration => ({
            ...decoration,
            position: clonePoint(decoration.position),
            waypointPath: cloneWaypointPathState(decoration.waypointPath)
        })),
        target: {
            ...state.target,
            position: clonePoint(state.target.position),
            orbit: cloneOrbitState(state.target.orbit),
            waypointPath: cloneWaypointPathState(state.target.waypointPath)
        },
        slingshot: {
            ...state.slingshot,
            position: clonePoint(state.slingshot.position),
            anchorPosition: clonePoint(state.slingshot.anchorPosition || state.slingshot.position),
            waypointPath: cloneWaypointPathState(state.slingshot.waypointPath)
        },
        bounds: { stage: { ...state.bounds.stage }, flight: { ...state.bounds.flight } },
        rules: { ...state.rules },
        counters: { ...state.counters }
    };
}

export function resetSimulationAttempt(initialState, currentState = initialState) {
    // Browser retries reset the player-owned attempt state while the world
    // keeps moving. Preserve orbit phase/positions and aggregate counters.
    const reset = cloneSimulationState(currentState);
    const initial = cloneSimulationState(initialState);
    reset.penguin = initial.penguin;
    reset.slingshot = initial.slingshot;
    reset.bonuses.forEach((bonus, index) => {
        bonus.collected = initialState.bonuses[index]?.collected ?? false;
    });
    reset.counters.currentAttemptScore = 0;
    reset.counters.distance = 0;
    return reset;
}
import { PenguinState } from '../runtime/penguinState.js';
