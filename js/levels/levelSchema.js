// Shared vocabulary and runtime capabilities for the JSON level format.

import { LEVEL_DEFAULTS, PHYSICS_CONFIG, WORLD_CONFIG } from '../config/gameConfig.js';
import {
    LevelCameraMode, LevelOrbitType,
    LEVEL_CAMERA_MODES, LEVEL_ORBIT_TYPES,
    normalizeLevelOrbitType, isLevelOrbitType
} from './levelObjectVocabulary.js';
import {
    LevelObjectType, LEVEL_OBJECT_TYPE_ALIASES, LEVEL_OBJECT_TYPE_NAMES,
    LEVEL_OBJECT_TYPES, LEVEL_OBJECT_TYPE_BY_CLASS_NAME, normalizeLevelObjectType,
    getGameObjectDefinition
} from '../runtime/gameObjectRegistry.js';
import {
    WAYPOINT_PATH_MODES, WaypointPathMode,
    normalizeWaypointPathDefinition, normalizeWaypointPathMode
} from '../simulation/waypointSimulation.js';

export {
    LevelCameraMode, LevelObjectType, LevelOrbitType,
    LEVEL_CAMERA_MODES, LEVEL_OBJECT_TYPE_ALIASES, LEVEL_OBJECT_TYPE_NAMES,
    LEVEL_OBJECT_TYPES, LEVEL_ORBIT_TYPES, LEVEL_OBJECT_TYPE_BY_CLASS_NAME,
    normalizeLevelObjectType, normalizeLevelOrbitType, isLevelOrbitType,
    WAYPOINT_PATH_MODES, WaypointPathMode, normalizeWaypointPathMode
};

// The current runtime injects ID lookup only into these object implementations.
export const ORBIT_LOOKUP_TARGET_TYPES = Object.freeze([
    ...LEVEL_OBJECT_TYPES.filter(type => getGameObjectDefinition(type).capabilities.orbitTarget)
]);

export const ORBIT_SOURCE_TYPES = Object.freeze([
    ...LEVEL_OBJECT_TYPES.filter(type => getGameObjectDefinition(type).capabilities.orbitSource)
]);

export function isLevelObjectType(type) {
    return Boolean(getGameObjectDefinition(normalizeLevelObjectType(type)).type);
}

export function levelObjectTypeFromClassName(className) {
    return LEVEL_OBJECT_TYPE_BY_CLASS_NAME[className] ?? null;
}


export function normalizeOrbitDefinition(orbit = {}) {
    return {
        center: orbit.orbitCenter ?? orbit.center ?? null,
        targetId: orbit.orbitTargetId ?? orbit.targetId ?? null,
        radius: orbit.orbitRadius ?? orbit.radius ?? 0,
        speed: orbit.orbitSpeed ?? orbit.speed ?? 0,
        angle: orbit.orbitAngle ?? orbit.angle ?? 0,
        type: normalizeLevelOrbitType(orbit.orbitType ?? orbit.type) ?? LevelOrbitType.CIRCULAR,
        params: orbit.orbitParams ?? orbit.params ?? {}
    };
}

export { normalizeWaypointPathDefinition };

export function getLevelObjectPropertyDefaults(type) {
    return { ...getGameObjectDefinition(normalizeLevelObjectType(type)).levelDefaults };
}

export function normalizeLevelObjectDefinition(definition = {}) {
    const type = normalizeLevelObjectType(definition.type);
    const descriptor = getGameObjectDefinition(type);
    const sourceProperties = definition.properties && typeof definition.properties === 'object'
        ? definition.properties
        : {};
    const defaults = getLevelObjectPropertyDefaults(type);
    const properties = { ...sourceProperties };
    for (const [key, value] of Object.entries(defaults)) {
        if (properties[key] == null) properties[key] = value;
    }
    descriptor.normalizeProperties?.(properties, { definition });
    if (sourceProperties.orbit) {
        properties.orbit = normalizeOrbitDefinition(sourceProperties.orbit);
    }
    if (sourceProperties.waypointPath) {
        properties.waypointPath = normalizeWaypointPathDefinition(sourceProperties.waypointPath);
    }
    const position = definition.position ?? (
        sourceProperties.x !== undefined || sourceProperties.y !== undefined
            ? { x: sourceProperties.x, y: sourceProperties.y }
            : undefined
    );
    return {
        ...definition,
        type,
        ...(position === undefined ? {} : { position: { ...position } }),
        properties
    };
}

export function normalizeLevelDefinition(level = {}) {
    return {
        ...level,
        ...(level.camera ? {
            camera: {
                mode: typeof level.camera.mode === 'string'
                    ? level.camera.mode.trim().toLowerCase()
                    : LevelCameraMode.FIT,
                ...(level.camera.zoom == null ? {} : { zoom: level.camera.zoom })
            }
        } : {}),
        startPosition: { ...(level.startPosition ?? WORLD_CONFIG.defaultStartPosition) },
        targetPosition: { ...(level.targetPosition ?? WORLD_CONFIG.defaultTargetPosition) },
        objects: Array.isArray(level.objects)
            ? level.objects.map(normalizeLevelObjectDefinition)
            : [],
        rules: {
            scoreMultiplier: LEVEL_DEFAULTS.rules.scoreMultiplier,
            gravitationalConstant: PHYSICS_CONFIG.gravitationalConstant,
            ...(level.rules || {})
        }
    };
}
