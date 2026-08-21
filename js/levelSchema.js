// Shared vocabulary and runtime capabilities for the JSON level format.

import { LEVEL_DEFAULTS, PHYSICS_CONFIG, WORLD_CONFIG } from './config/gameConfig.js';

export const LevelObjectType = Object.freeze({
    PLANET: 'planet',
    BONUS: 'bonus',
    TARGET: 'target',
    SLINGSHOT: 'slingshot',
    TEXT: 'textobject',
    POINTING_ARROW: 'pointingarrow',
    PORTAL: 'portal',
    PENGUIN: 'penguin'
});

export const LEVEL_OBJECT_TYPE_ALIASES = Object.freeze({
    text: LevelObjectType.TEXT,
    arrow: LevelObjectType.POINTING_ARROW
});

export const LEVEL_OBJECT_TYPES = Object.freeze(Object.values(LevelObjectType));
export const LEVEL_OBJECT_TYPE_NAMES = Object.freeze([
    ...LEVEL_OBJECT_TYPES,
    ...Object.keys(LEVEL_OBJECT_TYPE_ALIASES)
]);

export const LEVEL_OBJECT_TYPE_BY_CLASS_NAME = Object.freeze({
    Planet: LevelObjectType.PLANET,
    Bonus: LevelObjectType.BONUS,
    Target: LevelObjectType.TARGET,
    Slingshot: LevelObjectType.SLINGSHOT,
    TextObject: LevelObjectType.TEXT,
    PointingArrow: LevelObjectType.POINTING_ARROW,
    Portal: LevelObjectType.PORTAL,
    Penguin: LevelObjectType.PENGUIN
});

export const LevelOrbitType = Object.freeze({
    CIRCULAR: 'circular',
    ELLIPTICAL: 'elliptical',
    FIGURE_8: 'figure8',
    GRAVITY: 'gravity',
    DIRECTOR_GRAVITY: 'director-gravity',
    CUSTOM: 'custom'
});

export const LEVEL_ORBIT_TYPES = Object.freeze(Object.values(LevelOrbitType));

export const LevelCameraMode = Object.freeze({
    FIT: 'fit',
    FOLLOW: 'follow'
});

export const LEVEL_CAMERA_MODES = Object.freeze(Object.values(LevelCameraMode));

// The current runtime injects ID lookup only into these object implementations.
export const ORBIT_LOOKUP_TARGET_TYPES = Object.freeze([
    LevelObjectType.PLANET,
    LevelObjectType.BONUS
]);

export const ORBIT_SOURCE_TYPES = Object.freeze([
    LevelObjectType.PLANET,
    LevelObjectType.BONUS,
    LevelObjectType.TARGET
]);

export function normalizeLevelObjectType(type) {
    if (typeof type !== 'string') return null;
    const normalized = type.trim().toLowerCase();
    return LEVEL_OBJECT_TYPE_ALIASES[normalized] || normalized;
}

export function isLevelObjectType(type) {
    return LEVEL_OBJECT_TYPES.includes(normalizeLevelObjectType(type));
}

export function levelObjectTypeFromClassName(className) {
    return LEVEL_OBJECT_TYPE_BY_CLASS_NAME[className] ?? null;
}

export function normalizeLevelOrbitType(type) {
    if (typeof type !== 'string') return null;
    return type.trim().toLowerCase();
}

export function isLevelOrbitType(type) {
    return LEVEL_ORBIT_TYPES.includes(normalizeLevelOrbitType(type));
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

export function getLevelObjectPropertyDefaults(type) {
    switch (normalizeLevelObjectType(type)) {
        case LevelObjectType.PLANET:
            return {
                radius: LEVEL_DEFAULTS.planet.radius,
                mass: LEVEL_DEFAULTS.planet.mass,
                gravitationalReach: LEVEL_DEFAULTS.planet.gravitationalReach
            };
        case LevelObjectType.BONUS:
            return {
                value: LEVEL_DEFAULTS.bonus.value,
                width: LEVEL_DEFAULTS.bonus.width,
                height: LEVEL_DEFAULTS.bonus.height
            };
        case LevelObjectType.TARGET:
            return { ...LEVEL_DEFAULTS.target };
        case LevelObjectType.SLINGSHOT:
            return { ...LEVEL_DEFAULTS.slingshot };
        case LevelObjectType.TEXT:
            return { ...LEVEL_DEFAULTS.text };
        case LevelObjectType.POINTING_ARROW:
            return { ...LEVEL_DEFAULTS.pointingArrow };
        case LevelObjectType.PORTAL:
            return { ...LEVEL_DEFAULTS.portal };
        default:
            return {};
    }
}

export function normalizeLevelObjectDefinition(definition = {}) {
    const type = normalizeLevelObjectType(definition.type);
    const sourceProperties = definition.properties && typeof definition.properties === 'object'
        ? definition.properties
        : {};
    const defaults = getLevelObjectPropertyDefaults(type);
    const properties = { ...sourceProperties };
    for (const [key, value] of Object.entries(defaults)) {
        if (properties[key] == null) properties[key] = value;
    }
    if (type === LevelObjectType.PLANET && properties.collisionRadius == null) {
        properties.collisionRadius = properties.radius + LEVEL_DEFAULTS.planet.collisionPadding;
    }
    if (sourceProperties.orbit) {
        properties.orbit = normalizeOrbitDefinition(sourceProperties.orbit);
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
