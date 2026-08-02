// Shared vocabulary and runtime capabilities for the JSON level format.

export const LevelObjectType = Object.freeze({
    PLANET: 'planet',
    BONUS: 'bonus',
    TARGET: 'target',
    SLINGSHOT: 'slingshot',
    TEXT: 'textobject',
    POINTING_ARROW: 'pointingarrow',
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
    Penguin: LevelObjectType.PENGUIN
});

export const LevelOrbitType = Object.freeze({
    CIRCULAR: 'circular',
    ELLIPTICAL: 'elliptical',
    FIGURE_8: 'figure8',
    GRAVITY: 'gravity',
    CUSTOM: 'custom'
});

export const LEVEL_ORBIT_TYPES = Object.freeze(Object.values(LevelOrbitType));

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
