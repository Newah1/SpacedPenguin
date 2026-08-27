import { EDITOR_CONFIG } from '../../config/editorConfig.js';
import { PHYSICS_CONFIG } from '../../config/gameConfig.js';
import {
    LevelOrbitType,
    ORBIT_LOOKUP_TARGET_TYPES,
    normalizeLevelObjectType
} from '../../levels/levelSchema.js';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function findRecord(definition, id) {
    return definition.objects?.find(object => object.properties?.id === id) || null;
}

function ensureOrbit(record) {
    record.properties ||= {};
    record.properties.orbit ||= {
        center: null,
        targetId: null,
        radius: 0,
        speed: 0,
        angle: 0,
        type: LevelOrbitType.CIRCULAR,
        params: {}
    };
    record.properties.orbit.params ||= {};
    return record.properties.orbit;
}

export class DocumentMutationService {
    constructor({ getPlayfieldCenter } = {}) {
        this.getPlayfieldCenter = getPlayfieldCenter || (() => ({ x: 400, y: 300 }));
    }

    setObjectProperty(definition, objectId, property, value) {
        const next = clone(definition);
        const record = findRecord(next, objectId);
        if (!record) return null;
        record.properties ||= {};

        if (property === 'x' || property === 'y') {
            record.position ||= { x: 0, y: 0 };
            record.position[property] = value;
        } else if (property === 'pointingAtX' || property === 'pointingAtY') {
            const axis = property === 'pointingAtX' ? 'x' : 'y';
            record.properties.pointingAt ||= { x: 0, y: 0 };
            record.properties.pointingAt[axis] = value;
        } else if (property.startsWith('orbit') || property === 'gravityStrength' ||
            property === 'velocityX' || property === 'velocityY') {
            this.#setOrbitProperty(next, record, property, value);
        } else if (property.startsWith('waypoint')) {
            this.#setWaypointProperty(record, property, value);
        } else if (property === 'validateObject') {
            this.#sanitizeRecord(record);
        } else {
            record.properties[property] = value;
            if ((property === 'width' || property === 'height') &&
                normalizeLevelObjectType(record.type) === 'planet') {
                const width = record.properties.width ?? record.properties.radius * 2;
                const height = record.properties.height ?? record.properties.radius * 2;
                record.properties.radius = Math.min(width, height) / 2;
            }
        }
        return next;
    }

    setObjectPosition(definition, objectId, position) {
        const next = clone(definition);
        const record = findRecord(next, objectId);
        if (!record) return null;
        record.position = { x: position.x, y: position.y };
        return next;
    }

    setOrbitCenter(definition, objectId, center) {
        const next = clone(definition);
        const record = findRecord(next, objectId);
        if (!record) return null;
        const orbit = ensureOrbit(record);
        orbit.center = { x: center.x, y: center.y };
        orbit.targetId = null;
        return next;
    }

    setLevelSetting(definition, property, value) {
        const next = clone(definition);
        next.rules ||= {};
        if (property === 'levelName') next.name = value;
        else if (property === 'levelDescription') next.description = value;
        else if (property === 'playfieldWidth' || property === 'playfieldHeight') {
            const dimension = property === 'playfieldWidth' ? 'width' : 'height';
            next.bounds ||= {};
            next.bounds.stage ||= { x: 0, y: 0, width: 800, height: 600 };
            next.bounds.stage[dimension] = value;
            next.bounds.flight = {
                x: next.bounds.stage.x - EDITOR_CONFIG.playfield.lossBufferX,
                y: next.bounds.stage.y - EDITOR_CONFIG.playfield.lossBufferY,
                width: next.bounds.stage.width + EDITOR_CONFIG.playfield.lossBufferX * 2,
                height: next.bounds.stage.height + EDITOR_CONFIG.playfield.lossBufferY * 2
            };
        } else if (property === 'cameraMode') {
            if (value === 'legacy') delete next.camera;
            else next.camera = { ...(next.camera || {}), mode: value };
        } else if (property === 'cameraZoom') {
            next.camera = { ...(next.camera || {}), mode: next.camera?.mode || 'follow', zoom: value };
        } else if (property === 'startX' || property === 'startY') {
            const axis = property === 'startX' ? 'x' : 'y';
            next.startPosition ||= { x: 100, y: 300 };
            next.startPosition[axis] = value;
            this.#synchronizeSingleton(next, 'slingshot', next.startPosition);
        } else if (property === 'targetX' || property === 'targetY') {
            const axis = property === 'targetX' ? 'x' : 'y';
            next.targetPosition ||= { x: 700, y: 300 };
            next.targetPosition[axis] = value;
            this.#synchronizeSingleton(next, 'target', next.targetPosition);
        } else {
            next.rules[property] = value;
        }
        return next;
    }

