// Dependency-free vocabulary for level objects and other serialized level enums.
// Keep this module free of registry, runtime, editor, and configuration imports so
// schema, validation, authoring, and headless tools can share it without cycles.

export const LevelObjectType = Object.freeze({
    PLANET: 'planet',
    BLACK_HOLE: 'blackhole',
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
    arrow: LevelObjectType.POINTING_ARROW,
    black_hole: LevelObjectType.BLACK_HOLE
});

export const LEVEL_OBJECT_TYPES = Object.freeze(Object.values(LevelObjectType));
export const LEVEL_OBJECT_TYPE_NAMES = Object.freeze([
    ...LEVEL_OBJECT_TYPES,
    ...Object.keys(LEVEL_OBJECT_TYPE_ALIASES)
]);

export const LevelOrbitType = Object.freeze({
    CIRCULAR: 'circular',
    ELLIPTICAL: 'elliptical',
    FIGURE_8: 'figure8',
    GRAVITY: 'gravity',
    DIRECTOR_GRAVITY: 'director-gravity',
    CUSTOM: 'custom'
});

export const LEVEL_ORBIT_TYPES = Object.freeze(Object.values(LevelOrbitType));

export const LevelCameraMode = Object.freeze({ FIT: 'fit', FOLLOW: 'follow' });
export const LEVEL_CAMERA_MODES = Object.freeze(Object.values(LevelCameraMode));

export function normalizeLevelObjectType(type) {
    if (typeof type !== 'string') return null;
    const normalized = type.trim().toLowerCase();
    return LEVEL_OBJECT_TYPE_ALIASES[normalized] || normalized;
}

export function normalizeLevelOrbitType(type) {
    if (typeof type !== 'string') return null;
    return type.trim().toLowerCase();
}

export function isLevelOrbitType(type) {
    return LEVEL_ORBIT_TYPES.includes(normalizeLevelOrbitType(type));
}
