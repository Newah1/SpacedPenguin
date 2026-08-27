// Dependency-free geometry primitives used by deterministic simulation.

export function distanceSquared(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dx * dx + dy * dy;
}

export function distance(a, b) {
    return Math.sqrt(distanceSquared(a, b));
}

export function pointInRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
        point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function circlesOverlap(a, aRadius, b, bRadius = 0) {
    const combinedRadius = aRadius + bRadius;
    return distanceSquared(a, b) < combinedRadius * combinedRadius;
}

export function clonePoint(point) {
    return { x: point.x, y: point.y };
}
