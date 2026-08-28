import { LEVEL_DEFAULTS, PHYSICS_CONFIG, WORLD_CONFIG } from '../config/gameConfig.js';
import { LevelOrbitType } from './levelSchema.js';
import {
    isRuntimeObjectExportable,
    serializeRuntimeObject
} from '../runtime/runtimeObjectSerialization.js';

export function serializeOrbitSystem(orbitSystem) {
    const result = {
        orbitCenter: orbitSystem.orbitCenter ? {
            x: orbitSystem.orbitCenter.x,
            y: orbitSystem.orbitCenter.y
        } : null,
        orbitTargetId: orbitSystem.orbitTargetId || null,
        orbitRadius: orbitSystem.orbitRadius,
        orbitSpeed: orbitSystem.orbitSpeed,
        orbitAngle: orbitSystem.orbitAngle,
        orbitType: orbitSystem.orbitType,
        orbitParams: orbitSystem.orbitParams || {}
    };
    if (orbitSystem.orbitType === LevelOrbitType.GRAVITY) {
        result.orbitParams = {
            ...result.orbitParams,
            gravityStrength: orbitSystem.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength,
            initialVelocity: orbitSystem.velocity
                ? { x: orbitSystem.velocity.x, y: orbitSystem.velocity.y }
                : { ...PHYSICS_CONFIG.orbit.initialVelocity }
        };
    }
    return result;
}

export function serializeWaypointPath(waypointSystem) {
    return {
        waypoints: waypointSystem.waypoints.map(point => ({ x: point.x, y: point.y })),
        speed: waypointSystem.speed,
        mode: waypointSystem.mode,
        phase: waypointSystem.phase
    };
}

export function serializeLevelRules(levelRules) {
    if (!levelRules) {
        return {
            maxTries: null,
            timeLimit: null,
            scoreMultiplier: LEVEL_DEFAULTS.rules.scoreMultiplier
        };
    }
    return {
        maxTries: levelRules.maxTries,
        timeLimit: levelRules.timeLimit,
        scoreMultiplier: levelRules.scoreMultiplier,
        requiredBonuses: levelRules.requiredBonuses,
        allowedMisses: levelRules.allowedMisses,
        gravitationalConstant: levelRules.gravitationalConstant
    };
}

export class RuntimeLevelSerializer {
    serialize({ world, session }) {
        const exportedSlingshotPosition = world.slingshot?.launchModel === 'director'
            ? world.slingshot.resetPosition
            : world.slingshot?.position;
        const startPosition = exportedSlingshotPosition
            ? { ...exportedSlingshotPosition }
            : (world.penguin
                ? { x: world.penguin.x, y: world.penguin.y }
                : { ...WORLD_CONFIG.defaultStartPosition });
        const objects = world.membership.list()
            .filter(isRuntimeObjectExportable)
            .map(object => serializeRuntimeObject(object, {
                serializeOrbit: serializeOrbitSystem,
                serializeWaypointPath
            }))
            .filter(Boolean);

        return {
            name: session.levelMetadata?.name || `Custom Level ${session.level}`,
            description: session.levelMetadata?.description ?? '',
            startPosition,
            targetPosition: world.target
                ? { x: world.target.position.x, y: world.target.position.y }
                : { ...WORLD_CONFIG.defaultTargetPosition },
            bounds: {
                stage: { ...world.stageRect },
                flight: { ...world.flightRect }
            },
            ...(world.cameraConfig ? { camera: { ...world.cameraConfig } } : {}),
            objects,
            rules: serializeLevelRules(session.levelRules)
        };
    }

    serializeObject(object) {
        return serializeRuntimeObject(object, {
            serializeOrbit: serializeOrbitSystem,
            serializeWaypointPath
        });
    }
}

export default RuntimeLevelSerializer;
