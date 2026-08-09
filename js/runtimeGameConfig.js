import {
    LEVEL_CATALOG_CONFIG,
    LEVEL_DEFAULTS,
    LEVEL_GENERATOR_CONFIG,
    PHYSICS_CONFIG,
    SIMULATION_CONFIG,
    WORLD_CONFIG
} from './config/gameConfig.js';

const configRoots = Object.freeze({
    WORLD_CONFIG,
    LEVEL_CATALOG_CONFIG,
    LEVEL_GENERATOR_CONFIG,
    SIMULATION_CONFIG,
    PHYSICS_CONFIG,
    LEVEL_DEFAULTS
});

const rootAliases = new Map(Object.keys(configRoots).flatMap(name => {
    const shortName = name.replace(/_CONFIG$/, '');
    return [
        [name.toLowerCase(), name],
        [shortName.toLowerCase(), name]
    ];
}));

const overrides = new Map();

function findKey(object, requestedKey) {
    if (!object || typeof object !== 'object') return null;
    return Object.keys(object).find(key => key.toLowerCase() === requestedKey.toLowerCase()) || null;
}

export function resolveGameConfigPath(path) {
    const segments = String(path || '').split('.').filter(Boolean);
    const rootName = rootAliases.get((segments.shift() || '').toLowerCase());
    if (!rootName) throw new Error(`Unknown game config root: ${path}`);

    let value = configRoots[rootName];
    const canonicalSegments = [rootName];
    for (const segment of segments) {
        const key = findKey(value, segment);
        if (!key) throw new Error(`Unknown game config path: ${path}`);
        value = value[key];
        canonicalSegments.push(key);
    }
    if (canonicalSegments.length === 1) throw new Error('Specify a config value, not an entire config root.');

    return {
        canonicalPath: canonicalSegments.join('.'),
        sourceValue: value
    };
}

export function getRuntimeGameConfigValue(path) {
    const resolved = resolveGameConfigPath(path);
    return overrides.has(resolved.canonicalPath)
        ? overrides.get(resolved.canonicalPath)
        : resolved.sourceValue;
}

function parseValue(rawValue, sourceValue) {
    if (typeof sourceValue === 'number') {
        const value = Number(rawValue);
        if (!Number.isFinite(value)) throw new Error('Expected a finite number.');
        return value;
    }
    if (typeof sourceValue === 'boolean') {
        const normalized = String(rawValue).toLowerCase();
        if (normalized !== 'true' && normalized !== 'false') {
            throw new Error('Expected true or false.');
        }
        return normalized === 'true';
    }
    if (typeof sourceValue === 'string') return String(rawValue);
    if (sourceValue === null || typeof sourceValue === 'object') {
        let value;
        try {
            value = JSON.parse(rawValue);
        } catch {
            throw new Error('Expected valid JSON for an object, array, or null value.');
        }
        if (Array.isArray(sourceValue) !== Array.isArray(value)) {
            throw new Error(Array.isArray(sourceValue) ? 'Expected a JSON array.' : 'Expected a JSON object.');
        }
        if (sourceValue !== null && (value === null || typeof value !== 'object')) {
            throw new Error('Expected a JSON object.');
        }
        return value;
    }
    throw new Error('Unsupported config value type.');
}

export function setRuntimeGameConfigValue(path, rawValue) {
    const resolved = resolveGameConfigPath(path);
    const value = parseValue(rawValue, resolved.sourceValue);
    overrides.set(resolved.canonicalPath, value);
    return { ...resolved, value };
}

export function clearRuntimeGameConfigOverrides() {
    overrides.clear();
}

function appendConfigPaths(paths, prefix, value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        const path = `${prefix}.${key}`;
        if (child && typeof child === 'object') {
            paths.push(`${path}.`);
            appendConfigPaths(paths, path, child);
        } else {
            paths.push(path);
        }
    }
}

export function listGameConfigPaths() {
    const paths = [];
    for (const [rootName, value] of Object.entries(configRoots)) {
        const shortName = rootName.replace(/_CONFIG$/, '').toLowerCase();
        paths.push(`${rootName}.`, `${shortName}.`);
        appendConfigPaths(paths, rootName, value);
        appendConfigPaths(paths, shortName, value);
    }
    return paths;
}