    resetGravityOrbit(definition, objectId) {
        const next = clone(definition);
        const record = findRecord(next, objectId);
        if (!record) return null;
        this.#sanitizeRecord(record);
        const orbit = ensureOrbit(record);
        if (orbit.type !== LevelOrbitType.GRAVITY) return null;
        const target = orbit.targetId ? findRecord(next, orbit.targetId) : null;
        const center = target?.position || orbit.center || this.getPlayfieldCenter();
        orbit.center = orbit.targetId ? null : { ...center };
        let initial = orbit.params.initialPosition;
        const distance = initial && Number.isFinite(initial.x) && Number.isFinite(initial.y)
            ? Math.hypot(initial.x - center.x, initial.y - center.y)
            : NaN;
        if (!Number.isFinite(distance) ||
            distance < EDITOR_CONFIG.orbitReset.minimumInitialDistance ||
            distance > EDITOR_CONFIG.orbitReset.maximumInitialDistance) {
            const currentDistance = record.position
                ? Math.hypot(record.position.x - center.x, record.position.y - center.y)
                : NaN;
            initial = Number.isFinite(currentDistance) &&
                currentDistance >= EDITOR_CONFIG.orbitReset.minimumInitialDistance &&
                currentDistance <= EDITOR_CONFIG.orbitReset.maximumInitialDistance
                ? { ...record.position }
                : { x: center.x + EDITOR_CONFIG.orbitReset.fallbackInitialDistance, y: center.y };
        }
        const velocity = orbit.params.initialVelocity || PHYSICS_CONFIG.orbit.initialVelocity;
        const gravityStrength = finite(
            orbit.params.gravityStrength,
            EDITOR_CONFIG.authoringDefaults.orbit.gravityStrength
        );
        record.position = { ...initial };
        orbit.radius = Math.hypot(initial.x - center.x, initial.y - center.y);
        orbit.speed = 3;
        orbit.angle = 0;
        orbit.params = {
            ...orbit.params,
            gravityStrength,
            initialVelocity: {
                x: finite(velocity.x, 0),
                y: finite(velocity.y, 3)
            },
            initialPosition: { ...initial }
        };
        return next;
    }

    applyPlanetAdjustments(definition, entries) {
        const next = clone(definition);
        for (const entry of entries) {
            const record = findRecord(next, entry.objectId);
            if (!record) return null;
            record.position = clone(entry.position);
            record.properties ||= {};
            record.properties.mass = entry.mass;
        }
        return next;
    }

