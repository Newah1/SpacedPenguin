// Pure simulation helpers shared by the browser runtime and Node tests.
import { PHYSICS_CONFIG, SIMULATION_CONFIG } from './config/gameConfig.js';

export const LEGACY_PHYSICS_FPS = SIMULATION_CONFIG.legacyPhysicsFps;
export const MAX_PHYSICS_STEP = 1 / LEGACY_PHYSICS_FPS;

/**
 * Advance a point mass through the configured planetary gravity field.
 *
 * Gravity values in the port were calibrated as velocity changes per legacy
 * 60 Hz frame. Scaling by step * 60 preserves that feel while making the
 * result independent of whether a rendered frame represents one or two 60 Hz
 * simulation steps.
 */
export function integratePlanetGravity(position, velocity, planets, gravitationalConstant, deltaTime) {
    let x = position.x;
    let y = position.y;
    let vx = velocity.x;
    let vy = velocity.y;
    let remainingTime = Math.max(0, deltaTime);

    while (remainingTime > 0) {
        const step = Math.min(remainingTime, MAX_PHYSICS_STEP);
        const legacyFrameScale = step * LEGACY_PHYSICS_FPS;

        for (const planet of planets) {
            const dx = planet.x - x;
            const dy = planet.y - y;
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared <= 0) continue;

            const distance = Math.sqrt(distanceSquared);
            const gravitationalReach = planet.gravitationalReach ?? PHYSICS_CONFIG.defaultGravitationalReach;
            if (distance >= gravitationalReach) continue;

            const gravitationalForce = planet.mass * gravitationalConstant / distanceSquared;
            vx += gravitationalForce * dx * legacyFrameScale;
            vy += gravitationalForce * dy * legacyFrameScale;
        }

        x += vx * step;
        y += vy * step;
        remainingTime -= step;

        // Avoid an extra near-zero iteration from floating-point subtraction.
        if (remainingTime < Number.EPSILON) remainingTime = 0;
    }

    return {
        position: { x, y },
        velocity: { x: vx, y: vy }
    };
}
