// Pure level-definition validation shared by the browser loader and Node tools.
// This module deliberately has no DOM, game-object, or filesystem dependencies.

import {
    LevelObjectType,
    LevelOrbitType,
    WAYPOINT_PATH_MODES,
    LEVEL_CAMERA_MODES,
    ORBIT_LOOKUP_TARGET_TYPES,
    ORBIT_SOURCE_TYPES,
    isLevelObjectType,
    isLevelOrbitType,
    normalizeLevelObjectType,
    normalizeOrbitDefinition,
    normalizeWaypointPathDefinition
} from './levelSchema.js';
import { getGameObjectDefinition } from '../runtime/gameObjectRegistry.js';

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

function validateRect(value, path, collector) {
    if (!isRecord(value)) {
        collector.error('RECT_TYPE', path, 'must be an object with finite x, y, width, and height values');
        return;
    }
    for (const field of ['x', 'y', 'width', 'height']) {
        if (value[field] === undefined || value[field] === null) {
            collector.error('FINITE_NUMBER_REQUIRED', `${path}.${field}`, 'must be a finite number');
        }
    }
    validateOptionalNumber(value.x, `${path}.x`, collector);
    validateOptionalNumber(value.y, `${path}.y`, collector);
    validateOptionalNumber(value.width, `${path}.width`, collector, { exclusiveMin: 0 });
    validateOptionalNumber(value.height, `${path}.height`, collector, { exclusiveMin: 0 });
}

