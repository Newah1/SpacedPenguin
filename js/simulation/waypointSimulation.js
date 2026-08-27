import { clonePoint } from './simulationGeometry.js';

export const WaypointPathMode = Object.freeze({
    PING_PONG: 'pingpong',
    LOOP: 'loop'
});

export const WAYPOINT_PATH_MODES = Object.freeze(Object.values(WaypointPathMode));

export function normalizeWaypointPathMode(mode) {
    if (typeof mode !== 'string') return null;
    const normalized = mode.trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (normalized === 'pingpong' || normalized === 'backandforth') return WaypointPathMode.PING_PONG;
    if (normalized === 'loop' || normalized === 'circuit') return WaypointPathMode.LOOP;
    return mode.trim().toLowerCase();
}

export function normalizeWaypointPathDefinition(path = {}) {
    const sourceWaypoints = path.waypoints ?? path.points ?? [];
    return {
        waypoints: Array.isArray(sourceWaypoints)
            ? sourceWaypoints.map(point => ({ x: point?.x, y: point?.y }))
            : sourceWaypoints,
        speed: path.speed ?? path.waypointSpeed ?? 0,
        mode: normalizeWaypointPathMode(path.mode ?? path.pathMode) ?? WaypointPathMode.PING_PONG,
        phase: path.phase ?? path.distance ?? 0
    };
}

export function cloneWaypointPathState(path) {
    if (!path) return null;
    return {
        waypoints: Array.isArray(path.waypoints) ? path.waypoints.map(clonePoint) : [],
        speed: path.speed ?? 0,
        mode: path.mode ?? WaypointPathMode.PING_PONG,
        phase: path.phase ?? 0
    };
}

function segmentData(waypoints, mode) {
    const segments = [];
    let total = 0;
    const count = mode === WaypointPathMode.LOOP ? waypoints.length : waypoints.length - 1;
    for (let index = 0; index < count; index++) {
        const from = waypoints[index];
        const to = waypoints[(index + 1) % waypoints.length];
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        segments.push({ from, to, length, start: total });
        total += length;
    }
    return { segments, total };
}

function positionAtDistance(segments, total, distance) {
    if (total <= 0) return clonePoint(segments[0]?.from || { x: 0, y: 0 });
    const clamped = Math.max(0, Math.min(total, distance));
    const segment = segments.find(candidate => clamped <= candidate.start + candidate.length) || segments.at(-1);
    if (!segment || segment.length <= 0) return clonePoint(segment?.to || { x: 0, y: 0 });
    const progress = Math.max(0, Math.min(1, (clamped - segment.start) / segment.length));
    return {
        x: segment.from.x + (segment.to.x - segment.from.x) * progress,
        y: segment.from.y + (segment.to.y - segment.from.y) * progress
    };
}

export function stepWaypointPath(pathInput, currentPosition, deltaTime) {
    const path = cloneWaypointPathState(pathInput);
    if (!path || path.waypoints.length < 2 || deltaTime <= 0 || path.speed === 0) {
        return { position: clonePoint(currentPosition), waypointPath: path };
    }
    const { segments, total } = segmentData(path.waypoints, path.mode);
    if (total <= 0) return { position: clonePoint(path.waypoints[0]), waypointPath: path };

    const cycleLength = path.mode === WaypointPathMode.LOOP ? total : total * 2;
    path.phase = ((path.phase + path.speed * deltaTime) % cycleLength + cycleLength) % cycleLength;
    const distance = path.mode === WaypointPathMode.PING_PONG && path.phase > total
        ? cycleLength - path.phase
        : path.phase;
    return { position: positionAtDistance(segments, total, distance), waypointPath: path };
}

export function advanceWaypointPathsMutable(entities, deltaTime) {
    for (const entity of entities) {
        if (!entity.waypointPath) continue;
        const stepped = stepWaypointPath(entity.waypointPath, entity.position, deltaTime);
        entity.position = stepped.position;
        entity.waypointPath = stepped.waypointPath;
        if (entity.anchorPosition) entity.anchorPosition = clonePoint(stepped.position);
    }
    return entities;
}

export class WaypointSystem {
    constructor(path = {}) {
        const normalized = normalizeWaypointPathDefinition(path);
        this.waypoints = normalized.waypoints;
        this.speed = normalized.speed;
        this.mode = normalized.mode;
        this.phase = normalized.phase;
    }

    update(deltaTime, currentPosition) {
        const result = stepWaypointPath(this, currentPosition, deltaTime);
        this.phase = result.waypointPath?.phase ?? this.phase;
        return result.position;
    }
}
