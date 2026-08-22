import { Planet } from './gameObjects.js';
import { LEVEL_DEFAULTS, PHYSICS_CONFIG } from './config/gameConfig.js';

const BLACK_HOLE_VISUALS = Object.freeze({
    haloRadiusScale: 2.35,
    diskInnerScale: 1.05,
    diskOuterScale: 1.85,
    particleCount: 28,
    particleMinRadiusScale: 1.25,
    particleMaxRadiusScale: 2.15,
    particleRadius: 1.7,
    particleSpeed: 0.0007,
    particleRadialDance: 0.13
});

/**
 * A gravity source with no collision surface.
 *
 * Black holes intentionally extend Planet so they reuse the existing gravity,
 * orbit, runtime registration, and hierarchical lookup paths. The simulation
 * kernel distinguishes them through `collidable = false`.
 */
export class BlackHole extends Planet {
    constructor(
        x,
        y,
        radius = LEVEL_DEFAULTS.planet.radius,
        mass = LEVEL_DEFAULTS.planet.mass,
        gravitationalReach = PHYSICS_CONFIG.defaultGravitationalReach,
        gameObjectLookup = null
    ) {
        super(x, y, radius, mass, gravitationalReach, null, null, gameObjectLookup);
        this.collidable = false;
        this.collisionRadius = 0;
        this.name = 'Black Hole';
    }

    drawSprite(ctx) {
        const visuals = BLACK_HOLE_VISUALS;
        const radius = this.radius;
        const time = globalThis.performance?.now?.() ?? Date.now();
        const seed = [...String(this.id || `${this.position.x}:${this.position.y}`)]
            .reduce((sum, char) => sum + char.charCodeAt(0), 0);

        // A dim accretion haze makes the black center readable even against
        // the game's dark starfield without turning it into a bright portal.
        const haloRadius = radius * visuals.haloRadiusScale;
        const halo = ctx.createRadialGradient(0, 0, radius * 0.72, 0, 0, haloRadius);
        halo.addColorStop(0, 'rgba(0, 0, 0, 0)');
        halo.addColorStop(0.44, 'rgba(70, 24, 104, 0.28)');
        halo.addColorStop(0.7, 'rgba(28, 10, 58, 0.18)');
        halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, haloRadius, 0, Math.PI * 2);
        ctx.fill();

        // Thin, uneven accretion ring.
        ctx.save();
        ctx.rotate(Math.sin(time * 0.00017 + seed) * 0.08);
        ctx.scale(1, 0.42);
        const disk = ctx.createRadialGradient(
            0,
            0,
            radius * visuals.diskInnerScale,
            0,
            0,
            radius * visuals.diskOuterScale
        );
        disk.addColorStop(0, 'rgba(0, 0, 0, 0)');
        disk.addColorStop(0.36, 'rgba(120, 56, 168, 0.16)');
        disk.addColorStop(0.63, 'rgba(201, 126, 255, 0.42)');
        disk.addColorStop(0.8, 'rgba(82, 35, 126, 0.20)');
        disk.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = disk;
        ctx.beginPath();
        ctx.arc(0, 0, radius * visuals.diskOuterScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Render-only particles orbit with slightly different angular and
        // radial frequencies, producing a loose "dancing" swarm.
        for (let index = 0; index < visuals.particleCount; index++) {
            const normalized = index / visuals.particleCount;
            const baseAngle = normalized * Math.PI * 2 + seed * 0.017;
            const direction = index % 4 === 0 ? -1 : 1;
            const speed = visuals.particleSpeed * (0.65 + (index % 7) * 0.075);
            const phase = baseAngle + time * speed * direction;
            const radiusBand = visuals.particleMinRadiusScale +
                (visuals.particleMaxRadiusScale - visuals.particleMinRadiusScale) *
                ((index * 37) % visuals.particleCount) / visuals.particleCount;
            const dance = 1 + visuals.particleRadialDance *
                Math.sin(time * 0.0012 + index * 1.73 + seed * 0.01);
            const orbitRadius = radius * radiusBand * dance;
            const flatten = 0.56 + 0.12 * Math.sin(index * 2.1 + seed);
            const x = Math.cos(phase) * orbitRadius;
            const y = Math.sin(phase) * orbitRadius * flatten;
            const alpha = 0.28 + 0.58 * (0.5 + 0.5 * Math.sin(time * 0.002 + index * 0.93));

            ctx.globalAlpha = alpha;
            ctx.shadowColor = 'rgba(183, 112, 255, 0.9)';
            ctx.shadowBlur = 5;
            ctx.fillStyle = index % 5 === 0 ? '#d9b2ff' : '#8c55bc';
            ctx.beginPath();
            ctx.arc(x, y, visuals.particleRadius * (0.7 + (index % 3) * 0.22), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // Event horizon: deliberately absolute black with a subtle rim.
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(124, 72, 158, 0.34)';
        ctx.lineWidth = Math.max(1, radius * 0.05);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.02, 0, Math.PI * 2);
        ctx.stroke();

        if (this.gravitationalReach > 0 &&
            this.gravitationalReach < PHYSICS_CONFIG.defaultGravitationalReach) {
            ctx.strokeStyle = 'rgba(135, 86, 174, 0.24)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, radius + this.gravitationalReach, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}