function validateCamera(camera, collector) {
    if (!isRecord(camera)) {
        collector.error('CAMERA_TYPE', '$.camera', 'must be an object');
        return;
    }
    if (typeof camera.mode !== 'string' || !LEVEL_CAMERA_MODES.includes(camera.mode.trim().toLowerCase())) {
        collector.error('CAMERA_MODE', '$.camera.mode', `must be one of: ${LEVEL_CAMERA_MODES.join(', ')}`);
    }
    validateOptionalNumber(camera.zoom, '$.camera.zoom', collector, { exclusiveMin: 0 });
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
    if (!isLevelObjectType(object.type)) {
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

    const descriptor = getGameObjectDefinition(type);
    descriptor.validateProperties?.({
        type, properties, objectPath: path, propertyPath: `${path}.properties`, collector,
        helpers: { optionalNumber: validateOptionalNumber, point: validatePoint }
    });
    return { object, index, path, type, properties };
}

function validatePortalPairs(objects, identifiers, collector) {
    const portals = objects.filter(entry => entry.type === LevelObjectType.PORTAL);
    for (const portal of portals) {
        const id = portal.properties.id;
        const pairId = portal.properties.pairedPortalId;
        if (typeof id !== 'string' || id.trim() === '') {
            collector.error('PORTAL_ID_REQUIRED', `${portal.path}.properties.id`, 'portal endpoints require a unique ID');
            continue;
        }
        if (typeof pairId !== 'string' || pairId.trim() === '') {
            collector.error('PORTAL_PAIR_REQUIRED', `${portal.path}.properties.pairedPortalId`, 'portal endpoints require a pairedPortalId');
            continue;
        }
        if (pairId === id) {
            collector.error('PORTAL_PAIR_SELF', `${portal.path}.properties.pairedPortalId`, 'cannot reference the same portal');
            continue;
        }
        const pair = identifiers.get(pairId);
        if (!pair || pair.type !== LevelObjectType.PORTAL) {
            collector.error('PORTAL_PAIR_UNKNOWN', `${portal.path}.properties.pairedPortalId`, `does not reference a portal ("${pairId}")`);
            continue;
        }
        if (pair.properties.pairedPortalId !== id) {
            collector.error('PORTAL_PAIR_NOT_RECIPROCAL', `${portal.path}.properties.pairedPortalId`, `portal "${pairId}" must pair back to "${id}"`);
        }
        if (pair.properties.color === portal.properties.color) {
            collector.error('PORTAL_PAIR_COLOR', `${portal.path}.properties.color`, 'paired endpoints must use different colors');
        }
    }
}

const RELATIONSHIP_VALIDATORS = Object.freeze({
    portalPair: validatePortalPairs
});

function validateRegisteredRelationships(objects, identifiers, collector) {
    const invoked = new Set();
    for (const entry of objects) {
        const key = getGameObjectDefinition(entry.type).relationshipValidator;
        if (!key || invoked.has(key)) continue;
        invoked.add(key);
        RELATIONSHIP_VALIDATORS[key]?.(objects, identifiers, collector);
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

        const orbit = normalizeOrbitDefinition(orbitValue);
        validateOptionalNumber(orbit.radius, `${path}.orbitRadius`, collector, { min: 0 });
        validateOptionalNumber(orbit.speed, `${path}.orbitSpeed`, collector);
        validateOptionalNumber(orbit.angle, `${path}.orbitAngle`, collector);
        if (!isLevelOrbitType(orbit.type)) {
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
                    collector.error('ORBIT_TARGET_UNAVAILABLE', `${path}.orbitTargetId`, `references ${target.type}, but runtime orbit lookup supports planet, black hole, repulsor star, and bonus IDs`);
                } else if (target === entry) {
                    collector.error('ORBIT_SELF_REFERENCE', `${path}.orbitTargetId`, 'cannot reference the same object');
                } else if (typeof entry.properties.id !== 'string') {
                    collector.warning('ORBIT_SOURCE_WITHOUT_ID', `${entry.path}.properties.id`, 'orbiting object has no ID, so cycles involving it cannot be identified');
                } else {
                    edges.set(entry.properties.id, [orbit.targetId]);
                }
            }
        }

        if (orbit.type === LevelOrbitType.DIRECTOR_GRAVITY) {
            const sources = orbit.params?.gravitySources;
            if (!Array.isArray(sources) || sources.length === 0) {
                collector.error('DIRECTOR_GRAVITY_SOURCES', `${path}.orbitParams.gravitySources`, 'must contain at least one gravity source');
            } else {
                for (let index = 0; index < sources.length; index++) {
                    const source = sources[index];
                    const sourcePath = `${path}.orbitParams.gravitySources[${index}]`;
                    if (!isRecord(source)) {
                        collector.error('DIRECTOR_GRAVITY_SOURCE_TYPE', sourcePath, 'must be an object');
                        continue;
                    }
                    validateOptionalNumber(source.mass, `${sourcePath}.mass`, collector, { exclusiveMin: 0 });
                    validateOptionalNumber(source.collisionRadius, `${sourcePath}.collisionRadius`, collector, { min: 0 });
                    if (source.position !== undefined) validatePoint(source.position, `${sourcePath}.position`, collector);
                    if (source.targetId !== undefined) {
                        const target = identifiers.get(source.targetId);
                        if (!target) {
                            collector.error('ORBIT_TARGET_MISSING', `${sourcePath}.targetId`, `references unknown object ID "${source.targetId}"`);
                        } else if (!ORBIT_LOOKUP_TARGET_TYPES.includes(target.type)) {
                            collector.error('ORBIT_TARGET_UNAVAILABLE', `${sourcePath}.targetId`, `references ${target.type}, but runtime orbit lookup supports planet, black hole, repulsor star, and bonus IDs`);
                        } else if (target === entry) {
                            collector.error('ORBIT_SELF_REFERENCE', `${sourcePath}.targetId`, 'cannot reference the same object');
                        } else if (typeof entry.properties.id === 'string') {
                            const targets = edges.get(entry.properties.id) || [];
                            if (!targets.includes(source.targetId)) targets.push(source.targetId);
                            edges.set(entry.properties.id, targets);
                        }
                    } else if (source.position === undefined) {
                        collector.error('DIRECTOR_GRAVITY_SOURCE_POSITION', sourcePath, 'requires targetId or position');
                    }
                }
            }
            validateOptionalNumber(orbit.params?.sourceFrameRate, `${path}.orbitParams.sourceFrameRate`, collector, { exclusiveMin: 0 });
            validateOptionalNumber(orbit.params?.gravityStrength, `${path}.orbitParams.gravityStrength`, collector, { min: 0 });
        }

        const activeNonGravityOrbit = orbit.type !== LevelOrbitType.GRAVITY && orbit.radius > 0 && orbit.speed !== 0;
        const activePhysicsOrbit = orbit.type === LevelOrbitType.GRAVITY || orbit.type === LevelOrbitType.DIRECTOR_GRAVITY;
        if ((activeNonGravityOrbit || activePhysicsOrbit) && !ORBIT_SOURCE_TYPES.includes(entry.type)) {
            collector.error('ORBIT_SOURCE_UNAVAILABLE', path, `runtime orbit stepping supports gravity-body, bonus, and target sources, not ${entry.type}`);
        }
        if ((activeNonGravityOrbit || orbit.type === LevelOrbitType.GRAVITY) && orbit.targetId === null && orbit.center === null) {
            collector.error('ORBIT_CENTER_REQUIRED', path, 'an active orbit requires orbitTargetId or orbitCenter');
        }
    }
    validateOrbitCycles(edges, identifiers, collector);
}

