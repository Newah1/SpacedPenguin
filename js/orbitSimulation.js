import { LEGACY_PHYSICS_FPS, MAX_PHYSICS_STEP } from './simulation.js';
import { LevelOrbitType } from './levelSchema.js';
import { clonePoint } from './simulationGeometry.js';
import { PHYSICS_CONFIG } from './config/gameConfig.js';

export function cloneOrbitState(orbit) {
    if (!orbit) return null;
    return {
        type: orbit.type,
        center: orbit.center ? clonePoint(orbit.center) : null,
        targetId: orbit.targetId ?? null,
        radius: orbit.radius ?? 0,
        speed: orbit.speed ?? 0,
        angle: orbit.angle ?? 0,
        params: { ...(orbit.params || {}) },
        velocity: clonePoint(orbit.velocity || { x: 0, y: 0 }),
        gravityStrength: orbit.gravityStrength ?? orbit.params?.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength,
        maxGravityAccel: orbit.maxGravityAccel ?? PHYSICS_CONFIG.orbit.maxGravityAcceleration
    };
}

export function stepOrbit(orbitInput, currentPosition, center, target, deltaTime) {
    const orbit = cloneOrbitState(orbitInput);
    if (!orbit || !center || deltaTime <= 0) {
        return { position: clonePoint(currentPosition), orbit };
    }

    if (orbit.type !== LevelOrbitType.GRAVITY && orbit.speed === 0) {
        return { position: clonePoint(currentPosition), orbit };
    }

    if (orbit.type === LevelOrbitType.GRAVITY) {
        return stepGravityOrbit(orbit, currentPosition, center, target, deltaTime);
    }

    orbit.angle += orbit.speed * deltaTime;
    switch (orbit.type) {
        case LevelOrbitType.ELLIPTICAL:
            return { position: ellipticalPosition(orbit, center), orbit };
        case LevelOrbitType.FIGURE_8:
            return { position: figure8Position(orbit, center), orbit };
        case LevelOrbitType.CUSTOM:
            return { position: customPosition(orbit, center), orbit };
        case LevelOrbitType.CIRCULAR:
        default:
            return { position: circularPosition(orbit, center), orbit };
    }
}

function circularPosition(orbit, center) {
    return {
        x: center.x + Math.cos(orbit.angle) * orbit.radius,
        y: center.y + Math.sin(orbit.angle) * orbit.radius
    };
}

function ellipticalPosition(orbit, center) {
    const semiMajorAxis = orbit.params.semiMajorAxis ?? orbit.radius;
    const semiMinorAxis = orbit.params.semiMinorAxis ?? orbit.radius * PHYSICS_CONFIG.orbit.ellipseMinorAxisRatio;
    const rotation = orbit.params.rotation ?? 0;
    const x = Math.cos(orbit.angle) * semiMajorAxis;
    const y = Math.sin(orbit.angle) * semiMinorAxis;
    const cosRotation = Math.cos(rotation);
    const sinRotation = Math.sin(rotation);
    return {
        x: center.x + x * cosRotation - y * sinRotation,
        y: center.y + x * sinRotation + y * cosRotation
    };
}

function figure8Position(orbit, center) {
    const size = orbit.params.size ?? orbit.radius;
    const sin = Math.sin(orbit.angle);
    const cos = Math.cos(orbit.angle);
    const denominator = 1 + sin * sin;
    return {
        x: center.x + size * cos / denominator,
        y: center.y + size * sin * cos / denominator
    };
}

function customPosition(orbit, center) {
    const { xFunction, yFunction } = orbit.params;
    if (typeof xFunction === 'function' && typeof yFunction === 'function') {
        return {
            x: center.x + xFunction(orbit.angle),
            y: center.y + yFunction(orbit.angle)
        };
    }
    return circularPosition(orbit, center);
}

function stepGravityOrbit(orbit, currentPosition, center, target, deltaTime) {
    let position = clonePoint(currentPosition);
    let remainingTime = Math.max(0, deltaTime);
    while (remainingTime > 0) {
        const step = Math.min(remainingTime, MAX_PHYSICS_STEP);
        const legacyFrameScale = step * LEGACY_PHYSICS_FPS;
        const dx = center.x - position.x;
        const dy = center.y - position.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        const reach = target?.gravitationalReach;
        const effectiveReach = typeof reach === 'number' && reach > 0
            ? (target.radius ?? 0) + reach
            : null;

        if (distanceSquared > 0 && (effectiveReach === null || distance <= effectiveReach)) {
            const mass = typeof target?.mass === 'number' ? target.mass : 1;
            const force = mass * orbit.gravityStrength / distanceSquared;
            let accelerationX = force * dx;
            let accelerationY = force * dy;
            const accelerationMagnitude = Math.hypot(accelerationX, accelerationY);
            if (accelerationMagnitude > orbit.maxGravityAccel) {
                const scale = orbit.maxGravityAccel / accelerationMagnitude;
                accelerationX *= scale;
                accelerationY *= scale;
            }
            orbit.velocity.x += accelerationX * legacyFrameScale;
            orbit.velocity.y += accelerationY * legacyFrameScale;
        }

        position.x += orbit.velocity.x * step;
        position.y += orbit.velocity.y * step;
        remainingTime -= step;
        if (remainingTime < Number.EPSILON) remainingTime = 0;
    }
    return { position, orbit };
}

export function advanceOrbitGraph(entities, deltaTime) {
    const source = entities.map(entity => ({
        ...entity,
        position: clonePoint(entity.position),
        orbit: cloneOrbitState(entity.orbit)
    }));
    const byId = new Map(source.map((entity, index) => [entity.id, { entity, index }]));
    const resolved = new Map();
    const resolving = new Set();

    const resolveEntity = index => {
        if (resolved.has(index)) return resolved.get(index);
        const entity = source[index];
        if (!entity.orbit) {
            resolved.set(index, entity);
            return entity;
        }
        if (resolving.has(index)) {
            resolved.set(index, entity);
            return entity;
        }

        resolving.add(index);
        let target = null;
        let center = entity.orbit.center;
        if (entity.orbit.targetId && byId.has(entity.orbit.targetId)) {
            const targetEntry = byId.get(entity.orbit.targetId);
            target = resolveEntity(targetEntry.index);
            center = target.position;
        }
        const stepped = stepOrbit(entity.orbit, entity.position, center, target, deltaTime);
        const result = { ...entity, position: stepped.position, orbit: stepped.orbit };
        resolving.delete(index);
        resolved.set(index, result);
        return result;
    };

    return source.map((_, index) => resolveEntity(index));
}
