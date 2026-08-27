import { advanceOrbitGraphMutable, compileOrbitGraph } from '../../simulation/orbitSimulation.js';
import { LevelOrbitType } from '../../levels/levelSchema.js';
import { PHYSICS_CONFIG } from '../../config/gameConfig.js';
import {
    advanceWaypointPathsMutable,
    cloneWaypointPathState
} from '../../simulation/waypointSimulation.js';

const MAX_PREVIEW_STEP_SECONDS = 1 / 20;

function clonePoint(point) {
    return point ? { x: point.x, y: point.y } : null;
}

export function runtimeObjectPosition(object) {
    if (!object) return null;
    if (object.position && Number.isFinite(object.position.x) && Number.isFinite(object.position.y)) {
        return clonePoint(object.position);
    }
    if (Number.isFinite(object.x) && Number.isFinite(object.y)) {
        return { x: object.x, y: object.y };
    }
    return null;
}

function cloneOrbitParams(params = {}) {
    return {
        ...params,
        ...(params.initialPosition ? { initialPosition: clonePoint(params.initialPosition) } : {}),
        ...(params.initialVelocity ? { initialVelocity: clonePoint(params.initialVelocity) } : {}),
        ...(Array.isArray(params.gravitySources)
            ? {
                gravitySources: params.gravitySources.map(source => ({
                    ...source,
                    ...(source.position ? { position: clonePoint(source.position) } : {})
                }))
            }
            : {})
    };
}

export function isMovingOrbit(orbitSystem) {
    if (!orbitSystem) return false;
    if (orbitSystem.orbitType === LevelOrbitType.DIRECTOR_GRAVITY) {
        return Array.isArray(orbitSystem.orbitParams?.gravitySources) &&
            orbitSystem.orbitParams.gravitySources.length > 0;
    }
    if (!orbitSystem.orbitCenter && !orbitSystem.orbitTargetId) return false;
    if (orbitSystem.orbitType === LevelOrbitType.GRAVITY) return true;
    return Number.isFinite(orbitSystem.orbitRadius) && orbitSystem.orbitRadius > 0 &&
        Number.isFinite(orbitSystem.orbitSpeed) && orbitSystem.orbitSpeed !== 0;
}

export function isMovingWaypointPath(waypointSystem) {
    return Boolean(
        waypointSystem &&
        Array.isArray(waypointSystem.waypoints) &&
        waypointSystem.waypoints.length >= 2 &&
        Number.isFinite(waypointSystem.speed) &&
        waypointSystem.speed !== 0
    );
}

function orbitSnapshot(orbitSystem, targetId) {
    if (!isMovingOrbit(orbitSystem)) return null;
    const params = cloneOrbitParams(orbitSystem.orbitParams || {});
    const initialVelocity = params.initialVelocity || orbitSystem.velocity || { x: 0, y: 0 };
    return {
        type: orbitSystem.orbitType,
        center: clonePoint(orbitSystem.orbitCenter),
        targetId,
        radius: orbitSystem.orbitRadius ?? 0,
        speed: orbitSystem.orbitSpeed ?? 0,
        angle: orbitSystem.orbitAngle ?? 0,
        params,
        velocity: clonePoint(initialVelocity),
        frameAccumulator: 0,
        gravityStrength: params.gravityStrength ?? orbitSystem.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength,
        maxGravityAccel: orbitSystem.maxGravityAccel ?? PHYSICS_CONFIG.orbit.maxGravityAcceleration
    };
}

export class OrbitPreviewService {
    constructor({ getObjects, now } = {}) {
        this.getObjects = getObjects || (() => []);
        this.now = now || (() => (globalThis.performance?.now?.() ?? Date.now()) / 1000);
        this.dirty = true;
        this.objects = [];
        this.entities = [];
        this.entityIndexById = new Map();
        this.previewGraph = null;
        this.lastPreviewTime = null;
    }

    invalidate() {
        this.dirty = true;
        this.lastPreviewTime = null;
    }

    sync(objects = this.getObjects()) {
        if (!this.dirty) return this.objects;
        this.rebuild(objects);
        return this.objects;
    }

    rebuild(objects) {
        this.objects = [...objects];
        this.entities = [];
        this.entityIndexById = new Map();

        const syntheticIdByObject = new WeakMap();
        const objectByAuthoredId = new Map();
        this.objects.forEach((object, index) => {
            syntheticIdByObject.set(object, `__editor_preview_${index + 1}`);
            if (object.id && !objectByAuthoredId.has(object.id)) objectByAuthoredId.set(object.id, object);
        });

        for (const object of this.objects) {
            const position = runtimeObjectPosition(object);
            if (!position) continue;
            const targetObject = object.orbitSystem?.orbitTargetId
                ? objectByAuthoredId.get(object.orbitSystem.orbitTargetId)
                : null;
            const orbit = orbitSnapshot(
                object.orbitSystem,
                targetObject ? syntheticIdByObject.get(targetObject) : null
            );
            const startPosition = orbit?.type === LevelOrbitType.GRAVITY && orbit.params?.initialPosition
                ? clonePoint(orbit.params.initialPosition)
                : position;
            const entity = {
                id: syntheticIdByObject.get(object),
                position: startPosition,
                radius: object.radius,
                mass: object.mass,
                gravitationalReach: object.gravitationalReach,
                orbit,
                waypointPath: isMovingWaypointPath(object.waypointSystem)
                    ? cloneWaypointPathState(object.waypointSystem)
                    : null
            };
            if (object.id) this.entityIndexById.set(object.id, this.entities.length);
            this.entities.push(entity);
        }

        for (const object of this.objects) {
            const index = object.id ? this.entityIndexById.get(object.id) : undefined;
            if (index === undefined) continue;
            const orbit = this.entities[index].orbit;
            if (orbit?.type !== LevelOrbitType.DIRECTOR_GRAVITY) continue;
            orbit.params.gravitySources = (orbit.params.gravitySources || []).map(source => {
                const target = source.targetId ? objectByAuthoredId.get(source.targetId) : null;
                return {
                    ...source,
                    targetId: target ? syntheticIdByObject.get(target) : null
                };
            });
        }

        this.previewGraph = compileOrbitGraph(this.entities);
        this.lastPreviewTime = this.now();
        this.dirty = false;
    }

    advance() {
        this.sync();
        const now = this.now();
        if (this.lastPreviewTime === null) {
            this.lastPreviewTime = now;
            return;
        }
        const deltaTime = Math.min(
            MAX_PREVIEW_STEP_SECONDS,
            Math.max(0, now - this.lastPreviewTime)
        );
        this.lastPreviewTime = now;
        if (deltaTime > 0 && this.previewGraph) {
            advanceOrbitGraphMutable(this.entities, deltaTime, this.previewGraph);
            advanceWaypointPathsMutable(this.entities, deltaTime);
        }
    }

    getPosition(objectOrId, { advance = true } = {}) {
        if (advance) this.advance();
        const id = typeof objectOrId === 'string' ? objectOrId : objectOrId?.id;
        const index = this.entityIndexById.get(id);
        if (index === undefined) return null;
        const entity = this.entities[index];
        return entity?.orbit || entity?.waypointPath ? clonePoint(entity.position) : null;
    }
}

export default OrbitPreviewService;