    #setOrbitProperty(definition, record, property, value) {
        const orbit = ensureOrbit(record);
        switch (property) {
            case 'orbitTargetType':
                if (value === 'none') Object.assign(orbit, { center: null, targetId: null, radius: 0, speed: 0 });
                else if (value === 'position') {
                    orbit.targetId = null;
                    orbit.center ||= { ...(record.position || this.getPlayfieldCenter()) };
                } else if (value === 'object') {
                    orbit.center = null;
                    if (!orbit.targetId) {
                        orbit.targetId = definition.objects.find(candidate =>
                            candidate.properties?.id !== record.properties.id &&
                            ORBIT_LOOKUP_TARGET_TYPES.includes(normalizeLevelObjectType(candidate.type))
                        )?.properties?.id || null;
                    }
                }
                break;
            case 'orbitTargetId':
                orbit.targetId = value === 'none' ? null : value;
                if (orbit.targetId) orbit.center = null;
                break;
            case 'orbitCenterX':
            case 'orbitCenterY': {
                const axis = property === 'orbitCenterX' ? 'x' : 'y';
                orbit.center ||= { x: 0, y: 0 };
                orbit.center[axis] = value;
                orbit.targetId = null;
                break;
            }
            case 'orbitRadius': orbit.radius = value; break;
            case 'orbitSpeed': orbit.speed = value; break;
            case 'orbitType':
                orbit.type = value;
                if (value === LevelOrbitType.GRAVITY && !orbit.params.initialPosition) {
                    orbit.params.initialPosition = { ...(record.position || this.getPlayfieldCenter()) };
                    orbit.params.initialVelocity ||= { ...PHYSICS_CONFIG.orbit.initialVelocity };
                }
                break;
            case 'gravityStrength': orbit.params.gravityStrength = value; break;
            case 'velocityX':
            case 'velocityY': {
                const axis = property === 'velocityX' ? 'x' : 'y';
                orbit.params.initialVelocity ||= { x: 0, y: 0 };
                orbit.params.initialVelocity[axis] = value;
                break;
            }
        }
    }

    setWaypoint(definition, objectId, waypointIndex, position) {
        if (!Number.isInteger(waypointIndex)) return null;
        const next = clone(definition);
        const record = findRecord(next, objectId);
        const waypoint = record?.properties?.waypointPath?.waypoints?.[waypointIndex];
        if (!waypoint) return null;
        waypoint.x = position.x;
        waypoint.y = position.y;
        return next;
    }

    #setWaypointProperty(record, property, value) {
        if (property === 'waypointMode' && value === 'none') {
            delete record.properties.waypointPath;
            return;
        }
        const position = record.position || this.getPlayfieldCenter();
        const path = record.properties.waypointPath ||= {
            waypoints: [
                { x: position.x, y: position.y },
                { x: position.x + 100, y: position.y }
            ],
            speed: 60,
            mode: 'pingpong',
            phase: 0
        };
        delete record.properties.orbit;
        if (property === 'waypointMode') path.mode = value;
        else if (property === 'waypointSpeed') path.speed = value;
        else if (property === 'waypointAdd') {
            const last = path.waypoints.at(-1) || position;
            path.waypoints.push({ x: last.x + 100, y: last.y });
        } else if (property === 'waypointRemove' && path.waypoints.length > 2) {
            path.waypoints.pop();
        } else {
            const match = property.match(/^waypoint(\d+)([XY])$/);
            const point = match ? path.waypoints[Number(match[1])] : null;
            if (point) point[match[2].toLowerCase()] = value;
        }
    }

    #sanitizeRecord(record) {
        const center = this.getPlayfieldCenter();
        record.position ||= { ...center };
        record.position.x = finite(record.position.x, center.x);
        record.position.y = finite(record.position.y, center.y);
        const orbit = record.properties?.orbit;
        if (!orbit) return;
        if (orbit.center) {
            orbit.center.x = finite(orbit.center.x, center.x);
            orbit.center.y = finite(orbit.center.y, center.y);
        }
        orbit.params ||= {};
        orbit.params.gravityStrength = finite(
            orbit.params.gravityStrength,
            EDITOR_CONFIG.authoringDefaults.orbit.gravityStrength
        );
        if (orbit.params.initialVelocity) {
            orbit.params.initialVelocity.x = finite(orbit.params.initialVelocity.x, 0);
            orbit.params.initialVelocity.y = finite(orbit.params.initialVelocity.y, 3);
        }
    }

    #synchronizeSingleton(definition, type, position) {
        const singleton = definition.objects?.find(object => normalizeLevelObjectType(object.type) === type);
        if (singleton) singleton.position = { ...position };
    }
}

export default DocumentMutationService;
