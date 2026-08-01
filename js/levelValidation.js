// Pure level-definition validation shared by the browser loader and Node tools.
// This module deliberately has no DOM, game-object, or filesystem dependencies.

import {
    LEVEL_OBJECT_TYPE_NAMES,
    LEVEL_ORBIT_TYPES,
    LevelObjectType,
    LevelOrbitType,
    ORBIT_LOOKUP_TARGET_TYPES,
    normalizeLevelObjectType
} from './levelSchema.js';

class DiagnosticCollector {
    constructor() {
        this.diagnostics = [];
    }

    error(code, path, message) {
        this.diagnostics.push({ severity: 'error', code, path, message });
    }

    warning(code, path, message) {
        this.diagnostics.push({ severity: 'warning', code, path, message });
    }

    result() {
        const errors = this.diagnostics.filter(item => item.severity === 'error');
        const warnings = this.diagnostics.filter(item => item.severity === 'warning');
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            diagnostics: [...this.diagnostics]
        };
    }
}

export class LevelValidationError extends Error {
    constructor(validation, source = 'level definition') {
        const details = formatLevelDiagnostics(validation);
        super(`Invalid ${source}${details ? `\n${details}` : ''}`);
        this.name = 'LevelValidationError';
        this.validation = validation;
        this.source = source;
    }
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function validatePoint(value, path, collector, required = true) {
    if (value === undefined || value === null) {
        if (required) collector.error('POINT_REQUIRED', path, 'must be an object with finite x and y values');
        return false;
    }
    if (!isRecord(value)) {
        collector.error('POINT_TYPE', path, 'must be an object with finite x and y values');
        return false;
    }
    let valid = true;
    for (const axis of ['x', 'y']) {
        if (!isFiniteNumber(value[axis])) {
            collector.error('FINITE_NUMBER_REQUIRED', `${path}.${axis}`, 'must be a finite number');
            valid = false;
        }
    }
    return valid;
}

function validateOptionalNumber(value, path, collector, constraints = {}) {
    if (value === undefined || value === null) return;
    if (!isFiniteNumber(value)) {
        collector.error('FINITE_NUMBER_REQUIRED', path, 'must be a finite number');
        return;
    }
    if (constraints.integer && !Number.isInteger(value)) {
        collector.error('INTEGER_REQUIRED', path, 'must be an integer');
    }
    if (constraints.min !== undefined && value < constraints.min) {
        collector.error('NUMBER_TOO_SMALL', path, `must be at least ${constraints.min}`);
    }
    if (constraints.exclusiveMin !== undefined && value <= constraints.exclusiveMin) {
        collector.error('NUMBER_TOO_SMALL', path, `must be greater than ${constraints.exclusiveMin}`);
    }
}

function validateObjectShape(object, index, collector) {
    const path = `$.objects[${index}]`;
    if (!isRecord(object)) {
        collector.error('OBJECT_TYPE', path, 'must be an object definition');
        return null;
    }
    if (typeof object.type !== 'string' || object.type.trim() === '') {
        collector.error('OBJECT_TYPE_REQUIRED', `${path}.type`, 'must be a non-empty string');
        return null;
    }

    const type = normalizeLevelObjectType(object.type);
    if (!LEVEL_OBJECT_TYPE_NAMES.includes(object.type.toLowerCase())) {
        collector.error('OBJECT_TYPE_UNKNOWN', `${path}.type`, `unsupported object type "${object.type}"`);
    }
    if (object.properties !== undefined && !isRecord(object.properties)) {
        collector.error('PROPERTIES_TYPE', `${path}.properties`, 'must be an object');
    }
    const properties = isRecord(object.properties) ? object.properties : {};
    const position = object.position || (
        properties.x !== undefined || properties.y !== undefined
            ? { x: properties.x, y: properties.y }
            : undefined
    );
    validatePoint(position, `${path}.position`, collector);

    validateTypeSpecificProperties(type, properties, path, collector);
    return { object, index, path, type, properties };
}

function validateTypeSpecificProperties(type, properties, objectPath, collector) {
    const propertyPath = `${objectPath}.properties`;
    if (type === LevelObjectType.PLANET) {
        validateOptionalNumber(properties.radius, `${propertyPath}.radius`, collector, { exclusiveMin: 0 });
        validateOptionalNumber(properties.mass, `${propertyPath}.mass`, collector, { min: 0 });
        validateOptionalNumber(properties.collisionRadius, `${propertyPath}.collisionRadius`, collector, { exclusiveMin: 0 });
        validateOptionalNumber(properties.gravitationalReach, `${propertyPath}.gravitationalReach`, collector, { min: 0 });
    } else if (type === LevelObjectType.BONUS) {
        validateOptionalNumber(properties.value, `${propertyPath}.value`, collector, { min: 0 });
    } else if (type === LevelObjectType.TARGET) {
        validateOptionalNumber(properties.width, `${propertyPath}.width`, collector, { exclusiveMin: 0 });
        validateOptionalNumber(properties.height, `${propertyPath}.height`, collector, { exclusiveMin: 0 });
    } else if (type === LevelObjectType.SLINGSHOT) {
        validateOptionalNumber(properties.velocityMultiplier, `${propertyPath}.velocityMultiplier`, collector, { exclusiveMin: 0 });
        validateOptionalNumber(properties.maxPullback, `${propertyPath}.maxPullback`, collector, { exclusiveMin: 0 });
        validateOptionalNumber(properties.minPullback, `${propertyPath}.minPullback`, collector, { min: 0 });
        validateOptionalNumber(properties.stretchLimit, `${propertyPath}.stretchLimit`, collector, { exclusiveMin: 0 });
    }
}

function collectIdentifiers(objects, collector) {
    const identifiers = new Map();
    for (const entry of objects) {
        const id = entry.properties.id;
        if (id === undefined || id === null) continue;
        const path = `${entry.path}.properties.id`;
        if (typeof id !== 'string' || id.trim() === '') {
            collector.error('ID_TYPE', path, 'must be a non-empty string');
            continue;
        }
        if (identifiers.has(id)) {
            collector.error(
                'ID_DUPLICATE',
                path,
                `duplicates ${identifiers.get(id).path}.properties.id ("${id}")`
            );
            continue;
        }
        identifiers.set(id, entry);
    }
    return identifiers;
}

function normalizedOrbit(orbit) {
    return {
        center: orbit.orbitCenter ?? orbit.center ?? null,
        targetId: orbit.orbitTargetId ?? orbit.targetId ?? null,
        radius: orbit.orbitRadius ?? orbit.radius ?? 0,
        speed: orbit.orbitSpeed ?? orbit.speed ?? 0,
        angle: orbit.orbitAngle ?? orbit.angle ?? 0,
        type: orbit.orbitType ?? orbit.type ?? 'circular',
        params: orbit.orbitParams ?? orbit.params ?? {}
    };
}

function validateOrbits(objects, identifiers, collector) {
    const edges = new Map();
    for (const entry of objects) {
        const orbitValue = entry.properties.orbit;
        if (orbitValue === undefined || orbitValue === null) continue;
        const path = `${entry.path}.properties.orbit`;
        if (!isRecord(orbitValue)) {
            collector.error('ORBIT_TYPE', path, 'must be an object');
            continue;
        }

        const orbit = normalizedOrbit(orbitValue);
        validateOptionalNumber(orbit.radius, `${path}.orbitRadius`, collector, { min: 0 });
        validateOptionalNumber(orbit.speed, `${path}.orbitSpeed`, collector);
        validateOptionalNumber(orbit.angle, `${path}.orbitAngle`, collector);
        if (typeof orbit.type !== 'string' || !LEVEL_ORBIT_TYPES.includes(orbit.type)) {
            collector.error('ORBIT_KIND_UNKNOWN', `${path}.orbitType`, `unsupported orbit type "${orbit.type}"`);
        }
        if (!isRecord(orbit.params)) {
            collector.error('ORBIT_PARAMS_TYPE', `${path}.orbitParams`, 'must be an object');
        }
        if (orbit.center !== null) validatePoint(orbit.center, `${path}.orbitCenter`, collector);
        if (orbit.center !== null && orbit.targetId !== null) {
            collector.warning('ORBIT_CENTER_SHADOWED', path, 'defines both orbitCenter and orbitTargetId; orbitTargetId takes precedence');
        }
        if (orbit.type === LevelOrbitType.CUSTOM) {
            collector.warning('CUSTOM_ORBIT_FALLBACK', `${path}.orbitType`, 'JSON custom functions are unsupported; runtime falls back to a circular orbit');
        }

        if (orbit.targetId !== null) {
            if (typeof orbit.targetId !== 'string' || orbit.targetId.trim() === '') {
                collector.error('ORBIT_TARGET_ID_TYPE', `${path}.orbitTargetId`, 'must be a non-empty string or null');
            } else {
                const target = identifiers.get(orbit.targetId);
                if (!target) {
                    collector.error('ORBIT_TARGET_MISSING', `${path}.orbitTargetId`, `references unknown object ID "${orbit.targetId}"`);
                } else if (!ORBIT_LOOKUP_TARGET_TYPES.includes(target.type)) {
                    collector.error('ORBIT_TARGET_UNAVAILABLE', `${path}.orbitTargetId`, `references ${target.type}, but runtime orbit lookup supports planet and bonus IDs`);
                } else if (target === entry) {
                    collector.error('ORBIT_SELF_REFERENCE', `${path}.orbitTargetId`, 'cannot reference the same object');
                } else if (typeof entry.properties.id !== 'string') {
                    collector.warning('ORBIT_SOURCE_WITHOUT_ID', `${entry.path}.properties.id`, 'orbiting object has no ID, so cycles involving it cannot be identified');
                } else {
                    edges.set(entry.properties.id, orbit.targetId);
                }
            }
        }

        const activeNonGravityOrbit = orbit.type !== LevelOrbitType.GRAVITY && orbit.radius > 0 && orbit.speed !== 0;
        if ((activeNonGravityOrbit || orbit.type === LevelOrbitType.GRAVITY) && orbit.targetId === null && orbit.center === null) {
            collector.error('ORBIT_CENTER_REQUIRED', path, 'an active orbit requires orbitTargetId or orbitCenter');
        }
    }
    validateOrbitCycles(edges, identifiers, collector);
}

function validateOrbitCycles(edges, identifiers, collector) {
    const completed = new Set();
    for (const start of edges.keys()) {
        if (completed.has(start)) continue;
        const chain = [];
        const indexes = new Map();
        let current = start;
        while (edges.has(current) && !completed.has(current)) {
            if (indexes.has(current)) {
                const cycle = [...chain.slice(indexes.get(current)), current];
                const source = identifiers.get(current);
                collector.error(
                    'ORBIT_CYCLE',
                    `${source.path}.properties.orbit.orbitTargetId`,
                    `orbit reference cycle detected: ${cycle.join(' -> ')}`
                );
                break;
            }
            indexes.set(current, chain.length);
            chain.push(current);
            current = edges.get(current);
        }
        for (const id of chain) completed.add(id);
    }
}

function validateComposition(level, objects, collector) {
    const slingshots = objects.filter(entry => entry.type === LevelObjectType.SLINGSHOT);
    const targets = objects.filter(entry => entry.type === LevelObjectType.TARGET);
    if (slingshots.length > 1) {
        collector.error('SLINGSHOT_MULTIPLE', '$.objects', 'must contain at most one slingshot');
    } else if (slingshots.length === 0) {
        collector.warning('SLINGSHOT_DEFAULTED', '$.objects', 'contains no slingshot; the loader will create one at startPosition');
    }
    if (targets.length > 1) {
        collector.error('TARGET_MULTIPLE', '$.objects', 'must contain at most one target');
    } else if (targets.length === 0 && !validatePoint(level.targetPosition, '$.targetPosition', collector, false)) {
        collector.warning('TARGET_DEFAULTED', '$.objects', 'contains no target or valid targetPosition; the loader will use its default');
    }
    if (level.startPosition === undefined) {
        collector.warning('START_DEFAULTED', '$.startPosition', 'is omitted; the loader will use its default');
    } else {
        validatePoint(level.startPosition, '$.startPosition', collector);
    }
}

function validateRules(rules, bonusCount, collector) {
    if (rules === undefined || rules === null) return;
    if (!isRecord(rules)) {
        collector.error('RULES_TYPE', '$.rules', 'must be an object');
        return;
    }
    validateOptionalNumber(rules.maxTries, '$.rules.maxTries', collector, { integer: true, exclusiveMin: 0 });
    validateOptionalNumber(rules.timeLimit, '$.rules.timeLimit', collector, { exclusiveMin: 0 });
    validateOptionalNumber(rules.scoreMultiplier, '$.rules.scoreMultiplier', collector, { exclusiveMin: 0 });
    validateOptionalNumber(rules.gravitationalConstant, '$.rules.gravitationalConstant', collector, { min: 0 });
    validateOptionalNumber(rules.requiredBonuses, '$.rules.requiredBonuses', collector, { integer: true, min: 0 });
    validateOptionalNumber(rules.allowedMisses, '$.rules.allowedMisses', collector, { integer: true, min: 0 });
    if (Number.isInteger(rules.requiredBonuses) && rules.requiredBonuses > bonusCount) {
        collector.error('REQUIRED_BONUSES_UNAVAILABLE', '$.rules.requiredBonuses', `requires ${rules.requiredBonuses} bonuses, but the level defines ${bonusCount}`);
    }
    if (rules.customBehaviors !== undefined && !Array.isArray(rules.customBehaviors)) {
        collector.error('CUSTOM_BEHAVIORS_TYPE', '$.rules.customBehaviors', 'must be an array');
    }
    if (rules.timeLimit !== undefined && rules.timeLimit !== null) {
        collector.warning('RULE_NOT_ENFORCED', '$.rules.timeLimit', 'is parsed but not enforced by the current runtime');
    }
    if (Array.isArray(rules.customBehaviors) && rules.customBehaviors.length > 0) {
        collector.warning('RULE_NOT_ENFORCED', '$.rules.customBehaviors', 'are parsed but not dispatched by the current runtime');
    }
}

export function validateLevelDefinition(level) {
    const collector = new DiagnosticCollector();
    if (!isRecord(level)) {
        collector.error('LEVEL_TYPE', '$', 'must be a JSON object');
        return collector.result();
    }
    if (level.name !== undefined && typeof level.name !== 'string') {
        collector.error('NAME_TYPE', '$.name', 'must be a string');
    }
    if (!Array.isArray(level.objects)) {
        collector.error('OBJECTS_REQUIRED', '$.objects', 'must be an array');
        return collector.result();
    }

    const objects = level.objects
        .map((object, index) => validateObjectShape(object, index, collector))
        .filter(Boolean);
    validateComposition(level, objects, collector);
    const identifiers = collectIdentifiers(objects, collector);
    validateOrbits(objects, identifiers, collector);
    validateRules(level.rules, objects.filter(entry => entry.type === LevelObjectType.BONUS).length, collector);
    return collector.result();
}

export function assertValidLevelDefinition(level, source = 'level definition') {
    const validation = validateLevelDefinition(level);
    if (!validation.valid) throw new LevelValidationError(validation, source);
    return validation;
}

export function formatLevelDiagnostics(validation, source = null) {
    const prefix = source ? `${source}: ` : '';
    return validation.diagnostics
        .map(item => `${item.severity.toUpperCase()} ${item.code} ${item.path}: ${prefix}${item.message}`)
        .join('\n');
}