function validateWaypointPaths(objects, collector) {
    for (const entry of objects) {
        const value = entry.properties.waypointPath;
        if (value === undefined || value === null) continue;
        const path = `${entry.path}.properties.waypointPath`;
        if (!isRecord(value)) {
            collector.error('WAYPOINT_PATH_TYPE', path, 'must be an object');
            continue;
        }
        const waypointPath = normalizeWaypointPathDefinition(value);
        if (!Array.isArray(waypointPath.waypoints)) {
            collector.error('WAYPOINTS_TYPE', `${path}.waypoints`, 'must be an array');
        } else {
            if (waypointPath.waypoints.length < 2) {
                collector.error('WAYPOINTS_TOO_SHORT', `${path}.waypoints`, 'must contain at least two points');
            }
            waypointPath.waypoints.forEach((point, index) =>
                validatePoint(point, `${path}.waypoints[${index}]`, collector)
            );
        }
        validateOptionalNumber(waypointPath.speed, `${path}.speed`, collector, { min: 0 });
        validateOptionalNumber(waypointPath.phase, `${path}.phase`, collector, { min: 0 });
        if (!WAYPOINT_PATH_MODES.includes(waypointPath.mode)) {
            collector.error(
                'WAYPOINT_MODE_UNKNOWN',
                `${path}.mode`,
                `must be one of: ${WAYPOINT_PATH_MODES.join(', ')}`
            );
        }
        if (entry.properties.orbit !== undefined && entry.properties.orbit !== null) {
            collector.error('MOTION_CONFLICT', path, 'cannot be combined with an orbit on the same object');
        }
    }
}

function validateOrbitCycles(edges, identifiers, collector) {
    const visiting = new Set();
    const completed = new Set();
    const chain = [];
    const visit = current => {
        if (completed.has(current)) return;
        if (visiting.has(current)) {
            const start = chain.indexOf(current);
            const cycle = [...chain.slice(start), current];
            const source = identifiers.get(current);
            collector.error('ORBIT_CYCLE', `${source.path}.properties.orbit.orbitTargetId`, `orbit reference cycle detected: ${cycle.join(' -> ')}`);
            return;
        }
        visiting.add(current);
        chain.push(current);
        for (const target of edges.get(current) || []) visit(target);
        chain.pop();
        visiting.delete(current);
        completed.add(current);
    };
    for (const start of edges.keys()) visit(start);
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
    if (level.bounds !== undefined) {
        if (!isRecord(level.bounds)) {
            collector.error('BOUNDS_TYPE', '$.bounds', 'must be an object');
        } else {
            validateRect(level.bounds.stage, '$.bounds.stage', collector);
            validateRect(level.bounds.flight, '$.bounds.flight', collector);
        }
    }
    if (level.camera !== undefined) validateCamera(level.camera, collector);
    validateComposition(level, objects, collector);
    const identifiers = collectIdentifiers(objects, collector);
    validateOrbits(objects, identifiers, collector);
    validateWaypointPaths(objects, collector);
    validateRegisteredRelationships(objects, identifiers, collector);
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
