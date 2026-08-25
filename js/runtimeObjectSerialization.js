import { getGameObjectDefinitionForRuntime } from './gameObjectRegistry.js';
import { LevelObjectType } from './levelObjectVocabulary.js';

// These are deliberately explicit. Runtime objects contain animation, physics,
// asset, and cache state which must never become part of the authored format.
const COMMON_SERIALIZED_PROPERTIES = Object.freeze([
    'id', 'name', 'rotation', 'alpha', 'visible', 'width', 'height',
    'radius', 'mass', 'renderOrder'
]);

function runtimePosition(object) {
    if (typeof object?.x === 'number' && typeof object?.y === 'number') {
        return { x: object.x, y: object.y };
    }
    if (typeof object?.position?.x === 'number' && typeof object?.position?.y === 'number') {
        return { x: object.position.x, y: object.position.y };
    }
    return null;
}

function copyProperty(properties, object, key) {
    const value = object[key];
    if (value === undefined || value === null) return;
    properties[key] = value;
}

export function isRuntimeObjectExportable(object) {
    return getGameObjectDefinitionForRuntime(object).exportable === true;
}

export function serializeRuntimeObject(object, { serializeOrbit } = {}) {
    const descriptor = getGameObjectDefinitionForRuntime(object);
    if (!descriptor.exportable || !descriptor.type) return null;

    if (descriptor.serializeRuntime) {
        return descriptor.serializeRuntime(object, { runtimePosition, serializeOrbit });
    }

    const result = { type: descriptor.type };
    const position = runtimePosition(object);
    if (position) result.position = position;

    const properties = {};
    const keys = new Set([
        ...COMMON_SERIALIZED_PROPERTIES,
        ...(descriptor.serializedProperties || [])
    ]);
    for (const key of keys) copyProperty(properties, object, key);

    // Auto-sized text changes its rendered width every frame. Persist the
    // configured wrap limit instead of the transient rendered measurement.
    if (descriptor.type === LevelObjectType.TEXT && object.maxWidth !== undefined) {
        properties.width = object.maxWidth + object.padding * 2;
    }
    if (descriptor.type === LevelObjectType.POINTING_ARROW && object.pointingAt) {
        properties.pointingAt = { x: object.pointingAt.x, y: object.pointingAt.y };
    }
    if (object.orbitSystem && serializeOrbit) {
        properties.orbit = serializeOrbit(object.orbitSystem);
    }
    if (Object.keys(properties).length) result.properties = properties;
    return result;
}
