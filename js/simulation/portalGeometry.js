/**
 * Return the world-space normal of a portal's outward (active) face.
 * The active face is one of the ellipse's long rim sides. A zero-degree
 * portal therefore faces up (negative local Y).
 */
export function getPortalOutwardDirection(portal) {
    const radians = (portal.rotation || 0) * Math.PI / 180;
    return {
        x: Math.sin(radians),
        y: -Math.cos(radians)
    };
}
