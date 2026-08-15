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
        params: {
            ...(orbit.params || {}),
            ...(Array.isArray(orbit.params?.gravitySources)
                ? { gravitySources: orbit.params.gravitySources.map(source => ({
                    ...source,
                    ...(source.position ? { position: clonePoint(source.position) } : {})
                })) }
                : {})
        },
        velocity: clonePoint(orbit.velocity || { x: 0, y: 0 }),
        frameAccumulator: orbit.frameAccumulator ?? 0,
        gravityStrength: orbit.gravityStrength ?? orbit.params?.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength,
        maxGravityAccel: orbit.maxGravityAccel ?? PHYSICS_CONFIG.orbit.maxGravityAcceleration
    };
}

export function stepOrbit(orbitInput, currentPosition, center, target, deltaTime, targets = null) {
    const orbit = cloneOrbitState(orbitInput);
    if (!orbit || deltaTime <= 0 || (!center && orbit.type !== LevelOrbitType.DIRECTOR_GRAVITY)) {
        return { position: clonePoint(currentPosition), orbit };
    }

    if (orbit.type !== LevelOrbitType.GRAVITY &&
        orbit.type !== LevelOrbitType.DIRECTOR_GRAVITY &&
        orbit.speed === 0) {
        return { position: clonePoint(currentPosition), orbit };
    }

    if (orbit.type === LevelOrbitType.GRAVITY) {
        return stepGravityOrbit(orbit, currentPosition, center, target, deltaTime);
    }
    if (orbit.type === LevelOrbitType.DIRECTOR_GRAVITY) {
        return stepDirectorGravityOrbit(orbit, currentPosition, targets || [], deltaTime);
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

function stepDirectorGravityOrbit(orbit, currentPosition, targets, deltaTime) {
    const position = clonePoint(currentPosition);
    const sources = orbit.params.gravitySources || [];
    const sourceFrameRate = orbit.params.sourceFrameRate ?? 30;
    orbit.frameAccumulator += deltaTime * sourceFrameRate;

    while (orbit.frameAccumulator + Number.EPSILON >= 1) {
        for (let index = 0; index < sources.length; index++) {
            const source = sources[index];
            const sourcePosition = targets[index]?.position || source.position;
            if (!sourcePosition) continue;
            const dx = sourcePosition.x - position.x;
            const dy = sourcePosition.y - position.y;
            const minimumDistance = Math.max(0, source.collisionRadius ?? 0);
            const distanceSquared = Math.max(
                dx * dx + dy * dy,
                minimumDistance * minimumDistance
            );
            if (distanceSquared <= 0) continue;
            const force = (source.mass ?? 1) * (orbit.params.gravityStrength ?? orbit.gravityStrength) / distanceSquared;
            orbit.velocity.x += force * dx;
            orbit.velocity.y += force * dy;
        }
        position.x += orbit.velocity.x;
        position.y += orbit.velocity.y;
        orbit.frameAccumulator -= 1;
    }
    if (orbit.frameAccumulator < Number.EPSILON) orbit.frameAccumulator = 0;
    return { position, orbit };
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
    return advanceOrbitGraphMutable(source, deltaTime, compileOrbitGraph(source));
}

export function compileOrbitGraph(entities) {
    const indexesById = new Map(entities.map((entity, index) => [entity.id, index]));
    const sourceIndexes = entities.map(entity => {
        if (entity.orbit?.type === LevelOrbitType.DIRECTOR_GRAVITY) {
            return (entity.orbit.params?.gravitySources || []).map(source => (
                source.targetId && indexesById.has(source.targetId)
                    ? indexesById.get(source.targetId)
                    : -1
            ));
        }
        return [entity.orbit?.targetId && indexesById.has(entity.orbit.targetId)
            ? indexesById.get(entity.orbit.targetId)
            : -1];
    });
    const targetIndexes = sourceIndexes.map(indexes => indexes[0] ?? -1);
    const visitState = new Uint8Array(entities.length);
    const order = [];

    const visit = index => {
        if (visitState[index] === 2) return;
        if (visitState[index] === 1) return;
        visitState[index] = 1;
        for (const targetIndex of sourceIndexes[index]) {
            if (targetIndex >= 0) visit(targetIndex);
        }
        visitState[index] = 2;
        order.push(index);
    };

    for (let index = 0; index < entities.length; index++) visit(index);
    return { order, targetIndexes, sourceIndexes };
}

export function advanceOrbitGraphMutable(entities, deltaTime, graph = compileOrbitGraph(entities)) {
    for (const index of graph.order) {
        const entity = entities[index];
        if (!entity.orbit) continue;
        const targetIndex = graph.targetIndexes[index];
        const target = targetIndex >= 0 ? entities[targetIndex] : null;
        const center = target?.position ?? entity.orbit.center;
        const targets = (graph.sourceIndexes?.[index] || [targetIndex])
            .map(sourceIndex => sourceIndex >= 0 ? entities[sourceIndex] : null);
        const stepped = stepOrbit(entity.orbit, entity.position, center, target, deltaTime, targets);
        entity.position = stepped.position;
        entity.orbit = stepped.orbit;
    }
    return entities;
}
