// Dependency-free vocabulary for serialized level enums that are not game-object
// types. Game-object vocabulary is owned by gameObjectRegistry.js.

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

export function normalizeLevelOrbitType(type) {
    if (typeof type !== 'string') return null;
    return type.trim().toLowerCase();
}

export function isLevelOrbitType(type) {
    return LEVEL_ORBIT_TYPES.includes(normalizeLevelOrbitType(type));
}
